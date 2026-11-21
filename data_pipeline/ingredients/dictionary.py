"""식약처 화장품 원료성분정보 → data/ingredient_dict.csv (한 번만 받아 두면 됨).

공공데이터포털 활용신청: '식품의약품안전처_화장품 원료성분정보' (환경 데이터와 같은 키)

    python -m ingredients.dictionary
"""
from pathlib import Path

import pandas as pd

from envdata._http import get_items

URL = "http://apis.data.go.kr/1471000/CsmtcsIngdCpntInfoService01/getCsmtcsIngdCpntInfoService01"
OUT = Path("data/ingredient_dict.csv")


def _unwrap(it: dict) -> dict:
    return it["item"] if set(it) == {"item"} else it


def _pick(cols, *words):
    for c in cols:
        if all(w in c.upper() for w in words):
            return c
    return None


def download(out: Path = OUT, rows: int = 500) -> pd.DataFrame:
    items, page = [], 1
    while True:
        batch, total = get_items(URL, {"type": "json", "numOfRows": rows, "pageNo": page}, timeout=30)
        items += [_unwrap(i) for i in batch]
        print(f"\r{len(items)}/{total}", end="")
        if not batch or len(items) >= total:
            break
        page += 1
    print()
    raw = pd.DataFrame(items)
    # 열 이름이 바뀌어도 동작하도록 이름으로 찾는다 (예: INGR_KOR_NAME, INGR_ENG_NAME, INGR_SYNONYM)
    kor = _pick(raw.columns, "KOR", "NAME") or _pick(raw.columns, "KOR")
    eng = _pick(raw.columns, "ENG", "NAME") or _pick(raw.columns, "ENG")
    syn = _pick(raw.columns, "SYNONYM")
    if not kor:
        raise RuntimeError(f"한글 성분명 열을 못 찾았어요. 받은 열: {list(raw.columns)}")
    d = pd.DataFrame({
        "kor": raw[kor].astype(str).str.strip(),
        "inci": raw[eng].astype(str).str.strip() if eng else "",
        "synonyms": raw[syn].fillna("").astype(str) if syn else "",
    })
    d = d[d["kor"].ne("") & d["kor"].ne("None")].drop_duplicates("kor")
    out.parent.mkdir(parents=True, exist_ok=True)
    d.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"저장: {out} ({len(d)}개 성분), 원본 열: {list(raw.columns)}")
    return d


if __name__ == "__main__":
    download()
