"""촬영 품질 검사. 사진은 사용자 브라우저에서 측정하고(frontend/src/measure), 서버는 측정한 숫자만 받아 판정합니다.

기준과 판정 식은 검증 파이프라인(natssi_selfie_validation/code/measure_redness.py)의 quality_flags 와 같습니다.
기준을 바꾸면 그쪽 docs/05 기록표에 이유와 전후 수치를 남기고 두 곳을 함께 바꾸세요.
"""
import math
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

DEFAULT_THRESHOLDS = dict(
    min_side=480,                  # 짧은 변 픽셀
    bright_lo=70, bright_hi=210,   # 전체 평균 밝기(0~255)
    max_yaw=10.0, max_pitch=10.0, max_roll=8.0,   # 고개 각도(도)
    pitch_offset=3.7,              # MediaPipe pitch 치우침 보정: 진짜 정면에서 +3.7°(AI Hub DSLR 정면 20명)
    max_smile=0.40, max_blink=0.50,               # 표정(블렌드셰이프 0~1)
    min_face_ratio=0.25,           # 얼굴 폭 / 사진 폭
    min_sharpness=60.0,            # 얼굴 영역 라플라시안 분산(256px로 맞춘 뒤)
    max_clip_ratio=0.01,           # 볼 영역에서 하얗게 날아간 픽셀 비율
    min_roi_pixels=400,
)

Num = Optional[float]


class Features(BaseModel):
    """브라우저가 보내는 측정값(사진 없음). 범위를 벗어난 값은 422로 거절합니다."""
    model_config = ConfigDict(extra="ignore")
    feature_version: str = Field("2", max_length=8)
    width: int = Field(..., ge=1, le=20000)
    height: int = Field(..., ge=1, le=20000)
    brightness: float = Field(..., ge=0, le=255)
    face_found: bool = False
    n_faces: int = Field(0, ge=0, le=10)
    face_ratio: Num = Field(None, ge=0, le=10)
    sharpness: Num = Field(None, ge=0, le=1e7)
    yaw: Num = Field(None, ge=-180, le=180)
    pitch: Num = Field(None, ge=-180, le=180)
    roll: Num = Field(None, ge=-180, le=180)
    smile: Num = Field(None, ge=0, le=1)
    blink: Num = Field(None, ge=0, le=1)
    n_L: Num = Field(None, ge=0, le=4e8)
    n_R: Num = Field(None, ge=0, le=4e8)
    clip_ratio_L: Num = Field(None, ge=0, le=1)
    clip_ratio_R: Num = Field(None, ge=0, le=1)
    L_L: Num = Field(None, ge=0, le=100)
    L_R: Num = Field(None, ge=0, le=100)
    a_L: Num = Field(None, ge=-128, le=128)
    a_R: Num = Field(None, ge=-128, le=128)
    b_L: Num = Field(None, ge=-128, le=128)
    b_R: Num = Field(None, ge=-128, le=128)
    a_star: Num = Field(None, ge=-128, le=128)
    L_star: Num = Field(None, ge=0, le=100)
    L_diff: Num = Field(None, ge=-100, le=100)


def _missing(v):
    return v is None or (isinstance(v, float) and math.isnan(v))


def _bad(v, test):
    """값이 없으면(검출 실패 등) 통과로 보지 않음."""
    return _missing(v) or test(v)


def quality_flags(feat: dict, th=None):
    """측정값 + 기준 → 걸린 항목 리스트. 빈 리스트면 통과. (파이프라인 quality_flags 와 같은 식)"""
    t = {**DEFAULT_THRESHOLDS, **(th or {})}
    g = lambda k: feat.get(k)
    flags = []
    if min(g("width"), g("height")) < t["min_side"]:
        flags.append("resolution")
    if not t["bright_lo"] <= g("brightness") <= t["bright_hi"]:
        flags.append("brightness")
    if not g("face_found"):
        return flags + ["no_face"]
    if (g("n_faces") or 0) > 1:
        flags.append("multiple_faces")
    if _bad(g("face_ratio"), lambda v: v < t["min_face_ratio"]):
        flags.append("face_small")
    if _bad(g("sharpness"), lambda v: v < t["min_sharpness"]):
        flags.append("blur")
    pitch = None if _missing(g("pitch")) else g("pitch") - t["pitch_offset"]
    if any(_bad(v, lambda v, m=m: abs(v) > m) for v, m in ((g("yaw"), t["max_yaw"]), (pitch, t["max_pitch"]), (g("roll"), t["max_roll"]))):
        flags.append("head_pose")
    if _bad(g("smile"), lambda v: v > t["max_smile"]):
        flags.append("smile")
    if _bad(g("blink"), lambda v: v > t["max_blink"]):
        flags.append("eyes_closed")
    for s in ("L", "R"):
        if _bad(g(f"n_{s}"), lambda v: v < t["min_roi_pixels"]):
            flags.append(f"roi_small_{s}")
        if _bad(g(f"clip_ratio_{s}"), lambda v: v > t["max_clip_ratio"]):
            flags.append(f"clipped_{s}")
    return flags


def _num(v, fmt):
    return "—" if _missing(v) else format(v, fmt)


