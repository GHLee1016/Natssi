"""OpenRouter 무료 모델로 리포트 문장을 다듬습니다.

원칙
  - LLM에는 판정 기록에서 뽑은 사실(facts)만 줍니다. 사진·이름·원본 기록은 보내지 않습니다.
  - LLM의 출력은 guard()를 통과해야만 쓰고, 하나라도 걸리면 정해진 틀(template) 문장으로 돌아갑니다.
  - OPENROUTER_API_KEY 가 없으면 호출하지 않습니다.
"""
import hashlib
import json
import os
import re
import httpx

URL = "https://openrouter.ai/api/v1/chat/completions"
# 2026-11 기준 무료 모델 중 JSON 출력이 안정적이었던 순서. 환경변수 OPENROUTER_MODELS 로 바꿀 수 있음(쉼표 구분).
DEFAULT_MODELS = [
    "nvidia/nemotron-3.5-super-vl:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openrouter/free",
]
BANNED = ["진단", "치료", "완치", "질환", "피부염", "알레르기", "염증", "부작용", "처방", "때문에", "때문이", "원인은", "효과가 있", "개선됩니다", "추천"]

_client: httpx.Client | None = None
_cache: dict[str, dict] = {}

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
12. 출력은 아래 JSON 하나뿐이다. 다른 글은 쓰지 않는다.
{"sentences":[{"text":"...","cites":[1,2]}]}"""


def models() -> list[str]:
    env = os.environ.get("OPENROUTER_MODELS")
    return [m.strip() for m in env.split(",") if m.strip()] if env else DEFAULT_MODELS


def enabled() -> bool:
    return bool(os.environ.get("OPENROUTER_API_KEY"))


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=25)
    return _client


def _extract_json(text: str):
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("JSON이 없어요")
    return json.loads(text[start:end + 1])


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
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        return {"error": "OPENROUTER_API_KEY 없음"}
    payload_facts = [{k: f[k] for k in ("version", "phrase", "change", "reason", "signal_ids", "signal_days", "carried_over",
                                         "max_sting", "env_unusual", "calm_ids")} for f in facts]
    digest = hashlib.sha256(json.dumps([payload_facts, models(), SYSTEM], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if digest in _cache:
        return _cache[digest]
    ms = models()
    body = {
        "model": ms[0], "models": ms[:3], "temperature": 0.2, "max_tokens": 2000,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": "facts:\n" + json.dumps(payload_facts, ensure_ascii=False)}],
    }
    try:
        r = _http().post(URL, json=body, headers={"Authorization": f"Bearer {key}", "X-Title": "natssi"})
        r.raise_for_status()
        data = r.json()
        choice = data["choices"][0]
        content = choice["message"].get("content")
        if not isinstance(content, str) or not content.strip():
            # 추론형 모델이 토큰을 생각에 다 쓰면 본문이 비어 옵니다
            why = choice.get("finish_reason") or "empty"
            return {"error": f"LLM 응답 본문이 비어 있어요 ({data.get('model', ms[0])}, {why})"}
        parsed = _extract_json(content)
        sentences = parsed["sentences"] if isinstance(parsed, dict) else parsed
    except Exception as e:                      # 한도 초과, 시간 초과, 형식 오류 등
        code = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else None
        return {"error": f"LLM 호출 실패: {type(e).__name__}" + (f" (HTTP {code})" if code else f": {str(e)[:80]}")}
    if isinstance(sentences, list):
        for sent in sentences:
            if isinstance(sent, dict) and isinstance(sent.get("text"), str):
                sent["text"] = clean_text(sent["text"])
    problems = guard(sentences, facts)
    if problems:
        return {"error": "LLM 문장이 검사를 통과하지 못했어요", "problems": problems}
    out = {"sentences": [{"text": s["text"].strip(), "cites": sorted(set(s["cites"]))} for s in sentences],
           "model": data.get("model", ms[0])}
    _cache[digest] = out
    return out
