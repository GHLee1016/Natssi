"""사진 → 글자. RapidOCR + 한국어 PP-OCRv5 인식 모델 (onnxruntime, CPU).

이건희의 소비기한 OCR 대회 저장소(itda3-dscover-capybara)에서 가져온 결정:
- 주력 엔진은 RapidOCR. torch 없이 돌고, 같은 사진에서 EasyOCR 대비 오타가 적고 빠르다.
- 계단식 재시도: 1차에서 성분을 적게 읽은 사진에만 다른 설정으로 한 번 더 (pipeline.register).

전성분표는 글씨가 작고 빽빽해서, 매장 사진 57장으로 정한 값:
- Global.max_side_len 2000 → 3000: 입력을 덜 줄여야 '전성분' 줄을 놓치지 않는다
  (5번 사진 사전 일치 14% → 96%)
- 변형(variant)
  base   : 기본
  tight  : 글자 상자를 덜 넓힘(unclip 1.6 → 1.3). 줄 간격이 좁아 두 줄이 붙는 사진에서 낫다
  invert : 흑백 반전. 어두운 바탕에 흰 글씨
첫 실행 때 모델을 내려받는다(약 20MB).
"""
import os
from functools import lru_cache

import numpy as np

VARIANTS = ("base", "tight", "invert")


def cpu_threads(root: str = "/sys/fs/cgroup") -> int:
    """OCR 엔진이 쓸 스레드 수. 컨테이너(허깅페이스 Space 등)는 CPU 사용량을 몇 개로 제한해 두는데 os.cpu_count()는
    서버 전체 수를 보여 줘서, 엔진이 스레드를 너무 많이 만들면 제한 안에서 서로 다투느라 훨씬 느려진다.
    순서: NATSSI_THREADS 환경변수 > cgroup 제한(v2 cpu.max, v1 cfs_quota) > 이 프로세스가 쓸 수 있는 CPU 수."""
    if (v := os.environ.get("NATSSI_THREADS", "").strip()).isdigit() and int(v) > 0:
        return int(v)
    n = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else (os.cpu_count() or 1)
    quota = None
    try:
        q, period = open(f"{root}/cpu.max").read().split()[:2]          # cgroup v2: "200000 100000" 또는 "max 100000"
        if q != "max":
            quota = int(q) / int(period)
    except (OSError, ValueError):
        try:
            q = int(open(f"{root}/cpu/cpu.cfs_quota_us").read())         # cgroup v1: -1이면 제한 없음
            period = int(open(f"{root}/cpu/cpu.cfs_period_us").read())
            if q > 0:
                quota = q / period
        except (OSError, ValueError):
            pass
    if quota:
        n = min(n, max(1, int(quota + 0.5)))
    return max(1, n)


@lru_cache(maxsize=2)
def _engine(unclip: float = 1.6):
    from rapidocr import RapidOCR
    from rapidocr.utils.typings import LangRec, ModelType, OCRVersion
    return RapidOCR(params={
        "Rec.lang_type": LangRec.KOREAN,
        "Rec.ocr_version": OCRVersion.PPOCRV5,
        "Rec.model_type": ModelType.MOBILE,
        "Global.max_side_len": 3000,
        "Det.unclip_ratio": unclip,
        "EngineConfig.onnxruntime.intra_op_num_threads": cpu_threads(),
        "EngineConfig.onnxruntime.inter_op_num_threads": 1,
    })


def load(src, invert: bool = False) -> np.ndarray:
    """src: 파일 경로 또는 업로드된 사진 바이트. 한글 경로도 읽히게 imdecode 사용 (폰 사진 회전 정보도 반영됨)."""
    import cv2
    buf = np.frombuffer(src, dtype=np.uint8) if isinstance(src, (bytes, bytearray)) \
        else np.fromfile(str(src), dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("사진을 열 수 없어요")
    h, w = img.shape[:2]
    if max(h, w) > 3000:
        s = 3000 / max(h, w)
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return invert_img(img) if invert else img


def invert_img(img: np.ndarray) -> np.ndarray:
    """흑백 반전(어두운 바탕에 흰 글씨)."""
    import cv2
    g = 255 - cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)


def sideways_order(r) -> list[str] | None:
    """옆으로 누운 사진(글자가 세로로 놓임)이면 읽는 순서의 줄 목록, 아니면 None.
    엔진은 상자를 위에서 아래로 늘어놓는데, 누운 사진에서는 줄이 왼쪽에서 오른쪽(또는 반대)으로 이어져서
    그대로 두면 줄 순서가 뒤섞인다(메디힐 상자 사진: 라벨 순서와 맞는 성분 21%). 글자 인식은 엔진이 상자마다 돌려서 한다.
    방향: '전성분' 줄이 '주의사항' 같은 줄보다 앞에 오는 쪽. 단서가 없으면 오른쪽부터(시계 방향으로 누운 사진)."""
    txts = list(r.txts or [])
    if r.boxes is None or len(txts) < 3:
        return None
    b = np.asarray(r.boxes, dtype=float)
    w = np.linalg.norm(b[:, 1] - b[:, 0], axis=1)
    h = np.linalg.norm(b[:, 3] - b[:, 0], axis=1)
    if (h > 2 * w).mean() < 0.6:
        return None
    asc = [txts[i] for i in np.argsort(b[:, :, 0].mean(axis=1), kind="stable")]
    desc = asc[::-1]
    from .parse import START, STOP

    def score(lines):
        st = next((i for i, t in enumerate(lines) if START.search(t)), None)
        sp = [i for i, t in enumerate(lines) if STOP.search(t)]
        if st is None or not sp:
            return 0
        return sum(1 if st < i else -1 for i in sp)
    return desc if score(desc) >= score(asc) else asc


def read_image(img: np.ndarray, variant: str = "base") -> str:
    """이미 연 사진(BGR) → 글자. 같은 사진을 여러 설정·편 사진으로 읽을 때 다시 열지 않게."""
    eng = _engine(1.3 if variant == "tight" else 1.6)
    r = eng(invert_img(img) if variant == "invert" else img)
    return "\n".join(sideways_order(r) or r.txts or [])


def read_rows(img: np.ndarray, variant: str = "base") -> list[str]:
    """이미 연 사진 → 글자 줄 목록(위에서 아래로). 엔진이 줄 하나를 상자 하나로 잡으므로 상자 = 줄.
    상자끼리 묶지 않는다: 휜 사진에서는 위아래 줄이 겹쳐 보이고, 옆 칸(영문 전성분 등)이 같은 높이에 있어서.
    여러 장을 줄 단위로 이어 붙일 때(stitch.py) 쓴다."""
    eng = _engine(1.3 if variant == "tight" else 1.6)
    r = eng(invert_img(img) if variant == "invert" else img)
    if r.boxes is None or not len(r.txts or []):
        return []
    if (side := sideways_order(r)):
        return side
    order = sorted(range(len(r.txts)), key=lambda i: (float(r.boxes[i][:, 1].mean()), float(r.boxes[i][:, 0].min())))
    return [r.txts[i] for i in order]


def read_text(path, variant: str = "base") -> str:
    return read_image(load(path), variant)
