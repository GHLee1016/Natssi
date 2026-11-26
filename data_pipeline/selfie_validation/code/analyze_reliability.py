"""반복 촬영 신뢰도 분석: measurements.csv → ICC, SEM, MDC95 (+ 부트스트랩 신뢰구간)

    python analyze_reliability.py --in measurements.csv --out-dir results

입력 CSV 필수 열: subject_id, session_id, rep, a_star, quality_pass
  - session_id: 같은 사람이 '다른 시점'에 찍은 묶음(예: 날짜·시간대). 세션 안에서 연속으로 여러 장 = rep.
  - a_star: 볼 붉은기(CIELAB a*) — measure_redness.py 결과

용어
  SEM  = 측정 오차의 표준편차(같은 사람·같은 피부 상태를 다시 찍을 때 흔들리는 정도)
  MDC95 = 1.96 × √2 × SEM : 두 측정값의 차이가 이보다 커야 '오차를 넘는 변화'로 볼 수 있는 최소 변화량
앱은 하루 1장을 평소 범위와 비교하므로, 앱에 넣을 값은 'MDC95(하루 1장 기준)' 입니다.
"""
import argparse
import json
import os

import numpy as np
import pandas as pd

Z = 1.96


def pooled_sd(df, value, by):
    """그룹(by) 안의 흩어짐을 합친 표준편차. 2개 이상 있는 그룹만 씀."""
    num, den = 0.0, 0
    for _, g in df.groupby(by):
        v = g[value].dropna()
        if len(v) >= 2:
            num += ((v - v.mean()) ** 2).sum()
            den += len(v) - 1
    return (np.sqrt(num / den) if den else np.nan), den


def icc_two_way(mat):
    """mat: (n 대상 × k 세션) 완전한 표. McGraw & Wong ICC(A,1) 절대일치, ICC(C,1) 일관성."""
    y = np.asarray(mat, float)
    n, k = y.shape
    gm = y.mean()
    ss_r = k * ((y.mean(axis=1) - gm) ** 2).sum()
    ss_c = n * ((y.mean(axis=0) - gm) ** 2).sum()
    ss_t = ((y - gm) ** 2).sum()
    ss_e = ss_t - ss_r - ss_c
    msr, msc = ss_r / (n - 1), ss_c / (k - 1)
    mse = ss_e / ((n - 1) * (k - 1))
    icc_a = (msr - mse) / (msr + (k - 1) * mse + k * (msc - mse) / n)
    icc_c = (msr - mse) / (msr + (k - 1) * mse)
    return float(icc_a), float(icc_c), float(np.sqrt(mse))


def core(df):
    """한 번의 계산(부트스트랩에서도 재사용)."""
    sd_within, df_w = pooled_sd(df, "a_star", ["subject_id", "session_id"])
    sess = df.groupby(["subject_id", "session_id"], as_index=False).agg(a=("a_star", "mean"), r=("a_star", "size"))
    sd_means, df_d = pooled_sd(sess, "a", ["subject_id"])
    r_h = len(sess) / (1 / sess["r"]).sum()                       # 세션당 장수(조화평균)
    w = 0.0 if np.isnan(sd_within) else sd_within ** 2 * (1 - 1 / r_h)
    sd_single = np.sqrt(sd_means ** 2 + w) if not np.isnan(sd_means) else np.nan
    # ICC: 세션 순서(1,2,3…)로 맞춘 완전한 표만 사용
    sess["k"] = sess.groupby("subject_id").cumcount()
    wide = sess.pivot(index="subject_id", columns="k", values="a")
    kmin = int(sess.groupby("subject_id").size().min()) if len(sess) else 0
    icc_a = icc_c = np.nan
    if kmin >= 2 and wide.shape[0] >= 3:
        icc_a, icc_c, _ = icc_two_way(wide.iloc[:, :kmin].dropna().values)
    return dict(sem_within_session=sd_within, df_within=df_w, sem_between_days_of_means=sd_means, df_days=df_d,
                shots_per_session=r_h, sem_single_day=sd_single,
                mdc95_within_session=Z * np.sqrt(2) * sd_within, mdc95_single_day=Z * np.sqrt(2) * sd_single,
                icc_A1=icc_a, icc_C1=icc_c, sessions_used_for_icc=kmin)


