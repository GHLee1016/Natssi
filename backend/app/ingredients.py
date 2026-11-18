"""전성분 글자 → 성분 목록과 성분 계열.

사용자가 붙여 넣거나 OCR이 읽어 준 '전성분' 글자를 쉼표 단위로 나누고, 성분 계열(레티노이드·AHA·향료 …)을 붙입니다.
규칙은 data_pipeline/ingredients(parse.py, families.py, 강주희)와 같게 맞춰 두었습니다. 서버리스에 올릴 수 있게
pandas·OCR 없이 표준 라이브러리만 씁니다. 식약처 성분사전으로 표준명을 맞추는 단계는 사전 파일이 준비되면 여기에 붙입니다.

원칙: 효능을 말하지 않고, 성분 이름을 지어내지 않습니다. 읽기 어려운 조각은 '확인 필요'로 돌려 사용자가 고치게 합니다.
"""
import re

MAX_TEXT = 8000
MAX_ITEMS = 200

START = re.compile(r"(전\s*성\s*분|화장품\s*성분|ingredients?)\s*[:：]?", re.I)
STOP = re.compile(
    r"(사용\s*시?\s*의?\s*주\s*의\s*사\s*항|주\s*의\s*사\s*항|사용\s*방법|사용\s*법|"
    r"제조\s*번호|사용\s*기한|개봉\s*후|내\s*용\s*량|용\s*량|제조\s*(판매)?\s*업자|"
    r"책임\s*판매\s*업자|보관\s*방법|기능성\s*화장품|고객\s*(상담|센터)|made\s*in|원산지)",
    re.I,
)
# 쉼표로 나누되 '1,2-헥산다이올'처럼 숫자 사이 쉼표는 남긴다
SPLIT = re.compile(r"(?<!\d)[,，、;·\n]|[,，、;·\n](?!\d)")

RULES = {
    "레티노이드": ["레티놀", "레티닐", "레티날", "레티노익", "레티노에이트", "retinol", "retinyl", "retinal", "retinoate"],
    "AHA": ["글라이콜릭애씨드", "락틱애씨드", "만델릭애씨드", "말릭애씨드", "타타릭애씨드",
            "glycolic acid", "lactic acid", "mandelic acid", "malic acid", "tartaric acid"],
    "BHA": ["살리실릭애씨드", "베타인살리실레이트", "salicylic acid", "betaine salicylate"],
    "PHA": ["글루코노락톤", "락토바이오닉애씨드", "gluconolactone", "lactobionic acid"],
    "비타민C": ["아스코빅", "아스코빌", "ascorbic", "ascorbyl"],
    "나이아신아마이드": ["나이아신아마이드", "niacinamide"],
    "향료": ["향료", "리모넨", "리날룰", "시트로넬올", "제라니올", "시트랄", "유제놀", "쿠마린", "벤질알코올",
            "벤질살리실레이트", "헥실신나말", "fragrance", "parfum", "limonene", "linalool", "citronellol",
            "geraniol", "citral", "eugenol", "coumarin"],
    "에센셜오일": ["잎오일", "꽃오일", "껍질오일", "라벤더오일", "티트리", "페퍼민트", "유칼립투스", "leaf oil", "peel oil", "flower oil"],
    "알코올": ["에탄올", "변성알코올", "alcohol denat", "ethanol"],
    "자외선 차단": ["징크옥사이드", "티타늄디옥사이드", "에틸헥실메톡시신나메이트", "에틸헥실살리실레이트", "호모살레이트",
                "옥토크릴렌", "아보벤존", "부틸메톡시다이벤조일메탄", "비스-에틸헥실옥시페놀", "디에칠아미노하이드록시벤조일",
                "에틸헥실트리아존", "drometrizole", "zinc oxide", "titanium dioxide", "octocrylene", "avobenzone"],
    "세라마이드": ["세라마이드", "ceramide"],
    "판테놀": ["판테놀", "panthenol"],
    "펩타이드": ["펩타이드", "peptide"],
    "시카": ["병풀", "마데카소사이드", "아시아티코사이드", "마데카식애씨드", "아시아틱애씨드", "centella", "madecassoside"],
}
_COMPILED = {f: re.compile("|".join(re.escape(w) for w in ws), re.I) for f, ws in RULES.items()}


def families_of(name: str) -> list[str]:
    t = name.replace(" ", "")
    return [f for f, rx in _COMPILED.items() if rx.search(t)]


def cut_section(text: str) -> str:
    """'전성분' 표시 뒤부터 주의사항 등이 나오기 전까지. 표시가 없으면 전체."""
    t = re.sub(r"[ \t]+", " ", text)
    m = START.search(t)
    if m:
        t = t[m.end():]
    s = STOP.search(t)
    if s:
        t = t[: s.start()]
    return t


def clean(token: str) -> str:
    t = token.strip()
    t = re.sub(r"\(.*?\)|\[.*?\]", "", t)                       # 괄호 속 함량·설명 제거
    t = re.sub(r"\d+(\.\d+)?\s*(%|ppm|mg)", "", t, flags=re.I)
    t = re.sub(r"\s+", " ", t)
    return t.strip(" .·:：-_*\"'“”‘’|[]")


def _suspicious(name: str) -> bool:
    """사람이 한 번 보면 좋은 조각: 너무 짧거나, 글자가 아닌 것이 많거나, 숫자뿐인 경우."""
    letters = len(re.findall(r"[가-힣A-Za-z]", name))
    return len(name) < 2 or letters < max(2, len(name) // 2) or name.isdigit()


def analyze(text: str) -> dict:
    """전성분 글자 → {ingredients:[{name, families, status}], families, needs_review}. 같은 이름은 한 번만."""
    if len(text) > MAX_TEXT:
        raise ValueError("글이 너무 길어요. 전성분 부분만 붙여 넣어 주세요.")
    items, seen = [], set()
    for tok in SPLIT.split(cut_section(text)):
        name = clean(tok)
        key = name.replace(" ", "").lower()
        if not name or key in seen:
            continue
        seen.add(key)
        items.append({"name": name, "families": families_of(name),
                      "status": "확인 필요" if _suspicious(name) else "입력"})
        if len(items) > MAX_ITEMS:
            raise ValueError(f"성분이 {MAX_ITEMS}개를 넘어요. 전성분 부분만 붙여 넣어 주세요.")
    fams = sorted({f for it in items for f in it["families"]})
    return {"ingredients": items, "families": fams,
            "needs_review": [it["name"] for it in items if it["status"] == "확인 필요"]}
