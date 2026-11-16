"""촬영 품질 검사 자리. 지금은 밝기와 해상도만 실제로 확인합니다.
고개 각도·표정·측정 영역(MediaPipe)은 측정 파트에서 이 함수 안에 붙이면 됩니다."""
import io
from PIL import Image, ImageStat

from . import config

Image.MAX_IMAGE_PIXELS = config.MAX_IMAGE_PIXELS     # 지나치게 큰 그림(압축 폭탄)은 열지 않음


class BadImage(ValueError):
    """사용자에게 그대로 보여줘도 되는 사진 오류."""


def check(image_bytes: bytes):
    try:
        im = Image.open(io.BytesIO(image_bytes))
        if im.format not in config.ALLOWED_IMAGE_FORMATS:
            raise BadImage("JPG, PNG, WEBP 사진만 쓸 수 있어요.")
        if im.size[0] * im.size[1] > config.MAX_IMAGE_PIXELS:
            raise BadImage("사진 해상도가 너무 커요. 더 작은 사진으로 시도해 주세요.")
        im = im.convert("RGB")
    except BadImage:
        raise
    except Exception:
        raise BadImage("사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.")
    w, h = im.size
    bright = ImageStat.Stat(im.convert("L")).mean[0]
    checks = [
        {"name": "해상도", "ok": min(w, h) >= 480, "detail": f"{w}×{h}", "implemented": True},
        {"name": "밝기", "ok": 70 <= bright <= 210, "detail": f"평균 {bright:.0f}", "implemented": True},
        {"name": "고개 각도", "ok": None, "detail": "준비 중 (MediaPipe)", "implemented": False},
        {"name": "표정", "ok": None, "detail": "준비 중 (MediaPipe)", "implemented": False},
    ]
    passed = all(c["ok"] for c in checks if c["implemented"])
    return {"passed": passed, "checks": checks,
            "message": "좋아요, 이 사진으로 괜찮아요." if passed else "같은 장소·조명에서 다시 찍어 주세요.",
            "redness": None, "note": "붉은기 측정은 아직 연결되지 않았어요."}
