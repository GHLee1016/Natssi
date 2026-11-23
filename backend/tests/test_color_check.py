"""조명 색 검사(촬영 때)와 '그래도 기록하기', 판정에서 조명 다름 가려내기(저장된 b*로).
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
    assert "안개" in k["note"]


def test_override_does_not_skip_other_problems():
    """고개가 돌아간 사진은 '그대로 기록하기'로도 못 넘긴다 (볼 위치가 틀릴 수 있어서)."""
    r = ev(**{**WARM, "yaw": 20}, override=True)
    assert not r["passed"] and not r["overridable"] and not r["lighting_off"] and r["redness"] is None


def test_override_on_good_photo_changes_nothing():
    r = ev(**BASE, override=True)
    assert r["passed"] and not r["lighting_off"]


def test_nose_values_are_not_part_of_server_result():
    """콧등 값은 서버로 보내지 않는다(처리방침의 '서버에 보내는 숫자'에 없음). 보내도 무시하고, 결과에 상대 붉은기도 없다."""
    r = ev(**BASE, n_N=900, a_N=9.0, a_rel=4.5)
    assert r["passed"] and "redness_rel" not in r


def _rec(i, redness, b=16.0):
    return {"id": i, "date": f"2026-11-{i:02d}", "version": 1, "day_in_version": i, "redness": redness, "b": b,
            "quality_ok": True, "quality_note": None, "symptoms": {}, "env": {}}


def test_kept_lighting_day_is_unknown_and_left_out_of_baseline():
    recs = [_rec(i, 12.0 + (i % 3) * 0.1) for i in range(1, 8)]          # 평소 7일
    recs.append(_rec(8, 30.0, b=27.0))                                     # 노란 조명, 그대로 기록(따로 표시하지 않고 b*로 가려냄)
    recs.append(_rec(9, 12.1))
    out = judge.judge_all(recs)
    assert out[7]["verdict"]["level"] == judge.UNKNOWN
    assert "조명 색" in out[7]["verdict"]["reasons"][0]
    assert out[8]["verdict"]["baseline"]["n"] == 7                         # 8일째(조명 다름)는 평소 범위에서 빠짐
    assert out[8]["verdict"]["level"] == judge.NO_SIGNAL


def test_naturally_yellow_skin_still_gets_a_baseline():
    """피부가 원래 노랗게 찍혀 b*가 매일 24인 사람: 첫 7일은 고정 기준(22)에 걸리지만, 7일이 쌓이면 그 사람 b* 중앙값으로 다시 봐서
    '조명 다름'이 풀리고 평소 범위가 생긴다(고정 기준 때문에 앱이 영영 안 열리는 일이 없게)."""
    recs = [_rec(i, 12.0 + (i % 3) * 0.1, b=24.0 + (i % 2) * 0.2) for i in range(1, 10)]
    out = judge.judge_all(recs)
    assert not any(r["light_flag"] for r in out)
    assert out[8]["verdict"]["level"] == judge.NO_SIGNAL and out[8]["verdict"]["baseline"]["n"] == 8   # 앞선 8일이 모두 평소 범위에 들어감


def test_few_days_with_yellow_light_are_flagged():
    """기록이 아직 적으면(7개 미만) 고정 기준으로: 노란 조명(b* 27) 날만 조명 다름."""
    out = judge.judge_all([_rec(1, 12.0), _rec(2, 25.0, b=27.0), _rec(3, 12.1)])
    assert [r["light_flag"] for r in out] == [False, True, False]
    assert "조명 색" in out[1]["verdict"]["reasons"][0]
