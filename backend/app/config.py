"""판정에 쓰는 설정값. 사전 검증(반복 촬영)이 끝나면 MDC95를 실제 값으로 바꾸세요."""
from datetime import date

MDC95_A_STAR = 1.8          # 예시 값. 반복 촬영 실험 결과로 교체
MIN_BASELINE_RECORDS = 7    # 평소 범위를 만들기 위한 최소 기록 수
MAD_K = 3.0                 # 평소 범위 폭 = max(MDC95, MAD_K × 1.4826 × MAD)
SYMPTOM_ALERT = 2           # 증상 점수가 이 값 이상이면 '겹침'으로 봄
DEMO_TODAY = date(2026, 11, 16)
