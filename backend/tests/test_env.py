"""실제 환경값을 붙인 김서연 데모(날짜 고정 10/30~11/26, 서대문구). 값은 함께 배포한 CSV에서 읽는다."""
from fastapi.testclient import TestClient

from app import config, env, judge
from app.main import app, records


def test_fixed_demo_with_real_env(monkeypatch):
    monkeypatch.setattr(config, "DEMO_SHIFT_DAYS", 10)
    monkeypatch.setattr(config, "DEMO_ENV_DISTRICT", "서대문구")
    recs = records()
    assert recs[0]["date"] == "2026-10-30" and recs[-1]["date"] == "2026-11-26"           # 날짜가 매일 밀리지 않음
    by = {r["date"]: r for r in judge.judge_all(recs)}
    signal = sorted(d for d, r in by.items() if r["verdict"]["level"] == judge.SIGNAL)
    assert signal == ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]   # 이야기는 그대로
    assert by["2026-11-07"]["env"]["facts"] == ["전날 기온이 크게 바뀌었어요."]           # 실제 측정값에서 나온 사실
    assert by["2026-11-16"]["env"]["pm25"] == 13 and not by["2026-11-16"]["env"]["unusual"]
    assert recs[-1]["env"]["pm25"] is None and recs[-1]["env"]["measured_on"] is None          # 아직 측정 전인 날은 비어 있음
    assert by["2026-11-21"]["env"]["measured_on"] == "2026-11-19"                            # 그날 값이 없으면 이틀 전 값 + 날짜 표시


def test_report_uses_real_env_facts(monkeypatch):
    monkeypatch.setattr(config, "DEMO_SHIFT_DAYS", 10)
    monkeypatch.setattr(config, "DEMO_ENV_DISTRICT", "서대문구")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    c = TestClient(app)
    texts = [s["text"] for s in c.get("/api/report").json()["sentences"]]
    assert "같은 기간 미세먼지, 습도, 기온은 평소와 비슷했어요." in texts
    assert "기록하지 않은 요인" in c.get("/api/report/answer/other").json()["text"]


def test_missing_table_falls_back_to_csv(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:9")                             # 닿지 않는 주소 → CSV로 대신
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "x")
    from datetime import date
    rows = env.load_rows("서대문구", date(2026, 11, 14), date(2026, 11, 16))
    assert sorted(rows) == [date(2026, 11, 14), date(2026, 11, 15), date(2026, 11, 16)]
    assert env.summarize([{"facts": [], "detail": {"pm25": {}}}]) == ["같은 기간 미세먼지, 습도, 기온은 평소와 비슷했어요."]
    assert env.summarize([{}]) == ["같은 기간 미세먼지, 습도, 기온 측정값이 없어 비교하지 못했어요."]   # 구를 안 고른 사용자


def test_my_district_and_today_env(monkeypatch):
    from test_account_security import FakeSupabase, join
    import httpx
    from app import auth, ratelimit, store
    fake = FakeSupabase()
    for k, val in {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_ANON_KEY": "anon", "SUPABASE_SERVICE_KEY": "svc"}.items():
        monkeypatch.setenv(k, val)
    monkeypatch.setattr(config, "OPEN_MODE", False)
    client = httpx.Client(transport=httpx.MockTransport(fake.handler))
    auth._client = store._client = client
    auth._cache.clear(); ratelimit.reset()
    try:
        c = TestClient(app)
        assert c.put("/api/me/profile", json={"district": "서대문구"}).status_code == 401     # 로그인 필요
        h = join(c, "a@test.kr")
        assert c.get("/api/me", headers=h).json()["district"] is None                      # 고르기 전: 환경값 없음
        assert c.put("/api/me/profile", json={"district": "부산 해운대구"}, headers=h).status_code == 400
        assert c.put("/api/me/profile", json={"district": "서대문구"}, headers=h).status_code == 200
        monkeypatch.setattr(config, "today_kst", lambda: __import__("datetime").date(2026, 11, 18))
        me = c.get("/api/me", headers=h).json()
        assert me["district"] == "서대문구" and me["env"]["pm25"] == 20 and me["env"]["temp"] == 5.7   # 그 구의 실측값
        assert me["env"]["measured_on"] == "2026-11-18"
        assert c.get("/api/me/profile", headers=h).json()["district"] == "서대문구"
        assert c.get("/api/account/export", headers=h).json()["district"] == "서대문구"    # 내려받기에 포함
        assert c.post("/api/reset", headers=h).status_code == 200 and fake.profiles          # 체크인 지우기는 구를 남김
        assert c.put("/api/me/profile", json={"district": None}, headers=h).status_code == 200  # 지우기
        assert c.delete("/api/account", headers=h).status_code == 200 and not fake.profiles  # 탈퇴하면 함께 지움
    finally:
        auth._client = store._client = None


def test_photo_notice_version_is_separate_from_policy():
    m = TestClient(app).get("/api/meta").json()
    assert m["photo_notice_version"] <= m["consent_version"]          # 사진 처리 방식이 바뀐 날만 따로(처리방침 변경과 분리)
