# Hugging Face Space (Docker) 또는 아무 Docker 서버용.
# 빌드 위치: data_pipeline/ 폴더 (scripts/build_space.py가 이 구조로 복사해 줌)
#   docker build -f ocr_server/Dockerfile -t natssi-ocr .  &&  docker run -p 7860:7860 natssi-ocr
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ocr_server/requirements.txt ocr_server/requirements.txt
RUN pip install --no-cache-dir -r ocr_server/requirements.txt

COPY ingredients/ ingredients/
COPY ocr_server/ ocr_server/
COPY data/ingredient_dict.csv data/ingredient_dict.csv

# OCR 모델(약 20MB)을 빌드할 때 미리 받아 둔다 → 첫 요청이 느리지 않고, 실행 사용자에게 쓰기 권한이 없어도 됨
RUN python -c "from ingredients import ocr; ocr._engine(1.6); ocr._engine(1.3)"

# Hugging Face Space는 uid 1000으로 실행한다
RUN useradd -m -u 1000 user && chown -R user /app
USER user

ENV OMP_NUM_THREADS=2
EXPOSE 7860
CMD ["uvicorn", "ocr_server.app:app", "--host", "0.0.0.0", "--port", "7860"]
