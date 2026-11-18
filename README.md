# 낯씨 (natssi) — 웹앱 뼈대

가상 페르소나 김서연의 4주 데이터로 다이어리 → 변화 → 겹쳐 비교 → 루틴 → 리포트가 끝까지 열리는 앱입니다.
폰 브라우저에서는 아래 탭, 넓은 화면에서는 왼쪽 메뉴로 보입니다.

## 실행

터미널 두 개가 필요합니다. (Python 3.10 이상, Node 18 이상)

```bash
# 1) 서버
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2) 화면
cd frontend
npm install
npm run dev          # http://localhost:5173
```

같은 와이파이의 폰에서 보려면 `npm run dev`가 알려 주는 Network 주소로 접속하세요.
단, 폰 카메라는 https 또는 localhost에서만 켜집니다. 배포 전에는 "사진 고르기"로 확인하세요.

테스트: `cd backend && pytest`

## 배포: Vercel + Supabase

화면과 API를 Vercel 한 곳에 올리고, 증상 체크인은 Supabase에 저장합니다.
(설정 파일은 준비했지만, 실제 Vercel·Supabase 계정에 올려서 확인하지는 않았습니다.)

1. **Supabase**: 새 프로젝트를 만들고 SQL Editor에서 `supabase/schema.sql`을 실행합니다.
   Project Settings > API에서 Project URL과 `service_role` 키를 복사합니다.
2. **OpenRouter**: openrouter.ai에서 API 키를 만듭니다(무료 모델은 카드 없이 사용 가능).
3. **Vercel**: 이 폴더를 GitHub 저장소로 올린 뒤 Vercel에서 Import 합니다. Root Directory는 저장소 최상위 그대로 둡니다.
   Environment Variables에 `.env.example`의 네 가지를 넣고 Deploy 합니다.

환경변수가 없어도 앱은 열립니다. 이때 리포트는 정해진 틀 문장으로 나오고, 체크인은 저장되지 않습니다.

### LLM 리포트 (OpenRouter 무료 모델)

- 기본 모델 순서: `nvidia/nemotron-3.5-super-vl:free` → `nvidia/nemotron-3-ultra-550b-a55b:free` → `openrouter/free`
- 무료 모델은 자주 바뀌거나 사라집니다. `OPENROUTER_MODELS`로 목록을 바꿀 수 있습니다.
- 무료 한도는 모델당 분당 20회, 하루 200회 정도입니다. 같은 기록에 대한 결과는 서버가 기억해 두고 다시 부르지 않습니다.
- LLM에는 판정에서 뽑은 사실(버전, 일차, 기록 번호, 증상 점수)만 보냅니다. 이름과 사진은 보내지 않습니다.
- LLM 문장은 금지어, 기록에 없는 숫자, 없는 근거 번호, 기록과 다른 증상 점수를 검사합니다. 하나라도 걸리면 정해진 틀 문장으로 돌아갑니다.
- 무료 모델은 입력을 학습에 쓰거나 보관할 수 있습니다. 실제 사용자 데이터를 보내기 전에 OpenRouter의 데이터 정책 설정을 확인하세요.

### 한 서버로 직접 띄우기 (Vercel 없이)

```bash
cd frontend && npm install && npm run build
cd ../backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 구조

```
backend/app/
  config.py      판정 설정값 (MDC95 = 2.35: 팀원 3명 반복 셀카 예비 측정, 2026-11-19)
  demo_data.py   김서연 가상 기록 28일치, 루틴 버전 3개
  judge.py       판정 엔진 (신호 없음 / 관찰 중 / 신호 있음 / 구분 불가)
  report.py      근거 번호를 붙인 리포트 문장 + 문장·기록 대조(verify)
  llm.py         OpenRouter 호출 + LLM 문장 검사(guard)
  store.py       증상 체크인 저장 (Supabase, 없으면 메모리)
  quality.py     촬영 품질 판정 (브라우저가 잰 숫자를 받아 검증 파이프라인과 같은 기준으로 판정)
  main.py        API
frontend/src/
  pages/         Diary, Change(그래프·겹쳐 비교), Capture, Routine, Report
  api.js         서버 호출
