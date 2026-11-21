# data_pipeline — 환경 데이터 · 전성분 OCR (강주희)

**앱에 붙이는 방법은 [INTEGRATION.md](INTEGRATION.md)** 에 정리했어요.

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

```powershell
python scripts/backfill_env.py --start 2026-10-15        # 팀원 3명 (성북구·은평구·서대문구)
```

앱 연결: 기록별 `env = {"pm25": ..., "humidity": ..., "unusual": ...}` 에
`pm25`, `humid_avg`, `env_flags(표, 날짜)["env_changed"]` 를 그대로 넣으면 된다.
실사용자는 자치구 입력이 필요하고, 촬영 때 `kma.fetch_now(*kma.latlon_to_grid(lat, lon))`.

활용신청: 한국환경공단_에어코리아_대기오염정보 / 기상청_지상(종관, ASOS) 일자료 조회서비스 / 기상청_단기예보 조회서비스

## 2. 전성분 OCR (`ingredients/`) — 기획서 18~19쪽 루틴 등록

사진 → RapidOCR(한국어 PP-OCRv5) → '전성분' 구간 자르기 → 식약처 성분사전으로 표준명 맞추기(자모 단위 오타 보정) → 성분 계열(레티노이드·AHA·향료 …).
사전에 없는 이름은 지어내지 않고 `확인 필요`로 돌려 사용자가 고친다.

```powershell
python -m ingredients.dictionary              # 식약처 성분사전 1회 다운로드 (활용신청: 식품의약품안전처_화장품 원료성분정보)
python scripts/ocr_eval.py photos/ocr         # 제품명_1.jpg … + 정답 제품명.txt → 일치율·정밀도·소요 시간
```

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
