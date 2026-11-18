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


def from_text(text: str) -> dict:
    """OCR 원문(또는 사람이 붙여 넣은 전성분 글)을 성분 목록으로."""
    global _matcher
    _matcher = _matcher or Matcher()
    if _matcher.has_dict:
        matched = [r for frags in parse.split_chunks(text) for r in _segment(frags, _matcher)]
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
    texts = []
    for p in image_paths:
        t = ocr.read_text(p)
        if len(from_text(t)["ingredients"]) < 5:   # 거의 못 읽었으면 대비 보정 후 재시도
            t2 = ocr.read_text(p, enhance=True)
            if len(from_text(t2)["ingredients"]) > len(from_text(t)["ingredients"]):
                t = t2
        texts.append(t)
    text = "\n".join(texts)
    out = from_text(text)
    out["raw_text"] = text
    out["seconds"] = round(time.perf_counter() - t0, 1)
    return out
