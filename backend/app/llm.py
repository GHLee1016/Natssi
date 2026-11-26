"""Claude API(Claude Sonnet 5.5)로 리포트 문장을 다듬습니다.

원칙
  - LLM에는 판정 기록에서 뽑은 사실(facts)만 줍니다. 사진·이름·원본 기록은 보내지 않습니다.
  - 응답 형식은 구조화 출력(JSON 스키마)으로 고정하고, 내용은 guard()를 통과해야만 씁니다.
    하나라도 걸리거나 호출이 실패·거절되면 정해진 틀(template) 문장으로 돌아갑니다.
  - ANTHROPIC_API_KEY 가 없으면 호출하지 않습니다.
"""
import contextvars
import hashlib
import json
import logging
import os
import re
import time
import anthropic

DEFAULT_MODEL = "claude-sonnet-5-5"          # 환경변수 ANTHROPIC_MODEL 로 바꿀 수 있음
BANNED = ["진단", "치료", "완치", "질환", "피부염", "알레르기", "염증", "부작용", "처방", "때문에", "때문이", "원인은", "효과가 있", "개선됩니다", "추천"]

_client = None                               # anthropic.Anthropic (테스트에서는 가짜로 바꿔 끼움)
_cache: dict[str, dict] = {}

# AI 호출 기록(SEC-08): 시각, 누가(가명), 무엇(kind), 모델, 결과, 토큰 수, 걸린 시간만 남긴다. 질문·답·기록 내용과 키는 남기지 않는다.
CALLER = contextvars.ContextVar("natssi_ai_caller", default="-")
audit_log = logging.getLogger("natssi.ai")
if not audit_log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    audit_log.addHandler(_h)
    audit_log.setLevel(logging.INFO)
    audit_log.propagate = False


def caller_id(raw: str) -> str:
    """사용자 id나 IP를 그대로 남기지 않도록 짧은 해시로."""
    return hashlib.sha256(("natssi:" + str(raw)).encode()).hexdigest()[:12]


def audit(kind: str, status: str, model_name: str | None = None, res=None, started: float | None = None):
    usage = getattr(res, "usage", None)
    audit_log.info(json.dumps({
        "event": "ai_call", "kind": kind, "who": CALLER.get(), "model": model_name or getattr(res, "model", None),
        "status": status, "in": getattr(usage, "input_tokens", None), "out": getattr(usage, "output_tokens", None),
        "ms": round((time.monotonic() - started) * 1000) if started else None}, ensure_ascii=False))

SYSTEM = """너는 피부 기록 앱 '낯씨'의 리포트 문장을 쓰는 역할이다.
입력으로 주어지는 facts(JSON)에 있는 사실만 한국어 해요체로 풀어 쓴다.

규칙
1. facts에 없는 내용, 숫자, 날짜를 만들지 않는다.
2. 원인을 단정하지 않는다. "~때문에"라고 쓰지 않고 "시기가 겹쳤어요"처럼 사실만 말한다.
3. 질환명, 진단, 치료, 효능, 제품 추천을 쓰지 않는다.
4. 문장은 2~4개. 각 문장은 80자 이내.
5. 각 문장에는 근거가 된 기록 번호를 cites 배열로 붙인다. 번호는 facts의 signal_ids, calm_ids 안에 있는 것만 쓴다.
6. 문장 본문에는 기록 번호를 쓰지 않는다. 번호는 cites 배열에만 넣는다. 괄호로 번호를 나열하지 않는다.
7. signal_ids가 있는 버전은 문장에 증상 이름과 평소 범위 초과 여부를 한 번 쓴다. 붉은기가 평소 범위를 넘었다고 쓰고, max_sting이 0보다 크면 "따가움 N점이 기록됐어요"처럼 점수를 함께 쓴다. max_sting이 0이면 따가움은 언급하지 않는다. signal_days가 있으면 "N일째"로 시점도 쓴다. "자극 기록이 있었어요"처럼 증상 이름 없이 뭉뚱그리지 않는다. "변화는 N일째"처럼 대상이 흐린 말 대신 "바꾼 지 N일째"라고 쓴다.
8. carried_over가 true이면 앞 버전의 신호가 바꾼 직후까지 이어진 것이다. "붉은기가 아직 평소 범위 밖이었어요"라고 쓰고, 바꾼 뒤에 생겼다거나 바꿔서 나빠졌다는 뜻으로 읽히지 않게 한다.
9. 신호가 없는 구간(calm_ids)은 "기록이 없었어요" 대신 "붉은기와 따가움이 평소 범위 안이었어요"라고 쓴다.
10. calm_ids 중 번호가 앞선 signal_ids보다 큰(신호 뒤에 온) 기록이 있을 때만 "그 뒤 붉은기가 평소 범위로 돌아왔어요"를 마지막에 한 번, 별도 문장으로 쓴다. 신호보다 번호가 작은 calm_ids(신호 전에 평온했던 날)로는 '돌아왔다'고 쓰지 않는다. 이 문장의 cites에는 calm_ids만, 신호 문장의 cites에는 signal_ids만 넣는다. 한 문장에 둘을 섞지 않는다.
11. '버전'이라는 말을 쓰지 않는다. 루틴을 가리킬 때는 "N번째 루틴" 또는 "레티놀 세럼을 추가한 뒤"처럼 바꾼 내용으로 쓴다.
12. 출력은 sentences 배열 하나다. 각 항목은 문장(text)과 근거 기록 번호(cites)다."""

