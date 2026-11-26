"""판정 결과(judge.judge_all)와 루틴 버전으로 화면용 요약을 만든다. 새 판정은 하지 않고 이미 나온 결과를 센다.

- recap: 월간 Skin Recap(한 달 동안 기록·날씨·바꾼 것·평소 범위를 넘은 기간)
- challenge: '한 번에 하나만 바꾸기 14일' — 평소 7일 기록 → 제품 하나 바꾸기 → 바꾼 뒤 7일 비교
- overlap: 흐림(평소 범위를 넘은 날)과 시기가 겹친 변경, 그 제품의 성분 계열, 지금 루틴에서 같은 계열이 든 제품
문장은 사실만 쓴다(원인 단정·효능·추천 표현 없음).
"""
from statistics import median

from . import config, judge

BASE_DAYS = 7      # 바꾸기 전 평소 기록(사진) 일수
AFTER_DAYS = 7     # 바꾼 뒤 지켜볼 기록(사진) 일수
LEVELS = [judge.NO_SIGNAL, judge.WATCH, judge.SIGNAL, judge.UNKNOWN]


def _fams(item):
    return item.get("families") or ([item["family"]] if item.get("family") else [])


def _md(iso):
    return f"{int(iso[5:7])}/{int(iso[8:10])}"


def _spans(dates):
    """연속된 날짜를 묶는다: ['11/16~11/19', '11/22']"""
    from datetime import date
    out, run = [], []
    for d in sorted(dates):
        if run and (date.fromisoformat(d) - date.fromisoformat(run[-1])).days != 1:
            out.append(run); run = []
        run.append(d)
    if run:
        out.append(run)
    return [f"{_md(r[0])}~{_md(r[-1])}" if len(r) > 1 else _md(r[0]) for r in out]


def diff(prev, cur):
    """두 버전 사이에 바뀐 제품: [{name, kind: added|removed|usage, families, usage?}]"""
    p = {i["key"]: i for i in (prev or {}).get("items", [])}
    c = {i["key"]: i for i in cur.get("items", [])}
    out = []
    for k, i in c.items():
        if k not in p:
            out.append({"name": i["name"], "kind": "added", "families": _fams(i)})
        elif p[k].get("usage") != i.get("usage"):
            out.append({"name": i["name"], "kind": "usage", "families": _fams(i), "usage": f"{p[k].get('usage')} → {i.get('usage')}"})
    for k, i in p.items():
        if k not in c:
            out.append({"name": i["name"], "kind": "removed", "families": _fams(i)})
    return out


def _photo(rows):
    return [r for r in rows if r["redness"] is not None]


def recap(records, versions, month=None):
    months = sorted({r["date"][:7] for r in records})
    if not months:
        return {"month": month, "months": [], "empty": True}
    month = month if month in months else months[-1]
    rows = [r for r in records if r["date"].startswith(month)]
    photo = _photo(rows)
    count = {lv: sum(1 for r in photo if r["verdict"]["level"] == lv) for lv in LEVELS}
    signal = [r["date"] for r in rows if r["verdict"]["level"] == judge.SIGNAL]
    symptom = [r for r in rows if any(v > 0 for v in (r.get("symptoms") or {}).values())]
    changes = [{"date": v["start"], "change": v["change"]} for v in versions if v.get("change") and str(v["start"])[:7] == month]
    judged = [r for r in photo if r["verdict"].get("baseline")]
    inside = sum(1 for r in judged if r["verdict"]["baseline"]["low"] <= r["redness"] <= r["verdict"]["baseline"]["high"])
    env_diff = sum(1 for r in rows if (r.get("env") or {}).get("unusual"))
    back = None
    if signal:
        after = [r for r in photo if r["date"] > signal[-1] and r["verdict"]["level"] == judge.NO_SIGNAL]
        back = after[0]["date"] if after else None
    lines = [f"{int(month[5:])}월에 {len(rows)}일 기록했어요. 그중 사진을 찍은 날은 {len(photo)}일이에요."]
    if judged:
        n = len(judged)
        lines.append(f"평소와 비교한 {n}일 모두 볼 붉은기가 평소 범위 안이었어요." if inside == n else
                     f"평소와 비교한 {n}일 모두 볼 붉은기가 평소 범위 밖이었어요." if inside == 0 else
                     f"평소와 비교한 {n}일 중 {inside}일은 볼 붉은기가 평소 범위 안이었어요.")
    for c in changes:
        lines.append(f"{_md(str(c['date']))}에 루틴을 바꿨어요: {c['change']}.")
    if signal:
        lines.append(f"{', '.join(_spans(signal))}에 붉은기가 평소 범위를 넘었어요(흐림 {len(signal)}일).")
    if back:
        lines.append(f"{_md(back)}부터 다시 평소 범위로 돌아왔어요.")
    if symptom:
        lines.append(f"증상을 적은 날은 {len(symptom)}일이에요.")
    if env_diff:
        lines.append(f"동네 환경(미세먼지, 습도, 기온)이 평소와 달랐던 날은 {env_diff}일이에요.")
    return {"month": month, "months": months, "empty": False, "days": len(rows), "photo_days": len(photo),
            "weather": count, "signal_spans": _spans(signal), "back_on": back, "changes": changes,
            "symptom_days": len(symptom), "env_diff_days": env_diff, "inside": inside, "judged": len(judged), "lines": lines,
            # 기록 칸 지도용: 그 달에 기록한 날마다 날씨(사진이 없으면 None)
            "cal": [{"date": r["date"], "level": r["verdict"]["level"] if r in photo else None} for r in rows]}


