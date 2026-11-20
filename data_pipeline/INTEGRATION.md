# 앱에 붙이기 (이건희 님께)

`data_pipeline/`은 앱 코드(backend/frontend)를 건드리지 않았어요. 아래 순서로 붙이면 돼요.

---

## A. 환경 데이터 — 기록마다 실제 `env` 넣기

지금 `demo_data.py`의 `env`는 난수예요. `envdata/service.py`가 **같은 모양**(`pm25`, `humidity`, `unusual`)으로
실제 값을 돌려줘서 `judge.py`·화면은 그대로 두면 돼요. 표준 라이브러리만 써서 Vercel 함수에 그대로 들어가요.

### 1) Supabase 표 만들기 (한 번)
`data_pipeline/supabase_env.sql`을 SQL Editor에서 실행 → `env_daily`(서울 25개 구 일별 값, 누구나 읽기), `profiles`(사용자 구).

### 2) 표 채우기
```bash
cd data_pipeline
pip install -r requirements.txt
export DATA_GO_KR_KEY=...  SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...
python scripts/update_env.py --start 2026-10-01     # 처음 한 번 (25개 구 × 50일 ≈ 3분)
```
매일 자동: `deploy/env_daily.yml`을 `.github/workflows/`로 옮기고 저장소 Secrets에 위 세 값을 넣으면 매일 아침 7시(한국)에 어제 값까지 채워요.
**발표일(11/27)까지 매일 돌아야** 데모 날짜에 값이 있어요.

### 3) 백엔드에서 부르기
`envdata/service.py`를 `backend/app/env.py`로 복사(또는 import 경로 추가)하고:
```python
from .env import attach_env, summarize

records = attach_env(records, district)   # district: profiles.district (없으면 env를 건드리지 않음)
judged = judge.judge_all(records)        # judge.py는 그대로: env["unusual"]이면 '신호 있음' → '구분 불가'
```
데모(김서연)에도 실제 값을 쓰려면 `attach_env(demo_records, "서대문구")`.
→ 확인해 보니 **11/7(버전 2) 하루가 '신호 있음' → '구분 불가'(전날 기온이 크게 바뀌었어요)** 로 바뀌어요.
공공데이터로 '다른 이유'를 가려내는 장면이라 발표에 쓰기 좋아요. 데모 이야기가 바뀌니 같이 정해요.

### 4) 리포트 문장 (report.py)
지금은 고정 문장이에요. `env["facts"]`로 바꾸면 실제 사실을 말해요.
```python
# build_report: "같은 날 미세먼지·습도는 평소와 비슷했어요." 대신
for t in summarize([r["env"] for r in sig_records]):
    sentences.append({"text": t, "cites": f["signal_ids"]})
# answer("other")도 같은 summarize 결과를 쓰면 돼요
```
facts 예: `최근 3일 초미세먼지가 평소보다 높았어요.` / `최근 3일 공기가 평소보다 건조했어요.` / `전날 기온이 크게 바뀌었어요.`
('때문에'라고 쓰지 않아요. 기획서 22쪽)

### 5) 화면
- 내 계정: '사는 구' 고르기 (25개, 선택 사항) → `profiles` upsert
- 다이어리 `환경 · 초미세먼지 · 습도 · 평소와 달라요` 줄은 그대로 동작. 원하면 `env.facts`를 작게 보여 주기

### 기준값
`service.THRESHOLDS`. 서울 25개 구 10/19~11/19로 재 보니 처음 기준(미세먼지 1.5배)은 **44%의 날**을 '평소와 달라요'로 만들어서
2배·습도 20%p로 바꿨어요 → **8%**. 테스트: `python -m pytest tests -q`

---

## B. 전성분 OCR — 루틴 제품 등록

main에 '전성분 글자 입력으로 제품 등록'이 생겼으니, 그 앞에 사진 → 글자 단계만 붙이면 돼요.

```python
from ingredients.pipeline import register, from_text, suggest, from_names
from ingredients.families import ASK_FAMILIES

res = register([사진경로1, 사진경로2])   # {"ingredients": [{kor, inci, status, families}], "families": [...], "needs_review": [...]}
res = from_text(붙여넣은_전성분_글)        # 글자 입력도 같은 결과 모양
suggest("레티")                           # 자동완성 (식약처 사전 21,968개, 오타도 찾음)
from_names(["레티놀", "병풀추출물"], extra_families=["향료"])   # 둥근 병 등 직접 입력
```
- `status`: `일치` / `보정`(오타 고침 → 화면에 표시) / `확인 필요`(사전에 없음 → 사용자가 고침)
- 결과 화면에 `ASK_FAMILIES`(향료·알코올·에센셜오일·레티노이드·AHA·BHA·비타민C) 체크를 함께 보여 주세요.
  OCR이 놓치는 30%가 주로 이런 뒤쪽 성분이에요.
- 정답 20장 결과: 성분 일치율 67%(평평한 면), 정밀도 88%, **없는 계열을 붙인 경우 0건**.
- 주의: RapidOCR·onnxruntime·opencv는 Vercel 함수 용량(250MB)에 빠듯해요. 사진 OCR은 별도 서버나
  브라우저 밖에서 돌리고, 앱에는 `from_text`·`suggest`·`from_names`(가벼움, rapidfuzz만 필요)부터 붙이는 걸 추천해요.
