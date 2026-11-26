"""셀카 폴더를 시연 계정의 지난 기록으로 넣는다. 사진은 이 컴퓨터에서만 재고, 볼 색 숫자만 올린다(앱과 같은 원칙).

앱은 '오늘' 찍은 사진만 기록하므로, 팀원이 그동안 찍어 둔 사진을 날짜별로 한꺼번에 넣을 때 쓴다.
  1. 날짜: 사진의 촬영 시각(EXIF), 없으면 파일 이름의 날짜(20261103_081522.jpg, 2026-11-03_1.jpg 등). 둘 다 없으면 건너뜀.
  2. 측정: analysis/color_robustness.py의 measure, quality_ok(앱의 core.js, quality.py와 같은 식. measurements.csv 대비 a* 최대 0.009 차이)
     + 앱에만 있는 색 진하기 기준(min_chroma 5). 조명 색은 넣은 뒤 판정(judge.py)이 b*로 가려낸다.
  3. 하루에 하나: 그날 품질을 통과한 사진 중 가장 먼저 찍은 것(앱의 '하루에 처음 통과한 사진'과 같음).
  4. 올리기: checkins 표의 그날 행에 redness(a*), b, L만 더한다. 증상은 건드리지 않는다. 이미 볼 붉은기가 있는 날은 건너뜀(--overwrite면 덮어씀).

    pip install mediapipe opencv-python-headless pandas pillow requests
    # 1) 먼저 확인만(아무것도 올리지 않음)
    python scripts/import_photos.py "C:/사진폴더"
    # 2) 올리기: Supabase 주소와 service 키, 시연 계정 id(SQL: select id from auth.users where email='...')
    set SUPABASE_URL=...  &  set SUPABASE_SERVICE_KEY=...
    python scripts/import_photos.py "C:/사진폴더" --user-id <uuid> --apply
    # 볼 반사 허용치만 올려 보기(앱 기준은 1%. 시연용으로 지난 사진을 넣을 때만)
    python scripts/import_photos.py "C:/사진폴더" --max-clip 0.05

주의
  - 사진 주인(팀원)의 동의를 받은 사진만 쓴다. 사진 파일은 어디에도 올리지 않는다.
  - --apply 전에 그 계정의 지금 기록을 backup_checkins_<시각>.json으로 저장한다.
  - --max-clip은 '볼이 하얗게 날아간 비율' 기준만 바꾼다. 날아간 픽셀은 원래도 계산에서 빼므로 값은 그대로 재지만,
    앱이라면 다시 찍으라고 했을 사진이다. 이렇게 넣은 날은 표 끝에 '반사 허용'으로 표시하니 발표 때 밝힌다.
  - 계정의 처리방침 동의 버전이 2026-11-22(볼 붉은기 저장) 이상이어야 판정에 쓰인다.
"""
import argparse
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "analysis"))

import color_robustness as cr  # noqa: E402
from photo_dates import exif_datetime, name_datetime  # noqa: E402

APP_MAX_CLIP = cr.Q["clip"]            # 앱 기준(backend/app/quality.py max_clip_ratio 0.01)
MIN_CHROMA = 5.0                       # backend/app/quality.py DEFAULT_THRESHOLDS["min_chroma"]와 같게
IMG = {".jpg", ".jpeg", ".png"}
APP_MODEL = ROOT.parent / "frontend" / "public" / "mediapipe" / "face_landmarker.task"
if not cr.MODEL.exists() and APP_MODEL.exists():   # 앱에 들어 있는 얼굴 모델을 같이 쓴다
    cr.MODEL = APP_MODEL


def when(p: Path):
    """(날짜, 시각) 또는 None. EXIF 먼저, 없으면 파일 이름."""
    return exif_datetime(p) or name_datetime(p.name)


def measure_file(p: Path) -> dict:
    f = cr.measure(cr.load_rgb(p))
    ok = cr.quality_ok(f)
    out = {"ok": ok}
    if f.get("face_found") and "clip_L" in f:
        out["clip"] = max(f["clip_L"], f["clip_R"])
    if f.get("face_found") and "a_L" in f:
        a, b = f["a_star"], f["b_cheek"]
        chroma = math.hypot(a, b)
        out.update(redness=round(float(a), 2), b=round(float(b), 2),
                   L=round(float((f["L_L"] + f["L_R"]) / 2), 2), chroma=round(chroma, 1))
        if ok and chroma < MIN_CHROMA:
            out.update(ok=False, why="색이 너무 옅음(흑백이나 색 빠진 사진)")
    if not ok and "why" not in out:
        out["why"] = ("얼굴을 찾지 못함" if not f.get("face_found") else
                      f"볼이 하얗게 날아감 {out['clip']:.1%}" if out.get("clip", 0) > cr.Q["clip"] and cr.quality_ok({**f, "clip_L": 0, "clip_R": 0}) else
                      "품질 기준 미달(밝기, 각도, 표정, 선명도, 볼 노출 중)")
    return out