def challenge(records, versions):
    """한 번에 하나만 바꾸기 14일. rounds: 바꾼 버전마다의 결과, current: 지금 할 일."""
    by_v = {v["id"]: v for v in versions}
    rounds = []
    for v in versions:
        if not v.get("change"):
            continue
        prev = by_v.get(v["id"] - 1)
        before = _photo([r for r in records if r["version"] == v["id"] - 1])
        after = _photo([r for r in records if r["version"] == v["id"]])[:AFTER_DAYS]
        rnd = {"version": v["id"], "start": str(v["start"]), "change": v["change"], "changed": diff(prev, v),
               "before_days": len(before), "after_days": len(after), "done": len(after) >= AFTER_DAYS,
               "short_before": len(before) < BASE_DAYS}
        if prev and v.get("start") and prev.get("start"):
            from datetime import date
            gap = (date.fromisoformat(str(v["start"])) - date.fromisoformat(str(prev["start"]))).days
            rnd["too_soon"] = prev.get("change") is not None and gap < BASE_DAYS
        if before and after:
            b, a = median(r["redness"] for r in before), median(r["redness"] for r in after)
            rnd.update(before_median=round(b, 2), after_median=round(a, 2), delta=round(a - b, 2),
                       beyond=abs(a - b) > config.MDC95_A_STAR,
                       after_weather={lv: sum(1 for r in after if r["verdict"]["level"] == lv) for lv in LEVELS})
        rounds.append(rnd)
    last = rounds[-1] if rounds else None
    cur_v = versions[-1]["id"] if versions else 1
    if last and last["version"] == cur_v and not last["done"]:
        current = {"phase": "watching", "have": last["after_days"], "need": AFTER_DAYS,
                   "progress": min(last["before_days"], BASE_DAYS) + last["after_days"], "round": last}
    elif last and last["version"] == cur_v:                     # 마지막 변경의 7일이 끝남 → 결과를 먼저 보여 주고, 다음 변경은 그다음
        current = {"phase": "done", "have": AFTER_DAYS, "need": AFTER_DAYS, "progress": BASE_DAYS + AFTER_DAYS, "round": last}
    else:
        base = len(_photo([r for r in records if r["version"] == cur_v]))
        current = {"phase": "ready" if base >= BASE_DAYS else "baseline", "have": min(base, BASE_DAYS), "need": BASE_DAYS,
                   "progress": min(base, BASE_DAYS)}
    current["total"] = BASE_DAYS + AFTER_DAYS
    return {"current": current, "rounds": rounds}


def overlap(records, versions):
    """흐림과 시기가 겹친 변경. 앞 버전의 흐림이 이어진 날(carried over)은 빼고, 바꾼 뒤 새로 생긴 흐림만 본다."""
    from . import report
    facts = {f["version"]: f for f in report.build_facts(records, versions)}
    by_v = {v["id"]: v for v in versions}
    current = versions[-1] if versions else {"items": []}
    out = []
    for v in versions:
        f = facts.get(v["id"])
        if not v.get("change") or not f or not f["signal_ids"] or f["carried_over"]:
            continue
        changed = [c for c in diff(by_v.get(v["id"] - 1), v) if c["kind"] in ("added", "usage")]
        fams = sorted({x for c in changed for x in c["families"]})
        dates = [r["date"] for r in records if r["id"] in f["signal_ids"]]
        same = [{"name": i["name"], "families": [x for x in _fams(i) if x in fams]}
                for i in current.get("items", []) if any(x in fams for x in _fams(i))]
        out.append({"version": v["id"], "change": v["change"], "spans": _spans(dates), "changed": changed,
                    "families": fams, "in_current": same})
    return out


def build(records, versions, month=None):
    return {"recap": recap(records, versions, month), "challenge": challenge(records, versions),
            "overlap": overlap(records, versions)}
