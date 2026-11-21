"""환경 ↔ 볼 붉은기 예비 분석 (방법을 미리 정해 둔다. 결과를 보고 바꾸지 않는다).

질문: 팀원 셀카의 볼 붉은기(a*)가, 환경이 달랐던 날에 같이 움직이는 경향이 보이는가?
      → '입증'이 아니라 '경향이 보인다 / 판단할 수 없다'까지만 말한다.

미리 정한 것
- 결과 변수: 사람·날짜별 볼 a* 평균 (품질 통과 사진만)
- 환경 변수 3개 (서비스 판단 규칙과 같은 정의, 각각 표준화해 '1 표준편차당' 효과로 봄)
    pm25_r3   촬영 전날까지 3일 평균 초미세먼지 (사는 구)
    humid_r3  촬영 전날까지 3일 평균 습도
    tswing    전날 일평균 기온 변화의 크기 |전날 - 그 전날|
- 모형: a* ~ 사람별 평균 + 사람별 시간 추세(계절 효과 제거) + 환경 3개    (최소제곱)
- 판단: 3개를 한 번에 보므로 유의수준 0.05/3. 효과 크기와 98.3% 신뢰구간을 그대로 보고
- 시차·다른 변수는 더 시도하지 않는다

사용
    python analysis/env_skin_prelim.py power              # 검정력 시뮬레이션 (셀카 없이 지금 가능)
    python analysis/env_skin_prelim.py districts          # 구 단위 수집이 의미 있나
    python analysis/env_skin_prelim.py run 측정.csv        # 본 분석 (member,date,redness_a,quality_ok)
    python analysis/env_skin_prelim.py demo               # 가짜 측정값으로 본 분석 코드 점검
"""
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

ROOT = Path(__file__).resolve().parents[1]
MEMBERS = {"팀원C": "서대문구", "팀원A": "성북구", "팀원B": "은평구"}
MDC95 = 2.35                          # backend/app/config.py (팀원 반복 셀카 59장, 2026-11-19)
SEM = MDC95 / (1.96 * np.sqrt(2))     # 사진 1장 측정 오차 표준편차 ≈ 0.85
ALPHA = 0.05 / 3
ENV_VARS = ["pm25_r3", "humid_r3", "tswing"]


def env_features(district: str) -> pd.DataFrame:
    e = pd.read_csv(ROOT / "data" / "env_daily_seoul.csv")
    e = e[e.district == district].copy()
    e["date"] = pd.to_datetime(e["date"])
    e = e.set_index("date").sort_index()
    out = pd.DataFrame(index=e.index)
    out["pm25_r3"] = e["pm25"].shift(1).rolling(3).mean()
    out["humid_r3"] = e["humid_avg"].shift(1).rolling(3).mean()
    out["tswing"] = (e["temp_avg"].shift(1) - e["temp_avg"].shift(2)).abs()
    return out.dropna().reset_index()


def team_env() -> pd.DataFrame:
    return pd.concat([env_features(d).assign(member=m) for m, d in MEMBERS.items()], ignore_index=True)


def fit(df: pd.DataFrame) -> pd.DataFrame:
    """df: member, date, redness(일평균) + ENV_VARS"""
    d = df.copy()
    d["t"] = (d["date"] - d["date"].min()).dt.days
    for v in ENV_VARS:
        d[v + "_z"] = (d[v] - d[v].mean()) / d[v].std()
    m = smf.ols("redness ~ C(member) + C(member):t + " + " + ".join(v + "_z" for v in ENV_VARS), data=d).fit()
    ci = m.conf_int(alpha=ALPHA)
    rows = []
    for v in ENV_VARS:
        k = v + "_z"
        rows.append({"환경 변수(1SD당)": v, "효과(a*)": round(m.params[k], 2),
                     "98.3% CI": f"{ci.loc[k, 0]:.2f} ~ {ci.loc[k, 1]:.2f}", "p": round(m.pvalues[k], 3),
                     "판단": "경향 있음" if m.pvalues[k] < ALPHA else "판단할 수 없음"})
    return pd.DataFrame(rows)


# ---------- 1) 검정력 시뮬레이션 ----------

