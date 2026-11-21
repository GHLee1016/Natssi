"""서울 25개 구의 일별 환경 값을 env_daily 표에 채운다. 하루 한 번 돌리면 된다.

    python scripts/update_env.py                    # 최근 30일, 25개 구 → Supabase(설정 시) 또는 CSV
    python scripts/update_env.py --start 2026-10-01 # 처음 한 번: 이 날짜부터 (에어코리아는 최근 3개월까지)
    python scripts/update_env.py --districts 서대문구 은평구

필요한 환경변수
    DATA_GO_KR_KEY                         공공데이터포털 키
    SUPABASE_URL, SUPABASE_SERVICE_KEY     있으면 Supabase env_daily 표에 upsert, 없으면 data/env_daily_seoul.csv

호출 수: 에어코리아 구당 1~3번 + 기상청 1번 → 하루 80번 이하 (개발 계정 한도 500번/일)
"""
import argparse
import json
import os
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from envdata import airkorea, kma  # noqa: E402
from envdata.service import CSV_PATH, SEOUL_DISTRICTS, TABLE  # noqa: E402


def collect(districts, start: date, end: date) -> pd.DataFrame:
    term = "3MONTH" if (date.today() - start).days > 28 else "MONTH"
    weather = kma.fetch_asos_daily(start, end)
    frames = []
    for d in districts:
        try:
            daily = airkorea.daily_mean(airkorea.fetch_hourly(d, term))
        except Exception as e:  # 한 구가 실패해도 나머지는 저장
            print(f"  {d} 실패: {e}")
            continue
        daily = daily[(daily["date"] >= start) & (daily["date"] <= end)]
        frames.append(daily.rename(columns={"station": "district"}))
        print(f"  {d}: {len(daily)}일")
    air = pd.concat(frames, ignore_index=True)
    out = air.merge(weather[["date", "temp_avg", "humid_avg"]], on="date", how="outer")
    # 기상청 값만 있고 에어코리아가 없는 날도 구마다 행을 만든다
    grid = pd.MultiIndex.from_product([districts, pd.date_range(start, end).date], names=["district", "date"])
    out = out.dropna(subset=["district"]).set_index(["district", "date"]).reindex(grid).reset_index()
    out = out.drop(columns=["temp_avg", "humid_avg"]).merge(weather[["date", "temp_avg", "humid_avg"]], on="date", how="left")
    # 측정소 점검으로 빈 날(예: 양천구 22일)은 그날 서울 전체 중앙값으로 채우고 표시해 둔다
    out["pm_source"] = out["pm25"].notna().map({True: "district", False: "seoul_median"})
    for c in ("pm10", "pm25"):
        out[c] = out[c].fillna(out.groupby("date")[c].transform("median"))
    out.loc[out["pm25"].isna(), "pm_source"] = None
    return out[["district", "date", "pm10", "pm25", "temp_avg", "humid_avg", "pm_source"]]


def save_supabase(df: pd.DataFrame, url: str, key: str):
    rows = json.loads(df.assign(date=df["date"].astype(str)).to_json(orient="records", force_ascii=False))
    for i in range(0, len(rows), 500):
        req = urllib.request.Request(
            f"{url.rstrip('/')}/rest/v1/{TABLE}?on_conflict=district,date",
            data=json.dumps(rows[i:i + 500], ensure_ascii=False).encode(), method="POST",
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"})
        urllib.request.urlopen(req, timeout=30).read()
    print(f"Supabase {TABLE}: {len(rows)}행 upsert")


def save_csv(df: pd.DataFrame):
    if CSV_PATH.exists():
        old = pd.read_csv(CSV_PATH, encoding="utf-8-sig")
        old["date"] = pd.to_datetime(old["date"]).dt.date
        df = pd.concat([old, df]).drop_duplicates(["district", "date"], keep="last")
    df = df.sort_values(["district", "date"])
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(CSV_PATH, index=False, encoding="utf-8-sig")
    print(f"{CSV_PATH.name}: {len(df)}행")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--start", help="기본: 30일 전")
    p.add_argument("--districts", nargs="*", default=SEOUL_DISTRICTS)
    a = p.parse_args()
    end = date.today() - timedelta(days=1)
    start = date.fromisoformat(a.start) if a.start else end - timedelta(days=29)
    print(f"{start} ~ {end}, {len(a.districts)}개 구")
    df = collect(a.districts, start, end)
    print(f"결측: {df[['pm10', 'pm25', 'temp_avg', 'humid_avg']].isna().sum().to_dict()}")
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    save_supabase(df, url, key) if url and key else save_csv(df)


if __name__ == "__main__":
    main()
