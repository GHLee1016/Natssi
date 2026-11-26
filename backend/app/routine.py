"""내 루틴: 제품을 더하거나 빼면 '버전'이 새로 생깁니다. 판정은 이 버전 날짜를 기준으로 전후를 비교합니다.

- 같은 날 여러 번 바꾸면 한 버전으로 묶습니다(처음 루틴을 등록할 때 제품을 여러 개 넣을 수 있게).
- 다른 날 바꾸면 새 버전입니다. 직전 버전이 바뀐 지 7일이 안 됐다면 경고를 돌려줍니다(막지는 않음):
  한 번에 하나만 바꿔야 무엇이 원인인지 알 수 있어서입니다.
- 사용자 데이터는 {"versions": [...]} 한 덩어리로 저장하고, 화면에는 김서연 데모의 /api/routine 과 같은 모양으로 돌려줍니다.
"""
import uuid
from datetime import date, timedelta

from . import ingredients

USAGES = ["매일 아침", "매일 저녁", "아침·저녁", "주 2~3회", "필요할 때"]
MAX_ITEMS = 30
# 제품 사진 대신 고를 수 있는 모양 아이콘(frontend/src/icons.jsx의 PRODUCT 키). 고르지 않으면 화면이 성분 계열로 정한다
ICONS = ("cleanser", "retinol", "cream", "tube", "mist", "sun")
GAP_DAYS = 7
BACKDATE_DAYS = 60        # 바꾼 날을 며칠 전까지 고를 수 있나(제품을 바꾼 날 바로 기록하지 못하는 경우)


class RoutineError(ValueError):
    """사용자에게 그대로 보여줘도 되는 오류."""


def earliest_day(data: dict, today: date) -> date:
    """고를 수 있는 가장 이른 날: BACKDATE_DAYS일 전, 그리고 마지막으로 바꾼 날보다 앞서지 않게(순서가 섞이지 않게)."""
    lo = today - timedelta(days=BACKDATE_DAYS)
    vs = data.get("versions") or []
    return max(lo, date.fromisoformat(vs[-1]["start"])) if vs else lo


def change_day(data: dict, today: date, on: date | None) -> date:
    """사용자가 고른 '바꾼 날'을 확인한다. 고르지 않으면 오늘."""
    if on is None:
        return today
    if on > today:
        raise RoutineError("오늘 이후 날짜는 고를 수 없어요.")
    vs = data.get("versions") or []
    if vs and on < date.fromisoformat(vs[-1]["start"]):
        last = date.fromisoformat(vs[-1]["start"])
        raise RoutineError(f"마지막으로 바꾼 날({last.month}/{last.day})보다 앞 날짜는 고를 수 없어요.")
    if on < today - timedelta(days=BACKDATE_DAYS):
        raise RoutineError(f"{BACKDATE_DAYS}일 전까지만 고를 수 있어요.")
    return on


def set_first_start(data: dict, today: date, on: date) -> None:
    """처음 루틴(1번째)을 언제부터 썼는지 고친다. 등록을 늦게 해서, 그 전 기록도 처음 루틴에 넣고 싶을 때.
    다음 버전의 시작일보다 앞이어야 하고, BACKDATE_DAYS일 전까지만."""
    vs = data.get("versions") or []
    if not vs:
        raise RoutineError("먼저 제품을 등록해 주세요.")
    if on > today:
        raise RoutineError("오늘 이후 날짜는 고를 수 없어요.")
    if on < today - timedelta(days=BACKDATE_DAYS):
        raise RoutineError(f"{BACKDATE_DAYS}일 전까지만 고를 수 있어요.")
    if len(vs) > 1 and on >= date.fromisoformat(vs[1]["start"]):
        nxt = date.fromisoformat(vs[1]["start"])
        raise RoutineError(f"2번째 루틴을 시작한 날({nxt.month}/{nxt.day})보다 앞 날짜로 골라 주세요.")
    vs[0]["start"] = on.isoformat()


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
            warnings.append("오늘 이미 루틴을 바꿨어요. 하나씩 바꿔야 붉은기가 어느 제품을 바꾼 시기와 겹쳤는지 알 수 있어요.")
        return warnings
    if vs and vs[-1]["id"] >= 2 and (today - date.fromisoformat(vs[-1]["start"])).days < GAP_DAYS:
        warnings.append("지난번에 바꾼 지 7일이 안 됐어요. 하나씩 바꿔야 붉은기가 어느 제품을 바꾼 시기와 겹쳤는지 알 수 있어요.")
    first = not vs                                            # 처음 등록한 루틴은 '변화'가 아니라 출발점이다
    vs.append({"id": len(vs) + 1, "start": iso, "ops": [op], "change": None if first else op, "reason": reason, "items": items})
    return warnings


