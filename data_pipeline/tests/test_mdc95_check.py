"""MDC95 다시 계산(analysis/mdc95_check.py). 가짜 반복 측정값으로 식과 신뢰구간을 확인한다. scipy가 없으면 건너뛴다."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("scipy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "analysis"))
import mdc95_check as mc  # noqa: E402


def _fake(day_sd=1.0, photo_sd=0.3, members=3, days=12, shots=3, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for m in range(members):
        base = 10 + 2 * m                                   # 사람끼리 차이는 MDC에 들어가면 안 된다
        for k in range(days):
            day = base + rng.normal(0, day_sd)
            for p in range(1, shots + 1):
                rows.append(dict(member=f"m{m}", date=f"2026-11-{k + 1:02d}", photo=p, a=day + rng.normal(0, photo_sd)))
    return pd.DataFrame(rows)


def test_same_day_matches_known_formula():
    d = _fake()
    sd, dof = mc.pooled_sd(mc.units(d, "same_day"))
    g = d.groupby(["member", "date"])["a"]
    expect = np.sqrt(np.average(g.var(ddof=1), weights=g.count() - 1))
    assert sd == pytest.approx(expect)
    assert dof == len(d) - g.ngroups


def test_person_offset_is_removed():
    d = _fake(day_sd=1.0, photo_sd=0.0)
    sd, _ = mc.pooled_sd(mc.units(d, "day_first"))
    assert 0.7 < sd < 1.3                                    # 사람 평균 차이(2씩)가 섞이면 훨씬 커진다


def test_day_level_is_larger_than_same_day():
    d = _fake(day_sd=1.0, photo_sd=0.3)
    same, _ = mc.pooled_sd(mc.units(d, "same_day"))
    first, _ = mc.pooled_sd(mc.units(d, "day_first"))
    assert first > same * 2


def test_param_ci_brackets_estimate():
    lo, hi = mc.param_ci(1.0, 40)
    assert lo < mc.Z < hi
    assert hi - mc.Z > mc.Z - lo                              # SD 구간은 위쪽이 더 길다


def test_boot_ci_brackets_estimate():
    d = _fake()
    for how in mc.DEFS:
        sd, _ = mc.pooled_sd(mc.units(d, how))
        lo, hi = mc.boot_ci(d, how, b=300)
        assert lo <= mc.Z * sd * 1.05 and hi >= mc.Z * sd * 0.95, how


def test_random_schemes_run_and_bracket_median():
    d = _fake()
    for how in mc.RANDOM:
        mid, lo, hi = mc.random_ci(d, how, b=200)
        assert lo <= mid <= hi, how
        assert 1.0 < mid < 4.0, how


def test_original_formula_matches_manual():
    d = _fake()
    g = d.groupby(["member", "date"])["a"]
    within = np.sqrt(np.average(g.var(ddof=1), weights=g.count() - 1))
    sess = g.mean().reset_index()
    means = np.sqrt(np.average(sess.groupby("member")["a"].var(ddof=1), weights=sess.groupby("member").size() - 1))
    expect = mc.Z * np.sqrt(means ** 2 + within ** 2 * (1 - 1 / 3))
    assert mc.original_mdc(d) == pytest.approx(expect)
    lo, hi = mc.original_ci(d, b=200)
    assert lo <= expect <= hi
