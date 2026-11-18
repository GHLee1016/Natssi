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
| `envdata/flags.py` | 최근 3일 vs 그 전 14일 중앙값 → 사실 문장 + `env_changed` |
| `scripts/backfill_env.py` | 팀원별 일별 표 → `data/env_daily.csv` |

```powershell
python scripts/backfill_env.py --start 2026-10-15        # 팀원 3명 (성북구·강서구·서대문구)
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

엔진 선택과 계단식 재시도는 이건희의 소비기한 OCR 저장소(itda3-dscover-capybara)를 참고했다.
같은 합성 라벨에서 EasyOCR 대비 장당 32초 → 4초, 한글 오타 6개 → 1개.
