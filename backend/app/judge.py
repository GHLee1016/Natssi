"""판정 엔진. 같은 기록이면 항상 같은 결과가 나옵니다(LLM 없음).

판정 4단계: 신호 없음 / 관찰 중 / 신호 있음 / 구분 불가
"""
from statistics import median
from . import config

NO_SIGNAL, WATCH, SIGNAL, UNKNOWN = "신호 없음", "관찰 중", "신호 있음", "구분 불가"
MESSAGES = {
    NO_SIGNAL: "지금 루틴과 잘 지내고 있어요.",
    WATCH: "며칠 더 지켜볼게요.",
    SIGNAL: "바꾼 시기와 붉은기가 오른 시기가 겹쳐요. 같은 장소와 시간에 며칠 더 찍거나, 빈도를 줄여 보세요.",
    UNKNOWN: "기록이 더 필요해요.",
}
# 루틴을 바꾸지 않은 채(같은 버전 안에서) 평소 범위를 넘은 경우: '바꾼 시기'가 없으므로 다른 문장을 쓴다
SIGNAL_NO_CHANGE = "루틴을 바꾸지 않았는데 붉은기가 평소 범위를 넘은 날이 이어졌어요. 같은 장소와 시간에 며칠 더 찍어 확인해 보세요."


def _mad(values, med):
    return median([abs(v - med) for v in values]) if values else 0.0


def b_ref(vals, min_width=None):
    """내 평소 b*(볼 노란기) 범위: (중앙값, 허용 폭). 기록이 MIN_BASELINE_RECORDS보다 적으면 None.
    min_width: 허용 폭의 최소값. 기본은 판정용 LIGHT_B_MIN(3), 촬영 때 권유는 LIGHT_B_MIN_CAPTURE(4)를 넘긴다."""
    if len(vals) < config.MIN_BASELINE_RECORDS:
        return None
    med = median(vals)
    return med, max(config.LIGHT_B_MIN if min_width is None else min_width, config.MAD_K * 1.4826 * _mad(vals, med))


def color_off(b, ref):
    """그날 b*가 조명 색이 달랐다고 볼 만큼 벗어났나. ref(내 평소 범위)가 있으면 그것으로, 없으면 고정 위쪽 기준(노란 조명)만 본다.
    푸른 쪽은 고정 기준을 두지 않는다: 조명 필터 실험에서 8000K·10000K는 a* 변화가 MDC95 안이었다(data_pipeline/data/color_robustness_summary.md).
    고정 기준은 팀원 3명 피부로 정한 값이라, 평소 범위가 생기면 바로 그 사람 기준으로 바꾼다.
    평소 범위가 있으면 양쪽을 본다: 푸르게 찍혀 붉은기가 낮게 나온 날이 '맑음'이 되어 실제로 붉어진 날을 가리지 않게.
    촬영 때도 같은 양쪽 기준(폭만 4)이라, 판정에서 말없이 안개가 될 사진은 찍을 때 먼저 알려 준다."""
    if b is None:
        return False
    if ref:
        d = b - ref[0]
        return abs(d) > ref[1]
    return b > config.LIGHT_B_MAX


def light_off(r, prev, all_b=()):
    """조명 색이 평소와 달랐나(그날 볼 b*로 판단, 붉은기 높낮이와 상관없이). b*가 없는 기록(데모)은 늘 False.
    앞선 기록이 7일 넘게 있으면 그 평소 b*로, 아직 없으면 지금까지 쌓인 모든 기록의 b* 중앙값으로, 그것도 7개가 안 되면 고정 기준으로 본다.
    모든 기록으로 다시 보는 단계 덕분에, 피부가 원래 노랗게 찍히는 사람도 7일이 쌓이면 첫 주가 '조명 다름'에서 풀려 평소 범위가 생긴다."""
    if r.get("b") is None:
        return False
    prior = [p["b"] for p in prev if p.get("b") is not None and not p.get("light_flag")]
    return color_off(r["b"], b_ref(prior) or b_ref(list(all_b)))


def baseline_from(values):
    """평소 범위: 중앙값 ± max(MDC95, K × 1.4826 × MAD)."""
    med = median(values)
    half = max(config.MDC95_A_STAR, config.MAD_K * 1.4826 * _mad(values, med))
    return {"median": round(med, 2), "low": round(med - half, 2), "high": round(med + half, 2), "n": len(values)}


