from datetime import date
from fastapi.testclient import TestClient
from app import config, demo_data, judge, report
from app.main import app

rows = judge.judge_all(demo_data.build_records())
by_date = {r["date"]: r for r in rows}
client = TestClient(app)


def test_deterministic():
    assert judge.judge_all(demo_data.build_records()) == rows


def test_first_week_needs_more_records():
    assert by_date["2026-10-21"]["verdict"]["level"] == judge.UNKNOWN


def test_baseline_days_have_no_false_alarm():
    v1 = [r for r in rows if r["version"] == 1 and r["verdict"]["baseline"]]
    assert v1 and all(r["verdict"]["level"] == judge.NO_SIGNAL for r in v1)


def test_signal_on_days_4_to_7_of_version_2():
    sig = [r["day_in_version"] for r in rows if r["version"] == 2 and r["verdict"]["level"] == judge.SIGNAL]
    assert sig == [4, 5, 6, 7]


def test_returns_to_range_in_version_3():
    assert by_date["2026-11-16"]["verdict"]["level"] == judge.NO_SIGNAL
    assert by_date["2026-11-16"]["verdict"]["baseline_version"] == 1


def test_bad_photo_is_unknown():
    assert by_date["2026-10-30"]["verdict"]["level"] == judge.UNKNOWN


def test_report_cites_real_records():
    rep = report.build_report(rows, demo_data.VERSIONS)
    assert rep["sentences"] and report.verify(rep["sentences"], rows) == []
    assert rep["sentences"][0]["cites"] == [18, 19, 20, 21]


def test_verify_catches_wrong_number():
    bad = [{"text": "따가움 3점이 기록됐어요.", "cites": [18]}, {"text": "x", "cites": [999]}]
    assert len(report.verify(bad, rows)) == 2


def test_api_smoke(monkeypatch):
    assert client.get("/api/meta").status_code == 200
    assert client.get("/api/day/2026-11-09").json()["record"]["verdict"]["level"] == judge.SIGNAL
    assert client.get("/api/day/2025-01-01").status_code == 404
    c = client.get("/api/compare", params={"a": "2026-11-02", "b": "2026-11-09"}).json()
    assert c["beyond_error"] is True
    assert client.get("/api/report").json()["problems"] == []
    assert client.post("/api/me/checkin", json={"따가움": 2}).status_code == 401   # 로그인 없이는 저장 불가
    monkeypatch.setattr(config, "OPEN_MODE", True)                                            # 이하 로컬 개발 모드
    assert client.post("/api/me/checkin", json={"따가움": 5}).status_code == 422
    r = client.post("/api/me/checkin", json={"따가움": 2}).json()
    assert r["today_checkin"]["따가움"] == 2 and r["days_recorded"] == 1 and r["needed"] == 7
    client.post("/api/reset")


def test_demo_story_follows_today(monkeypatch):
    from datetime import date
    from app import config
    monkeypatch.setattr(config, "DEMO_SHIFT_DAYS", None)
    for today, shift in ((date(2026, 11, 16), 0), (date(2026, 11, 27), 11), (date(2026, 11, 10), 0)):   # 기준일 이전은 밀지 않음
        monkeypatch.setattr(config, "today_kst", lambda t=today: t)
        recs = demo_data.build_records(offset=config.demo_shift())
        assert config.demo_shift() == shift
        assert len(recs) == 28 and (recs[-1]["version"], recs[-1]["day_in_version"]) == (3, 7)
        assert recs[-1]["date"] == config.demo_today().isoformat()
