"""기상청 API 두 가지.

1) ASOS 일자료 (기상청_지상(종관, ASOS) 일자료 조회서비스)
   - 과거 날짜의 일평균 기온·습도. 서울은 관측소가 1곳(108)뿐이라 자치구 구분이 없다.
   - 백필용. 어제 날짜까지만 조회된다.
2) 초단기실황 (기상청_단기예보 조회서비스 getUltraSrtNcst)
   - 지금 이 시각의 관측값을 5km 격자(nx, ny) 단위로 준다 → 자치구 단위.
   - 앱에서 셀카를 찍을 때마다 호출해 함께 저장한다.
"""
import math
from datetime import date, datetime, timedelta

import pandas as pd

from ._http import get_items

ASOS_URL = "http://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList"
NCST_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"
SEOUL_STN = 108


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------- 1) ASOS 일자료 ----------

def fetch_asos_daily(start: date, end: date, stn_id: int = SEOUL_STN) -> pd.DataFrame:
    """start~end(포함) 일평균 기온·최저/최고기온·평균/최저 습도·강수량."""
    end = min(end, date.today() - timedelta(days=1))
    if start > end:
        return pd.DataFrame()
    items, _ = get_items(ASOS_URL, {
        "dataType": "JSON", "numOfRows": 999, "pageNo": 1,
        "dataCd": "ASOS", "dateCd": "DAY", "stnIds": stn_id,
        "startDt": start.strftime("%Y%m%d"), "endDt": end.strftime("%Y%m%d"),
    })
    df = pd.DataFrame([{
        "date": pd.to_datetime(it.get("tm")).date(),
        "temp_avg": _num(it.get("avgTa")),
        "temp_min": _num(it.get("minTa")),
        "temp_max": _num(it.get("maxTa")),
        "humid_avg": _num(it.get("avgRhm")),
        "humid_min": _num(it.get("minRhm")),
        "rain_mm": _num(it.get("sumRn")) or 0.0,
    } for it in items])
    return df


# ---------- 2) 초단기실황 ----------

def latlon_to_grid(lat: float, lon: float) -> tuple[int, int]:
    """위경도 → 기상청 동네예보 격자(nx, ny). 기상청 공개 LCC 변환식."""
    RE, GRID = 6371.00877, 5.0
    SLAT1, SLAT2, OLON, OLAT, XO, YO = 30.0, 60.0, 126.0, 38.0, 43, 136
    D = math.pi / 180.0
    re = RE / GRID
    s1, s2, olon, olat = SLAT1 * D, SLAT2 * D, OLON * D, OLAT * D
    sn = math.log(math.cos(s1) / math.cos(s2)) / math.log(
        math.tan(math.pi * 0.25 + s2 * 0.5) / math.tan(math.pi * 0.25 + s1 * 0.5))
    sf = math.tan(math.pi * 0.25 + s1 * 0.5) ** sn * math.cos(s1) / sn
    ro = re * sf / math.tan(math.pi * 0.25 + olat * 0.5) ** sn
    ra = re * sf / math.tan(math.pi * 0.25 + lat * D * 0.5) ** sn
    theta = lon * D - olon
    theta = (theta + math.pi) % (2 * math.pi) - math.pi
    theta *= sn
    nx = int(ra * math.sin(theta) + XO + 0.5)
    ny = int(ro - ra * math.cos(theta) + YO + 0.5)
    return nx, ny


def fetch_now(nx: int, ny: int, at: datetime | None = None) -> dict:
    """촬영 시각의 기온·습도·1시간 강수. 매시 정각 자료가 약 40분 뒤에 올라온다."""
    at = at or datetime.now()
    base = at - timedelta(minutes=45)
    base = base.replace(minute=0, second=0, microsecond=0)
    items, _ = get_items(NCST_URL, {
        "dataType": "JSON", "numOfRows": 20, "pageNo": 1,
        "base_date": base.strftime("%Y%m%d"), "base_time": base.strftime("%H%M"),
        "nx": nx, "ny": ny,
    })
    by_cat = {it["category"]: _num(it.get("obsrValue")) for it in items}
    return {
        "observed_at": base.isoformat(timespec="minutes"),
        "nx": nx, "ny": ny,
        "temp": by_cat.get("T1H"),
        "humid": by_cat.get("REH"),
        "rain_1h": by_cat.get("RN1"),
    }
