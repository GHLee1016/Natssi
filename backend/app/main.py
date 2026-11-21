import logging
import os
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import auth, config, demo_data, env, ingredients, judge, llm, quality, ratelimit, report, store
from . import routine as myroutine

log = logging.getLogger("natssi")
app = FastAPI(title="낯씨 API", version="0.2.0")


@app.exception_handler(RequestValidationError)
async def _invalid(request, exc):
    """입력 검사 실패. 받은 값(사진 바이트 등)은 응답에 다시 넣지 않아요."""
    errs = [{"loc": list(e.get("loc", [])), "msg": e.get("msg", ""), "type": e.get("type", "")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errs})
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


def records(v=None):
    """김서연 예시 기록. 로그인한 사용자의 기록은 섞지 않는다(내 기록은 /api/me).
    사람과 기록은 가상이지만 환경값(미세먼지·습도·기온)은 서대문구 실제 측정값을 붙인다. 값을 고정하려고 CSV에서만 읽는다."""
    recs = demo_data.build_records(offset=config.demo_shift())
    if config.DEMO_ENV_DISTRICT:
        env.attach_env(recs, config.DEMO_ENV_DISTRICT, source="csv")
    return recs


def judged(v=None):
    return judge.judge_all(records())


def _store_fail(what: str, e: Exception) -> HTTPException:
    """저장소 오류. 화면에는 쉬운 문구와 오류 번호만 보이고, 원인은 서버 로그에 남긴다.
    (로컬 개발 모드에서만 원인을 같이 보여 준다.)"""
    ref = secrets.token_hex(3)
    log.warning("저장소 오류 %s: %s", ref, store.why(e))
    extra = f" [{store.why(e)}]" if config.OPEN_MODE else ""
    return HTTPException(503, f"{what} 잠시 뒤 다시 시도해 주세요. (오류 번호 {ref}){extra}")


def routine_payload(v):
    return {"id": v["id"], "start": v["start"].isoformat(), "label": v["label"], "change": v["change"],
            "reason": v["reason"],
            "items": [{**demo_data.PRODUCTS[k], "key": k, "usage": u} for k, u in v["items"]]}


@app.get("/api/meta")
def meta(v=Depends(viewer)):
    return {"persona": demo_data.PERSONA, "today": config.demo_today().isoformat(),
            "first": demo_data.versions(config.demo_shift())[0]["start"].isoformat(), "mdc95": config.MDC95_A_STAR,
            "mdc95_is_example": False, "storage": store.backend_name(), "llm": llm.enabled(),
            "auth": auth.enabled() or config.OPEN_MODE, "recovery": config.RECOVERY_ENABLED, "env_district": config.DEMO_ENV_DISTRICT, "ocr": config.OCR_ENABLED, "consent_version": config.CONSENT_VERSION,
            "max_upload_mb": config.MAX_UPLOAD_BYTES // (1024 * 1024),
            "viewer": {"email": v["email"], "consent_version": (v.get("consent") or {}).get("version")} if v else None}


# ── 가입·로그인 ────────────────────────────────────────────────
class Credentials(BaseModel):
    email: str = Field(..., min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=8, max_length=128)


class LoginBody(BaseModel):
    email: str = Field(..., min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=1, max_length=128)


