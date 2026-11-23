"""품질 판정이 검증 파이프라인(natssi_selfie_validation/code/measure_redness.py)과 같은지 확인합니다."""
from app import quality

BASE = dict(width=800, height=1000, brightness=120, face_found=True, n_faces=1, face_ratio=0.5, sharpness=100,
            yaw=0, pitch=3.7, roll=0, smile=0, blink=0, n_L=1000, n_R=1000, clip_ratio_L=0, clip_ratio_R=0, a_star=11.0)
flags = quality.quality_flags


def test_flags_match_pipeline_cases():
    assert flags(BASE) == []
    assert flags({**BASE, "yaw": -12}) == ["head_pose"]
    assert flags({**BASE, "smile": 0.5, "clip_ratio_R": 0.1}) == ["smile", "clipped_R"]
    assert flags({**BASE, "face_found": False}) == ["no_face"]
    assert flags({**BASE, "width": 300, "brightness": 30}) == ["resolution", "brightness"]
    assert flags({**BASE, "yaw": None}) == ["head_pose"]                  # 값이 없으면 통과로 보지 않음
    assert flags({**BASE, "yaw": 12}, {"max_yaw": 15}) == []


def test_pitch_offset_from_ai_hub():
    assert flags({**BASE, "pitch": 13.0}) == []                           # 13 − 3.7 = 9.3 → 통과
    assert flags({**BASE, "pitch": 14.0}) == ["head_pose"]                # 10.3 → 걸림
    assert flags({**BASE, "pitch": -7.0}) == ["head_pose"]                # −10.7 → 걸림


def test_evaluate_shows_redness_only_when_passed():
    ok = quality.evaluate(quality.Features(**BASE))
    assert ok["passed"] and ok["redness"] == 11.0 and all(c["ok"] for c in ok["checks"])
    bad = quality.evaluate(quality.Features(**{**BASE, "blink": 0.9}))
    assert not bad["passed"] and bad["redness"] is None and bad["flags"] == ["eyes_closed"]
    assert next(c for c in bad["checks"] if c["name"] == "표정")["ok"] is False


def test_no_face_leaves_face_checks_unknown():
    r = quality.evaluate(quality.Features(width=800, height=1000, brightness=120, face_found=False))
    assert not r["passed"] and r["flags"] == ["no_face"]
    by = {c["name"]: c["ok"] for c in r["checks"]}
    assert by["해상도"] is True and by["얼굴"] is False and by["고개 각도"] is None


def test_grayscale_photo_is_rejected():
    """흑백 필터처럼 볼 색이 거의 없는 사진은 품질 탈락(붉은기가 −17쯤으로 잘못 재짐). 보통 피부 색은 통과."""
    skin = {**BASE, "a_L": 14.0, "b_L": 16.5, "a_R": 13.5, "b_R": 16.0}
    gray = {**BASE, "a_L": 0.4, "b_L": 0.6, "a_R": -0.2, "b_R": 0.3}
    assert flags(skin) == []
    assert flags(gray) == ["no_color"]
    assert flags({**BASE, "a_L": 0.4, "b_L": 0.6, "a_R": 12.0, "b_R": 15.0}) == []    # 한쪽만 색이 없으면 다른 항목에 맡김
    r = quality.evaluate(quality.Features(**gray))
    assert not r["passed"] and r["redness"] is None
    assert next(c for c in r["checks"] if c["name"] == "색")["ok"] is False


def test_color_cast_is_rejected():
    """노랗거나 푸른 조명(볼 b*가 8~22 밖)은 품질 탈락: 그런 사진은 볼 붉은기(a*)도 틀어져 있다.
    근거: 조명 색 필터 실험(data_pipeline/data/color_robustness_summary.md)."""
    skin = {**BASE, "a_L": 14.0, "b_L": 16.5, "a_R": 13.5, "b_R": 16.0}
    warm = {**BASE, "a_L": 24.0, "b_L": 27.0, "a_R": 23.0, "b_R": 26.0}     # 5000K 필터쯤
    cool = {**BASE, "a_L": 11.0, "b_L": 5.0, "a_R": 11.5, "b_R": 6.0}       # 10000K 필터쯤
    assert flags(skin) == []
    assert flags(warm) == ["color_cast"] and flags(cool) == ["color_cast"]
    assert flags({**BASE, "a_L": 14.0, "b_L": 10.5, "a_R": 13.0, "b_R": 19.0}) == []   # 팀원 원본 범위(10.4~19.4)는 통과
    w = quality.evaluate(quality.Features(**warm))
    c = next(x for x in w["checks"] if x["name"] == "색")
    assert not w["passed"] and w["redness"] is None and c["ok"] is False and "노랗게" in c["detail"]
    c = next(x for x in quality.evaluate(quality.Features(**cool))["checks"] if x["name"] == "색")
    assert "푸르게" in c["detail"]


def test_gray_photo_is_not_also_called_color_cast():
    gray = {**BASE, "a_L": 0.4, "b_L": 0.6, "a_R": -0.2, "b_R": 0.3}
    assert flags(gray) == ["no_color"]
    c = next(x for x in quality.evaluate(quality.Features(**gray))["checks"] if x["name"] == "색")
    assert "흑백" in c["detail"]
