"""휜 사진 펴기: 둥근 통·병의 전성분 라벨처럼 휘어 찍힌 글자를 평평하게 편다.

모델: PaddleOCR(PaddleX)의 UVDoc(문서 펴기, Apache-2.0)을 ONNX로 바꾼 것(약 32MB).
Paddle 없이 onnxruntime만으로 돈다(Space에 이미 있음). 사진 한 장에 CPU 2개로 0.3초쯤.

쓰는 법(pipeline.register): 원래 사진을 읽고, 편 사진을 한 번 더 읽어 두 글자를 합친다.
둘은 서로 다른 줄을 찾는다(둥근 통 4장: 원래 사진에서만 26개, 편 사진에서만 35개 성분). 합친 뒤 같은 성분은 dedupe가 하나로.
  가스비(정답 22): 재현율 0.55 → 0.77, 정밀도 0.92 → 0.89
  닥터자르트(정답 49): 재현율 0.55 → 0.82, 정밀도 0.90 → 0.93

모델 파일 위치: NATSSI_UNWARP_MODEL 환경변수 > data_pipeline/models/uvdoc.onnx.
파일이 없거나 NATSSI_UNWARP=0이면 펴기를 건너뛴다(지금까지와 똑같이 동작). 만드는 법은 README '휜 사진 펴기'.
대가: 사진마다 OCR을 한 번 더 하므로 시간이 1.6배쯤(둥근 통 5장 21.5초 → 35.4초, CPU 4개).
"""
import os
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL = Path(os.environ.get("NATSSI_UNWARP_MODEL") or Path(__file__).resolve().parents[1] / "models" / "uvdoc.onnx")


def available() -> bool:
    """모델 파일이 있고, NATSSI_UNWARP=0 으로 끄지 않았을 때. (Space가 느려지면 Settings → Variables에 NATSSI_UNWARP=0)"""
    return os.environ.get("NATSSI_UNWARP", "1") != "0" and MODEL.exists()


@lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort
    so = ort.SessionOptions()
    so.log_severity_level = 3                       # 변환 때 남은 안 쓰는 값 경고는 숨긴다
    s = ort.InferenceSession(str(MODEL), so, providers=["CPUExecutionProvider"])
    return s, s.get_inputs()[0].name


def unwarp(img: np.ndarray) -> np.ndarray:
    """BGR uint8 사진 → 편 BGR uint8 사진(같은 크기). PaddleX 전처리·후처리와 같다(0~1로 나눠 넣고 255를 곱함)."""
    s, name = _session()
    x = (img.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
    y = s.run(None, {name: x})[0][0]
    return np.clip(y.transpose(1, 2, 0) * 255.0, 0, 255).astype(np.uint8)
