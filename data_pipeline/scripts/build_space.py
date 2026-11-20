"""Hugging Face Space에 올릴 폴더를 만든다 → build/hf_space/

    python scripts/build_space.py
    # 그다음: build/hf_space 안의 파일을 Space 저장소에 올린다 (README의 '배포' 참고)
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "hf_space"

SPACE_README = """---
title: Natssi OCR
emoji: 🧴
colorFrom: pink
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

낯씨 전성분 OCR 서버. 화장품 전성분표 사진 → 성분 목록(식약처 화장품 원료성분 사전으로 표준명·오타 보정) → 성분 계열.
사진은 메모리에서만 처리하고 저장하지 않습니다. API 문서: `/docs`
"""


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc")
    shutil.copytree(ROOT / "ingredients", OUT / "ingredients", ignore=ignore)
    shutil.copytree(ROOT / "ocr_server", OUT / "ocr_server", ignore=ignore)
    (OUT / "data").mkdir()
    shutil.copy(ROOT / "data" / "ingredient_dict.csv", OUT / "data" / "ingredient_dict.csv")
    shutil.copy(ROOT / "ocr_server" / "Dockerfile", OUT / "Dockerfile")   # Space는 맨 위의 Dockerfile을 쓴다
    (OUT / "README.md").write_text(SPACE_README, encoding="utf-8")
    files = sorted(p.relative_to(OUT).as_posix() for p in OUT.rglob("*") if p.is_file())
    print(f"{OUT} ({len(files)}개 파일)")
    for f in files:
        print("  ", f)


if __name__ == "__main__":
    main()
