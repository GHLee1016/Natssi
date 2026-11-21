"""앱(백엔드)에서 부르는 환경 데이터 기능. 표준 라이브러리만 쓴다 (Vercel 함수에 pandas 없음).

    from envdata.service import attach_env
    records = attach_env(records, district="서대문구")   # 각 기록에 env 채우기

각 기록의 env 모양 (앱이 이미 쓰는 키 + 추가 키):
    {"pm25": 16, "humidity": 46, "unusual": False,          ← judge.py·화면이 쓰는 키 그대로
     "pm10": 31, "temp": 12.5, "facts": ["최근 3일 초미세먼지가 평소보다 높았어요."],
     "detail": {...}}                                         ← 리포트 '다른 이유' 문장용

규칙 (기획서 22쪽)
- 비교: 촬영 전날까지 최근 3일 평균 vs 그 전 14일 중앙값('내 동네 평소 값')
- 미세먼지: '나쁨' 시작값(PM10 81, PM2.5 36) 이상이거나 평소의 2배 이상
- 건조: 일평균 습도 40% 미만이거나 평소보다 20%p 이상 낮음
- 기온: 전날 일평균 기온이 그 전날보다 7℃ 이상 바뀜
- 표현은 사실만. '미세먼지 때문에'라고 하지 않는다.
기준값은 첫 버전이다. THRESHOLDS만 바꾸면 된다.

데이터는 env_daily 표(Supabase)에서 읽는다. 표는 scripts/update_env.py가 매일 채운다.
SUPABASE_URL·SUPABASE_SERVICE_KEY가 없으면 data/env_daily_seoul.csv(로컬)에서 읽는다.
"""
import csv
import json
import os
import statistics
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

# 서울 25개 구 × 2026-10-19~11-19(800일·구)로 맞춘 값.
#   처음 값(1.5배, 15%p)은 44%의 날을 '평소와 달라요'로 만들어 신호 절반이 '구분 불가'가 됐다.
#   (가을은 평소 초미세먼지가 15 안팎이라 1.5배=22, 아직 '보통'인데도 걸림)
#   2배·20%p로 바꾸면 8%. 계절이 바뀌면 다시 재 보고 조정한다.
THRESHOLDS = {
    "pm10_bad": 81,     # 환경부 PM10 '나쁨' 시작값 (㎍/㎥)
    "pm25_bad": 36,     # 환경부 PM2.5 '나쁨' 시작값 (㎍/㎥)
    "pm_ratio": 2.0,    # 평소의 2배 이상
    "humid_drop": 20,   # 평소보다 습도 20%p 이상 낮음
    "humid_dry": 40,    # 일평균 습도 40% 미만
    "temp_swing": 7,    # 전날 대비 일평균 기온 7℃ 이상 변화
}
RECENT_DAYS, BASELINE_DAYS = 3, 14
TABLE = "env_daily"
CSV_PATH = Path(__file__).resolve().parents[1] / "data" / "env_daily_seoul.csv"
COLS = ("pm10", "pm25", "temp_avg", "humid_avg")

SEOUL_DISTRICTS = [
    "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구",
    "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구",
    "용산구", "은평구", "종로구", "중구", "중랑구",
]


# ---------- 읽기 ----------

def _num(v):
    try:
        return None if v in (None, "") else float(v)
    except (TypeError, ValueError):
        return None