def add_item(data: dict, today: date, name: str, usage: str, names: list[str], reason: str | None = None,
             extra_families: list[str] = (), recent: bool = False, photo: str | None = None,
             icon: str | None = None) -> list[str]:
    """recent: 처음 등록하는 루틴(버전 1)에 넣는 제품을 '최근 2주 안에 쓰기 시작했다'고 표시. 이 제품은 쓰기 전 기록이 없어
    판정의 기준(평소) 안에 들어가므로, 화면에서 '지금은 판단할 수 없어요'라고 알린다. 나중에 추가하는 제품은 그 자체가 변화라 무시."""
    name = name.strip()
    if not name:
        raise RoutineError("제품 이름을 입력해 주세요.")
    if usage not in USAGES:
        raise RoutineError("사용 빈도를 골라 주세요.")
    items = _items(data)
    if len(items) >= MAX_ITEMS:
        raise RoutineError(f"제품은 {MAX_ITEMS}개까지 등록돼요.")
    if any(i["name"] == name for i in items):
        raise RoutineError("같은 이름의 제품이 이미 있어요.")
    clean, seen = [], set()
    for n in names:                                           # 서버가 한 번 더 정리한다(브라우저에서 고친 값도 믿지 않음)
        c = ingredients.canonical(n)                          # 'Glycerin'·'글리 세린'도 '글리세린' 하나로
        k = ingredients.same_key(c)
        if c and k not in seen:
            seen.add(k)
            clean.append(c)
    if len(clean) > ingredients.MAX_ITEMS:
        raise RoutineError("성분이 너무 많아요. 전성분 부분만 넣어 주세요.")
    if icon is not None and icon not in ICONS:
        raise RoutineError("알 수 없는 아이콘이에요.")
    bad = [f for f in extra_families if f not in ingredients.FAMILY_NAMES]
    if bad:
        raise RoutineError("알 수 없는 성분 계열이에요.")
    # 성분에서 찾은 계열 + 사용자가 '들어 있어요'라고 체크한 계열(글자·OCR이 뒤쪽 성분을 놓치는 경우가 많아서)
    fams = sorted({f for n in clean for f in ingredients.families_of(n)} | set(extra_families))
    vs = data.get("versions", [])
    first = not vs or (vs[-1]["id"] == 1 and vs[-1]["start"] == today.isoformat())
    item = {"key": uuid.uuid4().hex[:8], "name": name, "usage": usage, "kind": "cosmetic",
            "family": fams[0] if fams else "", "families": fams, "ingredients": clean, "recent": bool(recent and first),
            **({"photo": photo} if photo else {}),                    # 제품 사진: 검사한 작은 JPEG의 base64(선택)
            **({"icon": icon} if icon and not photo else {})}        # 사진 대신 고른 모양 아이콘(선택)
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


def set_look(data: dict, key: str, photo: str | None = None, icon: str | None = None) -> None:
    """제품이 목록에 보이는 모습(사진 또는 아이콘)만 바꾼다. 루틴을 바꾼 게 아니라서 새 버전을 만들지 않고,
    같은 제품이 들어 있는 모든 버전에 똑같이 반영한다(지난 버전을 볼 때도 같은 모습). photo가 있으면 사진, 없으면 icon(None = 자동)."""
    if icon is not None and icon not in ICONS:
        raise RoutineError("알 수 없는 아이콘이에요.")
    found = False
    for v in data.get("versions", []):
        for i in v["items"]:
            if i["key"] == key:
                found = True
                i.pop("photo", None); i.pop("icon", None)
                if photo:
                    i["photo"] = photo
                elif icon:
                    i["icon"] = icon
    if not found:
        raise RoutineError("그 제품을 찾지 못했어요.")


def is_setup_day(data: dict, today: date) -> bool:
    """오늘이 처음 루틴을 등록한 날인가(이날 바꾸는 것은 '변경'이 아니라 등록이라 이유를 묻지 않는다)."""
    vs = data.get("versions", [])
    return bool(vs) and vs[-1]["id"] == 1 and vs[-1]["start"] == today.isoformat()


def _josa(word: str, a: str, b: str) -> str:
    """받침 있으면 a(을), 없으면 b(를). 한글이 아니면 a/b 병기."""
    ch = word.strip()[-1:] if word.strip() else ""
    if "가" <= ch <= "힣":
        return word + (a if (ord(ch) - 0xAC00) % 28 else b)
    return f"{word}{a}({b})"


def phrase(change: str | None) -> str | None:
    """'X 추가 (매일 저녁)' → 'X를 추가한' 처럼 리포트 문장 앞부분. 여러 개를 한 번에 바꿨으면 '루틴을 바꾼'."""
    if not change:
        return None
    ops = change.split(", ")
    if len(ops) > 1:
        return "루틴을 바꾼"
    op = ops[0]
    if op.endswith(" 사용 중단"):
        return f"{op[:-len(' 사용 중단')]} 사용을 멈춘"
    for u in USAGES:                                       # 'X 매일 저녁 → 주 2~3회'
        if f" {u} → " in op:
            return f"{op.split(f' {u} → ')[0]} 사용 빈도를 바꾼"
    if " 추가" in op:
        return _josa(op.split(" 추가")[0], "을", "를") + " 추가한"
    return "루틴을 바꾼"


def payload(data: dict) -> dict:
    """화면용: {current, versions}. 아직 등록한 제품이 없으면 current 는 None."""
    vs = data.get("versions", [])

    def one(v):
        return {"id": v["id"], "start": v["start"], "label": v["change"] or "처음 등록한 루틴", "change": v["change"],
                "phrase": phrase(v["change"]),
                "reason": v.get("reason"),
                "items": [{"key": i["key"], "name": i["name"], "usage": i["usage"], "kind": i["kind"],
                           "family": i["family"] or "성분", "families": i["families"], "ingredients": i["ingredients"],
                           "recent": i.get("recent", False),
                           "photo": ("data:image/jpeg;base64," + i["photo"]) if i.get("photo") else None,
                           "icon": i.get("icon")}
                          for i in v["items"]]}

    return {"current": one(vs[-1]) if vs else None, "versions": [one(v) for v in vs], "usages": USAGES, "reasons": REASONS}
