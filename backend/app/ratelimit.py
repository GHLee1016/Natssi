"""호출 횟수 제한(슬라이딩 윈도).

서버리스는 인스턴스가 여러 개라 이 카운터는 인스턴스마다 따로입니다.
즉 '반복 호출로 비용이 폭주하는 것'을 막는 1차 방어이고, 확실한 상한은
Anthropic 콘솔의 월 사용 한도(spend limit)로 함께 걸어 두세요.
"""
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request

from . import config

_hits: dict[tuple[str, str], deque] = defaultdict(deque)
_MAX_KEYS = 5000


def client_ip(request: Request) -> str:
    """요청한 사람의 IP. Vercel이 직접 넣는 헤더를 먼저 믿는다(x-forwarded-for 첫 값은 사용자가 지어 보낼 수 있음).
    로컬처럼 프록시가 없으면 접속 주소를 쓴다."""
    h = request.headers
    ip = (h.get("x-vercel-forwarded-for") or h.get("x-real-ip") or "").split(",")[0].strip()
    if not ip and config.ON_VERCEL:                          # Vercel인데 위 헤더가 없으면 프록시가 붙인 마지막 값
        ip = h.get("x-forwarded-for", "").split(",")[-1].strip()
    return (ip or (request.client.host if request.client else "unknown"))[:64]


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