def plan(folder: Path):
    """날짜별로 넣을 값 하나씩. 반환: {date: {...}}, 건너뛴 목록"""
    by_day, skipped = defaultdict(list), []
    files = sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMG)
    for p in files:
        dt = when(p)
        if not dt:
            skipped.append((p.name, "날짜를 알 수 없음"))
            continue
        by_day[dt[0]].append((dt[1] or "99:99:99", p))
    chosen = {}
    for day in sorted(by_day):
        for t, p in sorted(by_day[day]):
            m = measure_file(p)
            if m["ok"]:
                chosen[day] = {**m, "file": p.name, "time": t, "photos": len(by_day[day])}
                break
            skipped.append((p.name, m["why"]))
        else:
            chosen.setdefault(day, None)
    return chosen, skipped


def supa():
    import requests
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL, SUPABASE_SERVICE_KEY 환경변수가 필요해요.")
    s = requests.Session()
    s.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    return url.rstrip("/"), s


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("folder")
    ap.add_argument("--user-id", help="시연 계정의 user id(uuid). --apply 할 때 필요")
    ap.add_argument("--apply", action="store_true", help="실제로 올린다(없으면 확인만)")
    ap.add_argument("--max-clip", type=float, default=APP_MAX_CLIP,
                    help=f"볼이 하얗게 날아간 비율 허용치(앱 기준 {APP_MAX_CLIP}). 다른 품질 기준은 그대로")
    ap.add_argument("--overwrite", action="store_true", help="이미 볼 붉은기가 있는 날도 덮어쓴다")
    args = ap.parse_args()
    folder = Path(args.folder)
    if not folder.is_dir():
        sys.exit(f"폴더가 없어요: {folder}")
    cr.Q["clip"] = args.max_clip

    try:
        chosen, skipped = plan(folder)
    finally:
        if getattr(cr, "_LMK", None) is not None:      # 끝날 때 얼굴 모델을 닫아 종료 경고를 막는다
            cr._LMK.close()
            cr._LMK = None
    print(f"\n{'날짜':<11} {'사진':>4}  {'a*(붉은기)':>10} {'b*':>6} {'L*':>6}  고른 사진")
    for day, c in chosen.items():
        if c:
            t = '' if c['time'].startswith('99') else c['time']
            relaxed = "  반사 허용 " + f"{c['clip']:.1%}" if c.get("clip", 0) > APP_MAX_CLIP else ""
            print(f"{day:<11} {c['photos']:>4}  {c['redness']:>10.2f} {c['b']:>6.2f} {c['L']:>6.2f}  {c['file']} {t}{relaxed}")
        else:
            print(f"{day:<11}    -  {'통과한 사진 없음':>10}")
    good = {d: c for d, c in chosen.items() if c}
    print(f"\n넣을 날 {len(good)}일 / 사진이 있는 날 {len(chosen)}일. 건너뛴 사진 {len(skipped)}장")
    for name, why in skipped[:30]:
        print(f"  - {name}: {why}")
    if not args.apply:
        print("\n확인만 했어요. 올리려면 --user-id 와 --apply 를 붙여 다시 실행하세요.")
        return
    if not args.user_id:
        sys.exit("--user-id 가 필요해요.")

    url, s = supa()
    r = s.get(f"{url}/rest/v1/checkins", params={"select": "day,symptoms", "user_id": f"eq.{args.user_id}"})
    r.raise_for_status()
    existing = {row["day"]: row["symptoms"] for row in r.json()}
    backup = ROOT / f"backup_checkins_{datetime.now():%Y%m%d-%H%M%S}.json"
    backup.write_text(json.dumps(existing, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n지금 기록 {len(existing)}일을 {backup.name}에 저장했어요.")
    done = kept = 0
    for day, c in good.items():
        old = existing.get(day) or {}
        if old.get("redness") is not None and not args.overwrite:
            kept += 1
            continue
        row = {"user_id": args.user_id, "day": day, "symptoms": {**old, "redness": c["redness"], "b": c["b"], "L": c["L"]}}
        w = s.post(f"{url}/rest/v1/checkins", params={"on_conflict": "user_id,day"},
                   headers={"Prefer": "resolution=merge-duplicates,return=minimal"}, data=json.dumps(row, ensure_ascii=False))
        w.raise_for_status()
        done += 1
    print(f"올렸어요: {done}일. 이미 볼 붉은기가 있어 둔 날: {kept}일.")


if __name__ == "__main__":
    main()
