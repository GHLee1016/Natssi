"""Hugging Face Space(Gradio SDK, 무료)에 올릴 폴더를 만든다 → build/hf_space/

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
sdk: gradio
sdk_version: 6.32.0
python_version: "3.12"
app_file: app.py
pinned: false
---

낯씨 전성분 OCR 서버. 화장품 전성분표 사진 → 성분 목록(식약처 화장품 원료성분 사전으로 표준명·오타 보정) → 성분 계열.
사진은 메모리에서만 처리하고 저장하지 않습니다. API 문서: `/docs`
"""


# gradio·fastapi·uvicorn은 Space가 sdk_version에 맞춰 설치하므로 여기서 고정하지 않는다 (충돌 방지)
SPACE_REQUIREMENTS = """rapidocr==3.10.0
onnxruntime==1.32.0
opencv-python-headless==5.1.0.95
rapidfuzz==3.14.6
numpy==2.5.2
python-multipart
spaces
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
    # 휜 사진 펴기 모델(선택). 없으면 Space는 펴기 없이 지금처럼 돈다.
    uv = ROOT / "models" / "uvdoc.onnx"
    if uv.exists():
        (OUT / "models").mkdir()
        shutil.copy(uv, OUT / "models" / "uvdoc.onnx")
    else:
        print("주의: models/uvdoc.onnx 가 없어 휜 사진 펴기 없이 묶어요 (README '휜 사진 펴기')")
    # Gradio Space 규칙: 맨 위 app.py 실행, requirements.txt 설치.
    # packages.txt(apt)는 쓰지 않는다: 기본 이미지에 libgl1·ffmpeg가 이미 있고,
    # 윈도우에서 만든 파일은 줄 끝(CRLF) 때문에 apt가 패키지 이름을 못 읽었다(첫 빌드 실패 원인).
    shutil.copy(ROOT / "ocr_server" / "space_app.py", OUT / "app.py")
    (OUT / "requirements.txt").write_text(SPACE_REQUIREMENTS, encoding="utf-8", newline="\n")
    (OUT / "README.md").write_text(SPACE_README, encoding="utf-8", newline="\n")
    files = sorted(p.relative_to(OUT).as_posix() for p in OUT.rglob("*") if p.is_file())
    print(f"{OUT} ({len(files)}개 파일)")
    for f in files:
        print("  ", f)


if __name__ == "__main__":
    main()
