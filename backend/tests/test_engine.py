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


def test_demo_story_signal_days():
    # MDC95를 바꾸면 데모 이야기가 달라질 수 있어요(1.65~2.40에서는 같고, 2.45 이상이면 '신호 있음'이 줄어요).
    assert sum(r["verdict"]["level"] == judge.SIGNAL for r in rows) == 5, config.MDC95_A_STAR


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


def test_light_change_turns_high_redness_into_fog():
    """조명 색(b*)이 평소와 다르면 붉은기가 높아도 '흐림'이 아니라 안개(구분 불가)."""
    def rec(i, a, b):
        return {"date": f"2026-12-{i + 1:02d}", "version": 1, "redness": a, "b": b, "quality_ok": True,
                "symptoms": {}, "env": {}}
    usual = [rec(i, 10 + (i % 3) * 0.2, 16 + (i % 2) * 0.3) for i in range(8)]
    warm = judge.judge_all(usual + [rec(8, 15, 22), rec(9, 15, 22)])           # 따뜻한 조명: a*, b* 함께 오름
    assert [r["verdict"]["level"] for r in warm[-2:]] == [judge.UNKNOWN, judge.UNKNOWN]
    assert "조명" in warm[-1]["verdict"]["reasons"][0]
    same_light = judge.judge_all(usual + [rec(8, 15, 16.2), rec(9, 15, 16.1)])  # 조명 그대로: 흐림
    assert same_light[-1]["verdict"]["level"] == judge.SIGNAL


def test_light_change_also_fogs_low_redness():
    """차가운 조명이나 필터로 붉은기가 낮게 찍혀도(b*가 평소와 다르면) '맑음'이 아니라 안개. 실제로 붉어진 날을 가리지 않게."""
    def rec(i, a, b):
        return {"date": f"2026-12-{i + 1:02d}", "version": 1, "redness": a, "b": b, "quality_ok": True,
                "symptoms": {}, "env": {}}
    usual = [rec(i, 10 + (i % 3) * 0.2, 16 + (i % 2) * 0.3) for i in range(8)]
    cool_low = judge.judge_all(usual + [rec(8, 6, 10)])          # 차갑게: a*, b* 함께 내려감(범위 아래)
    cool_in = judge.judge_all(usual + [rec(8, 9.5, 11)])          # 실제 붉은기가 올랐는데 차가운 필터로 평소 범위 안에 찍힘
    for r in (cool_low[-1], cool_in[-1]):
        assert r["verdict"]["level"] == judge.UNKNOWN and "조명" in r["verdict"]["reasons"][0]
    same_light = judge.judge_all(usual + [rec(8, 9.5, 16.1)])     # 조명 그대로면 맑음
    assert same_light[-1]["verdict"]["level"] == judge.NO_SIGNAL


def test_demo_insights_recap_challenge_overlap():
    c = TestClient(app)
    d = c.get("/api/insights").json()
    assert d["recap"]["month"] == "2026-11" and d["recap"]["weather"]["신호 있음"] == 5
    assert any("평소 범위를 넘었어요" in x for x in d["recap"]["lines"])
    cal = d["recap"]["cal"]                                                        # 기록 칸 지도: 기록한 날마다 날씨
    assert len(cal) == d["recap"]["days"] and sum(1 for x in cal if x["level"]) == d["recap"]["photo_days"]
    assert sum(1 for x in cal if x["level"] == "신호 있음") == 5
    r2, r3 = d["challenge"]["rounds"]
    assert r2["done"] and r2["beyond"] and r2["delta"] > 0                       # 레티놀 추가 뒤 붉은기 오름(오차 밖)
    assert r3["done"] and r3["delta"] < 0                                         # 주 2회로 줄인 뒤 내려감
    assert d["challenge"]["current"]["phase"] == "done"
    assert d["overlap"][0]["families"] == ["레티노이드"] and d["overlap"][0]["changed"][0]["kind"] == "added"
    assert c.get("/api/insights", params={"month": "2026-10"}).json()["recap"]["month"] == "2026-10"
    assert c.get("/api/insights", params={"month": "bad"}).status_code == 422
    for s in [x for x in d["recap"]["lines"]]:
        assert "때문" not in s and "추천" not in s                               # 원인 단정·추천 표현 없음
