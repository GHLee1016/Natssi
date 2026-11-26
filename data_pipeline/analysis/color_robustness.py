"""조명 색이 바뀌면 볼 붉은기(a*)가 얼마나 흔들리고, 품질 검사가 그걸 잡는가 — 필터로 흉내 낸 실험.

다른 조명에서 다시 찍기 어려워서, 팀원 셀카에 '조명 색 필터'를 씌워 본다.
- 따뜻함/차가움: 조명 색온도(K)가 바뀐 것처럼 선형 RGB 채널에 곱함(폰 화이트밸런스가 따라가지 못한 경우)
    6500K(기준) → 3000·4000·5000K(따뜻함), 8000·10000K(차가움)
- 초록/분홍 틴트: 초록 채널만 ±5·10·20% (a*는 초록↔빨강 축이라 형광등·LED 틴트에 직접 반응)

측정은 앱(frontend/src/measure/core.js, browser.js)과 같은 방식으로 파이썬에 옮겼다:
  사진 방향 반영, 색 프로필 무시(OpenCV처럼 저장된 값 그대로) → 긴 변 1600px로 얼굴 점 → 원본에서 양 볼 Lab,
  포화(250 이상)·어두운(20 미만) 픽셀 제외, 양 볼 a* 중앙값의 평균 = a_star.
  원본 사진으로 팀 측정값(measurements.csv)과 같은 값이 나오는지 먼저 확인한다(validate).

개선안도 같이 잰다:
- 상대 붉은기  a_rel_forehead = 볼 a* - 이마 a*,  a_rel_nose = 볼 a* - 콧등 a*  (조명 색은 얼굴 전체에 씌워지니 빼면 상쇄?)
- 색 틀어짐 검사: 얼굴 피부(볼+이마) b* 중앙값이 그 사람 평소 값에서 크게 벗어나면 '조명이 평소와 달라요'

    python analysis/color_robustness.py validate <face_data 폴더> <measurements.csv>
    python analysis/color_robustness.py run <face_data 폴더>
결과: private/color_robustness.csv (사진별, 깃허브 X), data/color_robustness_summary.md (요약만)
사진은 이 컴퓨터에서 숫자로만 처리하고 어디에도 저장·전송하지 않는다.
"""
import math
import re
import sys
from pathlib import Path

import cv2
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "models" / "face_landmarker.task"
# 사진 폴더 이름(실명) → 팀원A/B/C. 저장소가 공개라 대응표는 private/labels.csv(깃허브 X)에만 둔다.
#   private/labels.csv:  folder,label  (예: 폴더이름,팀원A)
_LABELS = ROOT / "private" / "labels.csv"
NAME_TO_LABEL = dict(pd.read_csv(_LABELS).values) if _LABELS.exists() else {}
MDC95 = 2.35

CHEEK_L = [116, 117, 118, 101, 36, 205, 187, 123]
CHEEK_R = [345, 346, 347, 330, 266, 425, 411, 352]
FOREHEAD = [109, 10, 338, 337, 151, 108]          # 이마 가운데 띠 (앞머리가 내려오면 가려질 수 있음)
NOSE = [168, 351, 412, 437, 4, 217, 188, 122]     # 콧등 (미간 아래 ~ 코끝 위)

DETECT_MAX_SIDE = 1600
# 팀 품질 기준 (results.json thresholds, 앱과 같음)
Q = dict(short=480, bright=(70, 210), yaw=10, pitch=10, pitch_off=3.7, roll=8, smile=0.40, blink=0.50,
         face_ratio=0.25, sharp=60, clip=0.01, n_roi=400)


# ---------- 색 변환 (core.js와 같은 식) ----------
_M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
_WHITE = np.array([0.95047, 1.0, 1.08883])
_LIN = np.array([(c / 255) / 12.92 if c / 255 <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4 for c in range(256)])


