# 코드 사용법

| 파일 | 하는 일 | 확인 상태 |
|---|---|---|
| `color.py` | sRGB → CIELAB(D65) 변환 | 기준색(흰색·빨강)으로 테스트 통과 |
| `measure_redness.py` | 사진 → 품질 검사 + 볼 a* 측정 → `measurements.csv` | 색 계산·ROI 통계는 확인. **MediaPipe 얼굴 랜드마크 부분은 실제 얼굴로 아직 못 돌려봄** |
| `analyze_reliability.py` | `measurements.csv` → ICC·SEM·MDC95 + 신뢰구간 → `results/report.md`, `results.json` | 가짜 데이터로 정답 재현, ICC는 pingouin과 소수점 9자리까지 일치 |
| `aihub_pilot.py` | AI Hub 028 데이터: 라벨 볼 bbox에서 a\* 측정(기기·각도 비교용) | Validation 107명 실행 완료 → `data/` |
| `test_analysis.py` | 위 테스트 | `python test_analysis.py` |

## 1) 측정 (얼굴 사진이 있는 내 컴퓨터에서)
```
pip install mediapipe opencv-python pillow numpy pandas
# 모델 1회 다운로드: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
python measure_redness.py --photos ./photos --meta ./metadata.csv --model ./face_landmarker.task --out measurements.csv --debug-dir ./debug
```
처음에는 사진 몇 장만으로 돌려 `debug/` 이미지에서 초록·노랑 다각형이 **양 볼 위에 제대로** 그려졌는지 확인하세요. 코·입가·그림자에 걸치면 `CHEEK_IMG_LEFT/RIGHT` 번호를 고칩니다.

## 2) 분석 (CSV만 있으면 어디서든: 내 컴퓨터 또는 Claude 프로젝트 채팅)
```
pip install numpy pandas
python analyze_reliability.py --in measurements.csv --out-dir results
```
