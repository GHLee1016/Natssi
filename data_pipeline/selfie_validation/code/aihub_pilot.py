"""라벨의 볼 bbox(가운데 60%)에서 a* 중앙값을 재서 CSV에 덧붙임. 사용: python3 pilot.py 시작 끝"""
import sys, os, io, json, glob, csv, zipfile
import numpy as np
from PIL import Image, ImageOps
from color import srgb_to_lab
D = os.path.expanduser("~/mnt/028.한국인 피부상태 측정 데이터/3.개방데이터/1.데이터")
z = zipfile.ZipFile(D + "/Validation/01.원천데이터/VS.zip")
names = set(z.namelist())
subs = sorted(os.listdir("vl/1. 디지털카메라"))[int(sys.argv[1]):int(sys.argv[2])]
out = open("pilot.csv", "a", newline=""); w = csv.writer(out)
if out.tell() == 0:
    w.writerow(["subject", "device", "kind", "angle", "side", "a_star", "L_star", "b_star", "clip", "n", "img_brightness"])
for s in subs:
    for dev_dir in ("1. 디지털카메라", "2. 스마트패드", "3. 스마트폰"):
        for jf in sorted(glob.glob(f"vl/{dev_dir}/{s}/*_0[56].json")):
            j = json.load(open(jf)); fn = j["info"]["filename"]
            zn = f"{dev_dir}/{s}/{fn}"
            if zn not in names: continue
            im = np.asarray(ImageOps.exif_transpose(Image.open(io.BytesIO(z.read(zn)))).convert("RGB"))
            if not j["images"].get("bbox"): continue
            x0, y0, x1, y1 = j["images"]["bbox"]; dx, dy = (x1 - x0) * 0.2, (y1 - y0) * 0.2
            px = im[int(y0 + dy):int(y1 - dy), int(x0 + dx):int(x1 - dx)].reshape(-1, 3)
            clip = (px >= 250).any(1); good = px[~clip & (px.max(1) >= 20)]
            lab = srgb_to_lab(good)
            side = "l" if j["images"]["facepart"] == 5 else "r"
            kind = fn.rsplit(".", 1)[0].split("_", 2)[2]
            w.writerow([s, j["images"]["device"], kind, j["images"]["angle"], side, round(float(np.median(lab[:, 1])), 3),
                        round(float(np.median(lab[:, 0])), 2), round(float(np.median(lab[:, 2])), 3), round(float(clip.mean()), 4), len(good),
                        round(float(im.mean()), 1)])
    out.flush(); print(s, flush=True)
