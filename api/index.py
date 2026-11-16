"""Vercel 서버리스 함수 진입점. /api/* 요청을 FastAPI 앱으로 넘깁니다."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.main import app  # noqa: E402,F401
