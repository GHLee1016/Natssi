"""에어코리아 측정소별 실시간 측정정보 (한국환경공단_에어코리아_대기오염정보).

서울 자치구마다 같은 이름의 측정소가 있다 (예: '관악구', '마포구').
dataTerm='3MONTH'로 최근 3개월치 시간별 값을 받을 수 있어 과거 백필에 쓴다.
"""
import pandas as pd

from ._http import get_items

URL = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None  # '-' 또는 빈 값 = 점검·통신장애


def fetch_hourly(station: str, data_term: str = "3MONTH") -> pd.DataFrame:
    """측정소의 시간별 PM10·PM2.5. data_term: DAILY | MONTH | 3MONTH"""
    rows, page = [], 1
    while True:
        items, total = get_items(URL, {
            "returnType": "json", "numOfRows": 1000, "pageNo": page,
            "stationName": station, "dataTerm": data_term, "ver": "1.0",
        })
        rows += items
        if not items or len(rows) >= total:
            break
        page += 1

    df = pd.DataFrame([{
        "station": station,
        "data_time": it.get("dataTime"),
        "pm10": _num(it.get("pm10Value")),
        "pm25": _num(it.get("pm25Value")),
    } for it in rows])
    if df.empty:
        return df
    # 에어코리아는 자정을 '24:00'으로 표기한다 → 다음 날 00:00
    raw = df["data_time"].astype(str)
    is24 = raw.str.endswith(" 24:00")
    t = pd.to_datetime(raw.str.replace(" 24:00", " 00:00", regex=False),
                       format="%Y-%m-%d %H:%M", errors="coerce")
    t[is24] += pd.Timedelta(days=1)
    df["data_time"] = t
    return df.dropna(subset=["data_time"]).sort_values("data_time").reset_index(drop=True)


def daily_mean(hourly: pd.DataFrame, min_hours: int = 18) -> pd.DataFrame:
    """시간별 → 일평균. 유효 시간이 min_hours 미만인 날은 결측 처리."""
    if hourly.empty:
        return pd.DataFrame(columns=["station", "date", "pm10", "pm25"])
    h = hourly.copy()
    # 1시~24시를 하루로 보는 에어코리아 관례에 맞춰 1시간 당겨서 날짜를 정한다
    h["date"] = (h["data_time"] - pd.Timedelta(hours=1)).dt.date
    g = h.groupby(["station", "date"])
    out = g[["pm10", "pm25"]].mean().round(1)
    counts = g[["pm10", "pm25"]].count()
    out = out.where(counts >= min_hours)
    return out.reset_index()
