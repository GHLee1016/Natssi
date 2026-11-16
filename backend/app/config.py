"""판정에 쓰는 설정값. 사전 검증(반복 촬영)이 끝나면 MDC95를 실제 값으로 바꾸세요."""
from datetime import date

MDC95_A_STAR = 1.8          # 예시 값. 반복 촬영 실험 결과로 교체
MIN_BASELINE_RECORDS = 7    # 평소 범위를 만들기 위한 최소 기록 수
MAD_K = 3.0                 # 평소 범위 폭 = max(MDC95, MAD_K × 1.4826 × MAD)
SYMPTOM_ALERT = 2           # 증상 점수가 이 값 이상이면 '겹침'으로 봄
DEMO_TODAY = date(2026, 11, 16)

import os

# ── 계정·보안 ───────────────────────────────────────────────
OPEN_MODE = os.environ.get("NATSSI_OPEN_MODE") == "1"   # 로컬 개발용: 로그인 없이 쓰기 허용(운영에서는 켜지 마세요)
CONSENT_VERSION = "2026-11-17"                          # 처리방침을 바꾸면 이 값도 바꿉니다
MAX_UPLOAD_BYTES = 4 * 1024 * 1024                      # Vercel 함수 요청 한도(4.5MB) 아래
MAX_IMAGE_PIXELS = 40_000_000                           # 압축 폭탄 방지
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
# (이름, 허용 횟수, 초) — 같은 서버 인스턴스 안에서만 세므로 '최선 노력' 수준입니다.
LIMITS = {
    "auth": (8, 60),
    "report": (6, 60),
    "capture": (12, 60),
    "write": (30, 60),
    "account": (6, 60),
}
