"""color_robustness.py run 결과 요약 → data/color_robustness_summary.md (사진별 값 없이 요약만)

    python analysis/color_robustness_summary.py
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MDC95 = 2.35
MEASURES = {"a_star": "볼 a* (지금 앱)", "a_rel_forehead": "볼 a* − 이마 a*", "a_rel_nose": "볼 a* − 콧등 a*"}


def mdc(orig: pd.DataFrame, col: str) -> float:
    """같은 날 여러 장의 흔들림 → MDC95 = 1.96·√2·SEM (SEM = 같은 날 표준편차의 제곱평균근)."""
    g = orig.groupby(["member", "date"])[col]
    var = g.var(ddof=1)
    n = g.count()
    ok = n >= 2
    sem = np.sqrt(np.average(var[ok], weights=(n[ok] - 1)))
    return 1.96 * np.sqrt(2) * sem


def main():
    d = pd.read_csv(ROOT / "private" / "color_robustness.csv")
    d["key"] = d["member"] + d["date"].astype(str) + "_" + d["photo"].astype(str)
    orig = d[d.kind == "none"].set_index("key")
    use = orig[orig.quality_ok].index                      # 원본이 품질 통과한 사진만 비교
    lines = ["# 조명 색 필터 실험 (볼 붉은기 a*와 품질 검사)", "",
             f"사진: 팀원 3명 셀카 {len(orig)}장 중 원본 품질 통과 {len(use)}장. 측정은 앱과 같은 방식"
             "(원본 69장으로 팀 측정값(measurements.csv)과 a* 차이 최대 0.009 확인).", ""]

    # 1) 필터별 변화
    rows = []
    for (name, kind, level), g in d[d.kind != "none"].groupby(["filter", "kind", "level"], sort=False):
        g = g.set_index("key").loc[lambda x: x.index.isin(use)]
        row = {"필터": name, "품질 통과": f"{g.quality_ok.mean():.0%}"}
        for col, label in MEASURES.items():
            diff = g[col] - orig.loc[g.index, col]
            row[f"{label} 변화(평균)"] = f"{diff.mean():+.2f}"
            row[f"{label} MDC 넘음"] = f"{(diff.abs() > MDC95).mean():.0%}"
        rows.append(row)
    t = pd.DataFrame(rows)
    lines += ["## 1. 필터별 붉은기 변화와 품질 검사", "",
              f"변화 = 필터 사진 − 원본 (같은 사진끼리). 'MDC 넘음' = 변화가 측정 오차 {MDC95}보다 큰 사진 비율.", "",
              t[["필터", "품질 통과", "볼 a* (지금 앱) 변화(평균)", "볼 a* (지금 앱) MDC 넘음"]].to_markdown(index=False), ""]

    # 2) 개선안 A: 상대 붉은기
    lines += ["## 2. 개선안 A — 상대 붉은기 (볼 − 이마/콧등)", "",
              t[["필터"] + [c for c in t.columns if "−" in c]].to_markdown(index=False), ""]
    o = orig.loc[use]
    m = {label: mdc(o, col) for col, label in MEASURES.items()}
    lines += ["같은 날 반복 사진으로 잰 측정 오차(MDC95, 이 실험의 원본 사진 기준):", ""]
    lines += [f"- {k}: {v:.2f}" for k, v in m.items()]
    lines += ["", f"이마 영역을 잴 수 없었던 사진(앞머리 등): {int((o['n_fh'].fillna(0) < 400).sum())}장", ""]

    # 3) 개선안 B: 색 틀어짐 검사 (b* 평소 값 대비)
    base = o.groupby("member")["b_cheek"].median()
    spread = (o["b_cheek"] - o["member"].map(base)).abs()
    th_rows = []
    for th in (3, 4, 5, 6):
        fa = (spread > th).mean()                         # 원본인데 걸림 (오경보)
        det = []
        for name, g in d[d.kind != "none"].groupby("filter", sort=False):
            g = g.set_index("key").loc[lambda x: x.index.isin(use)]
            big = (g["a_star"] - orig.loc[g.index, "a_star"]).abs() > MDC95   # 붉은기가 MDC 넘게 틀어진 사진
            flag = (g["b_cheek"] - g["member"].map(base)).abs() > th
            det.append((name, flag.mean(), flag[big].mean() if big.any() else np.nan))
        th_rows.append(dict(기준=f"|Δb*| > {th}", 원본_오경보=f"{fa:.0%}",
                            **{f"{n} 감지": f"{r:.0%}" for n, r, _ in det}))
    lines += ["## 3. 개선안 B — 색 틀어짐 검사 (볼 b*가 그 사람 평소 값에서 벗어나면 '조명이 평소와 달라요')", "",
              pd.DataFrame(th_rows).to_markdown(index=False), ""]
    out = ROOT / "data" / "color_robustness_summary.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
