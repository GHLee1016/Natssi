"""내 루틴: 제품을 더하거나 빼면 '버전'이 새로 생깁니다. 판정은 이 버전 날짜를 기준으로 전후를 비교합니다.

- 같은 날 여러 번 바꾸면 한 버전으로 묶습니다(처음 루틴을 등록할 때 제품을 여러 개 넣을 수 있게).
- 다른 날 바꾸면 새 버전입니다. 직전 버전이 바뀐 지 7일이 안 됐다면 경고를 돌려줍니다(막지는 않음):
  한 번에 하나만 바꿔야 무엇이 원인인지 알 수 있어서입니다.
- 사용자 데이터는 {"versions": [...]} 한 덩어리로 저장하고, 화면에는 김서연 데모의 /api/routine 과 같은 모양으로 돌려줍니다.
"""
import uuid
from datetime import date

from . import ingredients

USAGES = ["매일 아침", "매일 저녁", "아침·저녁", "주 2~3회", "필요할 때"]
MAX_ITEMS = 30
GAP_DAYS = 7


class RoutineError(ValueError):
    """사용자에게 그대로 보여줘도 되는 오류."""


def _items(data: dict) -> list:
    return list(data["versions"][-1]["items"]) if data.get("versions") else []


def _commit(data: dict, today: date, items: list, op: str, reason: str | None) -> list[str]:
    """새 항목 목록을 반영한다. 같은 날이면 마지막 버전을 고치고, 아니면 새 버전을 만든다. 경고 문구 목록을 돌려준다."""
    vs = data.setdefault("versions", [])
    warnings = []
    iso = today.isoformat()
    if vs and vs[-1]["start"] == iso:
        v = vs[-1]
        v["items"] = items
        v["ops"] = [*v.get("ops", []), op]
        v["change"] = None if v["id"] == 1 else ", ".join(v["ops"])
        if reason and v["id"] >= 2:                            # 처음 등록한 날(버전 1)은 '바꾼' 것이 아니라 출발점이라 이유를 남기지 않는다
            v["reason"] = reason
        if v["id"] >= 2 and len(v["ops"]) >= 2:                 # 처음 등록한 날(버전 1)은 여러 개를 넣어도 되지만, 그 뒤에는 하루에 하나씩
            warnings.append("오늘 루틴을 이미 한 번 바꿨어요. 한 번에 하나씩 바꿔야 무엇이 원인인지 알 수 있어요.")
        return warnings
    if vs and vs[-1]["id"] >= 2 and (today - date.fromisoformat(vs[-1]["start"])).days < GAP_DAYS:
        warnings.append("최근 7일 안에 루틴을 이미 한 번 바꿨어요. 한 번에 하나씩 바꿔야 무엇이 원인인지 알 수 있어요.")
    first = not vs                                            # 처음 등록한 루틴은 '변화'가 아니라 출발점이다
    vs.append({"id": len(vs) + 1, "start": iso, "ops": [op], "change": None if first else op, "reason": reason, "items": items})
    return warnings


def add_item(data: dict, today: date, name: str, usage: str, names: list[str], reason: str | None = None,
             extra_families: list[str] = ()) -> list[str]:
    name = name.strip()
    if not name:
        raise RoutineError("제품 이름을 입력해 주세요.")
    if usage not in USAGES:
        raise RoutineError("사용 빈도를 골라 주세요.")
    items = _items(data)
    if len(items) >= MAX_ITEMS:
        raise RoutineError(f"제품은 {MAX_ITEMS}개까지 등록할 수 있어요.")
    if any(i["name"] == name for i in items):
        raise RoutineError("같은 이름의 제품이 이미 있어요.")
    clean = []
    for n in names:                                           # 서버가 한 번 더 정리한다(브라우저에서 고친 값도 믿지 않음)
        c = ingredients.clean(n)
        if c and c not in clean:
            clean.append(c)
    if len(clean) > ingredients.MAX_ITEMS:
        raise RoutineError("성분이 너무 많아요. 전성분 부분만 넣어 주세요.")
    bad = [f for f in extra_families if f not in ingredients.FAMILY_NAMES]
    if bad:
        raise RoutineError("알 수 없는 성분 계열이에요.")
    # 성분에서 찾은 계열 + 사용자가 '들어 있어요'라고 체크한 계열(글자·OCR이 뒤쪽 성분을 놓치는 경우가 많아서)
    fams = sorted({f for n in clean for f in ingredients.families_of(n)} | set(extra_families))
    item = {"key": uuid.uuid4().hex[:8], "name": name, "usage": usage, "kind": "cosmetic",
            "family": fams[0] if fams else "", "families": fams, "ingredients": clean}
    return _commit(data, today, [*items, item], f"{name} 추가 ({usage})", reason)


REASONS = ["자극이 있어서", "더 자주 쓰려고", "그냥 바꿔 봤어요"]


def change_usage(data: dict, today: date, key: str, usage: str, reason: str | None = None) -> list[str]:
    """이미 등록한 제품의 사용 빈도를 바꾼다(예: 매일 저녁 → 주 2~3회). 새 버전이 생긴다."""
    if usage not in USAGES:
        raise RoutineError("사용 빈도를 골라 주세요.")
    items = _items(data)
    old = next((i for i in items if i["key"] == key), None)
    if not old:
        raise RoutineError("그 제품을 찾지 못했어요.")
    if old["usage"] == usage:
        raise RoutineError("지금과 같은 사용 빈도예요.")
    return _commit(data, today, [{**i, "usage": usage} if i["key"] == key else i for i in items],
                   f"{old['name']} {old['usage']} → {usage}", reason)


def remove_item(data: dict, today: date, key: str, reason: str | None = None) -> list[str]:
    items = _items(data)
    gone = next((i for i in items if i["key"] == key), None)
    if not gone:
        raise RoutineError("그 제품을 찾지 못했어요.")
    return _commit(data, today, [i for i in items if i["key"] != key], f"{gone['name']} 사용 중단", reason)


def is_setup_day(data: dict, today: date) -> bool:
    """오늘이 처음 루틴을 등록한 날인가(이날 바꾸는 것은 '변경'이 아니라 등록이라 이유를 묻지 않는다)."""
    vs = data.get("versions", [])
    return bool(vs) and vs[-1]["id"] == 1 and vs[-1]["start"] == today.isoformat()


def payload(data: dict) -> dict:
    """화면용: {current, versions}. 아직 등록한 제품이 없으면 current 는 None."""
    vs = data.get("versions", [])

    def one(v):
        return {"id": v["id"], "start": v["start"], "label": v["change"] or "처음 등록한 루틴", "change": v["change"],
                "reason": v.get("reason"),
                "items": [{"key": i["key"], "name": i["name"], "usage": i["usage"], "kind": i["kind"],
                           "family": i["family"] or "성분", "families": i["families"], "ingredients": i["ingredients"]}
                          for i in v["items"]]}

    return {"current": one(vs[-1]) if vs else None, "versions": [one(v) for v in vs], "usages": USAGES, "reasons": REASONS}