class RecoverBody(BaseModel):
    email: str = Field(..., min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ResetBody(BaseModel):
    access_token: str = Field(..., min_length=10, max_length=4000)
    password: str = Field(..., min_length=8, max_length=128)


class SignupBody(Credentials):
    consent_terms: bool = False
    consent_privacy: bool = False
    consent_photo: bool = False
    consent_health: bool = False   # 증상 점수 = 건강 정보(민감정보): 개인정보보호법 제23조 별도 동의


class RefreshBody(BaseModel):
    refresh_token: str = Field(..., min_length=10, max_length=2000)


def _check_password(pw: str):
    if pw.isdigit() or pw.isalpha():
        raise HTTPException(400, "비밀번호에 글자와 숫자를 함께 써 주세요.")


def _auth_on():
    if not auth.enabled():
        raise HTTPException(503, "로그인 기능이 아직 설정되지 않았어요.")


@app.post("/api/auth/signup")
def signup(body: SignupBody, request: Request):
    _auth_on()
    limit("auth", request)
    if not (body.consent_terms and body.consent_privacy and body.consent_photo and body.consent_health):
        raise HTTPException(400, "필수 항목에 모두 동의해야 가입할 수 있어요.")
    _check_password(body.password)
    try:
        return auth.signup(body.email.strip().lower(), body.password)
    except auth.AuthError as e:
        raise HTTPException(e.status, e.message)


@app.post("/api/auth/login")
def login(body: LoginBody, request: Request):
    _auth_on()
    limit("auth", request)
    try:
        return auth.login(body.email.strip().lower(), body.password)
    except auth.AuthError as e:
        raise HTTPException(e.status, e.message)


@app.post("/api/auth/recover")
def recover(body: RecoverBody, request: Request):
    """비밀번호 재설정 메일 요청. 가입 여부와 상관없이 같은 답을 준다(가입된 이메일을 알아내지 못하게)."""
    _auth_on()
    if not config.RECOVERY_ENABLED:
        raise HTTPException(503, "지금은 비밀번호 찾기를 쓸 수 없어요.")
    limit("auth", request)
    try:
        auth.recover(body.email.strip().lower())
    except auth.AuthError as e:
        raise HTTPException(e.status, e.message)
    return {"status": "sent"}


@app.post("/api/auth/reset")
def reset_password(body: ResetBody, request: Request):
    """메일 링크로 받은 임시 토큰으로 새 비밀번호를 정한다."""
    _auth_on()
    limit("auth", request)
    _check_password(body.password)
    try:
        return auth.reset_password(body.access_token, body.password)
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
        my_routine = store.load_routine(v["id"])
        profile = store.load_profile(v["id"])
    except Exception as e:
        raise _store_fail("저장소에 연결하지 못했어요.", e)
    return {"email": v["email"], "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "consent": v.get("consent"),
            "checkins": [{"day": d, "symptoms": s} for d, s in sorted(saved.items())],
            "routine": my_routine.get("versions", []),
            "district": profile.get("district"),
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
        raise _store_fail("삭제하지 못했어요.", e)
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
    ver = demo_data.versions(config.demo_shift())[rec["version"] - 1]
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
    return {"records": rows, "versions": [routine_payload(x) for x in demo_data.versions(config.demo_shift())],
            "mdc95": config.MDC95_A_STAR}


@app.get("/api/routine")
def routine():
    vs = demo_data.versions(config.demo_shift())
    cur = vs[demo_data.version_of(config.demo_today(), vs) - 1]
    return {"current": routine_payload(cur), "versions": [routine_payload(x) for x in vs]}


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


BASELINE_DAYS = config.MIN_BASELINE_RECORDS


def _mine(uid):
    try:
        return store.load_all(uid)
    except Exception as e:
        raise _store_fail("저장소에 연결하지 못했어요.", e)


def _my_env(uid, today):
    """내가 고른 구의 오늘 환경값(실측). 구를 안 골랐거나 값을 못 읽으면 None — 환경값 때문에 화면이 멈추지 않게."""
    try:
        district = store.load_profile(uid).get("district")
        if not district:
            return None, None
        return district, env.attach_env([{"date": today}], district, config.ENV_SOURCE)[0]["env"]
    except Exception as e:
        log.warning("my env failed: %s", store.why(e))
        return None, None


def _me_payload(uid):
    saved = _mine(uid)
    today = config.today_kst().isoformat()
    recent = [{"date": d, "symptoms": saved[d]} for d in sorted(saved, reverse=True)[:7]]
    district, today_env = _my_env(uid, today)
    return {"today": today, "today_checkin": saved.get(today), "days_recorded": len(saved),
            "needed": BASELINE_DAYS, "recent": recent, "district": district, "env": today_env}


class ProfileBody(BaseModel):
    district: Optional[str] = Field(None, max_length=10)     # 서울 25개 구 중 하나, None이면 지움


@app.get("/api/me/profile")
def my_profile(v=Depends(need_user)):
    try:
        return {**store.load_profile(v["id"]), "districts": env.SEOUL_DISTRICTS}
    except Exception as e:
        raise _store_fail("내 정보를 불러오지 못했어요.", e)


@app.put("/api/me/profile")
def save_my_profile(body: ProfileBody, request: Request, v=Depends(need_user)):
    """사는 구(선택). 고르면 그 구의 미세먼지·습도·기온을 같이 보여 준다. 구 단위만 받고 정확한 위치는 받지 않는다."""
    limit("account", request, v)
    if body.district and body.district not in env.SEOUL_DISTRICTS:
        raise HTTPException(400, "서울 25개 구 중에서 골라 주세요.")
    try:
        store.save_profile(v["id"], body.district or None)
    except Exception as e:
        raise _store_fail("사는 구를 저장하지 못했어요.", e)
    return {"district": body.district or None}


@app.get("/api/me")
def me(v=Depends(need_user)):
    """로그인한 사용자 본인의 기록. 오늘 체크인, 쌓인 일수(평소 범위까지 N/7), 최근 기록."""
    return _me_payload(v["id"])


@app.post("/api/me/checkin")
def checkin(body: Checkin, request: Request, v=Depends(need_user)):
    """오늘(한국 시간) 증상 체크인을 저장한다. 같은 날 다시 보내면 덮어쓴다."""
    limit("write", request, v)
    try:
        store.save(v["id"], config.today_kst().isoformat(), body.model_dump())
    except Exception as e:
        raise _store_fail("체크인을 저장하지 못했어요.", e)
    return _me_payload(v["id"])


@app.post("/api/capture")
def capture(body: quality.Features, request: Request, v=Depends(viewer)):
    """브라우저가 잰 측정값(숫자)만 받아 품질을 판정합니다. 사진은 서버로 오지 않고, 측정값도 저장하지 않아요."""
    limit("capture", request, v)
    return quality.evaluate(body)


# ── 내 루틴(제품 등록) ─────────────────────────────────────────
class AnalyzeBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=ingredients.MAX_TEXT)


class UsageChange(BaseModel):
    usage: str = Field(..., max_length=20)
    reason: Optional[str] = Field(None, max_length=60)


class RoutineAdd(BaseModel):
    name: str = Field(..., min_length=1, max_length=40)
    usage: str = Field(..., max_length=20)
    ingredients: list[str] = Field(default_factory=list, max_length=ingredients.MAX_ITEMS + 1)
    families: list[str] = Field(default_factory=list, max_length=20)     # 사용자가 '들어 있어요'라고 체크한 계열
    reason: Optional[str] = Field(None, max_length=60)


def _routine_response(data, warnings=()):
    return {**myroutine.payload(data), "warnings": list(warnings),
            "setup_day": myroutine.is_setup_day(data, config.today_kst()), "ask_families": ingredients.ASK_FAMILIES}


@app.get("/api/me/routine")
def my_routine(v=Depends(need_user)):
    """내 루틴(제품 목록과 버전). 판정·리포트와 달리 첫날부터 열려 있어요."""
    try:
        return _routine_response(store.load_routine(v["id"]))
    except Exception as e:
        raise _store_fail("루틴을 불러오지 못했어요.", e)


@app.post("/api/me/routine/analyze")
def analyze_ingredients(body: AnalyzeBody, request: Request, v=Depends(need_user)):
    """붙여 넣은 전성분 글자를 성분 목록과 성분 계열로 나눈다. 저장하지 않아요."""
    limit("write", request, v)
    try:
        return ingredients.analyze(body.text)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/me/routine/suggest")
def suggest_ingredients(q: str, request: Request, v=Depends(need_user)):
    """성분 이름 자동완성(식약처 사전). 글자를 칠 때마다 불리므로 제한을 넉넉히 둔다."""
    limit("suggest", request, v)
    return {"items": ingredients.suggest(q)} if q.strip() else {"items": []}


@app.post("/api/me/routine/items")
def add_routine_item(body: RoutineAdd, request: Request, v=Depends(need_user)):
    """제품을 루틴에 추가한다. 다른 날 바꾸면 새 버전이 생기고, 직전 변경이 7일 안이면 경고를 함께 돌려준다."""
    limit("write", request, v)
    try:
        data = store.load_routine(v["id"])
        warnings = myroutine.add_item(data, config.today_kst(), body.name, body.usage, body.ingredients, body.reason,
                                      body.families)
        store.save_routine(v["id"], data)
    except myroutine.RoutineError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise _store_fail("루틴을 저장하지 못했어요.", e)
    return _routine_response(data, warnings)


@app.patch("/api/me/routine/items/{key}")
def change_routine_usage(key: str, body: UsageChange, request: Request, v=Depends(need_user)):
    """등록한 제품의 사용 빈도를 바꾼다. 새 버전이 생기고, 변경이 잦으면 경고를 함께 돌려준다."""
    limit("write", request, v)
    try:
        data = store.load_routine(v["id"])
        warnings = myroutine.change_usage(data, config.today_kst(), key, body.usage, body.reason)
        store.save_routine(v["id"], data)
    except myroutine.RoutineError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise _store_fail("루틴을 저장하지 못했어요.", e)
    return _routine_response(data, warnings)


@app.delete("/api/me/routine/items/{key}")
def remove_routine_item(key: str, request: Request, v=Depends(need_user)):
    """제품 사용을 멈춘다(기록은 지난 버전에 남아요)."""
    limit("write", request, v)
    try:
        data = store.load_routine(v["id"])
        warnings = myroutine.remove_item(data, config.today_kst(), key)
        store.save_routine(v["id"], data)
    except myroutine.RoutineError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise _store_fail("루틴을 저장하지 못했어요.", e)
    return _routine_response(data, warnings)


class ConsentUpdate(BaseModel):
    photo: bool = False


@app.post("/api/account/consent")
def update_consent(body: ConsentUpdate, request: Request, authorization: Optional[str] = Header(None),
                   v=Depends(need_user)):
    """바뀐 사진 처리 안내에 다시 동의한 기록을 남깁니다(서버가 시각을 찍음)."""
    limit("account", request, v)
    if not body.photo:
        raise HTTPException(400, "바뀐 사진 처리 안내에 동의해야 촬영할 수 있어요.")
    if config.OPEN_MODE:                                     # 로컬 개발: 메모리에만 기록
        LOCAL_USER["consent"] = {"version": config.CONSENT_VERSION, "photo": True}
        return {"consent_version": config.CONSENT_VERSION}
    try:
        consent = auth.update_consent(authorization[7:].strip(), v.get("consent"))
    except auth.AuthError as e:
        raise HTTPException(e.status, e.message)
    return {"consent_version": consent["version"]}


@app.post("/api/reset")
def reset(request: Request, v=Depends(need_user)):
    """내 체크인만 지웁니다(루틴·사는 구는 남기고, 다른 사용자 데이터는 건드리지 않아요)."""
    limit("write", request, v)
    try:
        store.clear_checkins(v["id"])
    except Exception as e:
        raise _store_fail("체크인을 지우지 못했어요.", e)
    return {"ok": True}


# 빌드된 프론트엔드가 있으면 같은 서버에서 함께 서비스합니다.
DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = os.path.join(DIST, path)
        return FileResponse(f if path and os.path.isfile(f) else os.path.join(DIST, "index.html"))
