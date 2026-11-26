"""앱 판정 기준 MDC95(볼 a*, 2.35)를 남아 있는 반복 셀카 측정값으로 다시 계산해 본다.

2.35와 신뢰구간 1.85~2.97을 낸 원래 스크립트(natssi_selfie_validation)는 없어졌고, 어떤 반복을 기준으로 했는지
(같은 날 여러 장인지, 날마다 1장인지)와 신뢰구간 방법이 기록에 없다. 그래서 반복의 정의를 4가지로 나눠 모두 내고,
각각 두 가지 신뢰구간을 붙인다.

반복의 정의 (모두 사람 안에서만 본다. 사람끼리의 차이는 빼고, 사람별 분산을 자유도로 가중해 합친다)
- same_day   : 같은 날 여러 장의 흔들림 (color_robustness, fullface_redness의 MDC와 같은 식)
- day_first  : 날마다 첫 장만 골라 날짜 사이의 흔들림 ('하루 1장 기준')
- day_mean   : 날마다 평균을 내서 날짜 사이의 흔들림
- all_photos : 날짜 구분 없이 사람 안 모든 사진의 흔들림

MDC95 = 1.96 × √2 × SD.  SD는 위 정의의 사람 안 표준편차(합친 값).
신뢰구간
- 모수적: 정규분포 가정, SD² × 자유도 / 카이제곱(자유도)  → MDC 구간
- 부트스트랩: 사람별로 나눠서 각 사람 안의 단위(날 또는 사진)를 복원추출, 5000번, 2.5~97.5 백분위

입력은 이미 만든 측정 파일만 쓴다(사진을 다시 읽지 않음).
    python analysis/mdc95_check.py                       # private/fullface_redness.csv 또는 private/color_robustness.csv
    python analysis/mdc95_check.py <측정 csv>
결과 요약은 data/mdc95_check.md에 쓴다(사람별 숫자나 사진 정보는 쓰지 않음).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import chi2

ROOT = Path(__file__).resolve().parents[1]
TARGET = 2.35                 # backend/app/config.py MDC95_A_STAR
TARGET_CI = (1.85, 2.97)
Z = 1.96 * np.sqrt(2)
B = 5000
DEFS = {
    "same_day": "같은 날 여러 장",
    "day_first": "날마다 첫 장, 날짜 사이",
    "day_mean": "날마다 평균, 날짜 사이",
    "all_photos": "사람 안 모든 사진",
}


def load(path=None) -> pd.DataFrame:
    """원본(필터 없음) 중 품질 통과한 사진의 볼 a*만 남긴다: member, date, photo, a."""
    cands = [Path(path)] if path else [ROOT / "private" / "fullface_redness.csv", ROOT / "private" / "color_robustness.csv"]
    for p in cands:
        if p.exists():
            d = pd.read_csv(p)
            break
    else:
        raise SystemExit(f"측정 파일이 없어요: {', '.join(map(str, cands))}")
    if "kind" in d:
        d = d[d["kind"] == "none"]
    if "quality_ok" in d:
        d = d[d["quality_ok"].astype(bool)]
    d = d.dropna(subset=["a_star"])
    out = pd.DataFrame(dict(member=d["member"].astype(str), date=d["date"].astype(str),
                            photo=pd.to_numeric(d["photo"], errors="coerce"), a=d["a_star"].astype(float)))
    print(f"측정 파일: {p}", flush=True)
    return out.sort_values(["member", "date", "photo"]).reset_index(drop=True)


def units(d: pd.DataFrame, how: str) -> pd.DataFrame:
    """정의별로 '흔들림을 볼 단위'와 그 묶음(group)을 만든다. 반환: member, group, a."""
    if how == "same_day":
        return d.assign(group=d["member"] + "|" + d["date"])[["member", "group", "a"]]
    if how == "day_first":
        f = d.groupby(["member", "date"], as_index=False).first()
        return f.assign(group=f["member"])[["member", "group", "a"]]
    if how == "day_mean":
        m = d.groupby(["member", "date"], as_index=False)["a"].mean()
        return m.assign(group=m["member"])[["member", "group", "a"]]
    if how == "all_photos":
        return d.assign(group=d["member"])[["member", "group", "a"]]
    raise ValueError(how)


def pooled_sd(u: pd.DataFrame):
    """묶음 안 분산을 자유도로 가중해 합친 표준편차와 자유도. 단위가 1개뿐인 묶음은 뺀다."""
    g = u.groupby("group")["a"]
    ss = g.apply(lambda x: float(((x - x.mean()) ** 2).sum()))
    df = g.count() - 1
    ok = df > 0
    dof = int(df[ok].sum())
    if dof == 0:
        return float("nan"), 0
    return float(np.sqrt(ss[ok].sum() / dof)), dof


def param_ci(sd: float, dof: int, level=0.95):
    lo_q, hi_q = (1 - level) / 2, 1 - (1 - level) / 2
    return Z * sd * np.sqrt(dof / chi2.ppf(hi_q, dof)), Z * sd * np.sqrt(dof / chi2.ppf(lo_q, dof))


def boot_ci(d: pd.DataFrame, how: str, b=B, seed=0):
    """사람별로 나눠 복원추출. same_day는 '날'을 통째로, 나머지는 정의의 단위(날 또는 사진)를 뽑는다."""
    rng = np.random.default_rng(seed)
    if how == "same_day":
        days = {m: [g for _, g in x.groupby("date")] for m, x in d.groupby("member")}
        def draw():
            parts = []
            for m, gs in days.items():
                for k, i in enumerate(rng.integers(0, len(gs), len(gs))):
                    parts.append(gs[i].assign(date=f"{gs[i]['date'].iloc[0]}#{k}"))
            return pd.concat(parts)
    else:
        base = units(d, how)
        per = {m: x["a"].to_numpy() for m, x in base.groupby("member")}
        def draw():
            return pd.concat([pd.DataFrame(dict(member=m, group=m, a=v[rng.integers(0, len(v), len(v))]))
                              for m, v in per.items()])
    vals = []
    for _ in range(b):
        s = draw()
        sd, dof = pooled_sd(units(s, how) if how == "same_day" else s)
        if dof:
            vals.append(Z * sd)
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def check(d: pd.DataFrame, b=B) -> pd.DataFrame:
    rows = []
    for how, label in DEFS.items():
        u = units(d, how)
        sd, dof = pooled_sd(u)
        if not dof:
            continue
        plo, phi = param_ci(sd, dof)
        blo, bhi = boot_ci(d, how, b)
        rows.append(dict(정의=label, 단위수=len(u), 자유도=dof, MDC95=round(Z * sd, 2),
                         모수적=f"{plo:.2f}~{phi:.2f}", 부트스트랩=f"{blo:.2f}~{bhi:.2f}"))
    return pd.DataFrame(rows)


def main(path=None):
    d = load(path)
    t = check(d)
    close = t.iloc[(t["MDC95"] - TARGET).abs().argsort()[:1]]
    lines = ["# MDC95 다시 계산 (볼 a*, 앱 판정 기준)", "",
             f"사진: 원본 중 품질 통과 {len(d)}장, {d['member'].nunique()}명, 사람-날 {d.groupby(['member', 'date']).ngroups}개. "
             "측정은 analysis/mdc95_check.py.", "",
             f"> 앱 값: MDC95 {TARGET}, 95% 신뢰구간 {TARGET_CI[0]}~{TARGET_CI[1]} (원래 계산 스크립트와 방법 기록 없음).", "",
             t.to_markdown(index=False), "",
             f"- 2.35에 가장 가까운 정의: {close['정의'].iloc[0]} ({close['MDC95'].iloc[0]})",
             "- 모수적 구간은 정규분포를 가정하고, 부트스트랩은 사람별로 나눠 다시 뽑는다(사람이 3명이라 사람 단위로는 뽑지 않음).",
             ""]
    out = ROOT / "data" / "mdc95_check.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    print(f"→ {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
