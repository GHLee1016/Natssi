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


def light_off(r, prev):
    """조명 색이 평소와 달랐나: 그날 볼의 노란기(b*)가 내 평소 b* 범위 밖인가(붉은기 높낮이와 상관없이 본다). b*가 없는 기록(데모)은 늘 False.
    조명 필터 실험(2026-11-21, 3명 57장)에서 품질 검사가 놓친 색 변화의 대부분을 잡았다. 예비값."""
    vals = [p["b"] for p in prev if p.get("b") is not None]
    if r.get("b") is None or len(vals) < config.MIN_BASELINE_RECORDS:
        return False
    med = median(vals)
    return abs(r["b"] - med) > max(config.LIGHT_B_MIN, config.MAD_K * 1.4826 * _mad(vals, med))


def baseline_from(values):
    """평소 범위: 중앙값 ± max(MDC95, K × 1.4826 × MAD)."""
    med = median(values)
    half = max(config.MDC95_A_STAR, config.MAD_K * 1.4826 * _mad(values, med))
    return {"median": round(med, 2), "low": round(med - half, 2), "high": round(med + half, 2), "n": len(values)}


def judge_all(records):
    """기록 전체를 날짜순으로 판정해 각 기록에 verdict를 붙여 돌려줍니다."""
    out, signal_versions = [], set()
    for idx, r in enumerate(records):
        prev = out[:idx]
        # 기준: 지금 버전보다 앞선 버전 중, 신호가 없었던 가장 최근 버전의 기록
        base_vals, base_version = [], None
        for v in sorted({p["version"] for p in prev if p["version"] < r["version"]}, reverse=True):
            if v not in signal_versions:
                base_vals = [p["redness"] for p in prev if p["version"] == v and p["redness"] is not None]
                base_version = v
                break
        if base_version is None:      # 첫 버전: 같은 버전의 앞선 기록을 기준으로
            base_vals = [p["redness"] for p in prev if p["version"] == r["version"] and p["redness"] is not None]
            base_version = r["version"]
        max_symptom = max(r["symptoms"].values()) if r["symptoms"] else 0
        res = {"baseline": None, "baseline_version": base_version, "exceeds": False, "reasons": []}

        if not r["quality_ok"] or r["redness"] is None:
            verdict = UNKNOWN
            res["reasons"].append(r.get("quality_note") or "사진 품질이 낮아요")
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
            if light_off(r, prev):
                verdict = UNKNOWN
                res["reasons"].append("사진의 조명 색이 평소와 달라요. 같은 장소와 시간에 다시 찍어 주세요")
            elif exceeds and r["env"].get("unusual"):
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
