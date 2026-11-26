"""얼굴 전체 붉은기 시험판(analysis/fullface_redness.py)의 붉은 점 찾기. 얼굴 점 없이 가짜 피부 판으로 확인한다.
scipy가 없으면(OCR만 까는 CI) 건너뛴다."""
import sys
from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("scipy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "analysis"))
import fullface_redness as ff  # noqa: E402


def _skin(w=400, h=400):
    L = np.full((h, w), 65.0)
    A = np.full((h, w), 12.0) + np.random.default_rng(0).normal(0, 0.5, (h, w))
    return L, A, np.ones((h, w), bool)


def _dot(arr, cy, cx, r, v):
    yy, xx = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
    arr[(yy - cy) ** 2 + (xx - cx) ** 2 <= r * r] = v


def test_red_dot_is_found():
    L, A, skin = _skin()
    _dot(A, 200, 200, 7, 22.0)
    n, area, centers = ff.find_spots(L, A, skin, 400)
    assert n == 1
    cy, cx = centers[0]
    assert abs(cy - 200) < 8 and abs(cx - 200) < 8
    assert 0 < area < 1


def test_brown_spot_is_not_red():
    """갈색 점(주근깨, 점)은 a*가 조금 높아도 L*가 크게 낮아서 붉은 점으로 세지 않는다."""
    L, A, skin = _skin()
    _dot(A, 200, 200, 7, 20.0)
    _dot(L, 200, 200, 7, 45.0)
    assert ff.find_spots(L, A, skin, 400)[0] == 0


def test_spot_at_skin_edge_is_ignored():
    """뺀 영역(콧구멍, 눈 주변) 바로 옆은 주변 값이 치우쳐서 점 후보에서 뺀다."""
    L, A, skin = _skin()
    skin[:, 300:] = False
    _dot(A, 200, 298, 6, 22.0)
    assert ff.find_spots(L, A, skin, 400)[0] == 0


def test_flat_skin_has_no_spots():
    L, A, skin = _skin()
    assert ff.find_spots(L, A, skin, 400)[0] == 0


def test_lab_image_matches_color_robustness():
    img = np.array([[[200, 150, 130], [90, 60, 50]]], np.uint8)
    lab = ff.lab_image(img)
    ref = ff.cr.srgb_to_lab(img.reshape(-1, 3)).reshape(1, 2, 3)
    assert np.allclose(lab, ref)
