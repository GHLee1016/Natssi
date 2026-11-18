"""OCR 원문 → 성분 이름 목록."""
import re

START = re.compile(r"(전\s*성\s*분|화장품\s*성분|ingredients?)\s*[:：]?", re.I)
STOP = re.compile(
    r"(사용\s*시?\s*의?\s*주\s*의\s*사\s*항|주\s*의\s*사\s*항|사용\s*방법|사용\s*법|"
    r"제조\s*번호|사용\s*기한|개봉\s*후|내\s*용\s*량|용\s*량|제조\s*(판매)?\s*업자|"
    r"책임\s*판매\s*업자|보관\s*방법|기능성\s*화장품|고객\s*(상담|센터)|made\s*in|원산지)",
    re.I,
)
# 쉼표로 나누되 '1,2-헥산다이올'처럼 숫자 사이 쉼표는 남긴다
SPLIT = re.compile(r"(?<!\d)[,，、;]|[,，、;](?!\d)")


def cut_section(text: str) -> str:
    """'전성분' 표시 뒤부터 주의사항 등이 나오기 전까지. 표시가 없으면 전체."""
    t = re.sub(r"\s+", " ", text)
    m = START.search(t)
    if m:
        t = t[m.end():]
    s = STOP.search(t)
    if s:
        t = t[: s.start()]
    return t


def clean(token: str) -> str:
    t = token.strip()
    t = re.sub(r"\(.*?\)|\[.*?\]", "", t)          # 괄호 속 함량·설명 제거
    t = re.sub(r"\d+(\.\d+)?\s*(%|ppm|mg)", "", t, flags=re.I)
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
