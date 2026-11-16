"""촬영 품질 검사 자리. 지금은 밝기와 해상도만 실제로 확인합니다.
고개 각도·표정·측정 영역(MediaPipe)은 측정 파트에서 이 함수 안에 붙이면 됩니다."""
import io
from PIL import Image, ImageStat


def check(image_bytes: bytes):
    im = Image.open(io.BytesIO(image_bytes)).convert("RGB")
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
            "message": "좋아요, 저장했어요." if passed else "같은 장소·조명에서 다시 찍어 주세요.",
            "redness": None, "note": "붉은기 측정은 아직 연결되지 않았어요."}
