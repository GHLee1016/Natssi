import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import auth, config, demo_data, judge, llm, quality, ratelimit, report, store

app = FastAPI(title="낯씨 API", version="0.2.0")
# 같은 주소에서 화면과 API를 함께 서비스하므로 다른 출처의 접근은 허용하지 않습니다.
# 로컬에서 프런트(5173)를 따로 띄울 때만 CORS_ORIGINS 환경변수에 주소를 넣으세요.
_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["GET", "POST", "DELETE"],
                   allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.url.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


# ── 로그인 확인 ────────────────────────────────────────────────
LOCAL_USER = {"id": "local-dev", "email": "dev@local", "consent": None}


def viewer(authorization: Optional[str] = Header(None)):
    """로그인한 사용자를 돌려줍니다. 토큰이 없으면 None(= 읽기 전용 데모)."""
    if config.OPEN_MODE:
        return LOCAL_USER
    if not authorization:
        return None
    if not authorization.lower().startswith("bearer ") or not auth.enabled():
        raise HTTPException(401, "로그인이 필요해요.")
    try:
        return auth.user_from_token(authorization[7:].strip())
    except auth.AuthError as e:
        raise HTTPException(e.status, e.message)


def need_user(v=Depends(viewer)):
    if v is None:
        raise HTTPException(401, "로그인하면 내 기록을 저장할 수 있어요.")
    return v


def limit(bucket: str, request: Request, v=None):
    ratelimit.hit(bucket, v["id"] if v else ratelimit.client_ip(request))


def records(v):
    """예시 기록 위에, 로그인한 사용자 본인의 증상 체크인만 덮어씌워 돌려줍니다."""
    recs = demo_data.build_records(config.DEMO_TODAY)
    if v is None:
        return recs
    try:
        saved = store.load_all(v["id"])
    except Exception as e:
        raise HTTPException(503, f"저장소에 연결하지 못했어요. ({store.why(e)})")
    for r in recs:
        if r["date"] in saved:
            r["symptoms"] = {**r["symptoms"], **saved[r["date"]]}
    return recs


def judged(v):
    return judge.judge_all(records(v))


def routine_payload(v):
    return {"id": v["id"], "start": v["start"].isoformat(), "label": v["label"], "change": v["change"],
            "reason": v["reason"],
            "items": [{**demo_data.PRODUCTS[k], "key": k, "usage": u} for k, u in v["items"]]}


@app.get("/api/meta")
def meta(v=Depends(viewer)):
    return {"persona": demo_data.PERSONA, "today": config.DEMO_TODAY.isoformat(),
            "first": demo_data.VERSIONS[0]["start"].isoformat(), "mdc95": config.MDC95_A_STAR,
            "mdc95_is_example": True, "storage": store.backend_name(), "llm": llm.enabled(),
            "auth": auth.enabled() or config.OPEN_MODE, "consent_version": config.CONSENT_VERSION,
            "max_upload_mb": config.MAX_UPLOAD_BYTES // (1024 * 1024),
            "viewer": {"email": v["email"]} if v else None}


# ── 가입·로그인 ────────────────────────────────────────────────
class Credentials(BaseModel):
    email: str = Field(..., min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=8, max_length=128)


class SignupBody(Credentials):
    consent_terms: bool = False
    consent_privacy: bool = False
    consent_photo: bool = False


class RefreshBody(BaseModel):
    refresh_token: str = Field(..., min_length=10, max_length=2000)


def _auth_on():
    if not auth.enabled():
        raise HTTPException(503, "로그인 기능이 아직 설정되지 않았어요.")


@app.post("/api/auth/signup")
def signup(body: SignupBody, request: Request):
    _auth_on()
    limit("auth", request)
    if not (body.consent_terms and body.consent_privacy and body.consent_photo):
        raise HTTPException(400, "필수 항목에 모두 동의해야 가입할 수 있어요.")
    if body.password.isdigit() or body.password.isalpha():
        raise HTTPException(400, "비밀번호에 글자와 숫자를 함께 써 주세요.")
    try:
        return auth.signup(body.email.strip().lower(), body.password)
    except auth.AuthError as e:
        raise HTTPException(e.status, e.message)


@app.post("/api/auth/login")
def login(body: Credentials, request: Request):
    _auth_on()
    limit("auth", request)
    try:
        return auth.login(body.email.strip().lower(), body.password)
    except auth.AuthError as e:
        raise HTTPException(e.status, e.message)


@app.post("/api/auth/refresh")
def refresh(body: RefreshBody, request: Request):
    _auth_on()
    limit("auth", request)
    try:
        return auth.refresh(body.refresh_token)
    except auth.AuthError as e:
        raise HTTPException(e.status, e.message)


