"""전성분 글자 → 성분 목록(식약처 표준 이름)과 성분 계열. 앱 서버가 쓰는 입구.

실제 일은 juhee 브랜치에서 가져온 `ingr/`(식약처 화장품 원료성분 사전 21,968개 + 자모 단위 오타 보정)가 한다.
돌려주는 모양은 OCR 서버(허깅페이스 Space)의 결과와 같다 → 글자 입력·사진 OCR·직접 입력이 확인 화면 하나를 같이 쓴다.

status
- 일치:      사전에 그대로 있음
- 보정:      오타를 비슷한 표준 이름으로 고침(화면에 '입력한 글자'를 함께 보여 줌)
- 확인 필요: 사전에서 못 찾음 → 사용자가 고친다(지어내지 않음)
- 사전 없음: 사전 파일이 없을 때(배포 실수). 글자를 그대로 쓴다

원칙: 효능을 말하지 않고, 성분 이름을 지어내지 않는다.
"""
from .ingr import families as fam
from .ingr import parse, pipeline

MAX_TEXT = 8000
MAX_ITEMS = 200
FAMILY_NAMES = list(fam.RULES)
ASK_FAMILIES = fam.ASK_FAMILIES


def clean(token: str) -> str:
    return parse.clean(token)


def canonical(name: str) -> str:
    """같은 성분인지 가릴 때 쓰는 이름: 사전에 그대로 있으면 표준 이름('Glycerin'→'글리세린'), 없으면 정리한 글자."""
    c = clean(name)
    pipeline._matcher = pipeline._matcher or pipeline.Matcher()
    hit = pipeline._matcher.exact(c) if c else None
    return hit["kor"] if hit else c


def same_key(name: str) -> str:
    """공백·기호·대소문자를 무시한 비교 키."""
    return pipeline.norm(canonical(name))


def families_of(name: str) -> list[str]:
    return fam.tag(name)


def _shape(res: dict) -> dict:
    items = [{"name": i["kor"], "inci": i.get("inci", ""), "status": i["status"],
              "ocr": i.get("ocr", i["kor"]), "families": i.get("families", [])} for i in res["ingredients"]]
    if len(items) > MAX_ITEMS:
        raise ValueError(f"성분이 {MAX_ITEMS}개를 넘어요. 전성분 부분만 붙여 넣어 주세요.")
    return {"ingredients": items, "families": res["families"],
            "ask_families": [f for f in ASK_FAMILIES if f not in res["families"]],
            "needs_review": sum(i["status"] not in ("일치",) for i in items)}


def analyze(text: str) -> dict:
    """붙여 넣은 전성분 글자를 나누고 표준 이름에 맞춘다. 사람이 넣은 글이라 광고 문구 거르기는 하지 않는다."""
    if len(text) > MAX_TEXT:
        raise ValueError("글이 너무 길어요. 전성분 부분만 붙여 넣어 주세요.")
    if "성분" not in text:                      # '전성분' 머리말이 없으면 붙여서 전체를 성분 목록으로 본다
        text = "전성분: " + text
    return _shape(pipeline.from_text(text, select_lines=False))


def suggest(query: str, k: int = 8) -> list[dict]:
    """성분 이름 자동완성 → [{name, inci, families}]."""
    return [{"name": e["kor"], "inci": e.get("inci", ""), "families": fam.tag(e["kor"], e.get("inci", ""))}
            for e in pipeline.suggest(query.strip()[:40], k)]
