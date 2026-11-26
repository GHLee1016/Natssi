// PC 소개 페이지(랜딩). PC(마우스, 900px 이상) + 로그인 전 + 처음 온 사람에게만 보인다(App.jsx가 고른다).
// 심사위원과 처음 온 사람이 낯씨가 뭔지 바로 알고, 한 번 눌러 예시를 둘러보거나 폰으로 시작할 수 있게.
// 화면 미리보기는 docs/readme의 실제 캡처를 줄여 public/landing에 둔 것. 문구는 처리방침(Legal.jsx)과 어긋나지 않게 쓴다.
import { QR } from './Capture.jsx'

const STEPS = [
  ['폰으로 셀카와 증상을 남겨요', '하루 한 번, 셀카 한 장과 따가움, 화끈, 가려움, 당김을 0~3으로 남겨요. 1분이면 돼요.'],
  ['루틴은 한 번에 하나만 바꿔요', '제품을 더하거나 빈도를 바꿀 때 하나씩 바꾸면, 무엇이 달라졌는지 알 수 있어요.'],
  ['바꾼 시기와 붉어진 시기를 겹쳐 봐요', '볼 붉은기를 내 평소 범위와 비교해 맑음과 흐림으로 보여 주고, 루틴을 바꾼 날을 그래프에 함께 표시해요.'],
]

const TRUST = [
  ['얼굴 사진은 서버로 보내지 않아요', '사진은 폰 안에서 분석하고, 서버에는 볼 색 숫자만 보내요. 볼 부분 작은 사진 보관은 따로 동의한 경우에만 해요.'],
  ['진단하지 않아요', '얼굴 날씨는 내 평소 기록과 비교한 참고 결과예요. 증상이 계속되면 사용을 멈추고 전문의와 상담해 주세요.'],
  ['제품을 팔거나 추천하지 않아요', '광고도 없어요. 내가 쓰는 제품을 기록하고 비교하는 데만 써요.'],
  ['판정은 코드가 해요', 'AI는 리포트 문장만 다듬어요. 내 기록은 AI로 문장 다듬기에 동의한 경우에만 가명 요약으로 보내요.'],
]

// 할 수 있는 것과 한계: 숫자와 규칙을 정직하게(README '재 본 숫자', backend/app/judge.py와 같은 내용)
const LIMITS = [
  ['사진을 반복해서 찍을 때 생기는 차이는 ±2.35 정도예요', '팀원 3명이 같은 조건에서 여러 번 찍어 확인한 예비값(MDC95)이에요. 이보다 작은 차이는 실제 변화인지 구분하기 어려워서 평소와 같다고 봐요.'],
  ['조명이 다르면 판정을 미뤄요', '팀원 사진에 조명 색 필터를 씌워 본 실험으로 규칙을 만들었어요. 볼 색이 내 평소와 다르게 찍힌 날은 맑음이나 흐림 대신 안개로 둬요.'],
  ['원인을 단정하지 않아요', '루틴을 바꾼 시기와 붉어진 시기가 겹치는지만 보여 줘요. 무엇 때문인지, 어떤 상태인지는 말하지 않아요.'],
  ['사진에 따라 달라질 수 있어요', '조명, 각도, 거리, 화장에 따라 숫자가 흔들려요. 같은 폰으로 같은 자리에서 찍을수록 비교가 정확해져요.'],
]

// 자주 묻는 질문: 처리방침(Legal.jsx)과 지금 동작에 맞는 사실만
const FAQ = [
  ['진단해 주나요?', '아니요. 낯씨는 내 평소 기록과 비교해 달라진 날을 날씨로 보여 주는 기록 서비스예요. 병명이나 원인은 말하지 않아요. 증상이 계속되면 사용을 멈추고 전문의와 상담해 주세요.'],
  ['얼굴 사진은 어디에 저장되나요?', '얼굴 사진은 서버로 보내지 않아요. 폰 안에서 분석하고, 서버에는 볼 색 숫자만 보내요. 로그인하면 품질 검사를 통과한 사진의 볼 색 숫자 3개만 하루 한 번 남겨요. 양 볼의 작은 조각 사진은 따로 동의한 경우에만 보관하고, 동의를 끄면 바로 지워요.'],
  ['왜 사진 기록 7일이 필요한가요?', '사람마다 원래 볼 색이 달라서, 먼저 7일 동안 내 평소 범위를 만들어요. 그다음 날부터 그 범위와 비교해 맑음과 흐림을 알려 드려요. 그 전에는 며칠째인지 보여 드려요.'],
  ['조명이 바뀌면 어떻게 되나요?', '볼 색은 조명 색에 따라 달라져요. 그래서 볼의 노란기가 내 평소 범위를 벗어난 날은 판정을 안개로 미뤄요. 흑백이나 색이 빠진 사진은 품질 검사에서 다시 찍어 달라고 해요.'],
  ['앱을 설치해야 하나요?', '앱 스토어 앱은 없어요. 폰 브라우저로 열고 홈 화면에 추가하면 앱처럼 쓸 수 있어요.'],
  ['무료인가요?', '네, 지금은 무료예요. 결제 기능이 없고, 광고나 제품 판매도 하지 않아요.'],
]

