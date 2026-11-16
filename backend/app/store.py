"""증상 체크인 저장소.

SUPABASE_URL 과 SUPABASE_SERVICE_KEY 환경변수가 있으면 Supabase(Postgres)에 저장하고,
없으면 서버 메모리에 저장합니다(서버가 다시 켜지면 사라짐).
Vercel 같은 서버리스 환경에서는 메모리가 유지되지 않으므로 Supabase 설정이 필요합니다.
"""
import os
import httpx

TABLE = "checkins"
_memory: dict[str, dict] = {}
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


def load_all() -> dict[str, dict]:
    cfg = _cfg()
    if not cfg:
        return dict(_memory)
    url, key = cfg
    r = _http().get(f"{url}/rest/v1/{TABLE}", params={"select": "day,symptoms"}, headers=_headers(key))
    r.raise_for_status()
    return {row["day"]: row["symptoms"] for row in r.json()}


def save(day: str, symptoms: dict) -> None:
    cfg = _cfg()
    if not cfg:
        _memory[day] = symptoms
        return
    url, key = cfg
    r = _http().post(f"{url}/rest/v1/{TABLE}", params={"on_conflict": "day"},
                     headers=_headers(key, {"Prefer": "resolution=merge-duplicates,return=minimal"}),
                     json={"day": day, "symptoms": symptoms})
    r.raise_for_status()


def clear() -> None:
    cfg = _cfg()
    _memory.clear()
    if not cfg:
        return
    url, key = cfg
    r = _http().delete(f"{url}/rest/v1/{TABLE}", params={"day": "gte.1900-01-01"}, headers=_headers(key))
    r.raise_for_status()
