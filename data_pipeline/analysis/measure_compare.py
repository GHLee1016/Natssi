"""원래 측정 코드와 지금 측정 코드를 같은 사진으로 비교한다.

- 원래: natssi_selfie_validation/code/measure_redness.py (MDC95 2.35를 낼 때 쓴 measurements.csv를 만든 코드)
- 지금: analysis/color_robustness.py의 measure, quality_ok (앱 frontend/src/measure, backend/app/quality.py에 맞춘 코드)

원래 코드를 찾지 못해서 앱 코드를 바탕으로 다시 만들었기 때문에, 두 코드가 같은 사진에서 같은 값과 같은 품질 판정을 내는지 확인한다.
알려진 차이 (코드 비교)
- 사진 읽기: 원래 PIL(+EXIF 회전) / 지금 OpenCV. 둘 다 색 프로필은 무시
- 얼굴 점: 원래 원본 해상도에서 찾음 / 지금 긴 변 1600px로 줄여서 찾음(앱과 같음)
- 볼 영역: 원래 좌표를 버림(int)하고 테두리 없이 채움 / 지금 반올림하고 테두리까지 채움(앱과 같음)
- 선명도: 원래 256px로 줄일 때 쌍선형 / 지금 면적 평균(앱과 같음)
- 위아래 각도: 원래 |pitch| ≤ 10 / 지금 |pitch − 3.7| ≤ 10 (앱의 MediaPipe 치우침 보정)
- 여러 얼굴: 원래 찾은 얼굴 수 그대로 / 지금 겹치거나 아주 작은 얼굴은 빼고 셈(앱과 같음)
- 얼굴 각도를 못 잰 사진: 원래 통과 / 지금 탈락

    python analysis/measure_compare.py <face_data 폴더>
결과: private/measure_compare.csv (사진별, 깃허브 X), data/measure_compare.md (요약만)
사진은 이 컴퓨터에서 숫자로만 처리하고 어디에도 저장, 전송하지 않는다.
"""
import math
import sys
from pathlib import Path

import cv2
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import color_robustness as cr  # noqa: E402
import mdc95_check as mc  # noqa: E402

ROOT = cr.ROOT

# 원래 measure_redness.py의 기준(그대로 옮김)
O = dict(min_side=480, bright=(70, 210), yaw=10.0, pitch=10.0, roll=8.0, smile=0.40, blink=0.50,
         face_ratio=0.25, sharp=60.0, clip=0.01, n_roi=400)


def load_rgb_pil(path) -> np.ndarray:
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(path))
    return np.asarray(im.convert("RGB"))


def detect_full(img: np.ndarray):
    """원래처럼 원본 해상도에서 얼굴 점을 찾고, 찾은 얼굴 수를 그대로 센다."""
    import mediapipe as mp
    res = cr.landmarker().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
    if not res.face_landmarks:
        return None
    h, w = img.shape[:2]
    lm = np.array([[p.x * w, p.y * h] for p in res.face_landmarks[0]])
    blend = {c.category_name: c.score for c in res.face_blendshapes[0]} if res.face_blendshapes else {}
    mat = np.array(res.facial_transformation_matrixes[0]) if res.facial_transformation_matrixes else None
    return dict(lm=lm, blend=blend, matrix=mat, n_faces=len(res.face_landmarks))


def roi_orig(img: np.ndarray, pts: np.ndarray) -> dict:
    m = np.zeros(img.shape[:2], np.uint8)
    cv2.fillPoly(m, [np.asarray(pts, np.int32)], 1)
    px = img[m.astype(bool)]
    if not len(px):
        return dict(n=0, clip=0.0, a=np.nan)
    clipped = (px >= 250).any(axis=1)
    good = px[~clipped & ~(px.max(axis=1) < 20)]
    a = float(np.median(cr.srgb_to_lab(good)[:, 1])) if len(good) else np.nan
    return dict(n=int(len(good)), clip=float(clipped.mean()), a=a)


