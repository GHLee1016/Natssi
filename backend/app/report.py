"""리포트 문장 만들기.

build_report(): 판정 기록만으로 정해진 틀의 문장을 조립합니다.
build_report_llm(): OpenRouter 무료 모델이 같은 사실을 자연스럽게 다듬습니다. 출력이 검사
(llm.guard + verify)를 통과하지 못하거나 호출이 실패하면 틀 문장으로 돌아갑니다.
"""
import re
from . import llm
from .judge import SIGNAL, NO_SIGNAL

DISCLAIMER = "진단이 아니에요. 증상이 계속되면 사용을 멈추고 보건소·전문의와 상담하세요."


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
            "max_sting": max((r["symptoms"]["따가움"] for r in sig), default=0),
            "env_unusual": any(r["env"]["unusual"] for r in sig),
            "calm_ids": [r["id"] for r in rows if r["verdict"]["level"] == NO_SIGNAL],
        })
    return facts


def build_report(judged, versions):
    sentences = []
    facts = build_facts(judged, versions)
    env_by_v = {sv.pop("version"): sv for sv in env_sentences(judged, versions)}   # 실제 환경 값이 있을 때만 생김
    for f in facts:
        if f["version"] == 1 or not f["change"]:
            continue
        days = f["signal_days"]
        if days and f["carried_over"]:    # 앞 버전의 신호가 바꾼 직후까지 이어진 경우
            sentences.append({"text": f"{f['phrase']} 뒤(버전 {f['version']}) 처음 {len(days)}일은 붉은기가 아직 평소 범위 밖이었어요.",
                              "cites": f["signal_ids"]})
        elif days:
            span = f"{_span(days)}일째"            # 빠진 날(예: 환경 때문에 구분 불가)은 '4, 6~7일째'처럼 끊어 보인다
            text = f"{f['phrase']} 뒤(버전 {f['version']}) {span} 양 볼 붉은기가 평소 범위를 넘었"
            text += f"고, 같은 기간 따가움 {f['max_sting']}점이 기록됐어요." if f["max_sting"] else "어요."
            sentences.append({"text": text, "cites": f["signal_ids"]})
            if not f["env_unusual"]:
                sentences.append({"text": "같은 날 미세먼지·습도는 평소와 비슷했어요.", "cites": f["signal_ids"]})
        if f["version"] in env_by_v:
            sentences.append(env_by_v.pop(f["version"]))
        if f["calm_ids"] and any(p["signal_ids"] for p in facts if p["version"] < f["version"]):
            sentences.append({"text": f"그 뒤 붉은기가 평소 범위로 돌아왔어요." if f["carried_over"] else
                              f"{f['phrase']} 뒤(버전 {f['version']}) 붉은기가 평소 범위로 돌아왔어요.",
                              "cites": f["calm_ids"]})
    sentences += [env_by_v[k] for k in sorted(env_by_v)]   # 바꾼 적 없는 버전(1) 등 남은 것
    if not sentences:
        sentences.append({"text": "아직 눈에 띄는 변화가 없어요.", "cites": [judged[-1]["id"]] if judged else []})
    for s in sentences:
        s["cite_label"] = f"근거: 기록 {_span(s['cites'])}" if s["cites"] else ""
    return {"sentences": sentences, "disclaimer": DISCLAIMER, "source": "template"}


def _env_blocked(judged):
    """붉은기가 평소 범위를 넘었지만 같은 때 환경도 크게 달라 '구분 불가'로 둔 기록 (실제 환경 값이 있을 때만)."""
    return [r for r in judged if r["verdict"].get("env_blocked") and r.get("env", {}).get("facts")]


def _facts_of(rows):
    facts = []
    for r in rows:
        facts += [f for f in r["env"]["facts"] if f not in facts]
    return " ".join(facts)


