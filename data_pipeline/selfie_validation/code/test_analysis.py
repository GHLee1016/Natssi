"""가짜 데이터로 분석 코드가 맞는지 확인: 정답을 아는 오차를 넣고 다시 찾아내는지 본다.
    python test_analysis.py
"""
import numpy as np
import pandas as pd

from analyze_reliability import core, icc_two_way
from color import srgb_to_lab


def fake(n_sub=40, n_sess=4, n_rep=3, sd_person=3.0, sd_day=0.6, sd_shot=0.5, seed=1):
    rng = np.random.default_rng(seed)
    rows = []
    for s in range(n_sub):
        person = 12 + rng.normal(0, sd_person)
        for d in range(n_sess):
            day = person + rng.normal(0, sd_day)
            for r in range(n_rep):
                rows.append(dict(subject_id=f"S{s:02d}", session_id=f"D{d}", rep=r,
                                 a_star=day + rng.normal(0, sd_shot), quality_pass=True))
    return pd.DataFrame(rows)


def test_recovers_known_error():
    df = fake()
    r = core(df)
    true_single = np.sqrt(0.6 ** 2 + 0.5 ** 2)                  # 하루 1장 오차
    assert abs(r["sem_within_session"] - 0.5) < 0.06, r["sem_within_session"]
    assert abs(r["sem_single_day"] - true_single) < 0.1, r["sem_single_day"]
    assert abs(r["mdc95_single_day"] - 1.96 * np.sqrt(2) * true_single) < 0.3
    # 기대 ICC = 사람 간 분산 / (사람 간 + 날짜 + 장 평균 오차)
    exp_icc = 9 / (9 + 0.36 + 0.25 / 3)
    assert abs(r["icc_A1"] - exp_icc) < 0.05, r["icc_A1"]


def test_icc_matches_pingouin():
    try:
        import pingouin as pg
    except ImportError:
        print("pingouin 없음: 교차 확인 건너뜀"); return
    df = fake(n_sub=12, n_sess=3, n_rep=1, seed=3)
    wide = df.pivot(index="subject_id", columns="session_id", values="a_star")
    a1, c1, _ = icc_two_way(wide.values)
    t = pg.intraclass_corr(df, targets="subject_id", raters="session_id", ratings="a_star").set_index("Type")
    assert abs(a1 - t.loc["ICC(A,1)", "ICC"]) < 1e-9 and abs(c1 - t.loc["ICC(C,1)", "ICC"]) < 1e-9


def test_lab_reference_colors():
    # 알려진 값: 흰색 L=100,a=0,b=0 / sRGB 빨강 ≈ L 53.2, a 80.1, b 67.2
    w = srgb_to_lab(np.array([255, 255, 255]))
    r = srgb_to_lab(np.array([255, 0, 0]))
    assert abs(w[0] - 100) < 0.05 and abs(w[1]) < 0.05 and abs(w[2]) < 0.05
    assert abs(r[0] - 53.24) < 0.1 and abs(r[1] - 80.09) < 0.1 and abs(r[2] - 67.20) < 0.1


if __name__ == "__main__":
    for t in (test_lab_reference_colors, test_recovers_known_error, test_icc_matches_pingouin):
        t(); print("통과:", t.__name__)