def power(n_sim=400, seed=0, n_days=30):
    """n_days: 사람당 셀카 일수 (최근 n_days일). 실제 셀카 일수에 맞춘다."""
    rng = np.random.default_rng(seed)
    env = team_env()
    env = env[env.date > env.date.max() - pd.Timedelta(days=n_days)]
    days_avail = env.groupby("member").size().min()
    print(f"실제 환경 데이터: 3명 × {days_avail}일 ({env.date.min():%m/%d}~{env.date.max():%m/%d}), "
          f"사진 1장 측정 오차 SD {SEM:.2f} (MDC95 {MDC95})\n")
    rows = []
    for shots in (1, 3):                 # 하루 1장 vs 반복 촬영 3장 평균
        for sd_bio in (0.5, 1.0):        # 진짜 피부의 하루하루 흔들림 (모름 → 두 경우)
            for beta in (0.25, 0.5, 1.0):  # 초미세먼지 1SD당 붉은기 변화 (가정)
                hits = 0
                for _ in range(n_sim):
                    d = env.copy()
                    z = (d.pm25_r3 - d.pm25_r3.mean()) / d.pm25_r3.std()
                    person = d.member.map({m: rng.normal(12, 2) for m in MEMBERS})
                    d["redness"] = (person + beta * z + rng.normal(0, sd_bio, len(d))
                                    + rng.normal(0, SEM / np.sqrt(shots), len(d)))
                    t = (d["date"] - d["date"].min()).dt.days
                    d["t"] = t
                    for v in ENV_VARS:
                        d[v + "_z"] = (d[v] - d[v].mean()) / d[v].std()
                    m = smf.ols("redness ~ C(member) + C(member):t + pm25_r3_z + humid_r3_z + tswing_z", data=d).fit()
                    hits += m.pvalues["pm25_r3_z"] < ALPHA
                rows.append({"하루 사진": shots, "피부 자체 흔들림 SD": sd_bio, "가정한 효과(1SD당 a*)": beta,
                             "효과/MDC95": f"{beta / MDC95:.0%}", "찾아낼 확률": f"{hits / n_sim:.0%}"})
    out = pd.DataFrame(rows)
    print(out.to_string(index=False))
    out.to_csv(ROOT / "data" / "prelim_power.csv", index=False, encoding="utf-8-sig")
    return out


# ---------- 2) 구 단위 수집이 의미 있나 ----------

def districts():
    e = pd.read_csv(ROOT / "data" / "env_daily_seoul.csv")
    e = e[e.pm_source == "district"]
    wide = e.pivot(index="date", columns="district", values="pm25")
    within_day_sd = wide.std(axis=1).mean()
    across_day_sd = wide.mean(axis=1).std()
    rng = (wide.max(axis=1) - wide.min(axis=1))
    team = wide[list(MEMBERS.values())]
    print(f"초미세먼지(PM2.5) 서울 25개 구, {len(wide)}일")
    print(f"  같은 날 구끼리 차이 (SD 평균): {within_day_sd:.1f} ㎍/㎥")
    print(f"  날짜끼리 차이 (서울 평균의 SD): {across_day_sd:.1f} ㎍/㎥")
    print(f"  같은 날 가장 높은 구 - 가장 낮은 구: 평균 {rng.mean():.1f}, 최대 {rng.max():.1f} ㎍/㎥")
    print(f"  팀원 3개 구끼리 상관: {team.corr().values[np.triu_indices(3, 1)].round(2).tolist()}")

    # 서비스 판단('평소와 달라요')이 구 값 vs 서울 평균 값으로 얼마나 달라지나
    sys.path.insert(0, str(ROOT))
    from envdata import service
    days = [date(2026, 10, 19) + timedelta(days=i) for i in range(32)]
    seoul = e.groupby("date")[["pm10", "pm25"]].mean()
    diff = n = 0
    for dist in service.SEOUL_DISTRICTS:
        rows = service.load_rows(dist, date(2026, 10, 1), date(2026, 11, 20))
        rows_s = {d: {**v, **{c: float(seoul.loc[d.isoformat(), c]) for c in ("pm10", "pm25")}}
                  for d, v in rows.items() if d.isoformat() in seoul.index}
        for d in days:
            a, b = service.judge(rows, d)["unusual"], service.judge(rows_s, d)["unusual"]
            diff += a != b
            n += 1
    print(f"  '평소와 달라요' 판단이 구 값 vs 서울 평균 값으로 갈리는 경우: {diff}/{n} ({diff / n:.1%})")


# ---------- 3) 본 분석 ----------

def run(path):
    m = pd.read_csv(path)
    m["date"] = pd.to_datetime(m["date"])
    m = m[m.get("quality_ok", True).astype(str).str.lower().isin(["true", "1"])]
    daily = m.groupby(["member", "date"], as_index=False)["redness_a"].mean().rename(columns={"redness_a": "redness"})
    df = daily.merge(team_env(), on=["member", "date"], how="inner")
    print(f"분석에 쓴 날: {len(df)} (사람별 {df.groupby('member').size().to_dict()})")
    res = fit(df)
    print(res.to_string(index=False))
    return res


def demo(seed=1):
    """효과가 없는 가짜 측정값 → '판단할 수 없음'이 나와야 정상."""
    rng = np.random.default_rng(seed)
    env = team_env()
    rows = []
    for _, r in env.iterrows():
        for k in range(3):
            rows.append({"member": r.member, "date": r.date.date().isoformat(),
                         "redness_a": 12 + rng.normal(0, 0.8) + rng.normal(0, SEM), "quality_ok": k != 2 or rng.random() > .1})
    p = ROOT / "data" / "_fake_measure.csv"
    pd.DataFrame(rows).to_csv(p, index=False)
    out = run(p)
    p.unlink()
    return out


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "power"
    {"power": power, "districts": districts, "demo": demo}.get(cmd, lambda: run(sys.argv[2]))()
