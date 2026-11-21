"""정답 있는 전성분 OCR 평가: 사진(또는 같은 제품 사진 묶음)을 앱과 같은 경로(pipeline.register)로 읽고 정답과 비교한다.

정답: data/ocr_truth.csv  (사진은 저장소에 올리지 않고 정답 글자만 올린다)
    photos       사진 파일 이름. 같은 제품을 여러 장 함께 보내는 경우 공백으로 나눈다('a.jpg b.jpg')
    product      제품 이름
    shape        상자 / 둥근 통 …  (결과를 모양별로도 묶어 본다)
    scope        정답 범위: 사진에 '보이는' 성분만 적는다(가려진 부분은 빼고, 왜 뺐는지 적기)
    checked      사람이 사진과 대조해 확인했으면 '예'
    note         흐림 같은 사진 상태
    ingredients  라벨에 적힌 그대로, 쉼표로 (한글·영문 다 됨. 사전으로 표준 이름에 맞춰 비교)

    cd data_pipeline
    python scripts/ocr_truth_eval.py photos/truth                    # 정답이 있는 사진 전부
    python scripts/ocr_truth_eval.py photos/truth --compare-unwarp   # 휜 사진 펴기 끈 것 vs 켠 것
    python scripts/ocr_truth_eval.py photos/truth --cached           # OCR 다시 안 돌림(후처리만 바꿨을 때, 몇 초)

점수(사전과 맞은 성분만 '찾음'으로 센다. '확인 필요'는 사용자가 고치는 칸이라 따로 센다)
    재현율 = 정답 중 찾은 비율     정밀도 = 찾은 것 중 정답인 비율     F1 = 둘의 조화평균
    합계는 성분 단위로 모두 더해서 낸다(마이크로 평균).
결과: build/ocr_truth/report.md (표 + 놓친 성분·틀린 성분), build/ocr_truth/cache.json (OCR 원문)
"""
import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)
from ingredients import pipeline  # noqa: E402
from ingredients.match import norm  # noqa: E402

OUT = ROOT / "build" / "ocr_truth"


def truth_rows(path: Path) -> list[dict]:
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    for r in rows:
        r["files"] = r["photos"].split()
        std = pipeline.from_text("전성분: " + r["ingredients"], select_lines=False)["ingredients"]
        r["truth"] = {norm(i["kor"]) for i in std}
        r["names"] = {norm(i["kor"]): i["kor"] for i in std}
        r["not_in_dict"] = [i["ocr"] for i in std if i["status"] == "확인 필요"]
    return rows


def unwarp_supported() -> bool:
    try:
        from ingredients import unwarp  # noqa: F401
        return True
    except ImportError:
        return False


def read(files: list[Path], unwarp_on: bool | None) -> dict:
    """register 한 번. unwarp_on=None이면 지금 설정 그대로."""
    old = os.environ.get("NATSSI_UNWARP")
    if unwarp_on is not None:
        os.environ["NATSSI_UNWARP"] = "1" if unwarp_on else "0"
    try:
        t = time.perf_counter()
        r = pipeline.register([f.read_bytes() for f in files])
        return {"raw_text": r["raw_text"], "variants": r.get("variants"), "seconds": round(time.perf_counter() - t, 1)}
    finally:
        if old is None:
            os.environ.pop("NATSSI_UNWARP", None)
        else:
            os.environ["NATSSI_UNWARP"] = old


def score(raw_text: str, row: dict) -> dict:
    items = pipeline.from_text(raw_text)["ingredients"]
    found = {norm(i["kor"]): i["kor"] for i in items if i["status"] != "확인 필요"}
    hit = row["truth"] & set(found)
    n_t, n_f = len(row["truth"]), len(found)
    return {"truth": n_t, "found": n_f, "hit": len(hit), "review": sum(i["status"] == "확인 필요" for i in items),
            "recall": len(hit) / n_t if n_t else 0.0, "precision": len(hit) / n_f if n_f else 0.0,
            "missed": sorted(row["names"][k] for k in row["truth"] - hit),
            "wrong": sorted(found[k] for k in set(found) - row["truth"])}


