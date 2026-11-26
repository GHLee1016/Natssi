"""얼굴 전체 붉은기 (시험). 지금 앱은 양쪽 볼만 잰다. 이마, 코, 입 주변, 턱까지 넓히면 무엇이 달라지는지 본다.

측정 바탕은 color_robustness.py와 같다(사진 불러오기, 얼굴 점, sRGB→Lab 식, 품질 검사, 조명 필터).
더하는 것:
- 부위: 얼굴 윤곽 안을 이마, 코, 왼쪽 볼, 오른쪽 볼, 입 주변, 턱으로 나눈다(사진 기준 왼쪽/오른쪽).
- 빼는 곳: 눈 주변(눈썹~광대 위, 안경 자리. 안경 유무와 상관없이 늘 뺀다), 입술, 콧구멍, 얼굴 가장자리,
  어두운 픽셀(L*<30: 머리카락, 안경테, 그림자), 번들거림(L*가 중앙값+3×MAD 넘음), 날아간/아주 어두운 픽셀(앱과 같음).
- 얼굴 전체 값은 입 주변을 뺀 피부로 낸다(입 주변은 따로).
- 붉은 점: 주변(얼굴 폭 6% 창의 중앙값)보다 a*가 6 넘게 높고 L*는 8 넘게 낮지 않은(갈색 점, 주근깨 제외) 작은 덩어리.
  얼굴 폭 2.5% 안의 조각은 한 점으로 센다.
  안경테 가장자리 근처는 뺀다. 진단이 아니라 '붉은 점'이라는 관찰값이다.

    python analysis/fullface_redness.py pair <사진A> <사진B> <그림.png>   # 두 사진 비교 그림과 부위별 숫자
    python analysis/fullface_redness.py run <face_data 폴더>              # → private/fullface_redness.csv (깃허브 X)
    python analysis/fullface_redness.py summary                          # → data/fullface_redness_summary.md (요약만)

run은 사진마다 원본 1번 + 조명 필터 11종을 잰다. 필터 사진은 원본에서 찾은 얼굴 점을 그대로 써서 색 변화만 본다.
사진은 이 컴퓨터에서 숫자로만 처리하고 어디에도 저장, 전송하지 않는다.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import color_robustness as cr  # noqa: E402

ROOT = cr.ROOT
MDC95_CHEEK = cr.MDC95
REGIONS = ["이마", "코", "왼쪽 볼", "오른쪽 볼", "입 주변", "턱"]
COLS = {"이마": "fh", "코": "nose", "왼쪽 볼": "cl", "오른쪽 볼": "cr", "입 주변": "mouth", "턱": "chin"}

OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
        172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
EYEZONE_L = [70, 63, 105, 66, 107, 55, 193, 245, 128, 121, 120, 119, 118, 117, 111, 35, 124, 46, 116, 100, 47, 114, 188]
EYEZONE_R = [300, 293, 334, 296, 336, 285, 417, 465, 357, 350, 349, 348, 347, 346, 340, 265, 353, 276, 345, 329, 277, 343, 412]
NOSTRIL = [48, 64, 98, 97, 2, 326, 327, 294, 278, 219, 439, 240, 460]
NOSE_HULL = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 64, 48, 115, 131, 198, 196, 122, 193, 417, 351, 419, 420, 360, 344, 278,
             294, 327]
BROW_TOP = [105, 66, 107, 334, 296, 336]
MIDLINE = [1, 4, 6, 168]

SPOT_DA, SPOT_DL = 6.0, 8.0          # 붉은 점: 주변보다 a* +6 넘게, L* -8 넘게 어둡지 않게
SPOT_STEP = 4                       # 점 찾기는 4px 간격으로(속도)
SPOT_MERGE = 0.025                  # 이 거리(얼굴 폭 비율) 안의 조각은 한 점


def _poly(shape, pts, hull=False):
    import cv2
    p = np.round(pts).astype(np.int32)
    if hull:
        p = cv2.convexHull(p)
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [p.reshape(-1, 2)], 1)
    cv2.polylines(m, [p.reshape(-1, 2)], True, 1)
    return m.astype(bool)


def lab_image(img: np.ndarray) -> np.ndarray:
    return cr.srgb_to_lab(img.reshape(-1, 3)).reshape(img.shape[0], img.shape[1], 3)


def regions(img: np.ndarray, lm: np.ndarray, lab: np.ndarray):
    """부위별 마스크와 전체 피부 마스크."""
    H, W = img.shape[:2]
    L = lab[..., 0]
    ok_px = (img.max(-1) < 250) & (img.max(-1) >= 20)
    face = ndimage.binary_erosion(_poly(img.shape, lm[OVAL]), iterations=max(1, int(0.03 * W)))
    lips = _poly(img.shape, lm[LIPS])
    lips_d = ndimage.binary_dilation(lips, iterations=max(1, int(0.012 * W)))
    eyez = _poly(img.shape, lm[EYEZONE_L], hull=True) | _poly(img.shape, lm[EYEZONE_R], hull=True)
    eyez = ndimage.binary_dilation(eyez, iterations=max(1, int(0.025 * W)))
    nostril = _poly(img.shape, lm[NOSTRIL], hull=True)
    skin = face & ~lips_d & ~eyez & ~nostril & ok_px & (L >= 30)
    if skin.sum() < 1000:
        return None, {}
    Lm = np.median(L[skin])
    Lmad = np.median(np.abs(L[skin] - Lm))
    skin &= L <= Lm + 3 * 1.4826 * Lmad
    skin = ndimage.binary_opening(skin, iterations=2)
    brow_y = lm[BROW_TOP][:, 1].min()
    lip_bottom = lm[17, 1]
    mid_x = lm[MIDLINE][:, 0].mean()
    nose = _poly(img.shape, lm[NOSE_HULL], hull=True) & ~nostril
    ring = ndimage.binary_dilation(lips, iterations=max(1, int(0.06 * W))) & ~lips_d
    yy, xx = np.mgrid[0:H, 0:W]
    reg = {"이마": skin & (yy < brow_y), "코": skin & nose}
    reg["입 주변"] = skin & ring & ~nose
    reg["턱"] = skin & (yy > lip_bottom + 0.02 * H) & ~ring
    rest = skin & ~reg["이마"] & ~reg["코"] & ~reg["입 주변"] & ~reg["턱"]
    reg["왼쪽 볼"] = rest & (xx < mid_x)
    reg["오른쪽 볼"] = rest & (xx >= mid_x)
    return skin, reg


def find_spots(L: np.ndarray, A: np.ndarray, skin: np.ndarray, width: int):
    """붉은 점 개수, 피부 중 면적 비율(%), 중심 좌표. width = 사진 폭(창 크기 기준)."""
    s = SPOT_STEP
    sk = skin[::s, ::s]
    if sk.sum() < 50:
        return 0, 0.0, []
    a = A[::s, ::s].astype(float).copy()
    l = L[::s, ::s].astype(float).copy()
    a[~sk] = np.median(a[sk])                     # 피부 밖은 피부 중앙값으로 채워 창 중앙값이 끌려가지 않게
    l[~sk] = np.median(l[sk])
    size = max(3, int(0.06 * width / s) | 1)
    local_a = ndimage.median_filter(a, size=size, mode="nearest")
    local_l = ndimage.median_filter(l, size=size, mode="nearest")
    dark = ndimage.binary_dilation((L < 30)[::s, ::s], iterations=max(1, int(0.015 * width / s)))
    inner = ndimage.binary_erosion(sk, iterations=max(1, int(0.02 * width / s)))   # 뺀 영역 바로 옆은 창 중앙값이 치우쳐 점 후보에서 뺀다
    hot = inner & ~dark & ((a - local_a) > SPOT_DA) & ((local_l - l) < SPOT_DL)
    # 가까운 조각은 한 점으로(얼굴 폭의 2.5% 안). 한 뾰루지와 둘레의 붉어진 곳이 두 점으로 세어지지 않게
    grown = ndimage.binary_dilation(hot, iterations=max(1, int(SPOT_MERGE * width / s))) & sk
    lab_, n = ndimage.label(grown)
    if not n:
        return 0, 0.0, []
    sizes = ndimage.sum(hot, lab_, range(1, n + 1)) * s * s
    lo, hi = (0.004 * width) ** 2, (0.05 * width) ** 2
    keep = [i + 1 for i, v in enumerate(sizes) if lo <= v <= hi]
    spots = np.isin(lab_, keep) & hot
    centers = [(cy * s, cx * s) for cy, cx in ndimage.center_of_mass(spots, lab_, keep)] if keep else []
    return len(keep), float(spots.sum() / sk.sum() * 100), centers


def measure_full(img: np.ndarray, lm: np.ndarray, spots=True) -> dict:
    lab = lab_image(img)
    skin, reg = regions(img, lm, lab)
    if skin is None:
        return {"ff_ok": False}
    A, L, B = lab[..., 1], lab[..., 0], lab[..., 2]
    # 얼굴 전체는 입 주변을 뺀다: 입 모양, 입술 경계에 따라 흔들려서 같은 날 반복 오차가 가장 컸다(팀원 1명 41장, MDC95 1.52).
    # 입 주변은 따로(a_mouth) 남긴다.
    whole = skin & ~reg["입 주변"]
    out = {"ff_ok": True, "a_whole": float(np.median(A[whole])), "b_whole": float(np.median(B[whole])),
           "px_whole": int(whole.sum())}
    for name, m in reg.items():
        c = COLS[name]
        out[f"a_{c}"] = float(np.median(A[m])) if m.sum() >= 400 else np.nan
        out[f"px_{c}"] = int(m.sum())
    out["a_rel_whole_nose"] = out["a_whole"] - out["a_nose"]          # 조명 색 상쇄용 참고값
    if spots:
        n, area, centers = find_spots(L, A, skin, img.shape[1])
        out.update(spots=n, spot_area=area, _centers=centers)
    out["_skin"], out["_A"] = skin, A
    return out


# ---------- 두 사진 비교 그림 ----------

def pair(a_path, b_path, out_png):
    from PIL import Image, ImageDraw
    import matplotlib
    res = []
    for p in (a_path, b_path):
        img = cr.load_rgb(Path(p))
        face = cr.detect(img)
        if face is None:
            sys.exit(f"얼굴을 찾지 못했어요: {p}")
        f = measure_full(img, face["lm"])
        base = cr.measure(img, face)
        f["a_star_app"] = base["a_star"]
        res.append((img, face["lm"], f))
    tiles = []
    for img, lm, f in res:
        H, W = img.shape[:2]
        norm = np.clip((f["_A"] - 4) / 18, 0, 1)
        col = (matplotlib.colormaps["magma"](norm)[..., :3] * 255).astype(np.uint8)
        gray = np.repeat((img.mean(-1, keepdims=True) * 0.55 + 90).astype(np.uint8), 3, -1)
        hm = Image.fromarray(np.where(f["_skin"][..., None], col, gray))
        d = ImageDraw.Draw(hm)
        for cy, cx in f["_centers"]:
            r = 0.022 * W
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(80, 220, 255), width=6)
        x0, y0, x1, y1 = lm[:, 0].min(), lm[:, 1].min(), lm[:, 0].max(), lm[:, 1].max()
        pad = 0.08 * (x1 - x0)
        box = tuple(int(v) for v in (max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)))
        a, b = Image.fromarray(img).crop(box), hm.crop(box)
        h = 900
        a = a.resize((int(a.width * h / a.height), h))
        b = b.resize(a.size)
        t = Image.new("RGB", (a.width * 2 + 10, h), "white")
        t.paste(a, (0, 0))
        t.paste(b, (a.width + 10, 0))
        tiles.append(t)
    canvas = Image.new("RGB", (max(t.width for t in tiles), sum(t.height for t in tiles) + 20), "white")
    y = 0
    for t in tiles:
        canvas.paste(t, (0, y))
        y += t.height + 20
    canvas.save(out_png)
    keys = ["a_star_app", "a_whole"] + [f"a_{COLS[r]}" for r in REGIONS] + ["spots", "spot_area"]
    table = {k: [round(float(r[2][k]), 2) for r in res] for k in keys}
    print(json.dumps(table, ensure_ascii=False, indent=1))
    return table


# ---------- 여러 사진: 반복 촬영 오차, 조명 필터 ----------

KEEP = ["ff_ok", "a_whole", "b_whole", "a_rel_whole_nose", "spots", "spot_area"] + \
       [f"a_{c}" for c in COLS.values()] + [f"px_{c}" for c in COLS.values()]


def run(folder):
    rows = []
    for ph in cr.photos(Path(folder)):
        img = cr.load_rgb(ph["path"])
        base = cr.measure(img)
        if not base.get("face_found"):
            continue
        face = base.pop("face_ok")
        q = cr.quality_ok(base)
        for name, kind, level, gains in cr.FILTERS:
            im = img if kind == "none" else cr.apply_gains(img, gains)
            f = measure_full(im, face["lm"], spots=(kind == "none"))
            rows.append(dict(member=ph["member"], date=ph["date"], photo=ph["path"].stem.split("_")[-1],
                             filter=name, kind=kind, level=level, quality_ok=q,
                             a_star=base["a_star"] if kind == "none" else np.nan,
                             **{k: f.get(k) for k in KEEP}))
        print(f"{ph['path'].name}: 볼 {base['a_star']:.2f}, 전체 {rows[-len(cr.FILTERS)]['a_whole']}", flush=True)
    d = pd.DataFrame(rows)
    out = ROOT / "private" / "fullface_redness.csv"
    out.parent.mkdir(exist_ok=True)
    d.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"사진 {d[d.kind == 'none'].shape[0]}장 × 필터 {len(cr.FILTERS)}개 → {out}")
    return d


def mdc(orig: pd.DataFrame, col: str) -> float:
    """color_robustness_summary.mdc와 같은 식: MDC95 = 1.96·√2·SEM (같은 날 표준편차의 제곱평균근)."""
    g = orig.groupby(["member", "date"])[col]
    var, n = g.var(ddof=1), g.count()
    ok = (n >= 2) & var.notna()
    if not ok.any():
        return float("nan")
    return float(1.96 * np.sqrt(2) * np.sqrt(np.average(var[ok], weights=(n[ok] - 1))))


def summary():
    d = pd.read_csv(ROOT / "private" / "fullface_redness.csv")
    d["key"] = d["member"].astype(str) + d["date"].astype(str) + "_" + d["photo"].astype(str)
    orig = d[d.kind == "none"].set_index("key")
    use = orig[orig.quality_ok & orig.ff_ok].index
    o = orig.loc[use]
    measures = {"a_star": "볼 (지금 앱)", "a_whole": "얼굴 전체"} | {f"a_{c}": r for r, c in COLS.items()} | \
               {"a_rel_whole_nose": "얼굴 전체 − 코", "spots": "붉은 점 개수"}
    lines = ["# 얼굴 전체 붉은기 (시험)", "",
             f"사진: 셀카 {len(orig)}장 중 품질 통과하고 얼굴 전체를 잴 수 있었던 {len(use)}장, "
             f"{o['member'].nunique()}명. 측정은 analysis/fullface_redness.py.", ""]
    rows = []
    for col, label in measures.items():
        if col not in o:
            continue
        m = mdc(o, col)
        rows.append({"측정값": label, "MDC95 (같은 날 반복)": f"{m:.2f}",
                     "사람 안 흔들림 (중앙 절대편차)": f"{o.groupby('member')[col].apply(lambda s: (s - s.median()).abs().median()).median():.2f}",
                     "잴 수 있었던 사진": f"{o[col].notna().mean():.0%}"})
    lines += ["## 1. 부위별 측정 오차", "",
              "MDC95: 같은 날 여러 장의 흔들림으로 낸 '이보다 작은 변화는 측정 오차'인 크기. 볼(지금 앱)과 같은 식.", "",
              pd.DataFrame(rows).to_markdown(index=False), ""]
    rows = []
    for (name, kind, level), g in d[d.kind != "none"].groupby(["filter", "kind", "level"], sort=False):
        g = g.set_index("key").loc[lambda x: x.index.isin(use)]
        row = {"필터": name}
        for col, label in measures.items():
            if col in ("a_star", "spots") or col not in g:
                continue
            row[label] = f"{(g[col] - o.loc[g.index, col]).mean():+.2f}"
        rows.append(row)
    lines += ["## 2. 조명 색 필터를 씌웠을 때 평균 변화", "",
              "같은 사진에 필터만 씌움(얼굴 점은 원본 그대로). 0에 가까울수록 조명 색에 덜 흔들린다.", "",
              pd.DataFrame(rows).to_markdown(index=False), ""]
    sp = o.groupby(["member", "date"])["spots"].agg(["min", "max"])
    lines += ["## 3. 붉은 점 개수의 안정성", "",
              f"같은 날 여러 장에서 개수가 같았던 날 {int((sp['min'] == sp['max']).sum())}/{len(sp)}일, "
              f"차이 중앙값 {float((sp['max'] - sp['min']).median()):.1f}개.", ""]
    out = ROOT / "data" / "fullface_redness_summary.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "pair":
        pair(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "run":
        run(sys.argv[2])
    elif cmd == "summary":
        summary()