def evaluate(f: Features):
    """측정값 → 앱 화면용 결과(형식은 예전 check() 와 같음). 사진도 측정값도 저장하지 않습니다."""
    d = f.model_dump()
    flags = set(quality_flags(d))
    t = DEFAULT_THRESHOLDS
    face = d["face_found"]

    # detail: 사용자에게 보이는 쉬운 말. tech: 접이식 '측정 값'에 보이는 숫자(개발·검증용).
    def item(name, keys, good, bad, tech, needs_face=True):
        if needs_face and not face:
            return {"name": name, "ok": None, "detail": "얼굴을 찾은 뒤 확인해요", "tech": tech, "implemented": True}
        ok = not (flags & set(keys))
        return {"name": name, "ok": ok, "detail": good if ok else bad, "tech": tech, "implemented": True}

    pitch = None if _missing(d["pitch"]) else d["pitch"] - t["pitch_offset"]

    def pose_bad():
        if _missing(d["yaw"]) or pitch is None or _missing(d["roll"]):
            return "고개 각도를 재지 못했어요. 정면을 보고 다시 찍어 주세요"
        if abs(d["yaw"]) > t["max_yaw"]:
            return "얼굴이 옆으로 돌아갔어요. 정면을 봐 주세요"
        if pitch is not None and abs(pitch) > t["max_pitch"]:
            return "고개를 숙였거나 들었어요. 눈높이를 맞춰 주세요"
        return "고개가 기울었어요. 머리를 똑바로 세워 주세요"

    def expr_bad():
        if "eyes_closed" in flags:
            return "눈을 감았어요. 눈을 뜨고 찍어 주세요"
        return "웃고 있어요. 편안한 표정으로 찍어 주세요"

    dark = d["brightness"] < t["bright_lo"]
    checks = [
        item("해상도", {"resolution"}, "사진 크기가 충분해요", "사진이 작아요. 더 높은 화질로 찍어 주세요",
             f"{d['width']}×{d['height']}", needs_face=False),
        item("밝기", {"brightness"}, "알맞게 밝아요",
             "너무 어두워요. 더 밝은 곳에서 찍어 주세요" if dark else "너무 밝아요. 빛이 덜 센 곳에서 찍어 주세요",
             f"평균 {d['brightness']:.0f} (70~210)", needs_face=False),
        {"name": "얼굴", "ok": face and "multiple_faces" not in flags, "implemented": True,
         "tech": f"{d['n_faces']}명 검출",
         "detail": ("얼굴을 찾지 못했어요. 얼굴이 화면 안에 들어오게 해 주세요" if not face
                    else "여러 명이 보여요. 한 명만 나오게 찍어 주세요" if "multiple_faces" in flags else "얼굴이 잘 보여요")},
        item("얼굴 크기", {"face_small"}, "알맞은 크기예요", "얼굴이 작아요. 조금 더 가까이서 찍어 주세요",
             f"사진 폭의 {_num(d['face_ratio'], '.0%')} (25% 이상)"),
        item("선명도", {"blur"}, "또렷하게 보여요", "흐려요. 폰을 고정하고 다시 찍어 주세요",
             f"{_num(d['sharpness'], '.0f')} ({t['min_sharpness']:.0f} 이상)"),
        item("고개 각도", {"head_pose"}, "정면을 잘 보고 있어요", pose_bad(),
             f"좌우 {_num(d['yaw'], '+.0f')}°, 위아래 {_num(pitch, '+.0f')}°, 기울기 {_num(d['roll'], '+.0f')}°"),
        item("표정", {"smile", "eyes_closed"}, "편안한 표정이에요", expr_bad(),
             f"미소 {_num(d['smile'], '.2f')}, 눈 감음 {_num(d['blink'], '.2f')}"),
        item("볼 노출", {"clipped_L", "clipped_R"}, "볼에 빛이 고르게 닿았어요",
             "볼이 하얗게 번졌어요. 빛이 덜 센 곳에서 찍어 주세요",
             f"하얗게 날아간 부분 왼쪽 {_num(d['clip_ratio_L'], '.1%')}, 오른쪽 {_num(d['clip_ratio_R'], '.1%')} (1% 이하)"),
        item("볼 영역", {"roi_small_L", "roi_small_R"}, "양 볼이 잘 보여요",
             "볼이 가려졌어요. 머리카락이나 마스크를 치워 주세요",
             f"왼쪽 {_num(d['n_L'], ',.0f')}, 오른쪽 {_num(d['n_R'], ',.0f')} 픽셀"),
    ]
    passed = not flags
    redness = round(d["a_star"], 2) if passed and not _missing(d["a_star"]) else None
    if passed:
        message = "좋아요, 이 사진으로 괜찮아요."
        note = "볼 붉은기는 이 사진에서 잰 값이에요. 로그인하면 오늘 기록에 볼 색 숫자만 남겨요(사진은 남기지 않아요)."
    else:
        message = "같은 장소와 조명에서 정면을 보고 다시 찍어 주세요."
        note = "품질 검사를 통과한 사진만 볼 붉은기를 보여 드려요."
    return {"passed": passed, "checks": checks, "flags": sorted(flags), "message": message,
            "redness": redness, "note": note}
