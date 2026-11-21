# 낯씨 (natssi)

홈더마 사용자가 루틴을 한 번에 하나씩 바꾸고, 매일 셀카와 증상을 기록하면 **평소와 달라진 날과 바꾼 시기가 겹치는지** 보여 주는 AI 루틴 일기예요.
판매하지 않고(중립), 진단하지 않아요. 2026 AI 플랫폼 구축 경진대회 출품작이고, 서비스 주소는 https://natssiweb.vercel.app 이에요.

- **로그인 전:** 가상 페르소나 김서연의 4주 기록(10/30~11/26)을 읽기 전용으로 봐요. 환경값은 서대문구 실제 측정값이에요.
- **로그인 후:** 가상 데이터를 섞지 않고 내 기록만 봐요. 사진 기록이 7일 쌓이면 판정·변화·리포트가 열려요(그 전에는 n/7로 잠금).
- 폰 브라우저에서는 아래 탭, 넓은 화면에서는 왼쪽 메뉴로 보여요. 홈 화면에 추가(PWA)할 수 있어요.

## 무엇이 동작하나

| 기능 | 어떻게 |
|---|---|
| 판정 | 코드가 해요(`backend/app/judge.py`). 루틴 버전별 평소 범위 = 중앙값 ± max(MDC95 2.35, 3×1.4826×MAD). 조명이 맞지 않으면(b*) '구분 불가' |
| 촬영 | 얼굴 사진은 **기기 안에서만** 검사해요(MediaPipe: 얼굴 점·고개 각도·표정·선명도·노출·양 볼 L\*a\*b\*). 서버에는 숫자만 보내고, 통과하면 하루 1번 저장 |
| 볼 조각 | 선택 동의한 사람만 양 볼 조각(96px JPEG 2장)을 보관해 두 날 비교에 써요. 동의를 끄거나 탈퇴하면 바로 삭제 |
| 리포트 | 근거 기록 번호가 붙은 틀 문장. 'AI로 문장 다듬기'에 선택 동의한 사람만 가명 요약을 OpenRouter(Upstage Solar)로 보내 문장을 다듬고, 금지어·숫자·근거 번호 검사에 걸리면 틀 문장으로 돌아가요 |
| 인사이트 | 기록 요약(Skin Recap), 14일 챌린지, 루틴이 겹친 시기 안내(`insights.py`) |
| 루틴·제품 | 제품 등록, 제품 사진, 전성분 사진 읽기(OCR) → 성분 목록·성분 계열 |
| 계정 | Supabase Auth 이메일·비밀번호(서버가 중계), 만 14세 이상 확인, 필수·선택 동의 분리, 내 데이터 내려받기·탈퇴 |

### 전성분 OCR
- 사진 OCR은 브라우저가 팀원의 허깅페이스 Space(`alkadsdvs98py/natssi-ocr`, `frontend/src/ocr.js`)를 바로 불러요. 코드는 `data_pipeline/`에 있고 `python scripts/build_space.py`로 묶어 올려요(자세한 건 `data_pipeline/README.md`).
- 후처리: 줄바꿈으로 잘린 이름 잇기, 붙은 두 이름 나누기, 헷갈리는 글자(을→올 등), 중복 제거, 영문 성분명 사전 매칭.
- **휜 사진 펴기(UVDoc):** 둥근 통 사진은 원래 사진과 편 사진을 둘 다 읽어 합쳐요. 정답 있는 둥근 통 4장에서 재현율 0.39 → 0.52. 끄려면 Space 변수 `NATSSI_UNWARP=0`.
- 평가: AI 허브 화장품 성분표 281장(재현율 0.727, 정밀도 0.932), 정답 세트 `data_pipeline/data/ocr_truth.csv` + `scripts/ocr_truth_eval.py`.
- 무료 Space는 잠들면 첫 요청에 1~2분 걸려요. 시연 전에 Space 주소를 한 번 열어 두세요.

## 실행

Python 3.10 이상, Node 18 이상.

```bash
# 서버 (OPEN_MODE는 로그인 없이 개발할 때만. 운영에서는 켜지 않기)
NATSSI_OPEN_MODE=1 uvicorn app.main:app --reload --app-dir backend

# 화면
cd frontend && npm install && npm run dev      # http://localhost:5173
```

