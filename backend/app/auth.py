"""Supabase Auth(이메일+비밀번호) 중계와 토큰 확인.

브라우저는 Supabase에 직접 붙지 않고 이 서버를 거칩니다. 그래서 프런트 코드에는
Supabase 주소나 키가 들어가지 않습니다. 필요한 환경변수:
  SUPABASE_URL, SUPABASE_ANON_KEY(publishable 키), SUPABASE_SERVICE_KEY(secret 키)
"""
import logging
import os
import secrets
import time
import uuid
from datetime import datetime, timezone

import httpx

from . import config

log = logging.getLogger("natssi")
_client: httpx.Client | None = None      # 테스트에서 바꿔 끼울 수 있음
_cache: dict[str, tuple[float, dict]] = {}
CACHE_SECONDS = 60


class AuthError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


def _env():
    return (os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_ANON_KEY", ""),
            os.environ.get("SUPABASE_SERVICE_KEY", ""))


def enabled() -> bool:
    url, anon, svc = _env()
    return bool(url and anon and svc)


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=10)
    return _client


MESSAGES = {
    "invalid_credentials": "이메일 또는 비밀번호가 맞지 않아요.",
    "user_already_exists": "이미 가입된 이메일이에요. 로그인해 주세요.",
    "email_exists": "이미 가입된 이메일이에요. 로그인해 주세요.",
    "weak_password": "비밀번호가 너무 쉬워요. 8자 이상으로 글자와 숫자를 섞어 주세요.",
    "email_not_confirmed": "가입 때 받은 메일의 링크를 먼저 눌러 주세요.",
    "over_email_send_rate_limit": "메일을 너무 여러 번 요청했어요. 잠시 뒤 다시 시도해 주세요.",
    "over_request_rate_limit": "짧은 시간에 너무 여러 번 시도했어요. 잠시 뒤 다시 해 주세요.",
    "validation_failed": "입력한 내용을 확인해 주세요.",
    "signup_disabled": "지금은 가입을 받지 않아요.",
    "same_password": "이전과 다른 비밀번호를 써 주세요.",
    "email_address_invalid": "사용할 수 없는 이메일 주소예요. 다른 이메일을 써 주세요.",
    # Supabase 기본 메일 서비스는 프로젝트 팀 구성원이 아닌 주소로는 보내지 않는다(커스텀 SMTP를 설정하면 풀린다)
    "email_address_not_authorized": "지금은 이 주소로 메일을 보낼 수 없어요. 다른 이메일을 쓰거나 나중에 다시 해 주세요.",
    "user_banned": "이용이 제한된 계정이에요.",
}


def _fail(r: httpx.Response) -> AuthError:
    try:
        body = r.json()
    except Exception:
        body = {}
    code = body.get("error_code") or body.get("code") or ""
    if isinstance(code, int):
        code = ""
    msg = MESSAGES.get(code)
    if not msg:
        # 모르는 오류: 화면에는 오류 번호만, 원인(상태·코드·문구)은 서버 로그에 남겨 나중에 찾을 수 있게 한다
        ref = secrets.token_hex(3)
        log.warning("인증 오류 %s: status=%s code=%s msg=%s", ref, r.status_code, code or "-",
                    str(body.get("msg") or body.get("message") or body.get("error_description") or "")[:200])
        msg = f"요청을 마치지 못했어요. 잠시 뒤 다시 시도해 주세요. (오류 번호 {ref})"
    return AuthError(400 if r.status_code < 500 else 503, msg)


def _session(body: dict) -> dict:
    user = body.get("user") or {}
    return {"access_token": body["access_token"], "refresh_token": body.get("refresh_token"),
            "expires_at": body.get("expires_at") or int(time.time()) + int(body.get("expires_in", 3600)),
            "email": user.get("email")}


def _call(method, path, *, key, json=None, params=None, token=None):
    url, _, _ = _env()
    headers = {"apikey": key, "Authorization": f"Bearer {token or key}", "Content-Type": "application/json"}
    try:
        return _http().request(method, f"{url}{path}", json=json, params=params, headers=headers)
    except httpx.HTTPError:
        raise AuthError(503, "로그인 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.")


def signup(email: str, password: str, optional: dict | None = None) -> dict:
    """가입. 동의 기록은 사용자 메타데이터에 남깁니다(서버가 시각을 찍음). optional: 선택 동의 {ai_report, improve}."""
    _, anon, _ = _env()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    consent = {"version": config.CONSENT_VERSION, "age14": True, "terms": True, "privacy": True, "photo": True, "health": True, "at": now,
               **{k: bool(on) for k, on in (optional or {}).items()},
               **{f"{k}_at": now for k, on in (optional or {}).items() if on}}
    r = _call("POST", "/auth/v1/signup", key=anon, json={"email": email, "password": password,
                                                          "data": {"consent": consent}})
    if r.status_code >= 400:
        raise _fail(r)
    body = r.json()
    if body.get("access_token"):
        return {"status": "ok", **_session(body)}
    return {"status": "confirm_email", "email": email}      # 메일 인증을 켜 둔 경우