def judge_all(records):
    """기록 전체를 날짜순으로 판정해 각 기록에 verdict를 붙여 돌려줍니다."""
    out, signal_versions = [], set()
    all_b = [r["b"] for r in records if r.get("b") is not None and r.get("redness") is not None]
    for idx, r in enumerate(records):
        prev = out[:idx]
        # 조명 색이 달랐던 날(촬영 때 '그래도 기록하기'로 남긴 날 포함): 판정은 구분 불가, 평소 범위와 N/7일에서 뺀다
        r = {**r, "light_flag": r.get("redness") is not None and light_off(r, prev, all_b)}
        # 기준: 지금 버전보다 앞선 버전 중, 신호가 없었던 가장 최근 버전의 기록
        base_vals, base_version = [], None
        for v in sorted({p["version"] for p in prev if p["version"] < r["version"]}, reverse=True):
            if v not in signal_versions:
                base_vals = [p["redness"] for p in prev if p["version"] == v and p["redness"] is not None and not p.get("light_flag")]
                base_version = v
                break
        if base_version is None:      # 첫 버전: 같은 버전의 앞선 기록을 기준으로
            base_vals = [p["redness"] for p in prev if p["version"] == r["version"] and p["redness"] is not None
                         and not p.get("light_flag")]       # 조명 색이 달랐던 날은 평소 범위에서 뺀다
            base_version = r["version"]
        max_symptom = max(r["symptoms"].values()) if r["symptoms"] else 0
        res = {"baseline": None, "baseline_version": base_version, "exceeds": False, "reasons": []}

        if not r["quality_ok"] or r["redness"] is None:
            verdict = UNKNOWN
            res["reasons"].append(r.get("quality_note") or "사진 품질이 낮아요")
        elif r["light_flag"]:          # 조명 색이 평소와 달랐던 날(볼 b*로 판단)
            verdict = UNKNOWN
            res["reasons"].append("사진의 조명 색이 평소와 달라요. 붉은기가 조명 때문에 틀어졌을 수 있어 단정하지 않아요")
        elif len(base_vals) < config.MIN_BASELINE_RECORDS:
            verdict = UNKNOWN
            res["reasons"].append(f"평소 범위를 만들 기록이 부족해요 ({len(base_vals)}/{config.MIN_BASELINE_RECORDS})")
        else:
            b = baseline_from(base_vals)
            exceeds = r["redness"] > b["high"]
            res.update(baseline=b, exceeds=exceeds)
            prev_same = [p for p in prev if p["version"] == r["version"] and p["verdict"]["exceeds"]]
            prev_day_exceeded = bool(prev) and prev[-1]["verdict"]["exceeds"]
            # 조명 색(b*)이 평소와 다르면 붉은기가 높든 낮든 안개로 둔다. 높을 때만 보면, 차가운 조명이나 필터로 붉은기가
            # 낮게 찍힌 날이 '맑음'이 되어 실제로 붉어진 날을 가릴 수 있다(2026-11-21 조명 필터 실험: 차갑게 10% 56장 중 51장을
            # 이 규칙이 잡음, 필터 없는 사진 57장 중 2장이 걸림. 2026-11-22 데모 얼굴 필터 시험에서 차갑게, 채도 내림, 흑백 확인).
            if exceeds and r["env"].get("unusual"):
                verdict = UNKNOWN
                res["reasons"].append("같은 시기에 환경도 크게 달라졌어요")
            elif exceeds and (prev_day_exceeded or max_symptom >= config.SYMPTOM_ALERT):
                verdict = SIGNAL
                res["reasons"].append("붉은기가 평소 범위를 넘었어요")
                if prev_day_exceeded:
                    res["reasons"].append("이틀 이상 이어졌어요")
                if max_symptom >= config.SYMPTOM_ALERT:
                    res["reasons"].append("증상 체크인과 겹쳤어요")
            elif exceeds:
                verdict = WATCH
                res["reasons"].append("하루만 평소 범위를 벗어났어요")
            elif max_symptom >= config.SYMPTOM_ALERT:
                verdict = WATCH
                res["reasons"].append("사진 변화 없이 증상만 있어요")
            else:
                verdict = NO_SIGNAL
            _ = prev_same
        if verdict == SIGNAL:
            signal_versions.add(r["version"])
        msg = SIGNAL_NO_CHANGE if verdict == SIGNAL and base_version == r["version"] else MESSAGES[verdict]
        res.update(level=verdict, message=msg)
        out.append({**r, "verdict": res})
    return out