# 응답 형식(구조화 출력). 형식은 API가 보장하고, 내용(숫자·근거·금지어)은 guard()가 확인한다.
SCHEMA = {
    "type": "object",
    "properties": {"sentences": {"type": "array", "items": {
        "type": "object",
        "properties": {"text": {"type": "string"}, "cites": {"type": "array", "items": {"type": "integer"}}},
        "required": ["text", "cites"], "additionalProperties": False}}},
    "required": ["sentences"], "additionalProperties": False,
}


def model() -> str:
    return os.environ.get("ANTHROPIC_MODEL") or DEFAULT_MODEL


def enabled() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _api():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=20.0, max_retries=0)   # Vercel 함수 제한(30초) 안에 끝나게. 실패하면 틀 문장
    return _client


_ID_LIST = re.compile(r"\s*[\(\[]\s*(?:\d+\s*[,~\-]\s*)*\d+\s*[\)\]]")


def clean_text(text: str) -> str:
    """본문에 섞여 들어온 '(9,10,12)' 같은 기록 번호 나열을 지웁니다(번호는 cites에만 둡니다)."""
    return _ID_LIST.sub("", text).strip()


def allowed_numbers(facts) -> set[str]:
    nums = set()
    for f in facts:
        nums.add(str(f["version"]))
        nums.update(str(d) for d in f["signal_days"])
        nums.add(str(len(f["signal_days"])))
        nums.add(str(f["max_sting"]))
        nums.update(re.findall(r"\d+", f"{f.get('change') or ''} {f.get('phrase') or ''}"))
    return nums


def guard(sentences, facts) -> list[str]:
    """LLM 문장 검사. 문제 목록을 돌려주고, 비어 있으면 통과."""
    problems = []
    if not isinstance(sentences, list) or not 1 <= len(sentences) <= 5:
        return ["문장 수가 맞지 않아요"]
    valid_ids = {i for f in facts for i in f["signal_ids"] + f["calm_ids"]}
    signal_all = {i for f in facts for i in f["signal_ids"]}
    calm_all = {i for f in facts for i in f["calm_ids"]}
    nums = allowed_numbers(facts)
    for s in sentences:
        text, cites = s.get("text"), s.get("cites")
        if not isinstance(text, str) or not text.strip() or len(text) > 140:
            problems.append("문장 형식이 맞지 않아요")
            continue
        if not isinstance(cites, list) or not cites or not all(isinstance(c, int) for c in cites):
            problems.append(f"근거 번호가 없어요: {text}")
        elif not set(cites) <= valid_ids:
            problems.append(f"없는 근거 번호: {text}")
        elif set(cites) & signal_all and set(cites) & calm_all:
            # 신호 기록과 평온 기록을 한 문장이 함께 인용하면 주장과 근거가 어긋난다
            problems.append(f"신호·평온 기록을 함께 인용: {text}")
        if "돌아왔" in text and isinstance(cites, list) and cites and not any(i < min(cites) for i in signal_all):
            # '돌아왔다'는 앞선 신호가 있어야 성립한다. 신호보다 앞선 평온 기록을 근거로 쓰면 거짓 회복이 된다
            problems.append(f"앞선 신호 없이 회복을 말함: {text}")
        for w in BANNED:
            if w in text:
                problems.append(f"금지어 '{w}': {text}")
        for n in re.findall(r"\d+", text):
            if n not in nums:
                problems.append(f"기록에 없는 숫자 {n}: {text}")
    return problems


def write_report(facts):
    """성공하면 {'sentences': [...], 'model': '...'}, 실패하면 {'error': '...'}."""
    if not enabled():
        return {"error": "ANTHROPIC_API_KEY 없음"}
    payload_facts = [{k: f[k] for k in ("version", "phrase", "change", "reason", "signal_ids", "signal_days", "carried_over",
                                         "max_sting", "env_unusual", "calm_ids")} for f in facts]
    digest = hashlib.sha256(json.dumps([payload_facts, model(), SYSTEM], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if digest in _cache:
        audit("report", "cache")
        return _cache[digest]
    started = time.monotonic()
    try:
        res = _api().beta.messages.create(
            model=model(), max_tokens=4000,
            system=SYSTEM,
            messages=[{"role": "user", "content": "facts:\n" + json.dumps(payload_facts, ensure_ascii=False)}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",   # 안전 판단으로 거절되면 서버가 다른 모델로 다시 시도
        )
    except anthropic.APIStatusError as e:              # 한도 초과(429), 서버 오류, 잘못된 요청 등
        audit("report", f"http_{e.status_code}", model(), started=started)
        return {"error": f"LLM 호출 실패: HTTP {e.status_code}"}
    except anthropic.APIError as e:                    # 시간 초과, 연결 끊김 등
        audit("report", type(e).__name__, model(), started=started)
        return {"error": f"LLM 호출 실패: {type(e).__name__}"}
    audit("report", res.stop_reason or "ok", res=res, started=started)
    if res.stop_reason == "refusal":
        return {"error": "LLM이 답하지 않았어요 (refusal)"}
    if res.stop_reason == "max_tokens":
        return {"error": "LLM 응답이 길이 제한에 걸렸어요"}
    text = next((b.text for b in res.content if b.type == "text"), "")
    try:
        sentences = json.loads(text)["sentences"]
    except (ValueError, KeyError, TypeError):
        return {"error": "LLM 응답 형식이 맞지 않아요"}
    if isinstance(sentences, list):
        for sent in sentences:
            if isinstance(sent, dict) and isinstance(sent.get("text"), str):
                sent["text"] = clean_text(sent["text"])
    problems = guard(sentences, facts)
    if problems:
        return {"error": "LLM 문장이 검사를 통과하지 못했어요", "problems": problems}
    out = {"sentences": [{"text": s["text"].strip(), "cites": sorted(set(s["cites"]))} for s in sentences],
           "model": res.model}
    _cache[digest] = out
    return out