def srgb_to_lab(rgb_u8: np.ndarray) -> np.ndarray:
    lin = _LIN[rgb_u8]                                   # (N,3)
    xyz = lin @ _M.T / _WHITE
    eps, kappa = 216 / 24389, 24389 / 27
    f = np.where(xyz > eps, np.cbrt(xyz), (kappa * xyz + 16) / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def roi_stats(img: np.ndarray, pts: np.ndarray) -> dict:
    """img: RGB uint8, pts: (k,2) 원본 픽셀 좌표 다각형. cv2.fillPoly + 테두리(앱 polygonMask와 같은 결과)."""
    mask = np.zeros(img.shape[:2], np.uint8)
    p = np.round(pts).astype(np.int32)
    cv2.fillPoly(mask, [p], 1)
    cv2.polylines(mask, [p], True, 1)
    px = img[mask.astype(bool)]
    total = len(px)
    if not total:
        return dict(n=0, clip=np.nan, L=np.nan, a=np.nan, b=np.nan)
    clipped = (px >= 250).any(axis=1)
    dark = px.max(axis=1) < 20
    keep = px[~clipped & ~dark]
    if not len(keep):
        return dict(n=0, clip=clipped.mean(), L=np.nan, a=np.nan, b=np.nan)
    lab = srgb_to_lab(keep)
    return dict(n=len(keep), clip=clipped.mean(), L=float(np.median(lab[:, 0])),
                a=float(np.median(lab[:, 1])), b=float(np.median(lab[:, 2])))


def sharpness(img: np.ndarray, box) -> float:
    x0, y0, x1, y1 = max(0, box[0]), max(0, box[1]), min(img.shape[1], box[2]), min(img.shape[0], box[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    sm = cv2.resize(img[y0:y1, x0:x1], (256, 256), interpolation=cv2.INTER_AREA)
    g = cv2.cvtColor(sm, cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F, ksize=1, borderType=cv2.BORDER_REFLECT_101).var())


# ---------- 얼굴 점 ----------
_LMK = None


def landmarker():
    global _LMK
    if _LMK is None:
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision
        opts = vision.FaceLandmarkerOptions(
            base_options=mpt.BaseOptions(model_asset_path=str(MODEL)), running_mode=vision.RunningMode.IMAGE,
            num_faces=2, output_face_blendshapes=True, output_facial_transformation_matrixes=True)
        _LMK = vision.FaceLandmarker.create_from_options(opts)
    return _LMK


def detect(img: np.ndarray):
    import mediapipe as mp
    h, w = img.shape[:2]
    s = min(1.0, DETECT_MAX_SIDE / max(h, w))
    small = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else img
    res = landmarker().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(small)))
    if not res.face_landmarks:
        return None
    boxes = []
    for i, lm in enumerate(res.face_landmarks):
        xs, ys = [p.x for p in lm], [p.y for p in lm]
        boxes.append((max(xs) - min(xs), i, min(xs), min(ys), max(xs), max(ys)))
    boxes.sort(reverse=True)
    big, main = boxes[0][0], boxes[0][1]
    kept = []
    for b in boxes:
        if b[0] < 0.4 * big:
            continue
        ov = lambda a, c: max(0, min(a[4], c[4]) - max(a[2], c[2])) * max(0, min(a[5], c[5]) - max(a[3], c[3])) \
            >= 0.3 * min((a[4] - a[2]) * (a[5] - a[3]), (c[4] - c[2]) * (c[5] - c[3]))
        if any(ov(k, b) for k in kept):
            continue
        kept.append(b)
    lm = np.array([[p.x * w, p.y * h] for p in res.face_landmarks[main]])
    blend = {c.category_name: c.score for c in res.face_blendshapes[main]} if res.face_blendshapes else {}
    mat = np.array(res.facial_transformation_matrixes[main]) if res.facial_transformation_matrixes else None
    return dict(lm=lm, blend=blend, matrix=mat, n_faces=len(kept))


def euler(m) -> dict:
    r = np.asarray(m)[:3, :3]
    deg = 180 / math.pi
    sy = math.hypot(r[0, 0], r[1, 0])
    return dict(pitch=math.atan2(r[2, 1], r[2, 2]) * deg, yaw=math.atan2(-r[2, 0], sy) * deg,
                roll=math.atan2(r[1, 0], r[0, 0]) * deg)


