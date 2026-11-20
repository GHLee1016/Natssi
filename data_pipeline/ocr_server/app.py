"""낯씨 전성분 OCR 서버.

    cd data_pipeline
    uvicorn ocr_server.app:app --host 0.0.0.0 --port 7860
    → http://localhost:7860  (테스트 페이지), http://localhost:7860/docs (API 문서)

API (모두 같은 결과 모양을 돌려준다 → 앱은 화면 하나로 처리)
    POST /ocr       사진 1~3장 (multipart, 필드 이름 files)
    POST /parse     {"text": "정제수, 글리세린, ..."}        전성분 글자 붙여넣기
    POST /manual    {"names": [...], "families": [...]}     직접 입력 (둥근 병 등)
    GET  /suggest?q=레티                                   성분 이름 자동완성
    GET  /health

결과 모양
    {"ingredients": [{"name": "판테놀", "inci": "Panthenol", "status": "일치|보정|확인 필요",
                      "ocr": "판테늘", "families": ["판테놀"]}],
     "families": ["레티노이드", ...],          제품의 성분 계열
     "ask_families": ["향료", ...],            '들어 있나요?'로 다시 물어볼 계열 (아직 못 찾은 것만)
     "needs_review": 3, "source": "ocr|text|manual", "seconds": 21.4}

개인정보: 사진은 메모리에서만 읽고 디스크에 저장하지 않는다. 사진도 글자도 외부로 보내지 않는다.
"""
import os
import sys
import threading
import time
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

ROOT = Path(__file__).resolve().parents[1]           # data_pipeline/
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)                                       # data/ingredient_dict.csv 상대 경로
from ingredients import families as fam  # noqa: E402
from ingredients import pipeline  # noqa: E402

MAX_FILES = 3
MAX_MB = 10
ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "https://natssiweb.vercel.app,http://localhost:5173,http://127.0.0.1:5173").split(",")

app = FastAPI(title="낯씨 전성분 OCR", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in ORIGINS if o.strip()],
                   allow_methods=["GET", "POST"], allow_headers=["*"])

_ocr_lock = threading.Lock()   # OCR은 CPU를 다 쓰므로 한 번에 하나씩


def _shape(res: dict, source: str, seconds: float, debug: bool = False) -> dict:
    items = [{"name": i["kor"], "inci": i.get("inci", ""), "status": i["status"],
              "ocr": i.get("ocr", i["kor"]), "families": i.get("families", [])}
             for i in res["ingredients"]]
    out = {
        "ingredients": items,
        "families": res["families"],
        "ask_families": [f for f in fam.ASK_FAMILIES if f not in res["families"]],
        "needs_review": sum(i["status"] != "일치" for i in items),
        "source": source,
        "seconds": round(seconds, 1),
    }
    if not items:
        out["message"] = ("전성분을 찾지 못했어요. 전성분 글자가 화면을 가득 채우게, 평평한 면(상자)을 찍어 주세요. "
                          "둥근 병이면 핵심 성분을 직접 입력할 수 있어요.") if source == "ocr" else "성분을 찾지 못했어요."
    if debug and "raw_text" in res:
        out["raw_text"] = res["raw_text"]
        out["variants"] = res.get("variants")
    return out


@app.on_event("startup")
def _warm():
    pipeline.from_text("전성분: 정제수")   # 성분 사전 미리 읽기 (첫 요청이 느리지 않게)


@app.get("/health")
def health():
    m = pipeline._matcher
    return {"ok": True, "dictionary": len(m.index) if m else 0}


@app.post("/ocr")
async def ocr(files: list[UploadFile] = File(...), debug: bool = False):
    if not 1 <= len(files) <= MAX_FILES:
        raise HTTPException(400, f"사진은 1~{MAX_FILES}장 보내 주세요.")
    blobs = []
    for f in files:
        if f.content_type and not f.content_type.startswith("image/"):
            raise HTTPException(415, "사진 파일만 올릴 수 있어요.")
        b = await f.read()
        if len(b) > MAX_MB * 1024 * 1024:
            raise HTTPException(413, f"사진이 너무 커요 ({MAX_MB}MB 이하).")
        blobs.append(b)

    def work():
        with _ocr_lock:
            t0 = time.perf_counter()
            try:
                res = pipeline.register(blobs)
            except ValueError:
                raise HTTPException(422, "사진을 열 수 없어요. JPG·PNG로 보내 주세요.")
            return res, time.perf_counter() - t0

    res, sec = await run_in_threadpool(work)
    return _shape(res, "ocr", sec, debug)


class TextIn(BaseModel):
    text: str = Field(..., max_length=20000)


@app.post("/parse")
def parse(body: TextIn):
    t0 = time.perf_counter()
    text = body.text if "성분" in body.text else "전성분: " + body.text
    return _shape(pipeline.from_text(text, select_lines=False), "text", time.perf_counter() - t0)


class ManualIn(BaseModel):
    names: list[str] = Field(default_factory=list, max_length=30)
    families: list[str] = Field(default_factory=list, max_length=20)


@app.post("/manual")
def manual(body: ManualIn):
    unknown = [f for f in body.families if f not in fam.RULES]
    if unknown:
        raise HTTPException(400, f"모르는 계열: {unknown}")
    t0 = time.perf_counter()
    return _shape(pipeline.from_names(body.names, body.families), "manual", time.perf_counter() - t0)


@app.get("/suggest")
def suggest(q: str = Query(..., min_length=1, max_length=40), k: int = Query(8, ge=1, le=20)):
    return [{"name": e["kor"], "inci": e.get("inci", ""), "families": fam.tag(e["kor"], e.get("inci", ""))}
            for e in pipeline.suggest(q, k)]


@app.get("/families")
def families():
    return {"all": list(fam.RULES), "ask": fam.ASK_FAMILIES}


@app.get("/")
def index():
    return FileResponse(Path(__file__).with_name("index.html"))
