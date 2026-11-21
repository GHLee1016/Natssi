"""성분 글자 → 식약처 표준 이름·성분 계열. 출처: juhee 브랜치 data_pipeline/ingredients/pipeline.py (3cc4428).
사진 OCR(register)은 용량·시간 때문에 별도 OCR 서버(허깅페이스 Space)에서 돌리고, 여기는 글자·자동완성·직접 입력만 가져왔다."""
from . import families, parse
from .match import Matcher, jamo, norm
from .segment import segment

_matcher = None


def ingredient_lines(text: str, m: Matcher) -> str:
    """OCR 줄 가운데 성분 목록 줄만 고른다.

    '전성분' 머리말은 OCR이 자주 못 읽어서 기대지 않는다. 대신 줄 글자의 절반 이상이 사전 이름으로 덮이고
    이름이 2개 이상이면 성분 줄로 본다(쉼표를 못 읽은 줄 '정제수에탄을에이엠피…'도 segment가 나눠서 센다).
    광고 문구·주의사항은 여기서 빠진다. '전성분' 표시가 있는 줄은 이름 하나만 맞아도 남긴다.
    """
    keep, skip, prev = [], 0, False
    for line in text.splitlines():
        # '8 FREE' 표시 바로 뒤 몇 줄('동물성원료, 실리콘오일, 합성색소…')은 '안 들어간' 성분 목록이다
        if parse.FREE_FROM.search(line):
            skip = 3
            continue
        if skip and not parse.START.search(line):
            skip -= 1
            prev = False
            continue
        skip = 0
        s = parse.START.search(line)
        if s:
            line = line[s.end():]
        st = parse.STOP.search(line)
        if st:
            line = line[: st.start()]
        toks = [parse.clean(t) for t in parse.SPLIT.split(line)]
        toks = [t for t in toks if len(norm(t)) >= 2]
        if not toks:
            prev = False
            continue
        total = sum(len(norm(t)) for t in toks)
        hits = covered = tok_hits = 0
        for t in toks:     # 빠른 나누기로 세고, 대부분을 못 덮은 조각만 통째로 오타 보정을 해 본다(느려서)
            found = [r for r in segment(t, m, fuzzy=False) if r["status"] != "확인 필요"]
            c = min(1.0, sum(len(norm(r["ocr"])) for r in found) / len(norm(t)))
            if c < 0.6 and m.fuzzy(t):
                found, c = [{"ocr": t}], 1.0
            hits += len(found)
            tok_hits += c >= 0.6           # 조각의 대부분이 성분 이름이어야 '성분 조각'('Clear Moisture Cream'의 'Cream'은 아님)
            covered += c * len(norm(t))
        cover, ratio = covered / total, tok_hits / len(toks)
        # 쉼표 조각 대부분이 성분이거나(쉼표를 읽은 줄), 글자 대부분이 성분 이름으로 덮이면(쉼표를 못 읽은 줄) 성분 줄
        ok = (tok_hits >= 2 and ratio >= 0.4) or (hits >= 2 and cover >= 0.5)
        # 성분 줄 바로 다음 줄은 기준을 낮춘다: 목록 끝('…, 향료')이나 줄바꿈에서 잘린 이름 뒷부분('탄검')만 있는 줄
        cont = prev and (tok_hits >= 1 and ratio >= 0.3
                         or (len(toks) == 1 and m.exact(keep[-1].rsplit(",", 1)[-1].strip() + toks[0])))
        prev = ok or (bool(s) and hits >= 1) or bool(cont)
        if prev:
            keep.append(line)
    return "\n".join(keep)


def dedupe(items: list[dict]) -> list[dict]:
    """같은 성분은 한 번만. 사진 여러 장이 겹치거나, 줄바꿈에서 잘린 조각('세토페는')이 따로 읽혀도 하나로 남긴다.
    - 표준 이름이 같으면(공백·기호·대소문자 무시) 처음 것만
    - 사전에 없는 조각이 이미 찾은 성분 이름의 일부와 거의 같으면 버린다('추출물' ⊂ '병풀추출물')"""
    from rapidfuzz import fuzz
    out, seen = [], set()
    for it in items:
        k = norm(it["kor"])
        if k and k not in seen:
            seen.add(k)
            out.append(it)
    known = [jamo(norm(i["kor"])) for i in out if i["status"] != "확인 필요"]
    def part_of_known(it):
        j = jamo(norm(it["kor"]))
        return len(j) >= 3 and any(len(kj) > len(j) and fuzz.partial_ratio(j, kj) >= 90 for kj in known)
    return [it for it in out if it["status"] != "확인 필요" or not part_of_known(it)]


def from_text(text: str, select_lines: bool = True) -> dict:
    """OCR 원문(또는 사람이 붙여 넣은 전성분 글)을 성분 목록으로.
    select_lines=False: 사람이 넣은 글이라 줄 고르기(광고 문구 거르기)를 하지 않는다."""
    global _matcher
    _matcher = _matcher or Matcher()
    if _matcher.has_dict:
        # 성분 줄을 하나도 못 찾으면 빈 결과 → 앱에서 '전성분이 보이게 다시 찍어 주세요'
        picked = ingredient_lines(text, _matcher) if select_lines else text
        matched = [r for tok in parse.split_tokens(picked) for r in segment(tok, _matcher)]
    else:
        matched = [_matcher.match(t) for t in parse.split_list(text)]
    items = []
    for m in dedupe(matched):
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