```

## 실제로 동작하는 것

- 판정 엔진: 버전별 평소 범위(중앙값 ± max(MDC95, 3×MAD))와 증상 체크인으로 4단계 판정
- 증상 체크인 수정 → 바로 다시 판정 (Supabase에 저장, 설정이 없으면 서버 메모리)
- 리포트: OpenRouter 무료 모델이 문장을 쓰고, 검사에 걸리면 정해진 틀 문장으로 대체. 문장마다 근거 기록 번호
- 겹쳐 비교: 두 날짜 선택, 슬라이더, 붉은기 차이와 오차 범위 비교
- 촬영: 카메라 또는 사진 선택 → **브라우저에서** MediaPipe로 얼굴 점·고개 각도·표정, 선명도·노출, 양 볼 a* 측정(`frontend/src/measure/`) → 숫자만 서버로 보내 품질 판정(`/api/capture`). 사진은 서버로 보내지 않고, 숫자도 저장하지 않음

## 아직 자리만 있는 것 (파트별 연결 지점)

| 할 일 | 넣을 곳 |
|---|---|
| 측정한 볼 a*를 내 기록에 저장해 판정에 쓰기(사진은 저장하지 않음, 처리방침 갱신 필요) | `backend/app/store.py`, `/api/capture`, `judge.py` |
| 이어서 묻기 답변을 LLM으로 | `backend/app/report.py`의 `answer()` (지금은 정해진 답) |
| 전성분 OCR, 새 제품 등록, 버전 추가 | 새 API + `frontend/src/pages/Routine.jsx` |
| 환경 데이터(서울시·기상청) | `demo_data.py`의 `env` 자리 |
| 로그인 | 없음 (지금은 누구나 같은 가상 데이터를 봄) |

## 촬영 측정 (2026-11-19)

- 계산 식은 검증 파이프라인(`natssi_selfie_validation/code/measure_redness.py`)과 같아요: 볼 영역 랜드마크 번호, sRGB→CIELAB, 날아간·어두운 픽셀 제외, a* 중앙값, 흐림(256px INTER_AREA → 라플라시안 분산), 머리 자세(pitch +3.7° 보정).
- `cd frontend && npm test` — 같은 그림을 파이썬·OpenCV로 잰 기준값과 JS 결과가 맞는지 확인(볼 a* ±0.05, 흐림 ±0.2%, 자세 일치).
- `npm run build`·`npm run dev` 전에 `scripts/copy-mediapipe.mjs`가 MediaPipe wasm을 `public/mediapipe`로 복사하고 얼굴 모델(약 3.6MB)을 받아 둡니다. 모델을 못 받으면 앱이 실행 중에 Google 주소에서 받아요.
- 처리방침 버전이 바뀌면(`config.CONSENT_VERSION`) 촬영 화면에서 바뀐 사진 안내에 다시 동의해야 촬영할 수 있어요(`/api/account/consent`, 로그인 없이 쓰면 이 브라우저에만 기억).

## 주의

- 얼굴 사진 3장(`frontend/public/faces`)은 AI로 생성한 이미지입니다. 화면에 표시를 유지하세요.
- 데이터는 모두 가상입니다. MDC95 2.35는 팀원 3명(같은 폰·같은 장소)의 반복 셀카로 계산한 예비값이에요(95% 신뢰구간 1.85~2.97). 사진이 늘면 다시 계산해 갱신합니다.


## 로그인·보안 (v0.2)

- **로그인**: Supabase Auth 이메일+비밀번호. 브라우저는 이 서버(`/api/auth/*`)를 거치므로 화면 코드에 Supabase 키가 들어가지 않습니다.
- **로그인 전**: 김서연 가상 데이터를 읽기 전용으로 봅니다(저장·초기화·탈퇴 API는 401).
- **로그인 후**: 예시 기록 위에 **내 증상 체크인**만 덮어 보입니다. 데이터는 `user_id`로 분리되고 RLS 정책이 걸려 있습니다.
- **내 데이터**: `/api/account/export`(내려받기), `DELETE /api/account`(체크인+계정 삭제).
- **동의**: 가입 때 이용약관·개인정보·얼굴 사진 처리 안내에 모두 동의해야 하며, 약관 버전과 시각이 사용자 메타데이터에 기록됩니다. 문구는 `frontend/src/pages/Legal.jsx` — **초안이므로 법률 검토 후 [대괄호]를 채우세요.**
- **제한**: 호출 횟수(`config.LIMITS`, 인스턴스별 최선 노력 방식). 촬영은 측정값(숫자)만 받고 범위를 벗어난 값은 422로 거절.
- **환경변수**(Vercel): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODELS`. 로컬 개발은 `NATSSI_OPEN_MODE=1`.
- **Supabase 설정**: `supabase/schema.sql`(v2)을 실행하고, Authentication → Providers에서 Email을 켭니다. 시연용으로 메일 인증을 끄려면 Authentication → Sign In / Providers → Email의 "Confirm email"을 끄세요.
- 실제 호출 상한은 OpenRouter 키의 크레딧 한도로도 함께 거세요.