def bootstrap(df, n=2000, seed=0):
    rng = np.random.default_rng(seed)
    subs = df["subject_id"].unique()
    out = []
    for _ in range(n):
        pick = rng.choice(subs, len(subs), replace=True)
        parts = [df[df.subject_id == s].assign(subject_id=f"{s}#{i}") for i, s in enumerate(pick)]
        out.append(core(pd.concat(parts)))
    b = pd.DataFrame(out)
    return {c: (float(np.nanpercentile(b[c], 2.5)), float(np.nanpercentile(b[c], 97.5)))
            for c in ("mdc95_single_day", "mdc95_within_session", "icc_A1")}


def grade(icc):
    if np.isnan(icc):
        return "계산 불가"
    return "낮음(<0.5)" if icc < 0.5 else "보통(0.5~0.75)" if icc < 0.75 else "좋음(0.75~0.9)" if icc < 0.9 else "매우 좋음(≥0.9)"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out-dir", default="results")
    ap.add_argument("--boot", type=int, default=2000)
    a = ap.parse_args()
    raw = pd.read_csv(a.inp)
    raw["quality_pass"] = raw["quality_pass"].astype(str).str.lower().isin(["true", "1", "yes"])
    raw = raw.dropna(subset=["a_star"]) if "a_star" in raw else raw
    passed = raw[raw.quality_pass]
    res = {"n_photos_total": int(len(raw)), "n_photos_passed": int(len(passed)),
           "n_subjects": int(passed.subject_id.nunique()),
           "passed": core(passed), "all_photos": core(raw)}
    res["ci95_passed"] = bootstrap(passed, a.boot)
    rec = res["passed"]["mdc95_single_day"]
    res["recommended_MDC95_A_STAR"] = None if np.isnan(rec) else round(float(rec), 2)
    os.makedirs(a.out_dir, exist_ok=True)
    with open(os.path.join(a.out_dir, "results.json"), "w") as f:
        json.dump(res, f, ensure_ascii=False, indent=2, default=float)
    p, c = res["passed"], res["ci95_passed"]
    al = res["all_photos"]
    warn = "" if res["n_subjects"] >= 10 else f"\n> ⚠️ 대상자가 {res['n_subjects']}명이라 ICC 신뢰구간이 넓어요. ICC는 참고용으로, MDC95를 주 결과로 보고하세요.\n"
    md = f"""# 반복 촬영 신뢰도 결과 (볼 붉은기 a*)

- 사진: 전체 {res['n_photos_total']}장 / 품질 통과 {res['n_photos_passed']}장, 대상자 {res['n_subjects']}명
- 세션당 평균 촬영 수: {p['shots_per_session']:.2f}장
{warn}
| 지표 | 품질 통과 사진 | 95% 신뢰구간 | (참고) 전체 사진 |
|---|---|---|---|
| **MDC95 (하루 1장 기준, 앱에 넣을 값)** | **{p['mdc95_single_day']:.2f}** | {c['mdc95_single_day'][0]:.2f} ~ {c['mdc95_single_day'][1]:.2f} | {al['mdc95_single_day']:.2f} |
| MDC95 (같은 자리 연속 촬영) | {p['mdc95_within_session']:.2f} | {c['mdc95_within_session'][0]:.2f} ~ {c['mdc95_within_session'][1]:.2f} | {al['mdc95_within_session']:.2f} |
| SEM (하루 1장 기준) | {p['sem_single_day']:.2f} | | {al['sem_single_day']:.2f} |
| ICC(A,1) 절대일치 | {p['icc_A1']:.3f} — {grade(p['icc_A1'])} | {c['icc_A1'][0]:.3f} ~ {c['icc_A1'][1]:.3f} | {al['icc_A1']:.3f} |
| ICC(C,1) 일관성 | {p['icc_C1']:.3f} | | {al['icc_C1']:.3f} |

- 앱 반영: `backend/app/config.py` 의 `MDC95_A_STAR = {res['recommended_MDC95_A_STAR']}` (지금은 예시값 1.8)
- 품질 검사 효과: 전체 사진 MDC95 {al['mdc95_single_day']:.2f} → 통과 사진 {p['mdc95_single_day']:.2f} (작아질수록 품질 검사가 오차를 줄인 것)
- ICC 등급 기준: Koo & Li(2016) <0.5 낮음, 0.5~0.75 보통, 0.75~0.9 좋음, ≥0.9 매우 좋음
"""
    with open(os.path.join(a.out_dir, "report.md"), "w") as f:
        f.write(md)
    print(md)


if __name__ == "__main__":
    main()