def f1(p, r):
    return 2 * p * r / (p + r) if p + r else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", help="정답 사진이 있는 폴더")
    ap.add_argument("--truth", default=str(ROOT / "data" / "ocr_truth.csv"))
    ap.add_argument("--cached", action="store_true", help="지난번 OCR 원문으로 다시 채점(OCR 안 돌림)")
    ap.add_argument("--compare-unwarp", action="store_true", help="휜 사진 펴기 끈 것과 켠 것을 나란히")
    args = ap.parse_args()
    folder = Path(args.folder)

    configs = [("지금 설정", None)]
    if args.compare_unwarp:
        if not unwarp_supported():
            sys.exit("이 코드에는 휜 사진 펴기(ingredients/unwarp.py)가 없어요.")
        configs = [("펴기 끔", False), ("펴기 켬", True)]

    OUT.mkdir(parents=True, exist_ok=True)
    cache_path = OUT / "cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    rows = truth_rows(Path(args.truth))
    pipeline.from_text("전성분: 정제수")

    results = {name: [] for name, _ in configs}
    for r in rows:
        files = [folder / f for f in r["files"]]
        if not all(f.exists() for f in files):
            print(f"건너뜀(사진 없음): {r['photos']}")
            continue
        for name, flag in configs:
            key = f"{r['photos']}|{name}"
            if args.cached and key in cache:
                ocr = cache[key]
            else:
                ocr = cache[key] = read(files, flag)
            s = score(ocr["raw_text"], r)
            results[name].append({**s, "row": r, "seconds": ocr["seconds"], "variants": ocr.get("variants")})
            print(f"{r['photos'][:34]:<34} {name:<6} 재현율 {s['recall']:.2f} 정밀도 {s['precision']:.2f} "
                  f"({s['hit']}/{s['truth']}, 찾음 {s['found']}, 확인 필요 {s['review']}) {ocr['seconds']}초", flush=True)
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    lines = ["# 전성분 OCR 정답 평가", "",
             "숫자: 재현율 / 정밀도 (맞은 수 / 정답 수). 합계는 성분 단위로 모두 더한 값.", ""]
    head = "| 사진 | 모양 | " + " | ".join(n for n, _ in configs) + " |"
    lines += [head, "|" + "---|" * (2 + len(configs))]
    rows_seen = [x["row"] for x in results[configs[0][0]]]
    for i, r in enumerate(rows_seen):
        cells = []
        for name, _ in configs:
            s = results[name][i]
            cells.append(f"{s['recall']:.2f} / {s['precision']:.2f} ({s['hit']}/{s['truth']})")
        lines.append(f"| {r['photos']} | {r['shape']} | " + " | ".join(cells) + " |")
    summary = []
    # 합계: 한 장짜리와 여러 장 묶음을 따로(같은 사진이 묶음에 다시 들어가 두 번 세지 않게)
    for label, pick in (("사진 한 장씩", lambda x: len(x["row"]["files"]) == 1), ("여러 장 묶음", lambda x: len(x["row"]["files"]) > 1)):
        for name, _ in configs:
            rs = [x for x in results[name] if pick(x)]
            if not rs:
                continue
            hit, tru, fnd = (sum(x[k] for x in rs) for k in ("hit", "truth", "found"))
            rec, pre = (hit / tru if tru else 0), (hit / fnd if fnd else 0)
            sec = sum(x["seconds"] for x in rs)
            summary.append(f"[{label} {len(rs)}개] {name}: 재현율 {rec:.3f} · 정밀도 {pre:.3f} · F1 {f1(pre, rec):.3f} "
                           f"(맞음 {hit}/{tru}, 찾음 {fnd}, 확인 필요 {sum(x['review'] for x in rs)}) · {sec:.0f}초")
    lines += ["", "## 합계", ""] + [f"- {s}" for s in summary]
    lines += ["", "## 사진별 놓친 성분 · 틀린 성분", ""]
    for i, r in enumerate(rows_seen):
        lines.append(f"### {r['photos']} — {r['product']} ({r['scope']}{', ' + r['note'] if r['note'] else ''})")
        if r["not_in_dict"]:
            lines.append(f"- 정답 중 사전에 없는 이름(맞힐 수 없음): {', '.join(r['not_in_dict'])}")
        for name, _ in configs:
            s = results[name][i]
            lines.append(f"- **{name}** 놓침 {len(s['missed'])}: {', '.join(s['missed']) or '없음'}")
            lines.append(f"  - 틀림 {len(s['wrong'])}: {', '.join(s['wrong']) or '없음'}")
        lines.append("")
    unchecked = [r["photos"] for r in rows_seen if r["checked"] != "예"]
    if unchecked:
        lines += ["", f"주의: 사람이 아직 확인하지 않은 정답 {len(unchecked)}개(checked가 '예'가 아님): {', '.join(unchecked)}"]
    (OUT / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n" + "\n".join(summary))
    print(f"자세한 결과: {OUT / 'report.md'}")


if __name__ == "__main__":
    main()
