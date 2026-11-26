"""리포트 문장 만들기.

build_report(): 판정 기록만으로 정해진 틀의 문장을 조립합니다.
build_report_llm(): Claude API(Claude Sonnet 5.5)가 같은 사실을 자연스럽게 다듬습니다. 출력이 검사
(llm.guard + verify)를 통과하지 못하거나 호출이 실패하면 틀 문장으로 돌아갑니다.
"""
import re
from . import env, llm
from .judge import SIGNAL, NO_SIGNAL

DISCLAIMER = "이 리포트는 의료 진단이 아니에요. 피부 증상이 계속되면 해당 제품 사용을 중단하고 피부과 전문의와 상담해 주세요."


def _span(ids):
    """[9,10,12,13] -> '9~10, 12~13' (빠진 번호를 연속 범위로 보이지 않게 구간별로 접는다)"""
    runs = []
    for i in sorted(set(ids)):
        if runs and i == runs[-1][1] + 1:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return ", ".join(str(a) if a == b else f"{a}~{b}" for a, b in runs)


def build_facts(judged, versions):
    facts = []
    for v in versions:
        rows = [r for r in judged if r["version"] == v["id"]]
        sig = [r for r in rows if r["verdict"]["level"] == SIGNAL]
        days = [r["day_in_version"] for r in sig]
        # 앞 버전의 신호가 바꾼 직후 처음 며칠까지 이어졌는가 (바꾼 탓이 아니라 아직 남은 것)
        prev_signal = any(p["signal_ids"] for p in facts if p["version"] == v["id"] - 1)
        facts.append({
            "carried_over": bool(prev_signal and days and days == list(range(1, len(days) + 1))),
            "version": v["id"], "label": v["label"], "change": v["change"], "reason": v["reason"],
            "phrase": v.get("phrase") or v["label"],
            "signal_ids": [r["id"] for r in sig],
            "signal_days": [r["day_in_version"] for r in sig],
            "max_sting": max((r["symptoms"].get("따가움", 0) for r in sig), default=0),
            "env_unusual": any(r["env"].get("unusual") for r in sig),
            "envs": [r["env"] for r in sig],
            "calm_ids": [r["id"] for r in rows if r["verdict"]["level"] == NO_SIGNAL],
        })
    return facts


def _no_red_text(judged):
    """흐린 날이 없을 때의 문장. 평소 범위와 비교한 기록이 0일이면 '붉은 날이 없었다'고 하지 않는다."""
    if any(r["verdict"].get("baseline") for r in judged):
        return "비교한 기록 중 평소보다 붉은 날은 없었어요."
    return "아직 비교할 기록이 없어요. 사진 기록을 더 남기면 붉은기 변화를 확인할 수 있어요."


def build_report(judged, versions):
    sentences = []
    facts = build_facts(judged, versions)
    for f in facts:
        if (f["version"] == 1 or not f["change"]) and f["signal_ids"]:   # 루틴을 바꾸지 않은 기간에 평소 범위를 넘음
            md = lambda iso: f"{int(iso[5:7])}월 {int(iso[8:10])}일"
            ds = [r["date"] for r in judged if r["id"] in f["signal_ids"]]
            span = f"{md(ds[0])}부터 {md(ds[-1])}까지" if len(ds) > 1 else f"{md(ds[0])}에"
            sentences.append({"text": f"{span} 평소보다 볼이 붉었어요. 이 기간에 루틴 변경은 없었어요.",
                              "cites": f["signal_ids"]})
            continue
        if f["version"] == 1 or not f["change"]:
            continue
        days = f["signal_days"]
        if days and f["carried_over"]:    # 앞 버전의 신호가 바꾼 직후까지 이어진 경우
            sentences.append({"text": f"{f['phrase']} 뒤 {'첫날에도' if len(days) == 1 else f'처음 {len(days)}일 동안에도'} 붉은기가 평소보다 높았어요. 루틴을 바꾸기 전부터 이어진 변화예요.",
                              "cites": f["signal_ids"]})
        elif days:
            span = f"{days[0]}일째부터 {days[-1]}일째까지" if len(days) > 1 else f"{days[0]}일째에"
            text = f"{f['phrase']} 뒤 {span} 볼이 평소보다 붉었어요."
            if f["max_sting"]:
                text += f" 같은 기간에 따가움 {f['max_sting']}점(최고 점수)도 기록됐어요."
            sentences.append({"text": text, "cites": f["signal_ids"]})
            if not f["env_unusual"]:                 # 환경이 평소와 달랐던 날은 판정이 이미 '구분 불가'라 여기 오지 않는다
                for t in env.summarize(f["envs"]):   # 실제 측정값에서 나온 사실 문장(없으면 '평소와 비슷했어요')
                    sentences.append({"text": t, "cites": f["signal_ids"]})
        if f["calm_ids"] and any(p["signal_ids"] for p in facts if p["version"] < f["version"]):
            sentences.append({"text": "이후 붉은기가 평소 범위 안으로 돌아온 기록이 있었어요." if f["carried_over"] else
                              f"{f['phrase']} 뒤에는 붉은기가 평소 범위 안으로 돌아온 기록이 있었어요.",
                              "cites": f["calm_ids"]})
    if not sentences:
        sentences.append({"text": _no_red_text(judged), "cites": [judged[-1]["id"]] if judged else []})
    for s in sentences:
        s["cite_label"] = f"참고 기록: {_span(s['cites'])}" if s["cites"] else ""
    return {"sentences": sentences, "disclaimer": DISCLAIMER, "source": "template"}


