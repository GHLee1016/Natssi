"""셀카 폴더에서 '파일 이름 → 찍은 날짜·시각'만 뽑는다. 사진 내용(픽셀)은 읽지 않는다.

    python analysis/photo_dates.py "C:/Users/.../Downloads/셀카폴더"
    → data/photo_dates.csv  (subfolder, file, date, time, source)

날짜 출처 우선순위
1. EXIF 촬영 시각(DateTimeOriginal) — 폰 원본이면 있음
2. 파일 이름의 날짜 (20261103_081522.jpg, IMG_20261103_..., 2026-11-03 ...)
3. 둘 다 없으면 빈칸 (파일 수정 시각은 내려받은 시각이라 쓰지 않음)

결과에는 사진이 아니라 날짜만 들어가므로 깃허브에 올려도 된다(이름은 S01처럼 바꾸는 걸 추천).
"""
import csv
import re
import sys
from pathlib import Path

from PIL import Image

IMG = {".jpg", ".jpeg", ".png", ".heic", ".webp"}
NAME_DATE = re.compile(r"(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?:[-_ ]?(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2}))?")


def exif_datetime(p: Path):
    try:
        with Image.open(p) as im:            # 헤더만 읽는다 (픽셀 디코딩 안 함)
            ex = im.getexif()
            v = ex.get_ifd(0x8769).get(36867) or ex.get(306)   # DateTimeOriginal, 없으면 DateTime
    except Exception:
        return None
    if v and re.match(r"\d{4}:\d{2}:\d{2} \d{2}:\d{2}", str(v)):
        d, t = str(v).split(" ")[:2]
        return d.replace(":", "-"), t[:8]
    return None


def name_datetime(name: str):
    m = NAME_DATE.search(name)
    if not m:
        return None
    y, mo, d, hh, mm, ss = m.groups()
    if not (1 <= int(mo) <= 12 and 1 <= int(d) <= 31):
        return None
    return f"{y}-{mo}-{d}", (f"{hh}:{mm}:{ss}" if hh else "")


def main(folder: str, out: str = "data/photo_dates.csv"):
    root = Path(folder)
    rows = []
    for p in sorted(root.rglob("*")):
        if p.suffix.lower() not in IMG:
            continue
        got, src = exif_datetime(p), "exif"
        if not got:
            got, src = name_datetime(p.name), "filename"
        rows.append({"subfolder": str(p.parent.relative_to(root)), "file": p.name,
                     "date": got[0] if got else "", "time": got[1] if got else "", "source": src if got else "none"})
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["subfolder", "file", "date", "time", "source"])
        w.writeheader()
        w.writerows(rows)
    by = {}
    for r in rows:
        by.setdefault(r["subfolder"], []).append(r)
    print(f"사진 {len(rows)}장 → {out}")
    for k, rs in by.items():
        days = sorted({r['date'] for r in rs if r['date']})
        print(f"  {k}: {len(rs)}장, 촬영일 {len(days)}일 ({days[0] if days else '-'} ~ {days[-1] if days else '-'}), "
              f"날짜 없음 {sum(not r['date'] for r in rs)}장")


if __name__ == "__main__":
    main(*sys.argv[1:])
