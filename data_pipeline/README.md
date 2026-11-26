# data_pipeline — 환경 데이터 · 전성분 OCR (강주희)

앱(backend/frontend)과 따로 돌아가는 파이썬 모듈. **이 폴더 안에서** 실행한다.

```powershell
cd data_pipeline
pip install -r requirements.txt
$env:DATA_GO_KR_KEY = "공공데이터포털 인증키"   # 코드·저장소에 키를 쓰지 않는다
```

## 1. 환경 데이터 (`envdata/`) — 기획서 22쪽 '다른 이유'

| 파일 | 내용 |
|---|---|
| `envdata/airkorea.py` | 에어코리아 자치구 측정소 PM10·PM2.5 시간별 → 일평균 (최근 3개월까지 다시 받기 가능) |
| `envdata/kma.py` | 기상청 ASOS 일자료(서울 108, 과거 기온·습도), 초단기실황(촬영 순간, 5km 격자) |
| `envdata/service.py` | **앱용** (표준 라이브러리만). `attach_env(기록들, 구)` → 기록마다 `env={pm25, humidity, unusual, facts}` |
| `envdata/flags.py` | 같은 판단을 pandas 표로 (분석용) |
| `scripts/update_env.py` | 서울 25개 구 일별 값 → Supabase `env_daily` 또는 `data/env_daily_seoul.csv` (매일 실행) |
| `scripts/backfill_env.py` | 팀원별 일별 표 → `data/env_daily.csv` |
| `analysis/env_skin_prelim.py` | 환경과 볼 붉은기 예비 분석 (방법을 미리 고정). 결과는 `data/prelim_result.md`, 검정력은 `data/prelim_power.csv` |
| `analysis/photo_dates.py` | 사진 파일에서 촬영 날짜 뽑기 |

```powershell
python scripts/backfill_env.py --start 2026-10-15        # 팀원 3명 (성북구·은평구·서대문구)
```

예비 분석에는 `pip install numpy statsmodels`가 더 필요하다(매일 도는 환경값 갱신에는 필요 없어서 requirements.txt에 넣지 않음).
팀원 이름 대신 `팀원A`, `팀원B`, `팀원C`로 적는다. 측정 CSV의 `member` 칸도 같은 이름을 쓴다.
```powershell
python analysis/env_skin_prelim.py power              # 검정력 시뮬레이션
python analysis/env_skin_prelim.py run 측정.csv        # 본 분석 (member,date,redness_a,quality_ok)
```

앱 연결: 기록별 `env = {"pm25": ..., "humidity": ..., "unusual": ...}` 에
`pm25`, `humid_avg`, `env_flags(표, 날짜)["env_changed"]` 를 그대로 넣으면 된다.
실사용자는 자치구 입력이 필요하고, 촬영 때 `kma.fetch_now(*kma.latlon_to_grid(lat, lon))`.

활용신청: 한국환경공단_에어코리아_대기오염정보 / 기상청_지상(종관, ASOS) 일자료 조회서비스 / 기상청_단기예보 조회서비스

## 2. 전성분 OCR (`ingredients/`) — 기획서 18~19쪽 루틴 등록

사진 → RapidOCR(한국어 PP-OCRv5) → '전성분' 구간 자르기 → 식약처 성분사전으로 표준명 맞추기(자모 단위 오타 보정) → 성분 계열(레티노이드·AHA·향료 …).
사전에 없는 이름은 지어내지 않고 `확인 필요`로 돌려 사용자가 고친다.

