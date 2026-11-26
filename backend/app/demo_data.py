"""가상 페르소나 김서연의 4주치 기록. 실제 사람의 데이터가 아닙니다."""
import random
from datetime import date, timedelta

from . import config

PERSONA = {
    "name": "김서연", "age": 28, "type": "홈더마 사용자 (중관여)",
    "note": "가상 인물, 가상 기록",
}

PRODUCTS = {
    "cleanser": {"name": "약산성 클렌저", "family": "세정", "kind": "cosmetic"},
    "retinol": {"name": "레티놀 세럼", "family": "레티노이드", "kind": "cosmetic"},
    "cream": {"name": "세라마이드 크림", "family": "보습", "kind": "cosmetic"},
    "sun": {"name": "데일리 선크림", "family": "자외선 차단", "kind": "cosmetic"},
    "led": {"name": "LED 케어 디바이스", "family": "LED", "kind": "device"},
}

VERSIONS = [
    {"id": 1, "start": date(2026, 10, 20), "label": "기존 루틴", "phrase": None, "change": None, "reason": None,
     "items": [("cleanser", "아침·저녁"), ("cream", "매일 저녁"), ("sun", "아침"), ("led", "주 3회 · 10분 · 강도 2")]},
    {"id": 2, "start": date(2026, 11, 3), "label": "레티놀 세럼 추가", "phrase": "레티놀 세럼을 추가한", "change": "레티놀 세럼 추가 (매일 저녁)",
     "reason": "새 제품",
     "items": [("cleanser", "아침·저녁"), ("retinol", "매일 저녁"), ("cream", "매일 저녁"), ("sun", "아침"),
               ("led", "주 3회 · 10분 · 강도 2")]},
    {"id": 3, "start": date(2026, 11, 10), "label": "레티놀 주 2회로 조정", "phrase": "레티놀을 주 2회로 줄인", "change": "레티놀 세럼 매일 → 주 2회",
     "reason": "자극",
     "items": [("cleanser", "아침·저녁"), ("retinol", "주 2회"), ("cream", "매일 저녁"), ("sun", "아침"),
               ("led", "주 3회 · 10분 · 강도 2")]},
]

# 반응을 심은 부분: 버전 2의 4~7일차에 붉은기가 오르고, 버전 3에서 가라앉음
_V2_SHIFT = [0.3, 0.6, 1.2, 2.6, 3.4, 3.9, 3.4]
_V2_STING = [0, 0, 1, 2, 2, 2, 1]
_V3_SHIFT = [2.4, 1.5, 0.8, 0.3, 0.0, 0.1, -0.1]
_V3_STING = [1, 0, 0, 0, 0, 0, 0]
_SKIPPED = {date(2026, 10, 25), date(2026, 10, 30)}   # 조명이 달라 측정 보류된 날 (기준일 기준)


def versions(shift: int = 0) -> list:
    """기준 날짜(VERSIONS)를 shift일 민 루틴 버전 목록. 이름·항목은 그대로, 시작일만 움직인다."""
    return [{**v, "start": v["start"] + timedelta(days=shift)} for v in VERSIONS]


def version_of(d: date, vs: list | None = None) -> int:
    vid = 1
    for v in vs or VERSIONS:
        if d >= v["start"]:
            vid = v["id"]
    return vid


def build_records(end: date | None = None, offset: int = 0):
    vs = versions(offset)
    end = end or config.DEMO_BASE + timedelta(days=offset)
    skipped = {d + timedelta(days=offset) for d in _SKIPPED}
    rng = random.Random(20261116)
    recs, d, i = [], vs[0]["start"], 1
    while d <= end:
        vid = version_of(d, vs)
        day_in_v = (d - vs[vid - 1]["start"]).days
        noise = rng.gauss(0, 0.45)
        shift, sting = 0.0, 0
        if vid == 2:
            shift, sting = _V2_SHIFT[day_in_v], _V2_STING[day_in_v]
        elif vid == 3:
            shift, sting = _V3_SHIFT[day_in_v], _V3_STING[day_in_v]
        quality_ok = d not in skipped
        recs.append({
            "id": i, "date": d.isoformat(), "version": vid, "day_in_version": day_in_v + 1,
            "quality_ok": quality_ok,
            "quality_note": None if quality_ok else "조명이 평소와 달라 측정을 보류했어요",
            "redness": round(shift + noise * (0.5 if shift > 1 else 1), 2) if quality_ok else None,
            "symptoms": {"따가움": sting, "화끈": 1 if sting >= 2 and day_in_v == 5 else 0, "가려움": 0, "당김": 1 if vid == 2 and day_in_v >= 2 else 0},
            "routine_done": True,
            "env": {"pm25": 16 + rng.randint(-4, 6), "humidity": 46 + rng.randint(-5, 5), "unusual": False},
            "photo": "B" if (vid == 2 and day_in_v >= 3) or (vid == 3 and day_in_v == 0) else ("A" if vid == 1 else "C"),
        })
        d += timedelta(days=1)
        i += 1
    return recs
