"""OCR 엔진 스레드 수: 컨테이너 CPU 제한(cgroup)에 맞추고, NATSSI_THREADS로 직접 정할 수 있다."""
import os

from ingredients.ocr import cpu_threads

# 맥에는 sched_getaffinity가 없다(cpu_threads도 같은 방식으로 cpu_count를 쓴다)
AVAIL = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else (os.cpu_count() or 1)


def test_cgroup_v2_quota(tmp_path, monkeypatch):
    monkeypatch.delenv("NATSSI_THREADS", raising=False)
    (tmp_path / "cpu.max").write_text("200000 100000\n")      # CPU 2개만큼
    assert cpu_threads(str(tmp_path)) == min(2, AVAIL)
    (tmp_path / "cpu.max").write_text("max 100000\n")          # 제한 없음 → 쓸 수 있는 CPU 수
    assert cpu_threads(str(tmp_path)) == AVAIL


def test_cgroup_v1_quota(tmp_path, monkeypatch):
    monkeypatch.delenv("NATSSI_THREADS", raising=False)
    (tmp_path / "cpu").mkdir()
    (tmp_path / "cpu" / "cfs_quota_us").write_text("50000")    # 파일 이름이 틀리면 제한 없음으로 본다
    assert cpu_threads(str(tmp_path)) == AVAIL
    (tmp_path / "cpu" / "cpu.cfs_quota_us").write_text("100000")
    (tmp_path / "cpu" / "cpu.cfs_period_us").write_text("100000")
    assert cpu_threads(str(tmp_path)) == 1


def test_env_override(tmp_path, monkeypatch):
    (tmp_path / "cpu.max").write_text("200000 100000\n")
    monkeypatch.setenv("NATSSI_THREADS", "3")
    assert cpu_threads(str(tmp_path)) == 3
    monkeypatch.setenv("NATSSI_THREADS", "0")                  # 0이나 이상한 값은 무시
    assert cpu_threads(str(tmp_path)) >= 1
