"""배포한 OCR Space의 실제 속도 재기. 앱(frontend/src/ocr.js)과 같은 방식: 긴 변 1800px JPEG, Gradio /ocr.

    pip install gradio_client opencv-python-headless
    python scripts/space_speed.py photos/truth                      # 기본 주소(앱이 쓰는 Space)
    python scripts/space_speed.py photos/truth --url http://127.0.0.1:7860/

사진 폴더의 앞쪽 사진으로 1장, 2장, 3장 요청을 보내고 걸린 시간을 보여 준다(같은 사진이면 결과 성분 수도 같아야 한다).
본선 전 기준: 1장 30초 이내(앱 안내 '30초쯤'), 3장 60초 이내면 괜찮음.
"""
import argparse
import tempfile
import time
from pathlib import Path

import cv2
from gradio_client import Client, handle_file

URL = "https://alkadsdvs98py-natssi-ocr.hf.space/"


def as_app(src: Path, out_dir: Path) -> Path:
    img = cv2.imread(str(src))
    h, w = img.shape[:2]
    s = min(1, 1800 / max(h, w))
    img = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    out = out_dir / (src.stem + ".jpg")
    cv2.imwrite(str(out), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--url", default=URL)
    args = ap.parse_args()
    photos = sorted(p for p in Path(args.folder).iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})[:3]
    if not photos:
        raise SystemExit("사진이 없어요.")
    tmp = Path(tempfile.mkdtemp())
    files = [as_app(p, tmp) for p in photos]
    t = time.perf_counter()
    c = Client(args.url, verbose=False)
    print(f"연결(잠든 Space 깨우기 포함) {time.perf_counter() - t:.1f}초")
    for n, label in ((1, "1장"), (1, "1장 다시"), (min(2, len(files)), "2장"), (len(files), f"{len(files)}장")):
        t = time.perf_counter()
        out = c.predict(images=[handle_file(str(f)) for f in files[:n]], api_name="/ocr")
        print(f"{label:<8} {time.perf_counter() - t:6.1f}초 (서버 {out.get('seconds')}초) 성분 {len(out.get('ingredients', []))}"
              f" {out.get('message', '')[:30]}", flush=True)


if __name__ == "__main__":
    main()