def env_sentences(judged, versions):
    """환경 때문에 '구분 불가'로 둔 날을 버전별로 한 문장씩. 사실만 말하고 '때문에'라고 하지 않는다.
    예: '물광 세럼 추가 뒤(버전 2) 3일째에도 붉은기가 평소 범위를 넘었지만, 그때는 전날 기온이 크게 바뀌었어요.
         그래서 그날은 바꾼 탓인지 가릴 수 없어 '구분 불가'로 두었어요.'"""
    out = []
    by_v = {v["id"]: v for v in versions}
    blocked = _env_blocked(judged)
    for vid in sorted({r["version"] for r in blocked}):
        rows = [r for r in blocked if r["version"] == vid]
        days = [r["day_in_version"] for r in rows]
        span = f"{_span(days)}일째"
        v = by_v.get(vid, {})
        head = f"{v.get('phrase') or v.get('label', '')} 뒤(버전 {vid}) " if v.get("change") else f"버전 {vid} "
        out.append({"version": vid, "text": f"{head}{span}에도 붉은기가 평소 범위를 넘었지만, 그때는 {_facts_of(rows)} "
                            "그래서 그날은 바꾼 탓인지 가릴 수 없어 '구분 불가'로 두었어요.",
                    "cites": [r["id"] for r in rows]})
    return out


def _label(s):
    s["cite_label"] = f"근거: 기록 {_span(s['cites'])}" if s["cites"] else ""
    return s


def build_report_llm(judged, versions):
    base = build_report(judged, versions)
    if not llm.enabled():
        return base
    res = llm.write_report(build_facts(judged, versions))
    if "sentences" not in res:
        return {**base, "llm_error": res.get("error"), "llm_problems": (res.get("problems") or [])[:3]}
    if verify(res["sentences"], judged):
        return {**base, "llm_error": "LLM 문장이 기록 대조를 통과하지 못했어요"}
    return {"sentences": [_label(s) for s in res["sentences"]], "disclaimer": DISCLAIMER,
            "source": "llm", "model": res["model"]}


QUESTIONS = [
    {"id": "cause", "q": "바꾼 제품 때문인 거예요?"},
    {"id": "other", "q": "다른 이유는 없었어요?"},
    {"id": "next", "q": "빈도를 줄이면 어떻게 봐요?"},
]


def answer(qid, judged, versions):
    facts = build_facts(judged, versions)
    sig = next((f for f in facts if f["signal_ids"]), None)
    cites = sig["signal_ids"] if sig else []
    if qid == "cause":
        text = ("원인을 단정할 수는 없어요. 다만 바꾼 시기와 붉은기가 오른 시기가 겹쳤어요. "
                "수면·생리 주기처럼 기록하지 않은 요인도 있을 수 있어요.")
    elif qid == "other":
        text = ("같은 기간 미세먼지와 습도는 평소와 비슷했어요. "
                "기록하지 않은 요인은 낯씨가 알 수 없어요.") if sig and not sig["env_unusual"] else \
               "같은 기간 환경도 평소와 달랐어요. 그래서 어느 쪽 때문인지 가릴 수 없어요."
        blocked = _env_blocked(judged)
        if blocked:   # 실제 환경 값이 있을 때: 환경이 크게 달랐던 날을 따로 알려 준다
            text += (f" 다만 기록 {_span([r['id'] for r in blocked])}에서는 {_facts_of(blocked)} "
                     "그날은 '구분 불가'로 두었어요.")
            cites = sorted(set(cites) | {r["id"] for r in blocked})
    elif qid == "next":
        text = "빈도를 바꾸면 새 버전으로 기록돼요. 그 뒤 붉은기가 평소 범위로 돌아오는지 2주 동안 비교해요."
        cites = []
    else:
        return None
    return {"text": text, "cites": cites, "cite_label": f"근거: 기록 {_span(cites)}" if cites else ""}


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
            actual = max(by_id[c]["symptoms"]["따가움"] for c in s["cites"] if c in by_id)
            if int(m.group(1)) != actual:
                problems.append(f"따가움 점수 불일치(문장 {m.group(1)}, 기록 {actual}): {s['text']}")
    return problems
