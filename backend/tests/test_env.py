"""환경 데이터(공공데이터) 연결. Supabase에 env_daily·profiles 표가 없어도 앱이 멈추지 않아야 한다."""
import httpx
import pytest
from fastapi.testclient import TestClient

from app import auth, config, env, llm, ratelimit, store
from app.main import app
from tests.test_account_security import FakeSupabase, join


class FakeWithProfiles(FakeSupabase):
    def __init__(self):
        super().__init__()
        self.profiles = {}

    def handler(self, request: httpx.Request):
        if request.url.path == "/rest/v1/profiles":
            import json
            if request.method == "POST":
                b = json.loads(request.content)
                self.profiles[b["user_id"]] = b["district"]
                return httpx.Response(201)
            uid = request.url.params["user_id"].removeprefix("eq.")
            return httpx.Response(200, json=[{"district": self.profiles[uid]}] if uid in self.profiles else [])
        return super().handler(request)          # env_daily는 없음(404) → CSV로 대신해야 함


@pytest.fixture()
def fake(monkeypatch):
    f = FakeWithProfiles()
    for k, v in {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_ANON_KEY": "anon", "SUPABASE_SERVICE_KEY": "svc"}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setattr(config, "OPEN_MODE", False)
    client = httpx.Client(transport=httpx.MockTransport(f.handler))
    auth._client = store._client = client
    auth._cache.clear(); ratelimit.reset(); llm._cache.clear(); env._cache.clear()
    yield f, TestClient(app)
    auth._client = store._client = None
    env._cache.clear()


@pytest.fixture()
def demo_real_env(monkeypatch):
    for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENROUTER_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(config, "DEMO_ENV_DISTRICT", "서대문구")
    ratelimit.reset(); llm._cache.clear(); env._cache.clear()
    yield TestClient(app)
    env._cache.clear()


def test_env_shape_matches_what_judge_and_screen_use():
    env._cache.clear()
    r = env.attach_env([{"date": "2026-11-15"}], "서대문구")[0]["env"]
    assert {"pm25", "humidity", "unusual", "facts"} <= set(r)
    assert r["pm25"] is not None and r["humidity"] is not None


def test_no_district_leaves_records_alone():
    recs = [{"date": "2026-11-15", "env": {"pm25": 1, "humidity": 2, "unusual": False}}]
    assert env.attach_env(recs, None)[0]["env"]["pm25"] == 1


def test_default_demo_keeps_example_env():
    """DEMO_ENV_DISTRICT를 안 켜면 지금 데모 이야기 그대로(환경 때문에 '구분 불가'인 날 없음)."""
    assert config.DEMO_ENV_DISTRICT is None
    rows = TestClient(app).get("/api/timeline").json()["records"]
    assert not any(r["verdict"].get("env_blocked") for r in rows)


def test_demo_with_real_env_explains_unknown_day(demo_real_env):
    c = demo_real_env
    rows = c.get("/api/timeline").json()["records"]
    blocked = [r for r in rows if r["verdict"].get("env_blocked")]
    assert blocked, "실제 서대문구 값이면 11/7이 환경 때문에 '구분 불가'"
    assert "2026-11-07" in [r["date"] for r in blocked]
    assert "전날 기온이 크게 바뀌었어요." in blocked[0]["verdict"]["reasons"]

    rep = c.get("/api/report").json()
    env_s = [s for s in rep["sentences"] if "'구분 불가'로 두었어요" in s["text"]]
    assert env_s and set(env_s[0]["cites"]) == {r["id"] for r in blocked}
    assert not rep["problems"]
    for s in rep["sentences"]:
        assert "때문에" not in s["text"].replace("어느 쪽 때문인지", "")   # 원인 단정 금지

    other = c.get("/api/report/answer/other").json()
    assert "전날 기온이 크게 바뀌었어요." in other["text"] and set(other["cites"]) >= {r["id"] for r in blocked}


def test_profile_district_and_env_on_my_records(fake):
    f, c = fake
    h = join(c, "env@test.kr")
    p = c.get("/api/me/profile", headers=h).json()
    assert p.get("district") is None and len(p["districts"]) == 25

    assert c.put("/api/me/profile", json={"district": "부산진구"}, headers=h).status_code == 422
    me = c.put("/api/me/profile", json={"district": "서대문구"}, headers=h).json()
    assert me["district"] == "서대문구"
    assert me["env_today"] is not None and "unusual" in me["env_today"]   # env_daily 표가 없어도(404) CSV로

    c.post("/api/me/checkin", json={"따가움": 1}, headers=h)
    me = c.get("/api/me", headers=h).json()
    assert all("env" in r for r in me["recent"])
    assert c.get("/api/account/export", headers=h).json()["profile"] == {"district": "서대문구"}

    me = c.put("/api/me/profile", json={"district": None}, headers=h).json()    # 지우기
    assert me["district"] is None and me["env_today"] is None


def test_profiles_table_missing_does_not_break_me(fake, monkeypatch):
    f, c = fake
    h = join(c, "noprof@test.kr")
    monkeypatch.setattr(FakeWithProfiles, "handler", FakeSupabase.handler)     # profiles 표 없음 → 404
    store._client = httpx.Client(transport=httpx.MockTransport(lambda r: FakeSupabase.handler(f, r)))
    r = c.get("/api/me", headers=h)
    assert r.status_code == 200 and r.json()["district"] is None


@pytest.mark.parametrize("shift", [0, 5, 11])          # 기준일, 오늘(11/21), 발표일(11/27)
def test_demo_real_env_is_same_whatever_day_you_open(demo_real_env, monkeypatch, shift):
    """데모 날짜는 접속일에 맞춰 밀리지만, 환경은 이야기의 원래 날짜 값 → 언제 열어도 같은 결과."""
    monkeypatch.setattr(config, "DEMO_SHIFT_DAYS", shift)
    rows = demo_real_env.get("/api/timeline").json()["records"]
    assert [r["id"] for r in rows if r["verdict"].get("env_blocked")] == [19]