def _label(s):
    s["cite_label"] = f"참고 기록: {_span(s['cites'])}" if s["cites"] else ""
    return s


def pseudonymize(versions):
    """AI 모델에 보낼 버전 정보: 제품 이름·사용 빈도·이유·날짜를 빼고 '무엇을 바꿨는지'의 종류만 남긴다."""
    def kind(change):
        if not change:
            return None
        ops = change.split(", ")
        if len(ops) > 1:
            return "루틴을 바꾼"
        op = ops[0]
        return "제품 하나를 뺀" if op.endswith("사용 중단") else "사용 빈도를 바꾼" if "→" in op else "제품 하나를 더한" if "추가" in op else "루틴을 바꾼"
    return [{"id": v["id"], "label": kind(v["change"]) or "처음 루틴", "phrase": kind(v["change"]) or "처음 루틴",
             "change": kind(v["change"]), "reason": None} for v in versions]


def build_report_llm(judged, versions, llm_versions=None):
    """llm_versions: AI에 보낼 버전 정보(내 기록은 pseudonymize 결과). 없으면 versions(가상 데모)."""
    base = build_report(judged, versions)
    if not llm.enabled():
        return base
    res = llm.write_report(build_facts(judged, llm_versions or versions))
    if "sentences" not in res:
        return {**base, "llm_error": res.get("error"), "llm_problems": (res.get("problems") or [])[:3]}
    if verify(res["sentences"], judged):
        return {**base, "llm_error": "LLM 문장이 기록 대조를 통과하지 못했어요"}
    return {"sentences": [_label(s) for s in res["sentences"]], "disclaimer": DISCLAIMER,
            "source": "llm", "model": res["model"]}


QUESTIONS = [
    {"id": "cause", "q": "바꾼 제품과 관련이 있을까요?"},
    {"id": "other", "q": "다른 이유도 있을까요?"},
    {"id": "next", "q": "사용 횟수를 줄이면 어떻게 비교하나요?"},
]


def answer(qid, judged, versions):
    facts = build_facts(judged, versions)
    sig = next((f for f in facts if f["signal_ids"]), None)
    cites = sig["signal_ids"] if sig else []
    if qid in ("cause", "other") and not sig:                   # 평소 범위를 넘은(흐림) 날이 없음
        text = _no_red_text(judged)
    elif qid == "cause" and not sig["change"]:                   # 루틴을 바꾸지 않은 기간에 넘음
        text = ("이 기간에는 루틴 변경이 없었어요. 기록만으로 제품과 피부 변화의 관계를 알기는 어려워요. "
                "수면, 생리 주기, 조명처럼 기록하지 않은 요인도 영향을 줄 수 있어요.")
    elif qid == "cause":
        text = ("제품이 원인인지는 알 수 없어요. 루틴을 바꾼 시기에 붉은기가 높아진 기록이 있었어요. "
                "수면이나 생리 주기처럼 기록하지 않은 요인도 영향을 줄 수 있어요.")
    elif qid == "other":
        text = (" ".join(env.summarize(sig["envs"])) + " 수면이나 생리 주기처럼 기록하지 않은 요인도 영향을 줄 수 있어요.") if sig and not sig["env_unusual"] else \
               "같은 기간에 환경 정보도 평소와 달랐어요. 이 기록만으로는 피부 변화의 원인을 알 수 없어요."
    elif qid == "next":
        text = "사용 횟수를 바꾼 날짜가 기록돼요. 이후 2주 동안 붉은기 변화를 비교할 수 있어요."
        cites = []
    else:
        return None
    return {"text": text, "cites": cites, "cite_label": f"참고 기록: {_span(cites)}" if cites else ""}


def verify(sentences, judged):
    """문장이 인용한 기록 번호가 실제로 있고, 문장 속 '따가움 N점'이 그 기록과 맞는지 확인."""
    by_id = {r["id"]: r for r in judged}
    problems = []
    for s in sentences:
        for c in s["cites"]:
            if c not in by_id:
                problems.append(f"없는 기록 번호 {c}: {s['text']}")
        m = re.search(r"따가움 (\d)점", s["text"])
        if m and s["cites"]:
            actual = max(by_id[c]["symptoms"].get("따가움", 0) for c in s["cites"] if c in by_id)
            if int(m.group(1)) != actual:
                problems.append(f"따가움 점수 불일치(문장 {m.group(1)}, 기록 {actual}): {s['text']}")
    return problems
