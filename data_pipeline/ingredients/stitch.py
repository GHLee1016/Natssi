"""여러 장 사진을 줄 단위로 이어 붙이기. 둥근 통을 돌려 가며 찍은 2~3장용.

통을 돌리면 아래 줄이 새로 보이는 게 아니라 '모든 줄의 오른쪽'이 새로 보인다(라벨이 통을 감고 있어서).
그래서 앞 사진 줄의 끝부분과 다음 사진 줄의 앞쪽이 겹친다:
    앞 사진: '…, 글리세린, 페녹시'          (오른쪽 끝에서 잘림)
    다음 사진:        '글리세린, 페녹시에탄올, 피이지-7…'
    → '…, 글리세린, 페녹시에탄올, 피이지-7…'
겹친 글자는 사진마다 오독이 달라서 비슷한 정도(rapidfuzz)로 찾고, 겹친 부분은 다음 사진 쪽 글자를 쓴다
(앞 사진에서는 오른쪽 가장자리라 눌려 찍히고, 다음 사진에서는 가운데 쪽이라 더 잘 읽힌다).
줄 짝은 위에서 아래 순서를 지키며(순서가 엇갈리지 않게) 겹친 점수 합이 가장 큰 조합을 고른다.
짝이 없는 줄은 순서대로 그대로 둔다. 같은 성분이 두 번 나오면 뒤 단계(pipeline.dedupe)가 하나로 남긴다.
"""
from rapidfuzz import fuzz

MIN_SCORE = 82          # 겹친 글자의 비슷한 정도(0~100)
MIN_LEN = 8             # 겹친 부분이 이보다 짧으면 우연일 수 있어 잇지 않는다(긴 겹침일수록 점수가 높다)
SAME = 90               # 두 줄이 거의 같으면(같은 줄을 둘 다 통째로 읽음) 긴 쪽 하나만


def _key(s: str):
    """비교용 글자열(공백 빼고, 쉼표·마침표는 같은 것으로)과 원래 위치."""
    chars, idx = [], []
    for i, ch in enumerate(s):
        if ch.isspace():
            continue
        chars.append("," if ch in ",.，、;" else ch.lower())
        idx.append(i)
    return "".join(chars), idx


def overlap(a: str, b: str):
    """a의 끝부분(끝까지)이 b의 앞쪽 어딘가와 겹치면 (점수, 이은 줄), 아니면 None.
    a[-L:] ≈ b[p:p+L] 인 가장 긴 L을 찾는다(L ≥ 8글자, p는 b의 앞쪽 80% 안). 비슷한 정도는 글자 단위(오독 허용)."""
    ka, ia = _key(a)
    kb, ib = _key(b)
    if len(ka) < 6 or len(kb) < 6:
        return None
    if fuzz.ratio(ka, kb) >= SAME:
        return 100.0, (a if len(ka) >= len(kb) else b)
    head = kb[: int(len(kb) * 0.8) + 1]
    # 빠른 거르기: a 끝 8글자가 b 앞쪽 어딘가와 비슷하지도 않으면 겹칠 수 없다
    if fuzz.partial_ratio(ka[-MIN_LEN:], head) < MIN_SCORE - 7:
        return None
    # 맞는 글자 수 - 2 × 안 맞는 글자 수가 가장 큰 (L, p). 길이만 보면 안 맞는 글자를 품고 겹침을 너무 길게 잡는다.
    best = None
    for L in range(MIN_LEN, min(len(ka), len(kb)) + 1):
        for p in range(0, min(len(head), len(kb) - L) + 1):
            sc = fuzz.ratio(ka[-L:], kb[p:p + L])
            if sc < MIN_SCORE:
                continue
            same = sc / 100 * L
            val = same - 2 * (L - same)
            if best is None or val > best[0]:
                best = (val, L, p)
    if not best:
        return None
    val, L, p = best
    cut = ia[len(ka) - L]
    if a[cut] in ",.，、; " and not kb[p] == ",":    # 겹침이 앞 줄의 쉼표에서 시작하면 그 쉼표는 남긴다
        cut += 1
    return val, a[:cut] + b[ib[p]:]


def stitch_pair(A: list[str], B: list[str]) -> list[str]:
    """두 사진의 줄 목록 → 이어 붙인 줄 목록. 위아래 순서를 지키는 짝 중 점수 합이 가장 큰 것."""
    n, m = len(A), len(B)
    ov = {}
    for i in range(n):
        for j in range(m):
            if (r := overlap(A[i], B[j])):
                ov[i, j] = r
    # best[i][j] = A[i:], B[j:]에서 얻을 수 있는 최고 점수
    best = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            v = max(best[i + 1][j], best[i][j + 1])
            if (i, j) in ov:
                v = max(v, ov[i, j][0] + best[i + 1][j + 1])
            best[i][j] = v
    out, i, j = [], 0, 0
    while i < n and j < m:
        if (i, j) in ov and best[i][j] == ov[i, j][0] + best[i + 1][j + 1]:
            out.append(ov[i, j][1]); i += 1; j += 1
        elif best[i][j] == best[i + 1][j]:
            out.append(A[i]); i += 1
        else:
            out.append(B[j]); j += 1
    return out + A[i:] + B[j:]


def stitch(views: list[list[str]]) -> list[str]:
    """사진 순서대로(왼쪽에서 오른쪽으로 돌려 찍은 순서) 차례로 이어 붙인다."""
    if not views:
        return []
    out = views[0]
    for v in views[1:]:
        out = stitch_pair(out, v)
    return out
