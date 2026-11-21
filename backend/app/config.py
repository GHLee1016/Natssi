"""판정에 쓰는 설정값. MDC95는 팀원 반복 촬영 예비 검증값이며, 사진이 늘면 다시 계산해 갱신합니다."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

# 볼 붉은기(a*) 측정 오차의 최소 변화량(하루 1장 기준). 팀원 3명 반복 셀카 59장(품질 통과), 2026-11-19 계산,
# 95% 신뢰구간 1.85~2.97. 같은 폰·같은 장소 조건의 예비값(대상자가 적음). 계산: natssi_selfie_validation(run_pipeline.py)
# 데모(김서연) 판정은 1.65~2.40에서 같고, 2.45 이상이면 '신호 있음' 날이 줄어요(test_demo_story_signal_days).
MDC95_A_STAR = 2.35
MIN_BASELINE_RECORDS = 7    # 평소 범위를 만들기 위한 최소 기록 수
MAD_K = 3.0                 # 평소 범위 폭 = max(MDC95, MAD_K × 1.4826 × MAD)
LIGHT_B_MIN = 3.0           # 조명 색 판단: 평소 b*에서 max(이 값, MAD_K×1.4826×MAD) 넘게 벗어나면 '조명이 달라요'(예비값, 3명 데이터)
SYMPTOM_ALERT = 2           # 증상 점수가 이 값 이상이면 '겹침'으로 봄
# 김서연 이야기는 기준일(11/16)에 끝나게 짜여 있고, DEMO_SHIFT_DAYS만큼 통째로 밉니다.
# 10으로 고정 → 10/30~11/26. 실제 환경값(서대문구)을 그 날짜에 붙이므로 날짜를 매일 밀지 않고 고정합니다(2026-11-21 결정).
# None으로 두면 예전처럼 접속한 날(한국 시간)이 마지막 날이 되도록 매일 밉니다.
DEMO_BASE = date(2026, 11, 16)
DEMO_SHIFT_DAYS = 10
DEMO_ENV_DISTRICT = "서대문구"
ENV_SOURCE = "auto"              # 로그인 사용자의 환경값: Supabase env_daily 표(매일 갱신) → 없으면 CSV. "csv"면 CSV만   # 김서연 기록에 붙일 실제 환경값의 구(공공데이터, 함께 배포한 CSV에서 읽어 값을 고정). None이면 가상값


def today_kst() -> date:
    return datetime.now(ZoneInfo("Asia/Seoul")).date()    # Vercel은 UTC라서 한국 날짜를 따로 계산


def demo_shift() -> int:
    if DEMO_SHIFT_DAYS is not None:
        return DEMO_SHIFT_DAYS
    return max(0, (today_kst() - DEMO_BASE).days)


def demo_today() -> date:
    return DEMO_BASE + timedelta(days=demo_shift())


import os

# ── 계정·보안 ───────────────────────────────────────────────
# 비밀번호 찾기는 Supabase 커스텀 SMTP를 설정한 뒤에만 켠다(기본 메일 서비스는 팀 구성원에게만 보낸다).
RECOVERY_ENABLED = os.environ.get("NATSSI_RECOVERY") == "1"
OCR_ENABLED = os.environ.get("NATSSI_OCR") == "1"       # 전성분 사진 읽기(OCR). 서버·화면이 모두 준비된 뒤에만 켜기(기본 꺼짐)
# 로컬 개발용: 로그인 없이 쓰기 허용. Vercel(운영·미리보기)에서는 환경변수가 실수로 켜져 있어도 무시한다.
ON_VERCEL = bool(os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV"))
OPEN_MODE = os.environ.get("NATSSI_OPEN_MODE") == "1" and not ON_VERCEL
CONSENT_VERSION = "2026-11-23"                          # 처리방침을 바꾸면 이 값도 바꿉니다(11-23: 볼 밝기 L* 저장, 볼 조각 기기 저장(선택), AI 문장 다듬기(선택 동의) / 11-22: 볼 색 숫자(a*·b*) 하루 1번 저장 / 11-19: 사진을 브라우저에서 측정, 볼 붉은기 측정 연결 / 11-20: 내 루틴 저장 추가 / 11-21: 사는 구(선택) 추가)
PHOTO_NOTICE_VERSION = "2026-11-23"                     # 얼굴 사진 처리 방식이 바뀐 날. 이 값이 오를 때만 촬영 전에 다시 동의를 받는다
REDNESS_SINCE = "2026-11-22"                            # 이 버전 이상에 동의한 사용자만 볼 붉은기 숫자를 저장한다
MAX_UPLOAD_BYTES = 4 * 1024 * 1024                      # Vercel 함수 요청 한도(4.5MB) 아래
MAX_IMAGE_PIXELS = 40_000_000                           # 압축 폭탄 방지
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
# (이름, 허용 횟수, 초) — 같은 서버 인스턴스 안에서만 세므로 '최선 노력' 수준입니다.
LIMITS = {
    "auth": (8, 60),
    "report": (6, 60),
    "capture": (12, 60),
    "write": (30, 60),
    "suggest": (90, 60),
    "read": (90, 60),          # 로그인한 사람의 조회(내 기록·변화·볼 사진 등): 반복 호출로 DB 비용이 커지지 않게
    "account": (6, 60),
}
