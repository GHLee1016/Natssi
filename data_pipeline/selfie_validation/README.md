# 셀카 측정 검증 (MDC95 2.35를 낸 원래 코드와 문서)

앱 판정 기준 `MDC95_A_STAR = 2.35`(95% 신뢰구간 1.85~2.97, `backend/app/config.py`)를 낸 검증 작업의 코드와 문서다.
한동안 찾지 못했던 `natssi_selfie_validation` 묶음에서 코드와 문서만 옮겼다. 사진, 사진별 측정값, AI Hub 데이터는 올리지 않는다.

## 들어 있는 것

| 위치 | 내용 |
|---|---|
| `code/measure_redness.py` | 셀카 → 촬영 품질 검사 + 양 볼 a* → `measurements.csv` |
| `code/analyze_reliability.py` | `measurements.csv` → SEM, MDC95(하루 1장 기준), ICC, 사람 단위 부트스트랩 신뢰구간 |
| `code/color.py` | sRGB → CIELAB(D65) |
| `code/test_analysis.py` | 가짜 데이터로 분석 식 확인 (`python test_analysis.py`) |
| `code/aihub_pilot.py` | AI Hub 한국인 피부 데이터로 기기, 각도별 a* 비교(보조 근거). 데이터는 팀원 컴퓨터에만 있음 |
| `docs/01~07` | 배경, 데이터 정리와 개인정보, 측정 방법, 신뢰도 분석, 품질 기준 점검, 앱 반영, 공공데이터 보조 검증 |
| `metadata_template.csv` | 사진 목록 양식(빈 양식) |

## MDC95 계산 방법 (`analyze_reliability.py`)

- SEM(하루 1장) = √(하루 평균들의 날짜 간 분산 + 같은 날 분산 × (1 − 1/하루 장수))
- MDC95 = 1.96 × √2 × SEM
- 95% 신뢰구간: 사람 단위 부트스트랩 2000회, 2.5~97.5 백분위

## 지금 분석 코드와의 관계

지금 분석은 앱과 같은 방식으로 다시 만든 `analysis/color_robustness.py`를 쓴다. 같은 74장으로 두 코드를 비교한 결과
(`analysis/measure_compare.py`):

- 볼 a*: 차이 중앙 0.017, 최대 0.06 (사실상 같음)
- 품질 판정: 이 폴더의 `measure_redness.py`에는 MediaPipe 위아래 각도 보정(−3.7°)이 없어서 정면 사진 22장을 고개 숙임으로 거른다.
  앱과 지금 코드는 보정을 넣었다.
- MDC95: 보정 없는 이 코드로는 43장, 2.92(1.97~4.33). 보정한 지금 코드로는 62장, 2.39(1.93~2.97).
  앱 값 2.35(59장)는 보정을 넣은 버전으로 낸 값이고, 지금 코드와 맞는다.

같은 계산을 지금 측정값으로 다시 내는 스크립트는 `analysis/mdc95_check.py`다.