폰 카메라는 https 또는 localhost에서만 켜져요.

**테스트**
```bash
cd backend && python3 -m pytest tests -q        # 83개
cd frontend && npm test                          # 측정 식이 파이썬 기준값과 맞는지
cd data_pipeline && python -m pytest tests -q    # 전성분 OCR (rapidocr 필요)
```

**빌드:** `cd frontend && npm run build`. 빌드 전에 `scripts/copy-mediapipe.mjs`가 MediaPipe wasm과 얼굴 모델을 `public/mediapipe`로 복사해요.

## 배포 (Vercel + Supabase)

- `vercel.json`이 빌드(`cd frontend && npm install && npm run build`)와 `/api` → `api/index.py`(FastAPI)를 맡아요. `"framework": null`을 지우면 `/api`가 화면으로 빠지니 그대로 두세요.
- **Supabase:**
  - 새 프로젝트에만 `supabase/schema.sql`을 실행하세요. 첫 줄이 `drop table`이라 **운영 DB에서 실행하면 기록이 지워져요.**
  - 운영 DB에는 `supabase/patch_*.sql`만 써요.
  - 시연용으로는 Authentication → Email의 "Confirm email"을 꺼요.
- **환경변수(Vercel 대시보드에서만 다루고, 채팅·저장소에 올리지 않기):**

| 이름 | 내용 |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Supabase 주소와 키 |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODELS` | AI 문장 다듬기(쉼표 구분, 맨 앞 `upstage/solar-pro4`). 키에 크레딧 상한을 걸고, 계정에서 학습·공개 업체를 막아 두세요 |
| `NATSSI_OCR=1` | 전성분 사진 읽기 켜기. Space 주소를 바꾸면 `vercel.json` CSP의 connect-src도 바꾸기 |
| `NATSSI_RECOVERY=1` | 비밀번호 찾기 켜기. Supabase 커스텀 SMTP를 설정한 뒤에만 |

바꾼 뒤에는 Redeploy가 필요해요. 배포 상태는 `/api/meta`(storage, llm, auth)로 확인해요.

## 구조

```
backend/app/     main.py(API) judge.py(판정) report.py·llm.py(리포트) insights.py(요약·챌린지)
                 store.py(기록 저장) auth.py(로그인) routine.py·ingredients.py·ingr/(루틴·성분)
                 env.py(환경 데이터) quality.py(촬영 품질) ratelimit.py config.py demo_data.py(김서연)
frontend/src/    pages/(Diary, MyDay, Change, Capture, Routine, Report, Insights, Account, Legal …)
                 measure/(기기 안 측정) ocr.js(전성분 Space 호출) public/sw.js(홈 화면 설치용, 캐시 없음)
data_pipeline/   ingredients/(전성분 OCR·후처리) ocr_server/(Space) envdata/·scripts/update_env.py(환경 데이터)
supabase/        schema.sql(새 설치 전용), patch_*.sql(운영 DB용)
```

## 지켜야 할 것

- 판정은 코드가 하고, LLM은 문장만 다듬어요. LLM에는 이름·이메일·사진·제품 이름·날짜·볼 색 측정값을 보내지 않아요.
- 얼굴 전체 사진은 서버에 저장하지 않아요. 처리방침(`frontend/src/pages/Legal.jsx`)과 실제 동작이 일치해야 해요(공모전용 초안, 실서비스 전 법률 검토 필요).
- 서비스 워커에 캐시를 넣지 않아요.
- 얼굴 예시 이미지(`frontend/public/faces`)는 AI로 생성한 이미지예요. 표시를 유지하세요.
- 김서연 데이터는 가상이에요. MDC95 2.35는 팀원 3명의 반복 셀카로 낸 예비값이에요(95% 신뢰구간 1.85~2.97).
- 환경값 CSV(`backend/app/data/env_daily_seoul.csv`)는 11/19까지 있어요. 11/26 이후 `data_pipeline/scripts/update_env.py`로 한 번 갱신하세요.
