"""셀카 → 볼 붉은기(a*) 측정 + 촬영 품질 검사 → CSV

사용법 (내 컴퓨터에서 실행 권장, 얼굴 원본이 밖으로 나가지 않음):
    pip install mediapipe opencv-python pillow numpy pandas
    # 모델 파일 1회 다운로드(약 3.6MB):
    #   https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
    python measure_redness.py --photos ./photos --meta ./metadata.csv --model ./face_landmarker.task --out measurements.csv

결과 CSV에는 얼굴 사진이 아니라 숫자만 들어갑니다. 분석·공유는 이 CSV로 합니다.

주의: 얼굴 랜드마크(MediaPipe) 부분은 작성 환경에서 모델을 받을 수 없어 실제 얼굴로는 시험하지 못했습니다.
      처음 실행 때 --debug-dir 로 볼 영역(ROI) 그림을 저장해 눈으로 꼭 확인하세요.
"""
import argparse
import math
import os
import sys

import numpy as np
import pandas as pd
from PIL import Image, ImageOps

from color import srgb_to_lab

# ── 품질 기준 (앱 backend/app/quality.py 와 맞춤. 바꾸면 docs/05 에 이유를 남기세요) ──
MIN_SIDE = 480            # 짧은 변 픽셀
BRIGHT_RANGE = (70, 210)  # 전체 평균 밝기(0~255)
MAX_YAW, MAX_PITCH, MAX_ROLL = 10.0, 10.0, 8.0   # 고개 각도(도)
MAX_SMILE, MAX_BLINK = 0.40, 0.50                # 표정(블렌드셰이프 점수 0~1)
MIN_FACE_RATIO = 0.25     # 얼굴 폭 / 사진 폭
MIN_SHARPNESS = 60.0      # 얼굴 영역 라플라시안 분산(256px로 맞춘 뒤)
MAX_CLIP_RATIO = 0.01     # 볼 영역에서 하얗게 날아간 픽셀 비율
MIN_ROI_PIXELS = 400

# MediaPipe Face Mesh 478점 기준 볼 영역 다각형(사진 기준 왼쪽/오른쪽). 처음엔 --debug-dir 로 꼭 확인.
CHEEK_IMG_LEFT = [116, 117, 118, 101, 36, 205, 187, 123]
CHEEK_IMG_RIGHT = [345, 346, 347, 330, 266, 425, 411, 352]


def load_rgb(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)          # 폰 사진 회전 정보 반영
    return np.asarray(im.convert("RGB"))


def polygon_mask(shape, pts):
    import cv2
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.asarray(pts, np.int32)], 1)
    return m.astype(bool)


def roi_stats(rgb, mask):
    px = rgb[mask]
    n = len(px)
    if n == 0:
        return dict(n=0)
    clipped = (px >= 250).any(axis=1)
    dark = px.max(axis=1) < 20
    good = px[~clipped & ~dark]
    lab = srgb_to_lab(good) if len(good) else np.zeros((0, 3))
    return dict(n=int(len(good)), clip_ratio=float(clipped.mean()),
                L=float(np.median(lab[:, 0])) if len(lab) else np.nan,
                a=float(np.median(lab[:, 1])) if len(lab) else np.nan,     # 중앙값: 점·모공 그림자에 덜 흔들림
                a_mean=float(lab[:, 1].mean()) if len(lab) else np.nan,
                b=float(np.median(lab[:, 2])) if len(lab) else np.nan)


