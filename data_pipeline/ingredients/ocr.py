"""사진 → 글자. RapidOCR + 한국어 PP-OCRv5 인식 모델 (onnxruntime, CPU).

이건희의 소비기한 OCR 대회 저장소(itda3-dscover-capybara)에서 가져온 결정:
- 주력 엔진은 RapidOCR. torch 없이 돌고, 같은 사진에서 EasyOCR 대비 약 8배 빠르고 오타가 적었다.
- 계단식 재시도: 1차에서 성분을 거의 못 읽은 사진에만 대비 보정(CLAHE) 후 한 번 더.
첫 실행 때 모델을 내려받는다(약 20MB).
"""
from functools import lru_cache

import numpy as np


@lru_cache(maxsize=1)
def _engine():
    from rapidocr import RapidOCR
    from rapidocr.utils.typings import LangRec, ModelType, OCRVersion
    return RapidOCR(params={
        "Rec.lang_type": LangRec.KOREAN,
        "Rec.ocr_version": OCRVersion.PPOCRV5,
        "Rec.model_type": ModelType.MOBILE,
    })


def load(path, enhance: bool = False) -> np.ndarray:
    """한글 경로도 읽히게 imdecode 사용. enhance=True면 흑백 + CLAHE 대비 보정."""
    import cv2
    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"사진을 열 수 없어요: {path}")
    h, w = img.shape[:2]
    if max(h, w) > 3000:  # 폰 원본(4000px 이상)은 줄여야 빠르다
        s = 3000 / max(h, w)
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    if enhance:
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        g = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(g)
        img = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
    return img


def read_text(path, enhance: bool = False) -> str:
    r = _engine()(load(path, enhance))
    return "\n".join(r.txts or [])
