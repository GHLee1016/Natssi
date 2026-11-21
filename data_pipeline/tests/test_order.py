"""확인 화면의 성분 목록이 라벨 순서대로 나오게: 편 사진에서만 찾은 성분의 자리, 옆으로 누운 사진의 줄 순서."""
from types import SimpleNamespace

import numpy as np

from ingredients.ocr import sideways_order
from ingredients.pipeline import label_order

it = lambda *ks: [{"kor": k} for k in ks]
names = lambda items: [x["kor"] for x in items]


def test_flat_only_items_go_where_they_belong():
    final = it("정제수", "글리세린", "향료", "판테놀", "알란토인")
    base = it("정제수", "글리세린", "향료")
    # 편 사진에서 판테놀이 글리세린 바로 뒤에 있었으면 그 자리로
    assert names(label_order(final, base, it("글리세린", "판테놀", "향료"))) == ["정제수", "글리세린", "판테놀", "향료", "알란토인"]
    # 앞에 겹친 성분이 없으면 뒤에 오는 겹친 성분 앞으로
    assert names(label_order(final, base, it("판테놀", "알란토인", "글리세린"))) == ["정제수", "판테놀", "알란토인", "글리세린", "향료"]
    # 겹친 성분이 하나도 없으면(편 사진이 라벨 아래쪽만 읽음) 맨 뒤
    assert names(label_order(final, base, it("판테놀", "알란토인"))) == ["정제수", "글리세린", "향료", "판테놀", "알란토인"]


def _result(boxes, txts):
    return SimpleNamespace(boxes=np.array(boxes, dtype=float), txts=tuple(txts))


def _col(x):       # 세로로 긴 상자(폭 40, 높이 800)
    return [[x, 0], [x + 40, 0], [x + 40, 800], [x, 800]]


def _row(y):       # 가로로 긴 상자
    return [[0, y], [800, y], [800, y + 40], [0, y + 40]]


def test_sideways_photo_lines_in_reading_order():
    # 시계 방향으로 누운 사진: 첫 줄이 오른쪽. 엔진은 아무 순서로나 줄 수 있다
    r = _result([_col(0), _col(100), _col(200), _col(300)],
                ["사용할 때의 주의사항 1) 화장품", "나이아신아마이드, 판테놀", "전성분 정제수, 글리세린,", "제품명 크림"])
    assert sideways_order(r) == ["제품명 크림", "전성분 정제수, 글리세린,", "나이아신아마이드, 판테놀", "사용할 때의 주의사항 1) 화장품"]
    # 반시계 방향으로 누운 사진: 첫 줄이 왼쪽('전성분'이 '주의사항'보다 앞에 오는 쪽을 고른다)
    r = _result([_col(0), _col(100), _col(200), _col(300)],
                ["제품명 크림", "전성분 정제수, 글리세린,", "나이아신아마이드, 판테놀", "사용할 때의 주의사항 1) 화장품"])
    assert sideways_order(r)[1].startswith("전성분")


def test_upright_photo_unchanged():
    r = _result([_row(0), _row(60), _row(120)], ["전성분 정제수", "글리세린", "향료"])
    assert sideways_order(r) is None
