"""환경값 → '다른 이유' 사실 문장 (기획서 22쪽).

원칙
- 비교 기준: 촬영일 전날과 최근 3일 평균을 '내 평소 값'(그 이전 14일 중앙값)과 비교
- 표현: '미세먼지 때문에'라고 말하지 않고 '같은 날 미세먼지가 평소보다 높았어요'처럼 사실만
- env_changed=True 이면 판정 엔진이 '신호 있음' 대신 '구분 불가'로 내린다

기준값(THRESHOLDS)은 첫 버전 값이다. 데이터를 보고 조정한다.
"""
from datetime import date, timedelta

import pandas as pd

THRESHOLDS = {
    "pm10_bad": 81,          # 환경부 PM10 '나쁨' 시작값 (㎍/㎥)
    "pm25_bad": 36,          # 환경부 PM2.5 '나쁨' 시작값 (㎍/㎥)
    "pm_ratio": 1.5,         # 평소의 1.5배 이상
    "humid_drop": 15,        # 평소보다 습도 15%p 이상 낮음
    "humid_dry": 40,         # 일평균 습도 40% 미만
    "temp_swing": 7,         # 전날 대비 일평균 기온 7℃ 이상 변화
}
BASELINE_DAYS = 14


def _f(v):
    return None if pd.isna(v) else float(round(v, 1))


def _window(df: pd.DataFrame, end: date, days: int) -> pd.DataFrame:
    d = pd.to_datetime(df["date"]).dt.date
    return df[(d > end - timedelta(days=days)) & (d <= end)]


def env_flags(env: pd.DataFrame, shot_date: date) -> dict:
    """env: date, pm10, pm25, temp_avg, humid_avg 열을 가진 일별 표 (한 사람 기준)."""
    t = THRESHOLDS
    prev = shot_date - timedelta(days=1)
    recent = _window(env, prev, 3)                       # 전날까지 최근 3일
    base = _window(env, prev - timedelta(days=3), BASELINE_DAYS)  # 그 이전 14일
    if recent.empty:
        return {"env_changed": False, "facts": [], "detail": {"reason": "환경 기록 없음"}}

    r, b = recent.mean(numeric_only=True), base.median(numeric_only=True)
    facts, detail = [], {}

    pm_high = False
    for col, bad, label in (("pm10", t["pm10_bad"], "미세먼지"), ("pm25", t["pm25_bad"], "초미세먼지")):
        rv, bv = r.get(col), b.get(col)
        if pd.isna(rv):
            continue
        high = rv >= bad or (pd.notna(bv) and bv > 0 and rv >= bv * t["pm_ratio"])
        detail[col] = {"recent3": _f(rv), "usual": _f(bv), "high": bool(high)}
        if high and not pm_high:
            facts.append(f"최근 3일 {label}가 평소보다 높았어요.")
            pm_high = True

    hv, hb = r.get("humid_avg"), b.get("humid_avg")
    dry = pd.notna(hv) and (hv < t["humid_dry"] or (pd.notna(hb) and hb - hv >= t["humid_drop"]))
    if pd.notna(hv):
        detail["humid_avg"] = {"recent3": _f(hv), "usual": _f(hb), "dry": bool(dry)}
    if dry:
        facts.append("최근 3일 공기가 평소보다 건조했어요.")

    swing = False
    day_prev = _window(env, prev, 1)
    day_prev2 = _window(env, prev - timedelta(days=1), 1)
    if not day_prev.empty and not day_prev2.empty:
        a, c = day_prev["temp_avg"].iloc[0], day_prev2["temp_avg"].iloc[0]
        if pd.notna(a) and pd.notna(c):
            swing = abs(a - c) >= t["temp_swing"]
            detail["temp_swing"] = {"prev_day": _f(a), "day_before": _f(c), "swing": bool(swing)}
    if swing:
        facts.append("전날 기온이 크게 바뀌었어요.")

    return {"env_changed": bool(pm_high or dry or swing), "facts": facts, "detail": detail}
