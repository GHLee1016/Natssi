"""OCR로 읽은 성분 이름 → 식약처 표준 이름. 사전이 없으면 정리된 원문을 그대로 쓴다.

status
- 일치:      사전에 그대로 있음
- 보정:      OCR 오타를 비슷한 표준 이름으로 고침 (사용자 확인 화면에 표시)
- 확인 필요: 사전에서 못 찾음 → 사용자가 직접 고치게 한다 (AI가 지어내지 않음)
"""
import csv
import os
import re
from pathlib import Path

# pandas 없이 읽는다 → Vercel 함수(앱 백엔드)에도 그대로 들어간다. 필요한 건 rapidfuzz뿐.
# 위치: INGREDIENT_DICT 환경변수 > 이 패키지 옆 data/ingredient_dict.csv
DICT_PATH = Path(os.environ.get("INGREDIENT_DICT") or Path(__file__).resolve().parents[1] / "data" / "ingredient_dict.csv")


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


def _one_jamo_apart(a: str, b: str) -> bool:
    """자모 문자열이 한 자모만 바뀌었거나(치환) 받침 하나만 더하거나 빠진 경우."""
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    if abs(len(a) - len(b)) == 1:
        s, l = (a, b) if len(a) < len(b) else (b, a)
        return any(l[:i] + l[i + 1:] == s for i in range(len(l)))
    return False


# OCR이 자주 헷갈리는 글자 → 사전에 많은 글자. 사전에도 쓰이는 글자(륨·헬·펠…)라 자동으로는 못 찾아 따로 적는다.
# (사전에 거의 없는 글자 '을'·'듬'·'를' 같은 것은 아래 Matcher가 자모 하나 차이 후보를 스스로 찾는다)
CONFUSE = {"을": "올", "를": "롤올콜", "듬": "듐", "둥": "듐", "둠": "듐", "륨": "듐", "튬": "듐", "들": "듐",
           "헬": "헥", "펠": "펩", "펙": "펩", "는": "논", "클": "콜글", "플": "폴"}


class Matcher:
    def __init__(self, path: Path = DICT_PATH, cutoff: int = 80):
        self.cutoff = cutoff
        self.index: dict[str, dict] = {}
        if Path(path).exists():
            with open(path, encoding="utf-8-sig", newline="") as f:
                rows = [{k: (v or "") for k, v in r.items()} for r in csv.DictReader(f)]
            # 동의어는 쉼표로 이어져 있는데 'N,N-비스…'처럼 이름 안에도 쉼표가 있어, 양옆이 영숫자인 쉼표는 나누지 않는다.
            # 영문명도 'Water,Aqua'처럼 여럿일 수 있어 같은 규칙으로 나눈다('Water'만 쓴 탄산수보다 정제수가 먼저).
            sep = r";|(?<![0-9A-Za-z]),|,(?![0-9A-Za-z])|(?<=[a-z]),(?=[A-Z])"
            names = [(r, [r["kor"]], re.split(sep, r.get("inci", "")), re.split(sep, r.get("synonyms", ""))) for r in rows]
            # 한글 표준명 > 영문명 > 동의어 순으로 자리를 잡는다(다른 성분의 동의어가 표준명을 가로채지 않게)
            for level in (1, 2, 3):
                for r, *groups in names:
                    entry = {"kor": r["kor"], "inci": r.get("inci", "")}
                    for name in groups[level - 1]:
                        k = norm(name)
                        if len(k) >= 2:
                            self.index.setdefault(k, entry)
        self.keys = list(self.index)
        self.jkeys = [jamo(k) for k in self.keys]
        self.syl = {}
        for k in self.keys:
            for ch in k:
                if "가" <= ch <= "힣":
                    self.syl[ch] = self.syl.get(ch, 0) + 1
        self._cand: dict[str, str] = {}
        self._fz: dict[str, dict | None] = {}

    @property
    def has_dict(self) -> bool:
        return bool(self.index)

    def exact(self, token: str) -> dict | None:
        k = norm(token)
        if k in self.index:
            return {"ocr": token, **self.index[k], "status": "일치", "score": 100}
        return None

    def _candidates(self, ch: str) -> str:
        """이 글자 대신 와야 했을 글자 후보. 사전에 흔한 글자면 바꾸지 않는다(빈 문자열)."""
        if ch in self._cand:
            return self._cand[ch]
        out = CONFUSE.get(ch, "")
        if not out and "가" <= ch <= "힣" and self.syl.get(ch, 0) <= 2:
            j = jamo(ch)
            near = [c for c, n in self.syl.items() if n >= 20 and _one_jamo_apart(j, jamo(c))]
            out = "".join(sorted(near, key=lambda c: -self.syl[c])[:6])
        self._cand[ch] = out
        return out

    def repair(self, token: str) -> dict | None:
        """헷갈리는 글자 한두 개만 바꿔서 사전에 그대로 있으면 그 이름('프로판다이을'→'프로판다이올', '소듬'→'소듐')."""
        k = norm(token)
        spots = [(i, c) for i, ch in enumerate(k) if (c := self._candidates(ch))]
        if not spots or len(spots) > 4 or len(k) < 3:
            return None
        tries = [k]
        for i, cands in spots:
            tries = [t[:i] + c + t[i + 1:] for t in tries for c in (t[i], *cands)][:200]
        for t in tries[1:]:
            if t in self.index:
                return {"ocr": token, **self.index[t], "status": "보정", "score": 99}
        return None

    def fuzzy(self, token: str) -> dict | None:
        k = norm(token)
        if k in self._fz:
            r = self._fz[k]
            return r and {**r, "ocr": token}
        r = self._fuzzy(token)
        if len(self._fz) < 50000:
            self._fz[k] = r
        return r

    def _fuzzy(self, token: str) -> dict | None:
        k = norm(token)
        if (r := self.repair(token)):
            return r
        if len(k) < 3 or not self.keys:
            return None
        from rapidfuzz import fuzz, process
        if len(k) >= 5:
            best = process.extractOne(jamo(k), self.jkeys, scorer=fuzz.ratio, score_cutoff=self.cutoff)
            if best:
                return {"ocr": token, **self.index[self.keys[best[2]]], "status": "보정", "score": round(best[1])}
            return None
        # 짧은 이름(3~4글자)은 글자 수가 같고 자모 하나만 다를 때만 고친다.
        #   '리모넷'→'리모넨'(받침 하나) O,  '추출물'→'무추출물'(글자가 늘어남) X
        for _, score, i in process.extract(jamo(k), self.jkeys, scorer=fuzz.ratio, limit=5, score_cutoff=75):
            cand = self.keys[i]
            if len(cand) == len(k) and _one_jamo_apart(jamo(k), self.jkeys[i]):
                return {"ocr": token, **self.index[cand], "status": "보정", "score": round(score)}
        return None

    def match(self, token: str) -> dict:
        if not self.has_dict:
            return {"ocr": token, "kor": token, "inci": "", "status": "사전 없음", "score": None}
        return (self.exact(token) or self.fuzzy(token)
                or {"ocr": token, "kor": token, "inci": "", "status": "확인 필요", "score": None})