def measure(img: np.ndarray, face=None) -> dict:
    """img: RGB uint8 (원본 해상도). face를 주면 그 얼굴 점을 그대로 쓴다(필터 실험: 같은 위치에서 색만 비교)."""
    h, w = img.shape[:2]
    out = dict(width=w, height=h, brightness=float(img.mean()), face_found=False, n_faces=0)
    face = face or detect(img)
    if face is None:
        return out
    lm = face["lm"]
    out.update(face_found=True, n_faces=face["n_faces"])
    box = [int(math.floor(lm[:, 0].min())), int(math.floor(lm[:, 1].min())),
           int(math.ceil(lm[:, 0].max())), int(math.ceil(lm[:, 1].max()))]
    out["face_ratio"] = (box[2] - box[0]) / w
    out["sharpness"] = sharpness(img, box)
    if face["matrix"] is not None:
        out.update(euler(face["matrix"]))
    b = face["blend"]
    if b:
        out["smile"] = max(b.get("mouthSmileLeft", 0), b.get("mouthSmileRight", 0))
        out["blink"] = max(b.get("eyeBlinkLeft", 0), b.get("eyeBlinkRight", 0))
    for name, idx in (("L", CHEEK_L), ("R", CHEEK_R), ("fh", FOREHEAD), ("nose", NOSE)):
        st = roi_stats(img, lm[idx])
        for k, v in st.items():
            out[f"{k}_{name}"] = v
    out["a_star"] = np.nanmean([out["a_L"], out["a_R"]])
    out["b_cheek"] = np.nanmean([out["b_L"], out["b_R"]])
    out["a_rel_forehead"] = out["a_star"] - out["a_fh"]
    out["a_rel_nose"] = out["a_star"] - out["a_nose"]
    out["face_ok"] = face
    return out


def quality_ok(f: dict) -> bool:
    if not f.get("face_found"):
        return False
    return bool(min(f["width"], f["height"]) >= Q["short"] and Q["bright"][0] <= f["brightness"] <= Q["bright"][1]
                and f.get("n_faces", 1) <= 1                                   # 여러 얼굴(앱 quality.py와 같음)
                and abs(f.get("yaw", 99)) <= Q["yaw"] and abs(f.get("pitch", 99) - Q["pitch_off"]) <= Q["pitch"]
                and abs(f.get("roll", 99)) <= Q["roll"] and f.get("smile", 1) <= Q["smile"] and f.get("blink", 1) <= Q["blink"]
                and f["face_ratio"] >= Q["face_ratio"] and f["sharpness"] >= Q["sharp"]
                and f["clip_L"] <= Q["clip"] and f["clip_R"] <= Q["clip"] and f["n_L"] >= Q["n_roi"] and f["n_R"] >= Q["n_roi"])


def load_rgb(path: Path) -> np.ndarray:
    """cv2.imdecode: 사진 방향(EXIF) 반영, 색 프로필 무시 = 검증 파이프라인과 같음."""
    bgr = cv2.imdecode(np.fromfile(str(path), np.uint8), cv2.IMREAD_COLOR)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


# ---------- 필터 ----------

def kelvin_rgb(t: float) -> np.ndarray:
    """색온도 → sRGB(0~1) 근사 (Tanner Helland). 상대 비만 쓴다."""
    t /= 100
    r = 255 if t <= 66 else 329.698727446 * (t - 60) ** -0.1332047592
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * (t - 60) ** -0.0755148492
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    return np.clip(np.array([r, g, b]) / 255, 0, 1)


def _lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def _srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)


def temp_gains(kelvin: float) -> np.ndarray:
    """6500K 대비 조명 색이 kelvin으로 바뀌었을 때 선형 RGB 채널 배율 (밝기는 녹색=1로 유지)."""
    g = _lin(kelvin_rgb(kelvin)) / _lin(kelvin_rgb(6500))
    return g / g[1]


def apply_gains(img: np.ndarray, gains) -> np.ndarray:
    lin = _LIN[img] * np.asarray(gains, float)
    return np.clip(np.round(_srgb(np.clip(lin, 0, 1)) * 255), 0, 255).astype(np.uint8)


