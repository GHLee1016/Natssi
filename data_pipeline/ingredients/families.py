"""표준 성분명 → 성분 계열. 홍조·자극과 관련해 '이전에 신호가 났던 계열'을 알려 주는 데 쓴다.

효능을 말하지 않는다. 계열 이름은 앱 화면(레티노이드, 자외선 차단 …)과 맞춘다.
규칙은 한글 표준명(식약처) 또는 INCI에 들어가는 글자로 판단한다. 필요하면 추가한다.
"""
import re

RULES: dict[str, list[str]] = {
    "레티노이드": ["레티놀", "레티닐", "레티날", "레틴알", "레티노익", "레티노에이트", "retinol", "retinyl", "retinal", "retinoate"],
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


def tag(kor: str, inci: str = "") -> list[str]:
    text = f"{kor} {inci}".replace(" ", "") + " " + f"{kor} {inci}"
    return [f for f, rx in _COMPILED.items() if rx.search(text)]

# 직접 입력할 때 따로 물어볼 계열: 홍조·자극과 관련 있는데, 사람들이 '핵심 성분'으로는 잘 안 적는 것들
# (매장 사진 정답 20개에서 OCR이 가장 많이 놓친 계열도 판테놀·펩타이드·향료 같은 '뒤쪽' 성분이었다)
ASK_FAMILIES = ["향료", "알코올", "에센셜오일", "레티노이드", "AHA", "BHA", "비타민C"]
