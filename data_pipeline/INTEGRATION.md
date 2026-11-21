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

OCR은 용량(라이브러리 약 290MB)과 시간(사진당 20~40초) 때문에 Vercel 함수에 넣지 않고 **별도 OCR 서버**로 띄웠어요.

**배포 주소: 허깅페이스 Space `alkadsdvs98py/natssi-ocr`** (https://alkadsdvs98py-natssi-ocr.hf.space, 무료 ZeroGPU)
- 앱에서는 **`@gradio/client`** 로 불러요 (Space에서는 포트 제약 때문에 Gradio API만 열려요).
- 앱 주소(`natssiweb.vercel.app`)에서 브라우저로 불러도 CORS 통과 확인했어요.
- 실측: 사진 1장 전체 31초(서버 27초), 글자·자동완성·직접 입력은 1초 안.
- 무료 Space는 한동안 안 쓰면 잠들어요 → 첫 요청이 1~2분 걸릴 수 있어요. **발표 직전에 Space 주소를 한 번 열어 두기.**

```bash
npm i @gradio/client
```
```js
import { Client, handle_file } from "@gradio/client";
const ocr = await Client.connect("alkadsdvs98py/natssi-ocr");      // 앱 시작 때 한 번

// 사진 (File/Blob 1~3장)
const { data: [res] } = await ocr.predict("/ocr", { images: photos.map(f => handle_file(f)) });
// 글자 붙여넣기
const { data: [res2] } = await ocr.predict("/parse", { text: "정제수, 글리세린, ..." });
// 직접 입력 (names는 쉼표로 이은 글자)
const { data: [res3] } = await ocr.predict("/manual", { names: "레티놀, 병풀추출물", families: ["향료"] });
// 자동완성 → [{name, inci, families}]
const { data: [list] } = await ocr.predict("/suggest", { q: "레티" });
```
결과(`res`) 모양은 아래 표의 결과와 같아요. 로컬·터널로 띄운 FastAPI 서버에서는 같은 기능을 REST(`/ocr` 등)로도 불러요.

### 기능 (모두 같은 결과 모양 → 확인 화면 하나로 처리). 표의 주소는 로컬 FastAPI 기준
| 요청 | 보내는 것 | 용도 |
|---|---|---|
| `POST /ocr` | multipart, 필드 `files`에 사진 1~3장 (10MB 이하) | 사진 등록 |
| `POST /parse` | `{"text": "정제수, 글리세린, ..."}` | 글자 붙여넣기 (지금 앱의 글자 입력을 이걸로 바꾸면 오타 교정·계열이 붙음) |
| `POST /manual` | `{"names": ["레티놀"], "families": ["향료"]}` | 둥근 병 등 직접 입력 |
| `GET /suggest?q=레티` | | 성분 자동완성 `[{name, inci, families}]` |
| `GET /families` | | 계열 목록, 다시 물어볼 7개 |

결과:
```json
{"ingredients": [{"name": "판테놀", "inci": "Panthenol", "status": "보정", "ocr": "판테늘", "families": ["판테놀"]}],
 "families": ["레티노이드", "판테놀"],
 "ask_families": ["향료", "알코올", "에센셜오일", "AHA", "BHA", "비타민C"],
 "needs_review": 3, "source": "ocr", "seconds": 29.7,
 "message": "전성분을 찾지 못했어요. ..."}            ← 성분이 0개일 때만
```
확인 화면 제안: `status`가 `보정`이면 "읽은 글자: 판테늘" 작게, `확인 필요`면 빨간색+수정 칸, 아래에 `ask_families` 체크.
→ 사용자가 확인한 결과를 지금 있는 루틴 등록 흐름으로 저장.

- 30초 넘게 걸릴 수 있으니 "성분 읽는 중…" 표시 필요.
- Space 주소를 열면 Gradio 테스트 화면(사진·글자·직접 입력·자동완성 탭)이 나와요. 로컬 FastAPI는 `/` 테스트 페이지, `/docs` API 문서.
- **사진 없는 기능(`/parse`·`/suggest`·`/manual`)은 앱 백엔드(Vercel)에 바로 넣을 수 있어요.** `ingredients/`는 pandas 없이
  rapidfuzz만 쓰고, 사전 CSV(1.6MB)는 `INGREDIENT_DICT` 환경변수나 `ingredients/` 옆 `data/`에서 읽어요.
  그러면 OCR 서버가 꺼져 있어도 글자·직접 입력 등록은 항상 돼요.

### 파이썬에서 직접 쓰기 (서버 없이)
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
