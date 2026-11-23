"""촬영 품질 검사. 사진은 사용자 브라우저에서 측정하고(frontend/src/measure), 서버는 측정한 숫자만 받아 판정합니다.

기준과 판정 식은 검증 파이프라인(natssi_selfie_validation/code/measure_redness.py)의 quality_flags 와 같습니다.
기준을 바꾸면 그쪽 docs/05 기록표에 이유와 전후 수치를 남기고 두 곳을 함께 바꾸세요.
"""
import math
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from . import config, judge

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
    min_chroma=5.0,                # 양 볼 색의 진하기 √(a*²+b*²). 흑백·색 빠진 사진 거르기(피부는 보통 15 이상). 앱에만 있는 기준(2026-11-22)
)
# 조명 색 틀어짐(앱에만 있는 기준, 2026-11-23)은 judge.color_off와 같은 식을 쓴다: 로그인해 평소 b*가 7일 넘게 쌓였으면
# 그 사람 평소 b* ± max(4, 흔들림)(capture가 b_ref로 넘김, 판정은 ±3), 아니면 고정 위쪽 기준(config.LIGHT_B_MAX)만.
# 7일 뒤에는 촬영 때도 양쪽을 본다: 판정에서 안개가 될 푸른 사진을 찍을 때 먼저 알려 준다('그래도 기록하기'로 넘길 수 있음).
# 근거: data_pipeline/data/color_robustness_summary.md

Num = Optional[float]
# 사용자가 '그래도 이 사진으로 기록하기'를 고를 수 있는 항목. 볼 위치는 맞게 잡혔고 색만 틀어진 경우라 숫자를 남길 수는 있다.
# 남긴 날은 판정에서 '구분 불가(조명이 달랐어요)'로 다루고 평소 범위 계산에서 뺀다(judge.py light_flag).
# 얼굴·각도·흐림 같은 항목은 볼 위치 자체가 틀릴 수 있어서 넘기지 못한다.
SOFT_FLAGS = {"color_cast"}


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
    # 콧등 값(측정 버전 3의 n_N, a_N, b_N, a_rel)은 서버로 보내지 않는다: 판정에 아직 안 쓰고, 처리방침의 '서버에 보내는 숫자'에 없어서.
    # 상대 붉은기(볼 a* − 콧등 a*)는 브라우저가 결과 화면에만 참고로 보여 준다.
    override: bool = False         # 사용자가 SOFT_FLAGS만 걸린 사진을 그대로 기록하기로 골랐다


def _missing(v):
    return v is None or (isinstance(v, float) and math.isnan(v))


def _bad(v, test):
    """값이 없으면(검출 실패 등) 통과로 보지 않음."""
    return _missing(v) or test(v)


def quality_flags(feat: dict, th=None, b_ref=None):
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
    chroma = [math.hypot(g(f"a_{s}"), g(f"b_{s}")) for s in ("L", "R") if not _missing(g(f"a_{s}")) and not _missing(g(f"b_{s}"))]
    if chroma and max(chroma) < t["min_chroma"]:           # 양쪽 다 색이 거의 없음 = 흑백 필터 등. 값이 없으면 다른 항목이 거른다
        flags.append("no_color")
    elif judge.color_off(_b_mean(feat), b_ref):
        flags.append("color_cast")                         # 조명 색이 평소와 다름 → 볼 붉은기(a*)도 틀어져 있다
    return flags


def _b_mean(d, min_chroma=DEFAULT_THRESHOLDS["min_chroma"]):
    """색이 제대로 잡힌 볼(진하기 min_chroma 이상)만의 b* 평균. 한쪽이 색 빠짐이면 그쪽은 빼고 본다."""
    b = [d[f"b_{s}"] for s in ("L", "R") if not _missing(d.get(f"a_{s}")) and not _missing(d.get(f"b_{s}"))
         and math.hypot(d[f"a_{s}"], d[f"b_{s}"]) >= min_chroma]
    return sum(b) / len(b) if b else None


def _chroma(d):
    c = [math.hypot(d[f"a_{s}"], d[f"b_{s}"]) for s in ("L", "R") if not _missing(d.get(f"a_{s}")) and not _missing(d.get(f"b_{s}"))]
    return max(c) if c else None


def _num(v, fmt):
    return "—" if _missing(v) else format(v, fmt)


def evaluate(f: Features, b_ref=None):
    """측정값 → 앱 화면용 결과(형식은 예전 check() 와 같음). 사진도 측정값도 저장하지 않습니다.
    b_ref: 로그인한 사람의 평소 b* 범위(judge.b_ref). 없으면 조명 색은 고정 위쪽 기준으로만 본다."""
    d = f.model_dump()
    flags = set(quality_flags(d, b_ref=b_ref))
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
        item("색", {"no_color", "color_cast"}, "피부 색이 잘 보여요",
             "흑백이거나 색이 빠진 사진 같아요. 필터 없이 다시 찍어 주세요" if "no_color" in flags else
             ("조명이 노랗게 비쳐요. 낮 햇빛이나 하얀 조명 아래에서 다시 찍어 주세요" if (_b_mean(d) or 0) > (b_ref[0] if b_ref else config.LIGHT_B_MAX) else
              "조명이 평소보다 푸르게 비쳐요. 낮 햇빛이나 하얀 조명 아래에서 다시 찍어 주세요"),
             f"볼 색 진하기 {_num(_chroma(d), '.1f')} ({t['min_chroma']:.0f} 이상), 조명 색(b*) {_num(_b_mean(d), '.1f')} "
             + (f"(내 평소 {b_ref[0] - b_ref[1]:.1f}~{b_ref[0] + b_ref[1]:.1f})" if b_ref else f"({config.LIGHT_B_MAX:.0f} 이하)")),
        item("볼 영역", {"roi_small_L", "roi_small_R"}, "양 볼이 잘 보여요",
             "볼이 가려졌어요. 머리카락이나 마스크를 치워 주세요",
             f"왼쪽 {_num(d['n_L'], ',.0f')}, 오른쪽 {_num(d['n_R'], ',.0f')} 픽셀"),
    ]
    overridable = bool(flags) and flags <= SOFT_FLAGS
    lighting_off = overridable and d.get("override", False)      # 조명 색만 걸렸고 사용자가 그대로 기록하기로 함
    passed = not flags or lighting_off
    redness = round(d["a_star"], 2) if passed and not _missing(d["a_star"]) else None
    if lighting_off:
        message = "조명 색이 평소와 달랐던 사진으로 기록했어요."
        note = ("붉은기가 조명 때문에 틀어졌을 수 있어서, 이날은 판정에서 단정하지 않고 '구분 불가'로 둬요. "
                "평소 범위를 만들 때도 이날 값은 빼요.")
    elif passed:
        message = "좋아요, 이 사진으로 괜찮아요."
        note = "볼 붉은기는 이 사진에서 잰 값이에요. 로그인하면 오늘 기록에 볼 색 숫자만 남겨요(사진은 남기지 않아요)."
    elif overridable:
        message = "조명 색이 평소와 달라 보여요. 하얀 조명에서 다시 찍는 게 좋지만, 그대로 기록할 수도 있어요."
        note = "그대로 기록하면 이날은 판정에서 단정하지 않아요(구분 불가)."
    else:
        message = "같은 장소와 조명에서 정면을 보고 다시 찍어 주세요."
        note = "품질 검사를 통과한 사진만 볼 붉은기를 보여 드려요."
    return {"passed": passed, "checks": checks, "flags": sorted(flags), "message": message,
            "redness": redness, "overridable": overridable and not lighting_off,
            "lighting_off": lighting_off, "note": note}