// 위쪽 바로가기: 누르면 그 섹션으로('움직임 줄이기'면 바로 이동), 화면 읽기 프로그램도 그 제목부터 읽게 포커스를 옮긴다
const JUMPS = [['ld-how', '쓰는 법'], ['ld-preview', '화면'], ['ld-trust', '믿을 수 있는 이유'], ['ld-faq', '자주 묻는 질문']]
const smooth = () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
function jump(id) {
  const el = document.getElementById(id)
  el?.scrollIntoView({ behavior: smooth() ? 'smooth' : 'auto', block: 'start' })
  el?.focus({ preventScroll: true })
}

export default function Landing({ onExplore, onLegal, onAuth }) {
  const toStart = () => jump('landing-start')
  return (
    <div className="landing">
      <header className="ld-top">
        <button type="button" className="ld-logo" onClick={() => window.scrollTo(0, 0)} aria-label="낯씨 소개 맨 위로"><img src="/logo.svg" alt="" />낯씨</button>
        <nav className="ld-jumps" aria-label="소개 바로가기">
          {JUMPS.map(([id, label]) => <a key={id} href={'#' + id} onClick={(e) => { e.preventDefault(); jump(id) }}>{label}</a>)}
        </nav>
        {onAuth && (
          <nav className="ld-acct" aria-label="계정">
            <button type="button" className="link" onClick={() => onAuth('login')}>로그인</button>
            <button type="button" className="btn ld-signup" onClick={() => onAuth('signup')}>무료로 시작하기</button>
          </nav>
        )}
      </header>
      <section className="ld-hero" aria-labelledby="ld-title">
        <div className="ld-hero-text">
          <p className="ld-eyebrow">얼굴 날씨로 보는 루틴 일기</p>
          <h1 id="ld-title">루틴을 바꾼 뒤<br />내 얼굴이 어떤지<br />날씨처럼 보여 드려요</h1>
          <p className="ld-lead">매일 셀카 한 장과 증상 네 가지를 남기면, 내 평소 기록과 비교해 맑음과 흐림으로 알려 줘요. 루틴을 바꾼 시기와 볼이 붉어진 시기가 겹치는지 한눈에 볼 수 있어요.</p>
          <div className="ld-cta">
            <button className="btn dark ld-main" onClick={onExplore}>PC에서 예시 둘러보기</button>
            <button className="btn ghost" onClick={toStart}>폰으로 시작하기</button>
          </div>
          <p className="ld-note">예시는 김서연(가상 인물)의 4주 기록이에요. 로그인하지 않아도 다이어리, 변화, 루틴 관리, 리포트를 둘러볼 수 있어요.</p>
        </div>
        <figure className="ld-shot ld-hero-shot">
          <img src="/landing/web.jpg" width="1400" height="900" alt="PC에서 본 낯씨 다이어리 예시 화면. 이달 요약 숫자, 루틴을 바꾼 날이 점선으로 표시된 4주 볼 붉은기 그래프, 오늘의 얼굴 날씨 맑음." />
        </figure>
      </section>

      <section className="ld-sec" id="ld-how" tabIndex={-1} aria-labelledby="ld-how-t">
        <h2 id="ld-how-t">이렇게 써요</h2>
        <ol className="ld-steps">
          {STEPS.map(([t, d], i) => (
            <li key={t}><span className="ld-num" aria-hidden="true">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </section>

      <section className="ld-sec" id="ld-preview" tabIndex={-1} aria-labelledby="ld-preview-t">
        <h2 id="ld-preview-t">화면 미리보기</h2>
        <div className="ld-previews">
          <figure className="ld-shot">
            <img src="/landing/phones.jpg" width="1600" height="847" loading="lazy"
              alt="폰 화면 네 장. 다이어리의 오늘 얼굴 날씨, 볼 붉은기 흐름 그래프, 내 루틴, 근거가 붙은 리포트." />
            <figcaption>
              <h3>오늘 내 얼굴, 평소와 같을까요?</h3>
              <p>볼 붉은기를 내 평소 범위와 비교해 맑음, 구름 조금, 흐림으로 보여 줘요.</p>
              <h3>루틴을 바꾼 뒤 달라졌을까요?</h3>
              <p>4주 흐름에 루틴을 바꾼 날을 함께 그려서, 시기가 겹치는지 한눈에 봐요.</p>
            </figcaption>
          </figure>
          <figure className="ld-shot">
            <img src="/landing/record_ocr.jpg" width="900" height="931" loading="lazy"
              alt="폰 화면 두 장. 좋은 사진과 피할 사진을 보여 주는 촬영 전 안내, 전성분 사진에서 읽은 성분 33개를 확인하는 화면." />
            <figcaption>
              <h3>이 제품, 어떤 성분이 들었을까요?</h3>
              <p>전성분 사진을 찍으면 성분을 하나씩 나누고, 식약처 성분 사전으로 오타를 고쳐요.</p>
              <p>레티노이드나 향료처럼 성분 계열도 함께 표시해요.</p>
            </figcaption>
          </figure>
        </div>
        <p className="ld-note ld-example">화면 속 기록은 가상 인물 김서연의 예시예요.</p>
      </section>

      <section className="ld-sec" id="ld-trust" tabIndex={-1} aria-labelledby="ld-trust-t">
        <h2 id="ld-trust-t">믿고 쓸 수 있게</h2>
        <ul className="ld-trust">
          {TRUST.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
        </ul>
        <button className="link" onClick={() => onLegal('privacy')}>개인정보 처리방침 자세히 보기</button>
        <h3 className="ld-sub">할 수 있는 것과 한계</h3>
        <ul className="ld-limits">
          {LIMITS.map(([t, d]) => <li key={t}><b>{t}</b><p>{d}</p></li>)}
        </ul>
      </section>

      <section className="ld-sec" id="ld-faq" tabIndex={-1} aria-labelledby="ld-faq-t">
        <h2 id="ld-faq-t">자주 묻는 질문</h2>
        <div className="ld-faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="ld-sec ld-start" id="landing-start" tabIndex={-1} aria-labelledby="ld-start-t">
        <div>
          <h2 id="ld-start-t">폰으로 시작하기</h2>
          <p>기록은 폰으로 해요. 매일 같은 폰으로, 같은 자리에서 찍어야 볼 붉은기를 비교할 수 있어서예요.</p>
          <ol className="ld-pwa">
            <li>폰 카메라로 오른쪽 QR을 비추면 낯씨가 열려요.</li>
            <li>앱 스토어 앱은 없어요. 홈 화면에 추가하면 앱처럼 열 수 있어요.
              <ul>
                <li>아이폰 Safari: 공유 버튼, 홈 화면에 추가</li>
                <li>안드로이드 Chrome: 메뉴, 홈 화면에 추가(또는 앱 설치)</li>
              </ul>
            </li>
            <li>가입하고 매일 셀카와 증상을 남겨요. 사진 기록이 7일 쌓이면 내 평소 범위와 비교해요.</li>
          </ol>
          {onAuth && <button type="button" className="btn ld-signup ld-again" onClick={() => onAuth('signup')}>무료로 시작하기</button>}
        </div>
        <div className="ld-qr">
          <QR text={window.location.origin} label="폰 카메라로 비추면 낯씨가 열리는 QR 코드" />
          <p className="small">폰 카메라로 비춰 주세요</p>
        </div>
      </section>

      <footer className="ld-foot">
        <div>
          <p>2026 AI 플랫폼 구축 경진대회 출품작, 팀 니얼굴</p>
          <p>낯씨의 결과는 참고 정보이며 의료 진단이 아니에요.</p>
        </div>
        <button className="link" onClick={() => onLegal('privacy')}>개인정보 처리방침</button>
      </footer>
    </div>
  )
}
