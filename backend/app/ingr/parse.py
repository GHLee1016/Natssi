"""OCR 원문 → 성분 이름 목록."""
import re

START = re.compile(
    # OCR이 '전성분'을 '전성부'·'전섬분'처럼 잘못 읽어도 머리말로 본다(성분 1번으로 들어가지 않게)
    r"(전\s*[성섬셩]\s*[분부붇뷴]|화장품\s*성분|ingredients?|\[\s*성\s*분\s*\]|(?<![가-힣])성\s*분\s*[:：])\s*\]?\s*[:：]?", re.I)
STOP = re.compile(
    r"(\[[^\]\d,]{1,15}\]|"   # [용량], [사용할 때의 주의사항] 같은 대괄호 머리말
    r"사용\s*할?\s*때?\s*의?\s*주\s*의\s*사\s*항|사용\s*시?\s*의?\s*주\s*의\s*사\s*항|주\s*의\s*사\s*항|사용\s*방법|사용\s*법|"
    r"제조\s*번호|사용\s*기한|개봉\s*후|내\s*용\s*량|용\s*량|제조\s*(판매)?\s*업자|"
    r"책임\s*판매\s*업자|보관\s*방법|기능성\s*화장품|효\s*능\s*[·/]?\s*효\s*과|고객\s*(상담|센터)|made\s*in|원산지)",
    re.I,
)
# '무첨가·FREE' 목록 줄: 들어 있지 않은 성분이라 등록하면 안 된다
# ('프리지아추출물'·'아프리코트'처럼 이름에 '프리'가 든 성분이 48개라, '프리'는 '8 프리'·'프리:' 꼴만 본다)
FREE_FROM = re.compile(r"free(?!sia)|\d\s*프리|프리\s*[:：]|무\s*첨\s*가|미\s*함\s*유|무\s*\d+\s*종", re.I)
# 쉼표로 나누되 '1,2-헥산다이올'처럼 숫자 사이 쉼표는 남긴다
# OCR이 쉼표를 마침표로 읽는 경우도 많다('카프릴릴글라이콜. 수크로오스'). 소수점(0.1)은 나누지 않는다.
SPLIT = re.compile(r"(?<!\d)[,，、;]|[,，、;](?!\d)|\.(?=\s*[가-힣A-Za-z])")


def cut_sections(text: str) -> list[str]:
    """'전성분' 표시마다 그 뒤부터 주의사항 등이 나오기 전까지. 세트 상품(본품+증정품)은 여러 개.
    표시가 하나도 없으면 전체를 한 구간으로 본다."""
    t = re.sub(r"\s+", " ", text)
    starts = list(START.finditer(t))
    if not starts:
        return [t]
    out = []
    for i, m in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(t)
        seg = t[m.end():end]
        s = STOP.search(seg)
        if s:
            seg = seg[: s.start()]
        if seg.strip():
            out.append(seg)
    return out


def cut_section(text: str) -> str:
    return " , ".join(cut_sections(text))


def clean(token: str) -> str:
    t = token.strip()
    t = re.sub(r"\(.*?\)|\[.*?\]", "", t)          # 괄호 속 함량·설명 제거
    t = re.sub(r"\d*(\.\d+)?\s*(%|ppm|ppb|mg)", "", t, flags=re.I)
    t = t.strip(" .·:：-_*\"'“”‘’|[]")
    return t


# OCR은 쉼표를 자주 빠뜨린다. 한글 성분명에는 띄어쓰기가 없으므로 한글 사이 공백도 경계 후보로 본다.
# (영문 INCI 'Sodium Hyaluronate'의 공백은 나누지 않는다)
FRAG = re.compile(r"(?<=[가-힣0-9)])\s+(?=[가-힣0-9])")


def split_chunks(text: str) -> list[list[str]]:
    """쉼표 단위 덩어리 → 각 덩어리를 공백 조각으로. 조각 합치기는 pipeline이 사전을 보고 정한다."""
    out = []
    for tok in SPLIT.split(cut_section(text)):
        frags = [clean(f) for f in FRAG.split(clean(tok))]
        frags = [f for f in frags if f and not f.isdigit()]
        if frags:
            out.append(frags)
    return out


def split_tokens(text: str) -> list[str]:
    """쉼표 단위 덩어리(공백 포함). 덩어리 안에서 어디를 끊을지는 segment가 사전을 보고 정한다."""
    toks = (clean(tok) for tok in SPLIT.split(cut_section(text)))
    return [t for t in toks if t and not t.replace(" ", "").isdigit()]


def split_list(text: str) -> list[str]:
    """사전 없이 쓰는 단순 분리 (조각을 그대로 성분으로 봄, 한 글자 조각은 다음 조각에 붙임)."""
    out = []
    for frags in split_chunks(text):
        buf = ""
        for f in frags:
            buf += f
            if len(buf) >= 2:
                out.append(buf)
                buf = ""
        if buf and out:
            out[-1] += buf
    return out
