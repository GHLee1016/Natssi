"""여러 장 사진을 줄 단위로 이어 붙이기(돌려 찍은 둥근 통)."""
import numpy as np

from ingredients import ocr, pipeline, unwarp
from ingredients.stitch import overlap, stitch, stitch_pair


def test_overlap_joins_cut_name_and_keeps_comma():
    # 겹친 부분에 오독('글라이클')이 있어도 이어지고, 겹친 부분은 다음 사진 쪽 글자를 쓴다
    sc, line = overlap("정제수, 글리세린, 부틸렌글라이클, 페녹시", "부틸렌글라이콜, 페녹시에탄올, 향료")
    assert line == "정제수, 글리세린, 부틸렌글라이콜, 페녹시에탄올, 향료"
    # 겹침이 앞 줄의 쉼표에서 시작해도 쉼표를 잃지 않는다
    assert overlap("나이아신아마이드, 판테놀, 아데노", "판테놀, 아데노신, 마데카소사이드")[1] == "나이아신아마이드,판테놀, 아데노신, 마데카소사이드"
    assert overlap("Water, Glycerin, Butylene Glycol, Phenoxy", "Butylene Glycol, Phenoxyethanol, PEG-7")[1] == \
        "Water, Glycerin, Butylene Glycol, Phenoxyethanol, PEG-7"


def test_no_overlap_for_unrelated_lines():
    assert overlap("정제수, 글리세린", "나이아신아마이드, 판테놀, 아데노신") is None
    assert overlap("사용할 때의 주의사항", "정제수, 글리세린, 부틸렌글라이콜") is None


def test_rows_pair_in_order_and_unmatched_rows_stay():
    A = ["제품명 크림", "정제수, 글리세린, 부틸렌글라이콜, 페녹", "나이아신아마이드, 판테놀, 아데노", "사용할 때의 주의사항"]
    B = ["부틸렌글라이콜, 페녹시에탄올, 향료", "판테놀, 아데노신, 마데카소사이드", "주의사항 1. 화장품"]
    out = stitch_pair(A, B)
    assert out[0] == "제품명 크림"
    assert out[1] == "정제수, 글리세린, 부틸렌글라이콜, 페녹시에탄올, 향료"
    assert out[2].endswith("아데노신, 마데카소사이드")
    assert out[-2:] == ["사용할 때의 주의사항", "주의사항 1. 화장품"]
    assert stitch([A]) == A and stitch([]) == []


def test_register_stitches_two_photos(monkeypatch):
    views = {1: ["전성분: 정제수, 글리세린, 부틸렌글라이콜, 페녹"], 2: ["부틸렌글라이콜, 페녹시에탄올, 나이아신아마이드"]}
    monkeypatch.setattr(ocr, "load", lambda p: np.full((8, 8, 3), p[0], np.uint8))
    monkeypatch.setattr(ocr, "read_rows", lambda img, v="base": views[int(img[0, 0, 0])])
    monkeypatch.setattr(unwarp, "available", lambda: False)
    r = pipeline.register([b"\x01", b"\x02"])
    assert r["variants"][-1] == "stitch"
    assert [i["kor"] for i in r["ingredients"]] == ["정제수", "글리세린", "부틸렌글라이콜", "페녹시에탄올", "나이아신아마이드"]
    monkeypatch.setenv("NATSSI_STITCH", "0")            # 끄면 예전처럼 사진마다 따로(잘린 '페녹'은 조각으로 남음)
    monkeypatch.setattr(ocr, "read_image", lambda img, v="base": "\n".join(views[int(img[0, 0, 0])]))
    r = pipeline.register([b"\x01", b"\x02"])
    assert "stitch" not in r["variants"]
