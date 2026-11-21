"""성분 글자 → 식약처 표준 이름·성분 계열. 출처: juhee 브랜치 data_pipeline/ingredients/pipeline.py (3cc4428).
사진 OCR(register)은 용량·시간 때문에 별도 OCR 서버(허깅페이스 Space)에서 돌리고, 여기는 글자·자동완성·직접 입력만 가져왔다."""
from . import families, parse
from .match import Matcher

_matcher = None


def _segment(frags: list[str], m: Matcher) -> list[dict]:
    """공백 조각을 사전에 맞춰 합친다. 길게 합친 정확 일치 > 짧은 정확 일치 > 오타 보정 순."""
    out, i, n = [], 0, len(frags)
    while i < n:
        hit = None
        for how in (m.exact, m.fuzzy):
            for L in (4, 3, 2, 1):
                if i + L <= n and (r := how("".join(frags[i:i + L]))):
                    hit = (L, r)
                    break
            if hit:
                break
        if not hit:
            hit = (1, {"ocr": frags[i], "kor": frags[i], "inci": "", "status": "확인 필요", "score": None})
        out.append(hit[1])
        i += hit[0]
    return out


def ingredient_lines(text: str, m: Matcher) -> str:
    """OCR 줄 가운데 성분 목록 줄만 고른다.

    '전성분' 머리말은 OCR이 자주 못 읽어서 기대지 않는다. 대신 줄을 쉼표로 나눈 조각이
    사전에 많이 있으면(40% 이상, 2개 이상) 성분 줄로 본다. 광고 문구·주의사항은 여기서 빠진다.
    """
    keep, skip = [], 0
    for line in text.splitlines():
        # '8 FREE' 표시 바로 뒤 몇 줄('동물성원료, 실리콘오일, 합성색소…')은 '안 들어간' 성분 목록이다
        if parse.FREE_FROM.search(line):
            skip = 3
            continue
        if skip and not parse.START.search(line):
            skip -= 1
            continue
        skip = 0
        s = parse.START.search(line)
        if s:
            line = line[s.end():]
        st = parse.STOP.search(line)
        if st:
            line = line[: st.start()]
        toks = [parse.clean(t) for t in parse.SPLIT.split(line)]
        toks = [t for t in toks if len(t) >= 2]
        if not toks:
            continue
        hits = sum(1 for t in toks if m.exact(t) or m.fuzzy(t))
        if hits >= 2 and hits / len(toks) >= 0.4:
            keep.append(line)
    return "\n".join(keep)


def from_text(text: str, select_lines: bool = True) -> dict:
    """OCR 원문(또는 사람이 붙여 넣은 전성분 글)을 성분 목록으로.
    select_lines=False: 사람이 넣은 글이라 줄 고르기(광고 문구 거르기)를 하지 않는다."""
    global _matcher
    _matcher = _matcher or Matcher()
    if _matcher.has_dict:
        # 성분 줄을 하나도 못 찾으면 빈 결과 → 앱에서 '전성분이 보이게 다시 찍어 주세요'
        picked = ingredient_lines(text, _matcher) if select_lines else text
        matched = [r for frags in parse.split_chunks(picked) for r in _segment(frags, _matcher)]
    else:
        matched = [_matcher.match(t) for t in parse.split_list(text)]
    items, seen = [], set()
    for m in matched:
        if m["kor"] in seen:
            continue
        seen.add(m["kor"])
        m["families"] = families.tag(m["kor"], m["inci"])
        items.append(m)
    fams = sorted({f for it in items for f in it["families"]})
    need = [it["ocr"] for it in items if it["status"] in ("보정", "확인 필요")]
    return {"ingredients": items, "families": fams, "needs_review": need}


# ---------- 직접 입력 (둥근 병처럼 OCR이 안 되는 제품) ----------

def suggest(query: str, k: int = 8) -> list[dict]:
    """성분 이름 자동완성. 앞부분이 같은 이름 → 포함하는 이름 → 오타 보정 순."""
    global _matcher
    _matcher = _matcher or Matcher()
    from .match import norm
    q = norm(query)
    if len(q) < 1 or not _matcher.has_dict:
        return []
    seen, out = set(), []
    for rank in (lambda key: key.startswith(q), lambda key: q in key):
        for key in sorted((x for x in _matcher.keys if rank(x)), key=len):
            e = _matcher.index[key]
            if e["kor"] not in seen:
                seen.add(e["kor"])
                out.append(e)
            if len(out) >= k:
                return out
    if not out and len(q) >= 2:   # 오타면 비슷한 이름 몇 개 (자동완성이라 기준을 낮춘다)
        from rapidfuzz import fuzz, process
        from .match import jamo
        for _, score, i in process.extract(jamo(q), _matcher.jkeys, scorer=fuzz.ratio, limit=k * 3, score_cutoff=70):
            e = _matcher.index[_matcher.keys[i]]
            if e["kor"] not in seen:
                seen.add(e["kor"])
                out.append(e)
        out = out[:k]
    return out


def from_names(names: list[str], extra_families: list[str] = ()) -> dict:
    """사용자가 고른 핵심 성분 몇 개 + '들어 있다'고 체크한 계열 → OCR 결과와 같은 모양."""
    out = from_text("전성분: " + ", ".join(names), select_lines=False) if names else {"ingredients": [], "families": [], "needs_review": []}
    out["families"] = sorted(set(out["families"]) | set(extra_families))
    out["source"] = "manual"
    return out
