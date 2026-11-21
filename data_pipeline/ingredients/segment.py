"""쉼표 사이 덩어리 하나 → 성분 이름 몇 개. 사전을 보고 어디서 끊을지 정한다.

OCR이 자주 하는 실수
- 줄바꿈에서 이름이 잘린다:   '폴리글리세\\n린-3,1,2-헥산다이올', '세라\\n마이드엔피'
- 쉼표를 빠뜨려 두 이름이 붙는다: '나이아신아마이드흑효모발효물', '하이드록시아세토페논 판테놀'
- 글자 하나를 헷갈린다:        '프로판다이을'(올), '소듬'(듐)  → match.Matcher.repair / fuzzy

방법: 공백·기호를 뺀 글자열에서 사전 이름을 찾아, 덩어리 전체를 가장 잘 덮는 조합을 고른다(동적 계획법).
  사전에 그대로 있는 이름 > 헷갈리는 글자만 고친 이름 > 비슷한 이름(오타 보정) > 사전에 없음
  · 한 이름으로 맞으면 나누지 않는다('녹차추출물'을 '녹차'+'추출물'로 나누지 않음).
  · 사전에 없는 조각은 지어내지 않고 '확인 필요'로 남긴다.
"""
from .match import Matcher, norm

MAX_NAME = 80        # 사전 이름(정규화) 길이 상한으로 쓴다. 더 긴 이름은 거의 없다.
MAX_FUZZY = 60
EXACT, REPAIRED = 1.0, 0.95
PIECE = 0.5          # 조각 하나마다 빼는 점수: 같은 글자를 덮으면 적게 나눈 쪽이 이긴다


def _unknown(ocr: str) -> dict:
    return {"ocr": ocr, "kor": ocr, "inci": "", "status": "확인 필요", "score": None}


def _letters(token: str):
    """정규화 글자열과 각 글자의 원문 위치, 공백(낱말 경계) 위치."""
    chars, pos, words = [], [], set()
    for idx, ch in enumerate(token):
        n = norm(ch)
        if not n:
            if ch.isspace():
                words.add(len(chars))
            continue
        for c in n:
            chars.append(c)
            pos.append(idx)
    return "".join(chars), pos, words


def segment(token: str, m: Matcher) -> list[dict]:
    if not token.strip():
        return []
    if (r := m.exact(token)):                       # 대부분은 여기서 끝난다
        return [r]
    s, pos, words = _letters(token)
    L = len(s)
    if L == 0:
        return []
    soft = {0, L} | words

    # 1) 사전 이름이 들어 있는 자리. 두 글자 이름은 낱말 경계에 딱 맞을 때만(속에서 '오일' 같은 걸 줍지 않게).
    found: dict[tuple[int, int], tuple[float, dict]] = {}
    for i in range(L):
        for j in range(i + 2, min(L, i + MAX_NAME) + 1):
            if j - i == 2 and not (i in soft and j in soft):
                continue
            sub = s[i:j]
            if sub in m.index:
                found[(i, j)] = (EXACT, {**m.index[sub], "status": "일치", "score": 100})
            elif j - i >= 4 and any(m._candidates(c) for c in sub) and (r := m.repair(sub)):
                found[(i, j)] = (REPAIRED, r)

    # 2) 끊을 수 있는 자리: 공백, 덩어리 처음·끝, 사전 이름의 처음·끝
    cuts = sorted(soft | {x for ij in found for x in ij})

    def piece(i: int, j: int) -> tuple[float, dict]:
        n = j - i
        if (i, j) in found:
            w, r = found[(i, j)]
            return w * n - PIECE, r
        if 3 <= n <= MAX_FUZZY and (r := m.fuzzy(s[i:j])):
            # 비슷하기만 한 이름은 점수가 낮을수록 크게 깎는다(80점 → 0.33, 95점 → 0.83).
            # 그래야 사전에 그대로 있는 이름 + 찌꺼기 몇 글자가, 찌꺼기까지 삼킨 엉뚱한 보정보다 앞선다.
            return (r["score"] - 70) / 30 * n - 2 * PIECE, r
        return -0.5 * n - 1.0, None

    best = {0: (0.0, None, None)}                     # 자리 → (점수, 앞 자리, 조각)
    for a, i in enumerate(cuts):
        if i not in best:
            continue
        for j in cuts[a + 1:]:
            sc, r = piece(i, j)
            tot = best[i][0] + sc
            if j not in best or tot > best[j][0]:
                best[j] = (tot, i, r)

    pieces, j = [], L
    while j > 0:
        _, i, r = best[j]
        pieces.append((i, j, r))
        j = i
    pieces.reverse()

    out, matched = [], any(r for _, _, r in pieces)
    for i, j, r in pieces:
        ocr = token[pos[i]: pos[j - 1] + 1].strip(" ,.-_/·:")
        if r:
            out.append({**r, "ocr": ocr})
        elif not (matched and j - i <= 2):           # 이름 옆에 붙은 한두 글자 찌꺼기('드5', '이드')는 버린다
            out.append(_unknown(ocr or token.strip()))
    return out
