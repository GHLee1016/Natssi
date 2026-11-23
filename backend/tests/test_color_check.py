"""조명 색 검사(촬영 때)와 '그래도 기록하기', 콧등 상대 붉은기.
근거: data_pipeline/data/color_robustness_summary.md (팀원 셀카 100장 × 조명 색 필터 11종)."""
from app import judge, quality

BASE = dict(width=800, height=1000, brightness=120, face_found=True, n_faces=1, face_ratio=0.5, sharpness=100,
            yaw=0, pitch=3.7, roll=0, smile=0, blink=0, n_L=1000, n_R=1000, clip_ratio_L=0, clip_ratio_R=0,
            a_L=14.0, b_L=16.0, a_R=13.0, b_R=16.0, a_star=13.5)
WARM = {**BASE, "a_L": 24.0, "b_L": 27.0, "a_R": 23.0, "b_R": 26.0, "a_star": 23.5}


def ev(**kw):
    return quality.evaluate(quality.Features(**kw))


def test_color_cast_can_be_kept_by_user():
    r = ev(**WARM)
    assert not r["passed"] and r["overridable"] and r["redness"] is None and "그대로 기록" in r["message"]
    k = ev(**WARM, override=True)
    assert k["passed"] and k["lighting_off"] and k["redness"] == 23.5 and not k["overridable"]
    assert "구분 불가" in k["note"]


def test_override_does_not_skip_other_problems():
    """고개가 돌아간 사진은 '그대로 기록하기'로도 못 넘긴다 (볼 위치가 틀릴 수 있어서)."""
    r = ev(**{**WARM, "yaw": 20}, override=True)
    assert not r["passed"] and not r["overridable"] and not r["lighting_off"] and r["redness"] is None


def test_override_on_good_photo_changes_nothing():
    r = ev(**BASE, override=True)
    assert r["passed"] and not r["lighting_off"]


def test_nose_relative_redness_is_reference_only():
    r = ev(**BASE, n_N=900, clip_ratio_N=0.0, a_N=9.0, b_N=15.0, a_rel=4.5)
    assert r["passed"] and r["redness"] == 13.5 and r["redness_rel"] == 4.5
    assert ev(**BASE, n_N=900, clip_ratio_N=0.2, a_N=9.0, a_rel=4.5)["redness_rel"] is None   # 콧등이 번들거려 날아감
    assert ev(**BASE)["redness_rel"] is None                                                   # 측정 버전 2(콧등 없음)


def _rec(i, redness, b=16.0, light=False):
    return {"id": i, "date": f"2026-11-{i:02d}", "version": 1, "day_in_version": i, "redness": redness, "b": b,
            "quality_ok": True, "quality_note": None, "symptoms": {}, "env": {}, "light_flag": light}


def test_kept_lighting_day_is_unknown_and_left_out_of_baseline():
    recs = [_rec(i, 12.0 + (i % 3) * 0.1) for i in range(1, 8)]          # 평소 7일
    recs.append(_rec(8, 30.0, b=27.0, light=True))                         # 노란 조명, 그대로 기록
    recs.append(_rec(9, 12.1))
    out = judge.judge_all(recs)
    assert out[7]["verdict"]["level"] == judge.UNKNOWN
    assert "조명 색" in out[7]["verdict"]["reasons"][0]
    assert out[8]["verdict"]["baseline"]["n"] == 7                         # 8일째(조명 다름)는 평소 범위에서 빠짐
    assert out[8]["verdict"]["level"] == judge.NO_SIGNAL
