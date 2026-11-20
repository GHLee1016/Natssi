import time

from . import families, ocr, parse
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
    keep = []
    for line in text.splitlines():
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


def from_text(text: str) -> dict:
    """OCR 원문(또는 사람이 붙여 넣은 전성분 글)을 성분 목록으로."""
    global _matcher
    _matcher = _matcher or Matcher()
    if _matcher.has_dict:
        # 성분 줄을 하나도 못 찾으면 빈 결과 → 앱에서 '전성분이 보이게 다시 찍어 주세요'
        picked = ingredient_lines(text, _matcher)
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


def register(image_paths: list) -> dict:
    """전성분표 사진 여러 장(원통형 용기는 돌려 가며 2~3장) → 성분 목록."""
    t0 = time.perf_counter()
    def good(t):  # 사전과 맞은 성분 수
        return sum(i["status"] != "확인 필요" for i in from_text(t)["ingredients"])

    texts, used = [], []
    for p in image_paths:
        best_v, best_t = "base", ocr.read_text(p, "base")
        best = good(best_t)
        if best < 15:   # 적게 읽었으면 다른 설정으로 다시 (계단식)
            for v in ocr.VARIANTS[1:]:
                t = ocr.read_text(p, v)
                if (g := good(t)) > best:
                    best_v, best_t, best = v, t, g
        texts.append(best_t)
        used.append(best_v)
    text = "\n".join(texts)
    out = from_text(text)
    out["variants"] = used
    out["raw_text"] = text
    out["seconds"] = round(time.perf_counter() - t0, 1)
    return out
