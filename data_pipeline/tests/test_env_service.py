"""cd data_pipeline && python -m pytest tests -q"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from envdata.service import attach_env, judge, summarize  # noqa: E402


def _rows(override=None, n=20, end=date(2026, 11, 15)):
    """평온한 날들. override={날짜: {열: 값}}"""
    rows = {end - timedelta(days=i): {"pm10": 30.0, "pm25": 15.0, "temp_avg": 10.0, "humid_avg": 60.0}
            for i in range(n)}
    for d, vals in (override or {}).items():
        rows[d].update(vals)
    return rows


def test_calm_days_are_not_unusual():
    e = judge(_rows(), date(2026, 11, 15))
    assert e["unusual"] is False and e["facts"] == []
    assert e["pm25"] == 15 and e["humidity"] == 60   # 앱이 쓰는 키


def test_dust_spike_in_last_3_days():
    d = date(2026, 11, 15)
    rows = _rows({d - timedelta(days=k): {"pm25": 40.0} for k in (1, 2, 3)})
    e = judge(rows, d)
    assert e["unusual"] and e["facts"] == ["최근 3일 초미세먼지가 평소보다 높았어요."]


def test_spike_on_shot_day_itself_does_not_count():
    """촬영 당일 값은 아직 집계 중이라 비교에 쓰지 않는다 (전날까지 3일)."""
    d = date(2026, 11, 15)
    e = judge(_rows({d: {"pm25": 90.0}}), d)
    assert e["unusual"] is False and e["pm25"] == 90


def test_dry_and_temperature_swing():
    d = date(2026, 11, 15)
    rows = _rows({d - timedelta(days=k): {"humid_avg": 35.0} for k in (1, 2, 3)})
    rows[d - timedelta(days=1)]["temp_avg"] = 1.0       # 전날 10 → 1도
    e = judge(rows, d)
    assert "최근 3일 공기가 평소보다 건조했어요." in e["facts"]
    assert "전날 기온이 크게 바뀌었어요." in e["facts"]


def test_missing_data_is_not_unusual():
    e = judge({}, date(2026, 11, 15))
    assert e["unusual"] is False and e["pm25"] is None and e["detail"] == {"reason": "환경 기록 없음"}


def test_attach_env_without_district_keeps_records():
    recs = [{"date": "2026-11-15", "env": {"pm25": 1, "humidity": 2, "unusual": False}}]
    assert attach_env(recs, None)[0]["env"]["pm25"] == 1


def test_summarize_default_sentence():
    assert summarize([{"facts": []}]) == ["같은 기간 미세먼지·습도·기온은 평소와 비슷했어요."]
    assert summarize([{"facts": ["A"]}, {"facts": ["A", "B"]}]) == ["A", "B"]