def sharpness(rgb, box):
    import cv2
    x0, y0, x1, y1 = box
    face = rgb[max(0, y0):y1, max(0, x0):x1]
    if face.size == 0:
        return 0.0
    g = cv2.cvtColor(cv2.resize(face, (256, 256)), cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def euler_from_matrix(m):
    """MediaPipe facial transformation matrix(4x4) → (yaw, pitch, roll) 도."""
    r = np.asarray(m)[:3, :3]
    sy = math.hypot(r[0, 0], r[1, 0])
    pitch = math.degrees(math.atan2(r[2, 1], r[2, 2]))
    yaw = math.degrees(math.atan2(-r[2, 0], sy))
    roll = math.degrees(math.atan2(r[1, 0], r[0, 0]))
    return yaw, pitch, roll


class Landmarker:
    def __init__(self, model_path):
        import mediapipe as mp
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision
        opts = vision.FaceLandmarkerOptions(
            base_options=mpt.BaseOptions(model_asset_path=model_path),
            output_face_blendshapes=True, output_facial_transformation_matrixes=True, num_faces=2)
        self.mp = mp
        self.det = vision.FaceLandmarker.create_from_options(opts)

    def __call__(self, rgb):
        img = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        res = self.det.detect(img)
        if not res.face_landmarks:
            return None
        h, w = rgb.shape[:2]
        lm = np.array([[p.x * w, p.y * h] for p in res.face_landmarks[0]])
        bs = {c.category_name: c.score for c in res.face_blendshapes[0]} if res.face_blendshapes else {}
        mat = res.facial_transformation_matrixes[0] if res.facial_transformation_matrixes else None
        return dict(lm=lm, blend=bs, matrix=mat, n_faces=len(res.face_landmarks))


def measure(path, lmk, debug_dir=None):
    rgb = load_rgb(path)
    h, w = rgb.shape[:2]
    out = dict(width=w, height=h, brightness=float(rgb.mean(axis=2).mean()))
    flags = []
    if min(w, h) < MIN_SIDE:
        flags.append("resolution")
    if not BRIGHT_RANGE[0] <= out["brightness"] <= BRIGHT_RANGE[1]:
        flags.append("brightness")
    f = lmk(rgb)
    if f is None:
        out.update(quality_pass=False, flags="no_face")
        return out
    if f["n_faces"] > 1:
        flags.append("multiple_faces")
    lm = f["lm"]
    x0, y0 = lm.min(axis=0).astype(int)
    x1, y1 = lm.max(axis=0).astype(int)
    out["face_ratio"] = float((x1 - x0) / w)
    if out["face_ratio"] < MIN_FACE_RATIO:
        flags.append("face_small")
    out["sharpness"] = sharpness(rgb, (x0, y0, x1, y1))
    if out["sharpness"] < MIN_SHARPNESS:
        flags.append("blur")
    if f["matrix"] is not None:
        yaw, pitch, roll = euler_from_matrix(f["matrix"])
        out.update(yaw=yaw, pitch=pitch, roll=roll)
        if abs(yaw) > MAX_YAW or abs(pitch) > MAX_PITCH or abs(roll) > MAX_ROLL:
            flags.append("head_pose")
    bs = f["blend"]
    out["smile"] = max(bs.get("mouthSmileLeft", 0), bs.get("mouthSmileRight", 0))
    out["blink"] = max(bs.get("eyeBlinkLeft", 0), bs.get("eyeBlinkRight", 0))
    if out["smile"] > MAX_SMILE:
        flags.append("smile")
    if out["blink"] > MAX_BLINK:
        flags.append("eyes_closed")
    for side, idx in (("L", CHEEK_IMG_LEFT), ("R", CHEEK_IMG_RIGHT)):
        st = roi_stats(rgb, polygon_mask(rgb.shape, lm[idx]))
        for k, v in st.items():
            out[f"{k}_{side}"] = v
        if st.get("n", 0) < MIN_ROI_PIXELS:
            flags.append(f"roi_small_{side}")
        if st.get("clip_ratio", 0) > MAX_CLIP_RATIO:
            flags.append(f"clipped_{side}")
    out["a_star"] = float(np.nanmean([out.get("a_L", np.nan), out.get("a_R", np.nan)]))
    out["L_star"] = float(np.nanmean([out.get("L_L", np.nan), out.get("L_R", np.nan)]))
    out["quality_pass"] = not flags
    out["flags"] = ",".join(flags)
    if debug_dir:
        save_debug(rgb, lm, os.path.join(debug_dir, os.path.basename(path)))
    return out


def save_debug(rgb, lm, path):
    import cv2
    im = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR).copy()
    for idx, col in ((CHEEK_IMG_LEFT, (0, 255, 0)), (CHEEK_IMG_RIGHT, (0, 200, 255))):
        cv2.polylines(im, [lm[idx].astype(np.int32)], True, col, max(2, im.shape[1] // 400))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv2.imwrite(path, im)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--photos", required=True)
    ap.add_argument("--meta", required=True, help="metadata.csv (file,subject_id,session_id,rep,...)")
    ap.add_argument("--model", required=True, help="face_landmarker.task")
    ap.add_argument("--out", default="measurements.csv")
    ap.add_argument("--debug-dir", default=None, help="볼 영역을 그린 확인용 이미지를 저장할 폴더")
    a = ap.parse_args()
    meta = pd.read_csv(a.meta)
    need = {"file", "subject_id", "session_id", "rep"}
    if not need <= set(meta.columns):
        sys.exit(f"metadata.csv 에 {sorted(need - set(meta.columns))} 열이 필요해요")
    lmk = Landmarker(a.model)
    rows = []
    for _, r in meta.iterrows():
        p = os.path.join(a.photos, r["file"])
        if not os.path.exists(p):
            rows.append({**r.to_dict(), "quality_pass": False, "flags": "missing_file"})
            continue
        try:
            rows.append({**r.to_dict(), **measure(p, lmk, a.debug_dir)})
        except Exception as e:                       # 깨진 파일 등
            rows.append({**r.to_dict(), "quality_pass": False, "flags": f"error:{type(e).__name__}"})
        print(f"[{len(rows)}/{len(meta)}] {r['file']}: {rows[-1].get('flags') or 'ok'}")
    pd.DataFrame(rows).to_csv(a.out, index=False)
    print("저장:", a.out)


if __name__ == "__main__":
    main()
