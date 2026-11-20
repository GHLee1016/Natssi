"""OCR로 읽은 성분 이름 → 식약처 표준 이름. 사전이 없으면 정리된 원문을 그대로 쓴다.

status
- 일치:      사전에 그대로 있음
- 보정:      OCR 오타를 비슷한 표준 이름으로 고침 (사용자 확인 화면에 표시)
- 확인 필요: 사전에서 못 찾음 → 사용자가 직접 고치게 한다 (AI가 지어내지 않음)
"""
import re
from pathlib import Path

import pandas as pd

DICT_PATH = Path("data/ingredient_dict.csv")


def norm(s: str) -> str:
    s = str(s).lower()
    return re.sub(r"[\s\-·‧ㆍ,./()\[\]]", "", s)


_CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
_JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
_JONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"


def jamo(s: str) -> str:
    """'놀'→'ㄴㅗㄹ'. OCR 오타는 보통 글자 전체가 아니라 자모 하나라서(놀↔늘, 넨↔년) 자모로 비교한다."""
    out = []
    for ch in s:
        c = ord(ch) - 0xAC00
        if 0 <= c < 11172:
            out += [_CHO[c // 588], _JUNG[(c % 588) // 28], _JONG[c % 28].strip()]
        else:
            out.append(ch)
    return "".join(out)


class Matcher:
    def __init__(self, path: Path = DICT_PATH, cutoff: int = 80):
        self.cutoff = cutoff
        self.index: dict[str, dict] = {}
        if Path(path).exists():
            d = pd.read_csv(path, dtype=str).fillna("")
            for r in d.to_dict("records"):
                entry = {"kor": r["kor"], "inci": r.get("inci", "")}
                # 동의어는 쉼표로 이어져 있는데 'N,N-비스…'처럼 이름 안에도 쉼표가 있어, 양옆이 영숫자인 쉼표는 나누지 않는다
                syns = re.split(r";|(?<![0-9A-Za-z]),|,(?![0-9A-Za-z])", r.get("synonyms", ""))
                for name in [r["kor"], r.get("inci", ""), *syns]:
                    k = norm(name)
                    if len(k) >= 2:
                        self.index.setdefault(k, entry)
        self.keys = list(self.index)
        self.jkeys = [jamo(k) for k in self.keys]

    @property
    def has_dict(self) -> bool:
        return bool(self.index)

    def exact(self, token: str) -> dict | None:
        k = norm(token)
        if k in self.index:
            return {"ocr": token, **self.index[k], "status": "일치", "score": 100}
        return None

    def fuzzy(self, token: str) -> dict | None:
        k = norm(token)
        if len(k) < 3 or not self.keys:
            return None
        from rapidfuzz import fuzz, process
        # 짧은 조각은 한 글자만 달라도 엉뚱한 성분이 된다('추출물'→'무추출물') → 기준을 높인다
        cutoff = self.cutoff if len(k) >= 5 else (87 if len(k) == 4 else 92)
        best = process.extractOne(jamo(k), self.jkeys, scorer=fuzz.ratio, score_cutoff=cutoff)
        if best:
            return {"ocr": token, **self.index[self.keys[best[2]]], "status": "보정", "score": round(best[1])}
        return None

    def match(self, token: str) -> dict:
        if not self.has_dict:
            return {"ocr": token, "kor": token, "inci": "", "status": "사전 없음", "score": None}
        return (self.exact(token) or self.fuzzy(token)
                or {"ocr": token, "kor": token, "inci": "", "status": "확인 필요", "score": None})