**잰 숫자** (자세한 조건은 [저장소 README의 '재 본 숫자'](../README.md#재-본-숫자))

| 평가 | 재현율 | 정밀도 |
|---|---|---|
| AI 허브 화장품 성분표 281장 | 0.727 | 0.932 |
| 직접 찍은 정답 세트 8장(읽지 못한 2장 포함) | 0.61 | 0.95 |
| 둥근 통 펴기 전후(닥터자르트 미스트) | 0.55 → 0.82 | 0.90 → 0.91 |

AI 허브 데이터는 국내와 로컬에서만 써서, 281장 사진과 채점 결과는 저장소에 올리지 않았다.

```powershell
python -m ingredients.dictionary              # 식약처 성분사전 1회 다운로드 (활용신청: 식품의약품안전처_화장품 원료성분정보)
python scripts/ocr_eval.py photos/ocr         # 제품명_1.jpg … + 정답 제품명.txt → 일치율·정밀도·소요 시간
```

**정답 평가 세트** (`data/ocr_truth.csv` + `scripts/ocr_truth_eval.py`): 사진마다 '보이는' 전성분을 정답으로 적어 두고,
앱과 같은 경로(`register`)로 읽어 재현율·정밀도·놓친 성분·틀린 성분을 낸다. 사진은 올리지 않고 정답 글자만 올린다.
```powershell
python scripts/ocr_truth_eval.py photos/truth                    # → build/ocr_truth/report.md
python scripts/ocr_truth_eval.py photos/truth --compare-unwarp   # 휜 사진 펴기 끔 vs 켬
python scripts/ocr_truth_eval.py photos/truth --cached           # OCR 원문 재사용: 후처리만 바꿨을 때 몇 초
```
정답 추가: 사진을 `photos/truth/`에 두고 csv에 한 줄(사진 이름, 제품, 모양, 범위, 확인 여부, 메모, 성분). 같은 제품을 돌려 찍은
여러 장은 `photos` 칸에 공백으로 이어 적는다. 정답을 사진과 대조해 확인했으면 `checked`를 `예`로.

```python
from ingredients.pipeline import register
register(["제품_1.jpg", "제품_2.jpg"])   # {"ingredients": [...], "families": [...], "needs_review": [...], "seconds": ...}
```

### OCR 서버 (`ocr_server/`)
```powershell
python -m uvicorn ocr_server.app:app --host 0.0.0.0 --port 7860   # http://localhost:7860 테스트 페이지, /docs API 문서
python scripts/build_space.py                                     # 허깅페이스 Space에 올릴 폴더 → build/hf_space
```

엔진 선택과 계단식 재시도는 이건희의 소비기한 OCR 저장소(itda3-dscover-capybara)를 참고했다.
같은 합성 라벨에서 EasyOCR 대비 장당 32초 → 4초, 한글 오타 6개 → 1개.

### 휜 사진 펴기 (`ingredients/unwarp.py`)
둥근 통·병의 라벨은 휘어 찍혀서 줄을 통째로 놓친다. 사진마다 **원래 사진 + 편 사진**을 둘 다 읽고 글자를 합친다
(PaddleOCR의 문서 펴기 모델 UVDoc, Apache-2.0, ONNX 32MB, 장당 0.3초). 둘은 서로 다른 줄을 찾아서 합치면 늘어난다.

| 둥근 통 사진 | 펴기 없이 | 펴기 함께 |
|---|---|---|
| 닥터자르트 미스트(정답 49) | 30개, 재현율 0.55 | 44개, 재현율 0.82 (정밀도 0.90 → 0.91) |
| 가스비 폼(정답 22) | 17개, 재현율 0.77 | 18개 (정밀도 1.00 → 0.94) |
| 그라펜 포마드 | 20개 | 29개 |
| 5장 걸린 시간(CPU 4개) | 21.5초 | 35.4초 |

- 모델 파일 `models/uvdoc.onnx`는 저장소에 올리지 않는다(.gitignore). `build_space.py`가 있으면 Space 폴더에 넣고, 없으면 펴기 없이 묶는다.
- **끄기**: 환경변수 `NATSSI_UNWARP=0` (Space는 Settings → Variables and secrets). 코드 배포 없이 원래대로 돌아간다.
- 모델 만들기(파이썬 3.12, Paddle 3.3):
  ```powershell
  pip install paddlepaddle paddleocr paddle2onnx
  python -c "from paddleocr import TextImageUnwarping; TextImageUnwarping(model_name='UVDoc')"   # ~/.paddlex/official_models/UVDoc 내려받기
  paddle2onnx --model_dir ~/.paddlex/official_models/UVDoc --model_filename inference.json --params_filename inference.pdiparams --save_file models/uvdoc.onnx --opset_version 14
  ```
  ('onnx_graphsurgeon' 경고는 무시해도 된다. 결과는 Paddle과 같다: 평균 픽셀 차 0.5)

### 여러 장 이어 붙이기 (`ingredients/stitch.py`)
둥근 통을 돌려 가며 찍으면 아래 줄이 새로 보이는 게 아니라 **모든 줄의 오른쪽**이 새로 보인다. 그래서 사진이 2장 이상이면
앞 사진 줄의 끝과 다음 사진 줄의 앞쪽에서 겹친 글자(오독 허용)를 찾아 한 줄로 잇는다('…, 페녹시' + '페녹시에탄올, …').
겹친 부분은 다음 사진 쪽 글자를 쓰고, 줄 짝은 위아래 순서를 지킨다. 끄기: `NATSSI_STITCH=0`.

정답 사진 3장을 겹치게 잘라 만든 '돌려 찍은 사진'(정답 112개, 펴기 켬):

| | 재현율 | 정밀도 |
|---|---|---|
| 한 장 그대로 | 0.723 | 0.920 |
| 2장, 예전(사진마다 따로) | 0.705 | 0.738 |
| **2장, 줄 단위 이어 붙이기** | **0.750** | **0.903** |
| 3장, 예전 / 줄 단위 | 0.786 / 0.768 | 0.871 / 0.860 |

예전 방식은 사진 경계에서 잘린 조각이 엉뚱하게 보정돼 정밀도가 떨어졌다. 실제로 돌려 찍은 사진(가장자리가 눌린)으로는 아직 확인하지 못했다.