def load_rows(district: str, start: date, end: date) -> dict[date, dict]:
    """{날짜: {pm10, pm25, temp_avg, humid_avg}} (start~end 포함)."""
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if url and key:
        q = urllib.parse.urlencode([
            ("select", "date," + ",".join(COLS)), ("district", f"eq.{district}"),
            ("date", f"gte.{start.isoformat()}"), ("date", f"lte.{end.isoformat()}"),
        ])
        req = urllib.request.Request(f"{url.rstrip('/')}/rest/v1/{TABLE}?{q}",
                                     headers={"apikey": key, "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req, timeout=8) as r:
            raw = json.loads(r.read())
    elif CSV_PATH.exists():
        with open(CSV_PATH, encoding="utf-8-sig") as f:
            raw = [row for row in csv.DictReader(f)
                   if row["district"] == district and start.isoformat() <= row["date"] <= end.isoformat()]
    else:
        raw = []
    return {date.fromisoformat(r["date"]): {c: _num(r.get(c)) for c in COLS} for r in raw}


# ---------- 판단 ----------

def _vals(rows, days, col):
    return [rows[d][col] for d in days if d in rows and rows[d][col] is not None]


def _r1(v):
    return None if v is None else round(v, 1)


def judge(rows: dict[date, dict], day: date) -> dict:
    """한 기록(day)의 env. rows는 day 17일 전부터 day까지 있으면 된다."""
    t = THRESHOLDS
    prev = day - timedelta(days=1)
    recent = [prev - timedelta(days=i) for i in range(RECENT_DAYS)]
    base = [prev - timedelta(days=RECENT_DAYS + i) for i in range(BASELINE_DAYS)]

    # 화면에 보이는 값: 그날 값, 없으면(오늘처럼 아직 집계 전) 가장 가까운 지난 날
    shown = next((rows[d] for d in [day, prev, prev - timedelta(days=1)] if d in rows), {})
    out = {
        "pm25": None if shown.get("pm25") is None else round(shown["pm25"]),
        "humidity": None if shown.get("humid_avg") is None else round(shown["humid_avg"]),
        "pm10": None if shown.get("pm10") is None else round(shown["pm10"]),
        "temp": _r1(shown.get("temp_avg")),
        "unusual": False, "facts": [], "detail": {},
    }

    def mean(xs):
        return sum(xs) / len(xs) if xs else None

    def median(xs):
        return statistics.median(xs) if xs else None

    pm_high = False
    for col, bad, label in (("pm10", t["pm10_bad"], "미세먼지"), ("pm25", t["pm25_bad"], "초미세먼지")):
        rv, bv = mean(_vals(rows, recent, col)), median(_vals(rows, base, col))
        if rv is None:
            continue
        high = rv >= bad or (bv is not None and bv > 0 and rv >= bv * t["pm_ratio"])
        out["detail"][col] = {"recent3": _r1(rv), "usual": _r1(bv), "high": high}
        if high and not pm_high:
            out["facts"].append(f"최근 3일 {label}가 평소보다 높았어요.")
            pm_high = True

    hv, hb = mean(_vals(rows, recent, "humid_avg")), median(_vals(rows, base, "humid_avg"))
    dry = hv is not None and (hv < t["humid_dry"] or (hb is not None and hb - hv >= t["humid_drop"]))
    if hv is not None:
        out["detail"]["humid_avg"] = {"recent3": _r1(hv), "usual": _r1(hb), "dry": dry}
    if dry:
        out["facts"].append("최근 3일 공기가 평소보다 건조했어요.")

    a = rows.get(prev, {}).get("temp_avg")
    c = rows.get(prev - timedelta(days=1), {}).get("temp_avg")
    swing = a is not None and c is not None and abs(a - c) >= t["temp_swing"]
    if a is not None and c is not None:
        out["detail"]["temp_swing"] = {"prev_day": _r1(a), "day_before": _r1(c), "swing": swing}
    if swing:
        out["facts"].append("전날 기온이 크게 바뀌었어요.")

    out["unusual"] = bool(pm_high or dry or swing)
    if not out["detail"]:
        out["detail"]["reason"] = "환경 기록 없음"
    return out


def attach_env(records: list[dict], district: str | None) -> list[dict]:
    """앱 기록 목록(각각 'date': 'YYYY-MM-DD')에 env를 채운다. 표를 한 번만 읽는다.
    district가 없으면(사용자가 구를 안 골랐으면) env를 건드리지 않는다."""
    if not district or not records:
        return records
    days = [date.fromisoformat(r["date"]) for r in records]
    rows = load_rows(district, min(days) - timedelta(days=RECENT_DAYS + BASELINE_DAYS + 1), max(days))
    for r, d in zip(records, days):
        r["env"] = judge(rows, d)
    return records


def summarize(envs: list[dict]) -> list[str]:
    """여러 기록(예: 신호가 난 날들)의 env → 리포트 '다른 이유' 문장 (중복 없이)."""
    facts = []
    for e in envs:
        for f in e.get("facts", []):
            if f not in facts:
                facts.append(f)
    return facts or ["같은 기간 미세먼지·습도·기온은 평소와 비슷했어요."]
