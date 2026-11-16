import os
from datetime import date, timedelta
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, demo_data, judge, llm, quality, report, store

app = FastAPI(title="낯씨 API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def records():
    """가상 기록에 저장된 증상 체크인을 덮어씌워 돌려줍니다."""
    recs = demo_data.build_records(config.DEMO_TODAY)
    try:
        saved = store.load_all()
    except Exception as e:
        raise HTTPException(503, f"저장소에 연결하지 못했어요. ({store.why(e)})")
    for r in recs:
        if r["date"] in saved:
            r["symptoms"] = {**r["symptoms"], **saved[r["date"]]}
    return recs


def judged():
    return judge.judge_all(records())


def routine_payload(v):
    return {"id": v["id"], "start": v["start"].isoformat(), "label": v["label"], "change": v["change"],
            "reason": v["reason"],
            "items": [{**demo_data.PRODUCTS[k], "key": k, "usage": u} for k, u in v["items"]]}


@app.get("/api/meta")
def meta():
    return {"persona": demo_data.PERSONA, "today": config.DEMO_TODAY.isoformat(),
            "first": demo_data.VERSIONS[0]["start"].isoformat(), "mdc95": config.MDC95_A_STAR,
            "mdc95_is_example": True, "storage": store.backend_name(), "llm": llm.enabled()}


@app.get("/api/day/{d}")
def day(d: date):
    rows = judged()
    rec = next((r for r in rows if r["date"] == d.isoformat()), None)
    if rec is None:
        raise HTTPException(404, "이 날짜에는 기록이 없어요")
    v = demo_data.VERSIONS[rec["version"] - 1]
    week_start = d - timedelta(days=(d.weekday() + 1) % 7)
    week = []
    for i in range(7):
        wd = week_start + timedelta(days=i)
        r = next((x for x in rows if x["date"] == wd.isoformat()), None)
        week.append({"date": wd.isoformat(), "has_record": r is not None,
                     "level": r["verdict"]["level"] if r else None})
    return {"record": rec, "version": routine_payload(v), "week": week}


@app.get("/api/timeline")
def timeline():
    rows = judged()
    return {"records": rows, "versions": [routine_payload(v) for v in demo_data.VERSIONS],
            "mdc95": config.MDC95_A_STAR}


@app.get("/api/routine")
def routine():
    cur = demo_data.VERSIONS[demo_data.version_of(config.DEMO_TODAY) - 1]
    return {"current": routine_payload(cur), "versions": [routine_payload(v) for v in demo_data.VERSIONS]}


@app.get("/api/compare")
def compare(a: date, b: date):
    rows = {r["date"]: r for r in judged()}
    ra, rb = rows.get(a.isoformat()), rows.get(b.isoformat())
    if not ra or not rb:
        raise HTTPException(404, "두 날짜 모두 기록이 있어야 해요")
    diff = None
    if ra["redness"] is not None and rb["redness"] is not None:
        diff = round(rb["redness"] - ra["redness"], 2)
    return {"a": ra, "b": rb, "diff": diff, "mdc95": config.MDC95_A_STAR,
            "beyond_error": diff is not None and abs(diff) > config.MDC95_A_STAR,
            "photo_note": "AI로 생성된 이미지"}


@app.get("/api/report")
def get_report():
    rows = judged()
    rep = report.build_report_llm(rows, demo_data.VERSIONS)
    rep["problems"] = report.verify(rep["sentences"], rows)
    rep["questions"] = report.QUESTIONS
    return rep


@app.get("/api/report/answer/{qid}")
def get_answer(qid: str):
    ans = report.answer(qid, judged(), demo_data.VERSIONS)
    if ans is None:
        raise HTTPException(404, "준비되지 않은 질문이에요")
    return ans


class Checkin(BaseModel):
    따가움: int = Field(0, ge=0, le=3)
    화끈: int = Field(0, ge=0, le=3)
    가려움: int = Field(0, ge=0, le=3)
    당김: int = Field(0, ge=0, le=3)


@app.post("/api/day/{d}/checkin")
def checkin(d: date, body: Checkin):
    if not (demo_data.VERSIONS[0]["start"] <= d <= config.DEMO_TODAY):
        raise HTTPException(404, "이 날짜에는 기록이 없어요")
    try:
        store.save(d.isoformat(), body.model_dump())
    except Exception as e:
        raise HTTPException(503, f"체크인을 저장하지 못했어요. ({store.why(e)})")
    return day(d)


@app.post("/api/capture")
async def capture(photo: UploadFile = File(...)):
    data = await photo.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "사진이 너무 커요 (12MB 이하)")
    try:
        return quality.check(data)   # 사진은 저장하지 않습니다
    except Exception:
        raise HTTPException(400, "사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.")


@app.post("/api/reset")
def reset():
    try:
        store.clear()
    except Exception:
        raise HTTPException(503, "저장소를 비우지 못했어요.")
    return {"ok": True}


# 빌드된 프론트엔드가 있으면 같은 서버에서 함께 서비스합니다.
DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = os.path.join(DIST, path)
        return FileResponse(f if path and os.path.isfile(f) else os.path.join(DIST, "index.html"))
