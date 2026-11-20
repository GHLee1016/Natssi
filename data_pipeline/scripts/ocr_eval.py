"""전성분 OCR 일치율 측정 (기획서의 'OCR 전성분 일치율').

폴더 구성 (photos/ 는 깃허브에 안 올라감):
    photos/ocr/라운드랩토너_1.jpg     ← 같은 제품 여러 장은 _1, _2 …
    photos/ocr/라운드랩토너_2.jpg
    photos/ocr/라운드랩토너.txt       ← 정답: 공식몰·화해에서 복사한 전성분 (쉼표로 구분)

    python scripts/ocr_eval.py photos/ocr

결과: data/ocr_eval.csv, data/ocr_eval_detail.json
- 일치율(재현율) = 정답 성분 중 OCR이 맞게 찾은 비율
- 정밀도        = OCR이 내놓은 성분 중 정답에 있는 비율
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ingredients.match import norm  # noqa: E402
from ingredients.pipeline import from_text, register  # noqa: E402

IMG = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("folder")
    args = p.parse_args()
    folder = Path(args.folder)

    groups = defaultdict(list)
    for f in sorted(folder.iterdir()):
        if f.suffix.lower() in IMG:
            # '제품_1', '제품_2'는 한 제품으로 묶는다. 폰 기본 이름(20261118_190053)은 사진마다 따로.
            groups[re.sub(r"_\d{1,2}$", "", f.stem)].append(f)
    if not groups:
        print(f"{folder}에 사진이 없어요.")
        return

    rows, detail = [], {}
    for product, files in groups.items():
        res = register(files)
        pred = {norm(i["kor"]) for i in res["ingredients"]}
        n = len(res["ingredients"])
        exact = sum(i["status"] == "일치" for i in res["ingredients"])
        fixed = sum(i["status"] == "보정" for i in res["ingredients"])
        # 정답 없이도 볼 수 있는 지표: 읽은 성분 중 식약처 사전과 그대로/보정 후 맞은 비율
        row = {"product": product, "photos": len(files), "seconds": res["seconds"],
               "ocr_count": n, "dict_exact": round(exact / n, 3) if n else None,
               "dict_fixed": round(fixed / n, 3) if n else None,
               "needs_review": len(res["needs_review"])}
        ans = folder / f"{product}.txt"
        if ans.exists():
            gt_items = from_text("전성분: " + ans.read_text(encoding="utf-8"))["ingredients"]
            gt = {norm(i["kor"]) for i in gt_items}
            hit = pred & gt
            row |= {"answer_count": len(gt),
                    "recall": round(len(hit) / len(gt), 3) if gt else None,
                    "precision": round(len(hit) / len(pred), 3) if pred else None}
            res["missed"] = sorted(gt - pred)
            res["extra"] = sorted(pred - gt)
        rows.append(row)
        detail[product] = res
        print(row)

    df = pd.DataFrame(rows)
    Path("data").mkdir(exist_ok=True)
    df.to_csv("data/ocr_eval.csv", index=False, encoding="utf-8-sig")
    Path("data/ocr_eval_detail.json").write_text(json.dumps(detail, ensure_ascii=False, indent=1), encoding="utf-8")
    if "recall" in df:
        print(f"\n제품 {df['recall'].notna().sum()}개 평균 일치율 {df['recall'].mean():.1%}, "
              f"정밀도 {df['precision'].mean():.1%}, 제품당 {df['seconds'].mean():.1f}초")


if __name__ == "__main__":
    main()