# ── 내 데이터(열람·삭제) ──────────────────────────────────────
@app.get("/api/account/export")
def export_account(request: Request, v=Depends(need_user)):
    limit("account", request, v)
    try:
        saved = store.load_all(v["id"])
    except Exception as e:
        raise HTTPException(503, f"저장소에 연결하지 못했어요. ({store.why(e)})")
    return {"email": v["email"], "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "consent": v.get("consent"),
            "checkins": [{"day": d, "symptoms": s} for d, s in sorted(saved.items())],
            "note": "얼굴 사진은 서버에 저장하지 않아 내려받을 사진이 없어요."}


@app.delete("/api/account")
def delete_account(request: Request, v=Depends(need_user)):
    """내 체크인과 계정을 모두 지웁니다(되돌릴 수 없어요)."""
    limit("account", request, v)
    try:
        store.clear(v["id"])
        if not config.OPEN_MODE:
            auth.delete_user(v["id"])
    except auth.AuthError as e:
        raise HTTPException(e.status, e.message)
    except Exception as e:
        raise HTTPException(503, f"삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요. ({store.why(e)})")
    return {"ok": True}


# ── 기록 조회 ──────────────────────────────────────────────────
@app.get("/api/day/{d}")
def day(d: date, v=Depends(viewer)):
    return _day(d, v)


def _day(d, v):
    rows = judged(v)
    rec = next((r for r in rows if r["date"] == d.isoformat()), None)
    if rec is None:
        raise HTTPException(404, "이 날짜에는 기록이 없어요")
    ver = demo_data.VERSIONS[rec["version"] - 1]
    week_start = d - timedelta(days=(d.weekday() + 1) % 7)
    week = []
    for i in range(7):
        wd = week_start + timedelta(days=i)
        r = next((x for x in rows if x["date"] == wd.isoformat()), None)
        week.append({"date": wd.isoformat(), "has_record": r is not None,
                     "level": r["verdict"]["level"] if r else None})
    return {"record": rec, "version": routine_payload(ver), "week": week}


@app.get("/api/timeline")
def timeline(v=Depends(viewer)):
    rows = judged(v)
    return {"records": rows, "versions": [routine_payload(x) for x in demo_data.VERSIONS],
            "mdc95": config.MDC95_A_STAR}


@app.get("/api/routine")
def routine():
    cur = demo_data.VERSIONS[demo_data.version_of(config.DEMO_TODAY) - 1]
    return {"current": routine_payload(cur), "versions": [routine_payload(x) for x in demo_data.VERSIONS]}


@app.get("/api/compare")
def compare(a: date, b: date, v=Depends(viewer)):
    rows = {r["date"]: r for r in judged(v)}
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
def get_report(request: Request, v=Depends(viewer)):
    limit("report", request, v)          # LLM을 부르는 곳이라 가장 엄격하게 제한
    rows = judged(v)
    rep = report.build_report_llm(rows, demo_data.VERSIONS)
    rep["problems"] = report.verify(rep["sentences"], rows)
    rep["questions"] = report.QUESTIONS
    return rep


@app.get("/api/report/answer/{qid}")
def get_answer(qid: str, v=Depends(viewer)):
    ans = report.answer(qid, judged(v), demo_data.VERSIONS)
    if ans is None:
        raise HTTPException(404, "준비되지 않은 질문이에요")
    return ans


class Checkin(BaseModel):
    따가움: int = Field(0, ge=0, le=3)
    화끈: int = Field(0, ge=0, le=3)
    가려움: int = Field(0, ge=0, le=3)
    당김: int = Field(0, ge=0, le=3)


@app.post("/api/day/{d}/checkin")
def checkin(d: date, body: Checkin, request: Request, v=Depends(need_user)):
    limit("write", request, v)
    if not (demo_data.VERSIONS[0]["start"] <= d <= config.DEMO_TODAY):
        raise HTTPException(404, "이 날짜에는 기록이 없어요")
    try:
        store.save(v["id"], d.isoformat(), body.model_dump())
    except Exception as e:
        raise HTTPException(503, f"체크인을 저장하지 못했어요. ({store.why(e)})")
    return _day(d, v)


@app.post("/api/capture")
async def capture(request: Request, photo: UploadFile = File(...), v=Depends(viewer)):
    limit("capture", request, v)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > config.MAX_UPLOAD_BYTES + 64 * 1024:
        raise HTTPException(413, f"사진이 너무 커요 ({config.MAX_UPLOAD_BYTES // (1024 * 1024)}MB 이하)")
    data = await photo.read(config.MAX_UPLOAD_BYTES + 1)     # 한도보다 많이는 읽지 않음
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"사진이 너무 커요 ({config.MAX_UPLOAD_BYTES // (1024 * 1024)}MB 이하)")
    try:
        return quality.check(data)   # 사진은 저장하지 않습니다
    except quality.BadImage as e:
        raise HTTPException(400, str(e))


@app.post("/api/reset")
def reset(request: Request, v=Depends(need_user)):
    """내 체크인만 지웁니다(다른 사용자 데이터는 건드리지 않아요)."""
    limit("write", request, v)
    try:
        store.clear(v["id"])
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