def login(email: str, password: str) -> dict:
    _, anon, _ = _env()
    r = _call("POST", "/auth/v1/token", key=anon, params={"grant_type": "password"},
              json={"email": email, "password": password})
    if r.status_code >= 400:
        raise _fail(r)
    return {"status": "ok", **_session(r.json())}


def recover(email: str) -> None:
    """비밀번호 재설정 메일. 메일 안의 링크는 Supabase의 Site URL(대시보드 설정)로 돌아온다."""
    _, anon, _ = _env()
    r = _call("POST", "/auth/v1/recover", key=anon, json={"email": email})
    if r.status_code >= 400:
        raise _fail(r)


def reset_password(token: str, password: str) -> dict:
    _, anon, _ = _env()
    r = _call("PUT", "/auth/v1/user", key=anon, token=token, json={"password": password})
    if r.status_code in (401, 403):
        raise AuthError(401, "재설정 링크가 만료됐어요. 메일을 다시 받아 주세요.")
    if r.status_code >= 400:
        raise _fail(r)
    _cache.clear()
    return {"status": "ok"}


def refresh(refresh_token: str) -> dict:
    _, anon, _ = _env()
    r = _call("POST", "/auth/v1/token", key=anon, params={"grant_type": "refresh_token"},
              json={"refresh_token": refresh_token})
    if r.status_code >= 400:
        raise AuthError(401, "로그인이 만료됐어요. 다시 로그인해 주세요.")
    return {"status": "ok", **_session(r.json())}


def user_from_token(token: str) -> dict:
    """액세스 토큰을 Supabase에 물어 확인합니다(60초 캐시). 유효하지 않으면 AuthError(401)."""
    now = time.monotonic()
    hit = _cache.get(token)
    if hit and now - hit[0] < CACHE_SECONDS:
        return hit[1]
    _, anon, _ = _env()
    r = _call("GET", "/auth/v1/user", key=anon, token=token)
    if r.status_code in (401, 403):
        raise AuthError(401, "로그인이 필요해요.")
    if r.status_code >= 400:
        raise AuthError(503, "로그인 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.")
    u = r.json()
    try:
        uid = str(uuid.UUID(u["id"]))                        # 형식 검증(저장소 필터에 들어가는 값)
    except Exception:
        raise AuthError(401, "로그인이 필요해요.")
    out = {"id": uid, "email": u.get("email"), "consent": (u.get("user_metadata") or {}).get("consent")}
    if len(_cache) > 2000:
        _cache.clear()
    _cache[token] = (now, out)
    return out


def set_consent_flag(token: str, old: dict | None, key: str, on: bool) -> dict:
    """선택 동의 하나(예: ai_report)를 켜고 끈다. 언제 바꿨는지도 남긴다."""
    _, anon, _ = _env()
    consent = {**(old or {}), key: on, f"{key}_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    r = _call("PUT", "/auth/v1/user", key=anon, token=token, json={"data": {"consent": consent}})
    if r.status_code in (401, 403):
        raise AuthError(401, "로그인이 필요해요.")
    if r.status_code >= 400:
        raise AuthError(503, "선택 동의를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.")
    _cache.pop(token, None)
    return consent


def update_consent(token: str, old: dict | None) -> dict:
    """현재 처리방침 버전으로 동의 기록을 갱신합니다(기존 항목은 유지, 사진 처리 동의를 다시 받음)."""
    _, anon, _ = _env()
    consent = {**(old or {}), "version": config.CONSENT_VERSION, "photo": True,
               "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    r = _call("PUT", "/auth/v1/user", key=anon, token=token, json={"data": {"consent": consent}})
    if r.status_code in (401, 403):
        raise AuthError(401, "로그인이 필요해요.")
    if r.status_code >= 400:
        raise AuthError(503, "동의 기록을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.")
    _cache.pop(token, None)                # 다음 요청부터 새 동의 버전을 보게
    return consent


def delete_user(uid: str) -> None:
    _, _, svc = _env()
    r = _call("DELETE", f"/auth/v1/admin/users/{uid}", key=svc)
    if r.status_code >= 400 and r.status_code != 404:
        raise AuthError(503, "계정을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.")
    _cache.clear()