def sharp_orig(img, box) -> float:
    x0, y0, x1, y1 = box
    face = img[max(0, y0):y1, max(0, x0):x1]
    if face.size == 0:
        return 0.0
    g = cv2.cvtColor(cv2.resize(face, (256, 256)), cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def measure_orig(path) -> dict:
    """원래 measure_redness.measure와 같은 순서와 기준. 반환: a_star, pass, flags."""
    img = load_rgb_pil(path)
    h, w = img.shape[:2]
    flags = []
    if min(w, h) < O["min_side"]:
        flags.append("resolution")
    if not O["bright"][0] <= float(img.mean()) <= O["bright"][1]:
        flags.append("brightness")
    f = detect_full(img)
    if f is None:
        return dict(a_star=np.nan, ok=False, flags="no_face")
    if f["n_faces"] > 1:
        flags.append("multiple_faces")
    lm = f["lm"]
    x0, y0 = lm.min(axis=0).astype(int)
    x1, y1 = lm.max(axis=0).astype(int)
    if (x1 - x0) / w < O["face_ratio"]:
        flags.append("face_small")
    if sharp_orig(img, (x0, y0, x1, y1)) < O["sharp"]:
        flags.append("blur")
    if f["matrix"] is not None:
        e = cr.euler(f["matrix"])
        if abs(e["yaw"]) > O["yaw"] or abs(e["pitch"]) > O["pitch"] or abs(e["roll"]) > O["roll"]:
            flags.append("head_pose")
    bs = f["blend"]
    if max(bs.get("mouthSmileLeft", 0), bs.get("mouthSmileRight", 0)) > O["smile"]:
        flags.append("smile")
    if max(bs.get("eyeBlinkLeft", 0), bs.get("eyeBlinkRight", 0)) > O["blink"]:
        flags.append("eyes_closed")
    a = []
    for s, idx in (("L", cr.CHEEK_L), ("R", cr.CHEEK_R)):
        st = roi_orig(img, lm[idx])
        a.append(st["a"])
        if st["n"] < O["n_roi"]:
            flags.append(f"roi_small_{s}")
        if st["clip"] > O["clip"]:
            flags.append(f"clipped_{s}")
    return dict(a_star=float(np.nanmean(a)), ok=not flags, flags=",".join(flags))


def now_flags(f: dict) -> str:
    """지금 코드(quality_ok)가 왜 떨어뜨렸는지 사람이 읽을 이유."""
    if not f.get("face_found"):
        return "no_face"
    q, out = cr.Q, []
    if min(f["width"], f["height"]) < q["short"]:
        out.append("resolution")
    if not q["bright"][0] <= f["brightness"] <= q["bright"][1]:
        out.append("brightness")
    if f.get("n_faces", 1) > 1:
        out.append("multiple_faces")
    if f["face_ratio"] < q["face_ratio"]:
        out.append("face_small")
    if f["sharpness"] < q["sharp"]:
        out.append("blur")
    if abs(f.get("yaw", 99)) > q["yaw"] or abs(f.get("pitch", 99) - q["pitch_off"]) > q["pitch"] or abs(f.get("roll", 99)) > q["roll"]:
        out.append("head_pose")
    if f.get("smile", 1) > q["smile"]:
        out.append("smile")
    if f.get("blink", 1) > q["blink"]:
        out.append("eyes_closed")
    for s in ("L", "R"):
        if f[f"n_{s}"] < q["n_roi"]:
            out.append(f"roi_small_{s}")
        if f[f"clip_{s}"] > q["clip"]:
            out.append(f"clipped_{s}")
    return ",".join(out)


def run(folder):
    rows = []
    for ph in cr.photos(Path(folder)):
        o = measure_orig(ph["path"])
        n = cr.measure(cr.load_rgb(ph["path"]))
        n.pop("face_ok", None)
        rows.append(dict(member=ph["member"], date=ph["date"], photo=ph["path"].stem.split("_")[-1],
                         a_orig=o["a_star"], ok_orig=o["ok"], flags_orig=o["flags"],
                         a_now=n.get("a_star", np.nan), ok_now=cr.quality_ok(n), flags_now=now_flags(n),
                         pitch_now=n.get("pitch", np.nan)))
        r = rows[-1]
        print(f"{ph['path'].name}: 원래 {r['a_orig']:.3f}({'통과' if r['ok_orig'] else r['flags_orig']}), "
              f"지금 {r['a_now']:.3f}({'통과' if r['ok_now'] else r['flags_now']})", flush=True)
    if not rows:
        raise SystemExit(f"사진을 찾지 못했어요: {folder}\n"
                         "폴더 경로에 띄어쓰기가 있으면 따옴표로 감싸 주세요. 폴더 안은 '이름/2026-11-08_1.jpg' 구조여야 해요.")
    d = pd.DataFrame(rows)
    out = ROOT / "private" / "measure_compare.csv"
    out.parent.mkdir(exist_ok=True)
    d.to_csv(out, index=False, encoding="utf-8-sig")
    summary(d)
    return d


def _mdc(d: pd.DataFrame, a_col: str, ok_col: str):
    x = d[d[ok_col].astype(bool)].dropna(subset=[a_col])
    x = pd.DataFrame(dict(member=x["member"].astype(str), date=x["date"].astype(str),
                          photo=pd.to_numeric(x["photo"], errors="coerce"), a=x[a_col].astype(float)))
    lo, hi = mc.original_ci(x)
    return len(x), mc.original_mdc(x), lo, hi


def summary(d: pd.DataFrame):
    both = d.dropna(subset=["a_orig", "a_now"])
    diff = (both["a_now"] - both["a_orig"]).abs()
    only_o = d[d.ok_orig & ~d.ok_now]
    only_n = d[~d.ok_orig & d.ok_now]
    rows = []
    for label, a, ok in (("원래 코드", "a_orig", "ok_orig"), ("지금 코드", "a_now", "ok_now")):
        n, m, lo, hi = _mdc(d, a, ok)
        rows.append(dict(측정=label, 품질통과=n, MDC95=round(m, 2), 신뢰구간=f"{lo:.2f}~{hi:.2f}"))
    why = lambda x: ", ".join(f"{k} {v}장" for k, v in x.str.split(",").explode().value_counts().items()) or "없음"
    lines = ["# 원래 측정 코드와 지금 측정 코드 비교", "",
             f"사진 {len(d)}장, {d['member'].nunique()}명. 비교는 analysis/measure_compare.py.", "",
             "## 볼 a* 값", "",
             f"- 두 코드 모두 값이 나온 사진 {len(both)}장: 차이 절댓값 중앙 {diff.median():.3f}, 최대 {diff.max():.3f}", "",
             "## 품질 판정", "",
             f"- 원래 통과 {int(d.ok_orig.sum())}장, 지금 통과 {int(d.ok_now.sum())}장, 판정이 같은 사진 {int((d.ok_orig == d.ok_now).sum())}장",
             f"- 원래만 통과 {len(only_o)}장 (지금 떨어진 이유: {why(only_o['flags_now'])})",
             f"- 지금만 통과 {len(only_n)}장 (원래 떨어진 이유: {why(only_n['flags_orig'])})", "",
             "## MDC95 (원래 방법: 하루 1장 SEM, 사람 단위 부트스트랩 2000회)", "",
             pd.DataFrame(rows).to_markdown(index=False), "",
             f"> 앱 값: MDC95 {mc.TARGET}, 95% 신뢰구간 {mc.TARGET_CI[0]}~{mc.TARGET_CI[1]}", ""]
    out = ROOT / "data" / "measure_compare.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    print(f"→ {out}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("python analysis/measure_compare.py <face_data 폴더>")
    run(sys.argv[1])
