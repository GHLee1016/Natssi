"""로컬 PaddleOCR 학습 폴더 → Colab에 올릴 zip 하나.

설정 파일(yml)이 가리키는 데이터·라벨·사전학습 가중치·문자 사전만 골라 담는다(.venv, PaddleOCR 코드, output은 뺀다).
Colab은 PaddleOCR을 같은 커밋으로 새로 받고, 이 zip을 같은 폴더 구조로 풀어서 yml의 경로를 그대로 쓴다.

    cd ~/natssi_work/ocr-train/PaddleOCR
    ../.venv/bin/python /경로/pack_for_colab.py ../natssi_det.yml
    → ~/natssi_work/ocr-train.colab.zip  (이걸 구글 드라이브 MyDrive/natssi/ 에 올린다)

실행 위치(PaddleOCR 폴더) 기준 상대 경로 그대로 담는다. 학습 폴더 밖이나 절대 경로는 _ext/ 로 옮기고 yml을 고쳐 담는다.
"""
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import yaml

SKIP_KEYS = {"save_model_dir", "save_res_path", "save_inference_dir", "checkpoints", "infer_img"}
WEIGHT_EXT = (".pdparams", ".pdopt", ".states")


def main():
    yml = Path(sys.argv[1]).resolve()
    cwd = Path.cwd().resolve()                      # PaddleOCR 폴더
    root = cwd.parent                               # ocr-train
    if not (cwd / "tools" / "train.py").exists():
        sys.exit("PaddleOCR 폴더 안에서 실행해 주세요 (tools/train.py가 보이는 곳).")
    cfg = yaml.safe_load(open(yml, encoding="utf-8"))
    files: dict[tuple[Path, str], None] = {}        # (실제 파일, zip 안 이름) — 순서 유지·중복 제거
    missing = []

    def arc(f: Path) -> str:
        """zip 안 이름. 학습 폴더 밖이면 _ext/<맨 끝 폴더나 파일 이름>/… (yml도 같은 규칙으로 고친다)"""
        try:
            return f.relative_to(root).as_posix()
        except ValueError:
            return None

    def add(p: Path):
        p = p.resolve()
        targets = [p] if p.is_file() else [x for x in p.rglob("*") if x.is_file()]
        for f in targets:
            # 같은 파일이 두 이름으로 들어가도 된다(데이터 폴더 안의 라벨 파일 = 폴더 통째 + 라벨 경로)
            files[(f, arc(f) or "_ext/" + f.relative_to(p.parent).as_posix())] = None

    def fix(v: str) -> str:
        p = Path(v).expanduser()
        p = p if p.is_absolute() else cwd / p
        cands = [p] if p.exists() else [Path(str(p) + e) for e in WEIGHT_EXT if Path(str(p) + e).exists()]
        if not cands:
            if "/" in v and not v.startswith(("ppocr/", "configs/")):
                missing.append(v)
            return v
        try:                                        # PaddleOCR 저장소 안의 코드 파일(문자 사전 등)은 Colab 클론에 있다
            rel = cands[0].resolve().relative_to(cwd)
            if rel.parts[0] in ("ppocr", "configs", "tools"):
                return v
        except ValueError:
            pass
        for c in cands:
            add(c)
        inside = cands[0].resolve().is_relative_to(root)
        if inside and not Path(v).expanduser().is_absolute():
            return v
        # 밖이거나 절대 경로: _ext/ 로 옮기고 PaddleOCR 기준 상대 경로로
        base = p.resolve()
        new = "../" + (base.relative_to(root).as_posix() if inside else "_ext/" + base.name)
        return new

    def walk(x, key=""):
        if isinstance(x, dict):
            return {k: (v if k in SKIP_KEYS else walk(v, k)) for k, v in x.items()}
        if isinstance(x, list):
            return [walk(v, key) for v in x]
        if isinstance(x, str) and ("/" in x or x.endswith((".txt", ".pdparams"))):
            return fix(x)
        return x

    cfg = walk(cfg)
    try:
        import paddle
        paddle_ver = paddle.__version__
    except Exception:
        paddle_ver = ""
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=cwd, capture_output=True, text=True).stdout.strip()
    meta = {"yml": yml.name, "paddle": paddle_ver, "paddleocr_commit": commit, "images": len(files)}

    out = root.parent / f"{root.name}.colab.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f, name in sorted(files, key=lambda t: t[1]):
            z.write(f, name)
        z.writestr(yml.name, yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False))
        z.writestr("colab_meta.json", json.dumps(meta, ensure_ascii=False, indent=1))
    mb = out.stat().st_size / 1e6
    print(f"{out}  ({len(files)}개 파일, {mb:.0f}MB)")
    print("meta:", meta)
    if missing:
        print("경고: 설정에 있지만 찾지 못한 경로 →", missing)


if __name__ == "__main__":
    main()
