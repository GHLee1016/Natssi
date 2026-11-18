"""셀카 첫날부터 어제까지 팀원별 환경 데이터를 CSV로 저장한다.

사용법 (프로젝트 폴더에서):
    set DATA_GO_KR_KEY=발급받은_Decoding_키        (PowerShell: $env:DATA_GO_KR_KEY="...")
    python scripts/backfill_env.py --start 2026-11-01

결과: data/env_daily.csv  (member, district, date, pm10, pm25, temp_avg, ..., humid_avg)
"""
import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from envdata import airkorea, kma  # noqa: E402

# 팀원별 사는 자치구 (= 에어코리아 측정소 이름). 실제 자치구로 바꿔 주세요.
MEMBERS = {
    "이건희": "성북구",
    "김영래": "강서구",
    "강주희": "서대문구",
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--start", required=True, help="셀카 첫날, 예: 2026-11-01")
    p.add_argument("--out", default="data/env_daily.csv")
    p.add_argument("--member", action="append", metavar="이름=자치구",
                   help="이 사람만 받기 (여러 번 가능). 예: --member 강주희=관악구")
    args = p.parse_args()

    members = MEMBERS
    if args.member:
        members = dict(m.split("=", 1) for m in args.member)

    start = date.fromisoformat(args.start)
    end = date.today() - timedelta(days=1)
    if (date.today() - start).days > 85:
        print("주의: 에어코리아는 최근 3개월치만 줍니다. 그 이전 날짜는 비어 있습니다.")

    # 기온·습도: 서울 ASOS(108) 하나를 모든 팀원에게 공통 적용
    weather = kma.fetch_asos_daily(start, end)
    print(f"기상청 ASOS: {len(weather)}일")

    frames = []
    for station in sorted(set(members.values())):
        hourly = airkorea.fetch_hourly(station, "3MONTH")
        daily = airkorea.daily_mean(hourly)
        daily = daily[(daily["date"] >= start) & (daily["date"] <= end)]
        print(f"에어코리아 {station}: 시간별 {len(hourly)}건 → 일평균 {len(daily)}일")
        frames.append(daily.rename(columns={"station": "district"}))
    air = pd.concat(frames, ignore_index=True)

    rows = []
    for member, district in members.items():
        a = air[air["district"] == district].drop(columns="district")
        m = pd.DataFrame({"date": pd.date_range(start, end).date})
        m = m.merge(a, on="date", how="left").merge(weather, on="date", how="left")
        m.insert(0, "district", district)
        m.insert(0, "member", member)
        rows.append(m)
    out = pd.concat(rows, ignore_index=True)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, index=False, encoding="utf-8-sig")
    missing = out[["pm10", "temp_avg"]].isna().sum().to_dict()
    print(f"저장: {args.out} ({len(out)}행), 결측: {missing}")


if __name__ == "__main__":
    main()