FILTERS = (
    [("원본", "none", 0, (1, 1, 1))]
    + [(f"{k}K", "temp", k, tuple(temp_gains(k))) for k in (3000, 4000, 5000, 8000, 10000)]
    + [(f"초록 +{p}%", "tint", -p, (1, 1 + p / 100, 1)) for p in (5, 10, 20)]
    + [(f"분홍 +{p}%", "tint", p, (1, 1 - p / 100, 1)) for p in (5, 10, 20)]
)


# ---------- 실행 ----------

def photos(folder: Path):
    for p in sorted(folder.rglob("*")):
        if p.suffix.lower() in (".jpg", ".jpeg", ".png"):
            name = p.parent.name
            m = re.search(r"(20\d\d-\d\d-\d\d)_(\d+)", p.stem)
            yield dict(path=p, member=NAME_TO_LABEL.get(name, name),
                       date=m.group(1) if m else None, idx=int(m.group(2)) if m else None)


def exif_time(path: Path):
    from PIL import Image
    try:
        with Image.open(path) as im:
            ex = im.getexif()
            v = ex.get_ifd(0x8769).get(36867) or ex.get(306)
        return str(v).replace(":", "-", 2) if v else None
    except Exception:
        return None


def validate(folder, meas_csv):
    """원본 사진으로 잰 a_star가 팀 측정값과 같은지 (촬영 시각으로 짝지음)."""
    m = pd.read_csv(meas_csv)
    m["t"] = pd.to_datetime(m["taken_at"])
    rows = []
    for ph in photos(Path(folder)):
        t = exif_time(ph["path"])
        if not t:
            continue
        hit = m[(m["t"] - pd.Timestamp(t)).abs() <= pd.Timedelta(seconds=1)]
        if len(hit) != 1:
            continue
        f = measure(load_rgb(ph["path"]))
        h = hit.iloc[0]
        rows.append(dict(member=ph["member"], a_mine=f.get("a_star"), a_pipe=h["a_star"],
                         yaw_mine=f.get("yaw"), yaw_pipe=h["yaw"], bright_mine=f["brightness"], bright_pipe=h["brightness"],
                         q_mine=quality_ok(f) if f.get("face_found") else False))
    d = pd.DataFrame(rows)
    d["diff"] = d["a_mine"] - d["a_pipe"]
    print(f"짝지은 사진 {len(d)}장 / 측정 파일 {len(m)}장")
    print(f"a* 차이: 평균 {d['diff'].mean():+.3f}, 절댓값 중앙 {d['diff'].abs().median():.3f}, 최대 {d['diff'].abs().max():.3f}")
    print(f"밝기 차이 최대 {(d['bright_mine'] - d['bright_pipe']).abs().max():.3f}, 좌우각 차이 중앙 {(d['yaw_mine'] - d['yaw_pipe']).abs().median():.2f}°")
    print(f"품질 통과(내 계산) {int(d['q_mine'].sum())}장")
    return d


def run(folder):
    rows = []
    for ph in photos(Path(folder)):
        img = load_rgb(ph["path"])
        base = measure(img)
        if not base.get("face_found"):
            continue
        face = base.pop("face_ok")
        for name, kind, level, gains in FILTERS:
            if kind == "none":
                f = dict(base)
            else:
                f = measure(apply_gains(img, gains))            # 얼굴 점도 다시 찾음 (실제 사용과 같게)
                f.pop("face_ok", None)
            rows.append(dict(member=ph["member"], date=ph["date"], photo=ph["path"].stem.split("_")[-1],
                             filter=name, kind=kind, level=level, quality_ok=quality_ok(f),
                             **{k: f.get(k) for k in ("brightness", "a_star", "b_cheek", "a_fh", "a_nose", "n_fh",
                                                      "a_rel_forehead", "a_rel_nose", "clip_L", "clip_R")}))
        del face
    d = pd.DataFrame(rows)
    out = ROOT / "private" / "color_robustness.csv"
    out.parent.mkdir(exist_ok=True)
    d.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"사진 {d[d.kind == 'none'].shape[0]}장 × 필터 {len(FILTERS)}개 → {out}")
    return d


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "validate":
        validate(sys.argv[2], sys.argv[3])
    elif cmd == "run":
        run(sys.argv[2])
