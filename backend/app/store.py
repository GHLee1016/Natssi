"""사용자별 증상 체크인 저장소.

SUPABASE_URL 과 SUPABASE_SERVICE_KEY 환경변수가 있으면 Supabase(Postgres)에 저장하고,
없으면 서버 메모리에 저장합니다(서버가 다시 켜지면 사라짐).
Vercel 같은 서버리스 환경에서는 메모리가 유지되지 않으므로 Supabase 설정이 필요합니다.
"""
import os
import uuid
import httpx

TABLE = "checkins"
ROUTINE_TABLE = "routines"
PROFILE_TABLE = "profiles"
_memory: dict[str, dict[str, dict]] = {}   # {user_id: {day: symptoms}}
_memory_routine: dict[str, dict] = {}      # {user_id: 루틴 데이터(versions 목록)}
_memory_profile: dict[str, dict] = {}      # {user_id: {"district": 사는 구}}
_client: httpx.Client | None = None      # 테스트에서 바꿔 끼울 수 있음


def _cfg():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    return (url.rstrip("/"), key) if url and key else None


def backend_name() -> str:
    return "supabase" if _cfg() else "memory"


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=8)
    return _client


def _headers(key, extra=None):
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", **(extra or {})}


def _uid(uid: str) -> str:
    return str(uuid.UUID(uid)) if _cfg() else uid        # 저장소 필터에 들어가는 값이라 형식을 검증


def load_all(uid: str) -> dict[str, dict]:
    cfg = _cfg()
    if not cfg:
        return dict(_memory.get(uid, {}))
    url, key = cfg
    r = _http().get(f"{url}/rest/v1/{TABLE}", params={"select": "day,symptoms", "user_id": f"eq.{_uid(uid)}"},
                    headers=_headers(key))
    r.raise_for_status()
    return {row["day"]: row["symptoms"] for row in r.json()}


def save(uid: str, day: str, symptoms: dict) -> None:
    cfg = _cfg()
    if not cfg:
        _memory.setdefault(uid, {})[day] = symptoms
        return
    url, key = cfg
    r = _http().post(f"{url}/rest/v1/{TABLE}", params={"on_conflict": "user_id,day"},
                     headers=_headers(key, {"Prefer": "resolution=merge-duplicates,return=minimal"}),
                     json={"user_id": _uid(uid), "day": day, "symptoms": symptoms})
    r.raise_for_status()


def load_routine(uid: str) -> dict:
    """내 루틴(버전 목록). 아직 없으면 빈 값."""
    cfg = _cfg()
    if not cfg:
        return dict(_memory_routine.get(uid, {"versions": []}))
    url, key = cfg
    r = _http().get(f"{url}/rest/v1/{ROUTINE_TABLE}", params={"select": "data", "user_id": f"eq.{_uid(uid)}"},
                    headers=_headers(key))
    if r.status_code == 404:                  # routines 표를 아직 안 만든 DB: 루틴이 없는 것으로 본다
        return {"versions": []}
    r.raise_for_status()
    rows = r.json()
    return rows[0]["data"] if rows else {"versions": []}


def save_routine(uid: str, data: dict) -> None:
    cfg = _cfg()
    if not cfg:
        _memory_routine[uid] = data
        return
    url, key = cfg
    r = _http().post(f"{url}/rest/v1/{ROUTINE_TABLE}", params={"on_conflict": "user_id"},
                     headers=_headers(key, {"Prefer": "resolution=merge-duplicates,return=minimal"}),
                     json={"user_id": _uid(uid), "data": data})
    r.raise_for_status()


def load_profile(uid: str) -> dict:
    """사는 구 등 선택 정보. 없거나 표가 아직 없으면 빈 값."""
    cfg = _cfg()
    if not cfg:
        return dict(_memory_profile.get(uid, {}))
    url, key = cfg
    r = _http().get(f"{url}/rest/v1/{PROFILE_TABLE}", params={"select": "district", "user_id": f"eq.{_uid(uid)}"},
                    headers=_headers(key))
    if r.status_code == 404:                  # profiles 표를 아직 안 만든 DB
        return {}
    r.raise_for_status()
    rows = r.json()
    return {"district": rows[0]["district"]} if rows and rows[0].get("district") else {}


def save_profile(uid: str, district: str | None) -> None:
    cfg = _cfg()
    if not cfg:
        _memory_profile[uid] = {"district": district} if district else {}
        return
    url, key = cfg
    r = _http().post(f"{url}/rest/v1/{PROFILE_TABLE}", params={"on_conflict": "user_id"},
                     headers=_headers(key, {"Prefer": "resolution=merge-duplicates,return=minimal"}),
                     json={"user_id": _uid(uid), "district": district})
    r.raise_for_status()


def clear_checkins(uid: str) -> None:
    """체크인만 지운다('체크인 모두 지우기'). 루틴과 사는 구는 남긴다."""
    cfg = _cfg()
    _memory.pop(uid, None)
    if not cfg:
        return
    url, key = cfg
    r = _http().delete(f"{url}/rest/v1/{TABLE}", params={"user_id": f"eq.{_uid(uid)}"}, headers=_headers(key))
    r.raise_for_status()


def clear(uid: str) -> None:
    """해당 사용자의 체크인·루틴·사는 구를 모두 지웁니다(탈퇴)."""
    cfg = _cfg()
    _memory.pop(uid, None)
    _memory_routine.pop(uid, None)
    _memory_profile.pop(uid, None)
    if not cfg:
        return
    url, key = cfg
    for table in (TABLE, ROUTINE_TABLE, PROFILE_TABLE):
        r = _http().delete(f"{url}/rest/v1/{table}", params={"user_id": f"eq.{_uid(uid)}"}, headers=_headers(key))
        if table != TABLE and r.status_code == 404:     # 루틴·프로필 표가 아직 없으면 지울 것도 없다(탈퇴·초기화를 막지 않음)
            continue
        r.raise_for_status()


def why(exc: Exception) -> str:
    """오류 원인을 비밀값 없이 짧게 알려 줍니다(키·URL은 넣지 않음)."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        hint = {401: "키가 올바르지 않아요(service_role/secret 키인지 확인)",
                403: "키 권한이 없어요(anon 키가 아닌 service_role/secret 키를 쓰세요)",
                404: "checkins 또는 routines 테이블이 없어요(supabase/schema.sql 또는 patch_*.sql 실행 필요)"}.get(code, "")
        try:
            body = exc.response.json()
            msg = body.get("message") or body.get("hint") or ""
        except Exception:
            msg = ""
        return f"Supabase {code} {hint} {msg}".strip()
    if isinstance(exc, httpx.HTTPError):
        return f"Supabase에 닿지 못했어요({type(exc).__name__}). SUPABASE_URL을 확인하세요"
    return type(exc).__name__
