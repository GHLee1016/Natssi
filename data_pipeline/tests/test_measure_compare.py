"""원래/지금 측정 코드 비교(analysis/measure_compare.py). 얼굴 점 없이 볼 영역 계산과 요약만 확인한다."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("cv2")
pytest.importorskip("scipy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "analysis"))
import measure_compare as mcmp  # noqa: E402


def test_roi_orig_close_to_now():
    rng = np.random.default_rng(0)
    img = np.clip(rng.normal([200, 150, 130], 6, (300, 300, 3)), 0, 255).astype(np.uint8)
    pts = np.array([[50.6, 60.4], [220.2, 70.7], [240.9, 230.1], [60.3, 210.5]])
    o, n = mcmp.roi_orig(img, pts), mcmp.cr.roi_stats(img, pts)
    assert abs(o["a"] - n["a"]) < 0.05
    assert abs(o["n"] - n["n"]) / n["n"] < 0.03   # 좌표 버림/반올림, 테두리 차이로 픽셀 수가 조금 다르다


def test_quality_ok_rejects_multiple_faces():
    f = dict(face_found=True, width=1000, height=1200, brightness=120, n_faces=2, yaw=0, pitch=3.7, roll=0, smile=0, blink=0,
             face_ratio=0.5, sharpness=100, clip_L=0, clip_R=0, n_L=1000, n_R=1000)
    assert not mcmp.cr.quality_ok(f)
    assert mcmp.cr.quality_ok({**f, "n_faces": 1})
    assert "multiple_faces" in mcmp.now_flags(f)


def test_summary_runs(tmp_path, monkeypatch):
    rng = np.random.default_rng(1)
    rows = []
    for m in range(3):
        for k in range(10):
            day = 10 + m + rng.normal(0, 1)
            for p in range(1, 3):
                a = day + rng.normal(0, 0.3)
                rows.append(dict(member=f"m{m}", date=f"2026-11-{k + 1:02d}", photo=p, a_orig=a, a_now=a + 0.01,
                                 ok_orig=True, ok_now=not (k == 0 and p == 1), flags_orig="", flags_now="head_pose" if k == 0 and p == 1 else ""))
    monkeypatch.setattr(mcmp, "ROOT", tmp_path)
    (tmp_path / "data").mkdir()
    monkeypatch.setattr(mcmp.mc, "original_ci", lambda d, b=2000, seed=0: (0.0, 9.0))
    mcmp.summary(pd.DataFrame(rows))
    text = (tmp_path / "data" / "measure_compare.md").read_text(encoding="utf-8")
    assert "원래만 통과 3장" in text and "head_pose 3장" in text


def test_run_empty_folder_message(tmp_path):
    with pytest.raises(SystemExit, match="사진을 찾지 못했어요"):
        mcmp.run(tmp_path)
