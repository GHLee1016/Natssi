"""호출 횟수 제한(슬라이딩 윈도).

서버리스는 인스턴스가 여러 개라 이 카운터는 인스턴스마다 따로입니다.
즉 '반복 호출로 비용이 폭주하는 것'을 막는 1차 방어이고, 확실한 상한은
OpenRouter 키의 크레딧 한도로 함께 걸어 두세요.
"""
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request

from . import config

_hits: dict[tuple[str, str], deque] = defaultdict(deque)
_MAX_KEYS = 5000


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown"))[:64]


def hit(bucket: str, key: str) -> None:
    limit, window = config.LIMITS[bucket]
    now = time.monotonic()
    if len(_hits) > _MAX_KEYS:                      # 메모리 보호
        for k in [k for k, q in _hits.items() if not q or now - q[-1] > window]:
            _hits.pop(k, None)
    q = _hits[(bucket, key)]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        wait = int(window - (now - q[0])) + 1
        raise HTTPException(429, f"요청이 너무 많아요. {wait}초 뒤에 다시 시도해 주세요.",
                            headers={"Retry-After": str(wait)})
    q.append(now)


def reset() -> None:
    _hits.clear()
