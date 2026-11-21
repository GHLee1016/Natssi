"""pandas 표로 쓰는 '다른 이유' 판단 (분석·노트북용). 규칙은 service.py 한 곳에만 있다."""
from datetime import date

import pandas as pd

from .service import COLS, THRESHOLDS, judge  # noqa: F401  (THRESHOLDS는 예전 import 호환)


def env_flags(env: pd.DataFrame, shot_date: date) -> dict:
    """env: date, pm10, pm25, temp_avg, humid_avg 열을 가진 일별 표 (한 사람·한 구 기준)."""
    rows = {}
    for r in env.to_dict("records"):
        d = pd.Timestamp(r["date"]).date()
        rows[d] = {c: (None if pd.isna(r.get(c)) else float(r[c])) for c in COLS}
    e = judge(rows, shot_date)
    return {"env_changed": e["unusual"], "facts": e["facts"], "detail": e["detail"]}
