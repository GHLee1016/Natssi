"""휜 사진 펴기: 모델이 없으면 건너뛰고, 있으면 원래 사진 글자 + 편 사진 글자를 합쳐 읽는다."""
import numpy as np
import pytest

from ingredients import ocr, pipeline, unwarp


def fake_read(img, variant="base"):
    # 편 사진(값을 바꿔 표시)에서는 뒷부분 성분을, 원래 사진에서는 앞부분을 읽었다고 친다
    return "전성분: 정제수, 글리세린" if img[0, 0, 0] == 0 else "나이아신아마이드, 판테놀, 글리세린"


@pytest.fixture
def fake_ocr(monkeypatch):
    monkeypatch.setattr(ocr, "load", lambda p: np.zeros((40, 40, 3), np.uint8))
    monkeypatch.setattr(ocr, "read_image", fake_read)
    monkeypatch.setattr(unwarp, "unwarp", lambda img: np.full_like(img, 7))


def test_without_model_nothing_changes(fake_ocr, monkeypatch):
    monkeypatch.setattr(unwarp, "MODEL", unwarp.MODEL.with_name("없는파일.onnx"))
    r = pipeline.register([b"x"])
    assert r["variants"] == ["base"] and [i["kor"] for i in r["ingredients"]] == ["정제수", "글리세린"]


def test_unwarped_text_is_added_and_deduped(fake_ocr, monkeypatch):
    monkeypatch.setattr(unwarp, "available", lambda: True)
    r = pipeline.register([b"x"])
    assert r["variants"] == ["base+unwarp"]
    assert [i["kor"] for i in r["ingredients"]] == ["정제수", "글리세린", "나이아신아마이드", "판테놀"]   # 글리세린은 한 번


def test_switch_off(monkeypatch, tmp_path):
    f = tmp_path / "uvdoc.onnx"; f.write_bytes(b"0")
    monkeypatch.setattr(unwarp, "MODEL", f)
    assert unwarp.available()
    monkeypatch.setenv("NATSSI_UNWARP", "0")
    assert not unwarp.available()


@pytest.mark.skipif(not unwarp.MODEL.exists(), reason="models/uvdoc.onnx 없음")
def test_real_model_keeps_size():
    img = (np.random.default_rng(0).random((320, 240, 3)) * 255).astype(np.uint8)
    out = unwarp.unwarp(img)
    assert out.shape == img.shape and out.dtype == np.uint8
