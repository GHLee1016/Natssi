// PC 소개 페이지(랜딩). PC(마우스, 900px 이상) + 로그인 전 + 처음 온 사람에게만 보인다(App.jsx가 고른다).
// 심사위원과 처음 온 사람이 낯씨가 뭔지 바로 알고, 한 번 눌러 예시를 둘러보거나 폰으로 시작할 수 있게.
// 화면 미리보기는 docs/readme의 실제 캡처를 줄여 public/landing에 둔 것. 문구는 처리방침(Legal.jsx)과 어긋나지 않게 쓴다.
import { QR } from './Capture.jsx'

const STEPS = [
  ['매일 피부를 기록해요', '하루 한 번, 얼굴 사진 한 장과 따가움, 화끈거림, 가려움, 당김을 기록해요.'],
  ['루틴은 한 번에 하나만 바꿔요', '제품을 한 번에 하나씩 바꾸면 사용 전후의 피부 변화를 비교하기 쉬워요.'],
  ['루틴 변경 전후를 비교해요', '볼의 붉은기를 평소와 비교해 얼굴 날씨로 보여 줘요. 루틴을 바꾼 날짜도 그래프에서 확인할 수 있어요.'],
]

const TRUST = [
  ['얼굴 전체 사진은 서버에 보내지 않아요', '얼굴 사진은 기기에서 분석하고, 측정값만 서버에 보내요. 두 날짜를 겹쳐 보고 싶으면 얼굴 사진을 그 기기에만 남길 수 있어요.'],
  ['의료 진단은 하지 않아요', '얼굴 날씨는 평소 붉은기와 비교한 참고 정보예요. 피부 증상이 계속되면 해당 제품 사용을 중단하고 피부과 전문의와 상담해 주세요.'],
  ['제품을 팔거나 추천하지 않아요', '광고도 없어요. 제품 정보는 내가 쓰는 제품을 기록하고 비교할 때만 써요.'],
  ['AI는 문장만 다듬어요', '얼굴 날씨는 측정값과 기록에 따라 정해져요. AI 문장 다듬기에 동의한 경우에만 가명 처리한 기록 요약을 AI 서비스에 보내요.'],
]

// 할 수 있는 것과 한계: 숫자와 규칙을 정직하게(README '재 본 숫자', backend/app/judge.py와 같은 내용)
const LIMITS = [
  ['예비 측정 오차는 약 ±2.35예요', '팀원 3명이 같은 조건에서 반복 촬영해 확인한 예비 측정값(MDC95)이에요. 이보다 작은 차이는 실제 변화인지 구분하기 어려워요.'],
  ['조명이 달라지면 비교하기 어려워요', '팀원 사진에 조명 색 필터를 적용한 실험으로 비교 기준을 정했어요. 조명 색이 평소와 다르게 측정되면 얼굴 날씨를 안개로 표시해요.'],
  ['원인을 단정하지 않아요', '루틴을 바꾼 날짜와 붉은기 변화를 함께 보여 줘요. 피부가 달라진 원인은 이 기록만으로 알 수 없어요.'],
  ['찍는 환경에 따라 숫자가 달라져요', '조명, 각도, 거리, 화장에 따라 측정값이 달라질 수 있어요. 같은 스마트폰으로 비슷한 환경에서 촬영해 주세요.'],
]

// 자주 묻는 질문: 처리방침(Legal.jsx)과 지금 동작에 맞는 사실만
const FAQ = [
  ['진단해 주나요?', '아니요. 낯씨는 평소 붉은기와 비교해 얼굴 날씨를 보여 주는 기록 서비스예요. 피부 질환이나 변화의 원인을 진단하지 않아요. 증상이 계속되면 해당 제품 사용을 중단하고 피부과 전문의와 상담해 주세요.'],
  ['얼굴 사진은 어디에 저장되나요?', '얼굴 전체 사진은 기기에서 분석하며 서버로 보내지 않아요. 촬영 상태를 확인하기 위해 측정값을 서버에 보내고, 로그인한 경우 촬영 조건을 충족한 사진의 볼 색상 측정값 3개만 하루 한 번 저장해요. 내 계정에서 ‘이 기기에 얼굴 사진 보관’을 켜면, 두 날짜를 겹쳐 볼 수 있게 얼굴 사진을 그 기기에만 남겨요.'],
  ['왜 사진을 7일간 기록해야 하나요?', '사람마다 피부색이 달라 먼저 7일간의 사진 기록으로 붉은기 범위를 만들어요. 비교 기준이 만들어지면 다음 기록부터 얼굴 날씨를 확인할 수 있어요. 그전에는 기록한 일수를 보여 줘요.'],
  ['조명이 바뀌면 어떻게 되나요?', '조명에 따라 피부색이 다르게 찍힐 수 있어요. 볼의 노란기가 평소 범위를 벗어나면 얼굴 날씨를 안개로 표시해요. 흑백 사진이나 색이 빠진 사진은 다시 촬영해 주세요.'],
  ['앱을 설치해야 하나요?', '별도 앱 설치 없이 스마트폰에서 낯씨를 열고 홈 화면에 추가해 사용할 수 있어요.'],
  ['무료인가요?', '네, 지금은 무료예요. 결제 기능도 없고, 광고나 제품 판매도 하지 않아요.'],
]

// 위쪽 바로가기: 누르면 그 섹션으로('움직임 줄이기'면 바로 이동), 화면 읽기 프로그램도 그 제목부터 읽게 포커스를 옮긴다
const JUMPS = [['ld-how', '쓰는 법'], ['ld-preview', '화면'], ['ld-trust', '개인정보와 측정 안내'], ['ld-faq', '자주 묻는 질문']]
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
          <h1 id="ld-title">루틴을 바꾼 뒤,<br />내 피부는 어떻게<br />달라졌을까요?</h1>
          <p className="ld-lead">매일 얼굴 사진과 피부 증상을 기록해 보세요. 평소 붉은기와 비교한 얼굴 날씨를 확인하고, 루틴을 바꾸기 전후의 피부 변화를 살펴볼 수 있어요.</p>
          <div className="ld-cta">
            <button className="btn dark ld-main" onClick={onExplore}>PC에서 예시 보기</button>
            <button className="btn ghost" onClick={toStart}>스마트폰으로 시작하기</button>
          </div>
          <p className="ld-note">로그인 없이 가상 인물의 4주간 피부 기록을 둘러볼 수 있어요.</p>
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
              alt="모바일 화면 4장: 오늘의 얼굴 날씨, 붉은기 변화 그래프, 내 루틴, 피부 리포트." />
            <figcaption>
              <h3>오늘 내 피부는 평소와 같을까요?</h3>
              <p>볼의 붉은기를 평소와 비교해 맑음, 구름 조금, 흐림으로 보여 줘요.</p>
              <h3>루틴을 바꾼 뒤 피부는 달라졌을까요?</h3>
              <p>최근 4주간의 붉은기 변화와 루틴을 바꾼 날짜를 한눈에 확인해요.</p>
            </figcaption>
          </figure>
          <figure className="ld-shot">
            <img src="/landing/record_ocr.jpg" width="900" height="931" loading="lazy"
              alt="모바일 화면 2장: 사진 촬영 가이드와 성분표에서 인식한 성분 33개를 확인하는 화면." />
            <figcaption>
              <h3>이 제품에는 어떤 성분이 들어 있을까요?</h3>
              <p>성분표를 찍으면 성분 목록을 자동으로 정리하고, 식약처 성분 사전을 참고해 이름을 수정해요.</p>
              <p>레티노이드, 향료 같은 성분 계열도 표시해요.</p>
            </figcaption>
          </figure>
        </div>
        <p className="ld-note ld-example">화면 속 기록은 가상 인물 김서연의 예시예요.</p>
      </section>

      <section className="ld-sec" id="ld-trust" tabIndex={-1} aria-labelledby="ld-trust-t">
        <h2 id="ld-trust-t">사진과 개인정보 보호</h2>
        <ul className="ld-trust">
          {TRUST.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
        </ul>
        <button className="link" onClick={() => onLegal('privacy')}>개인정보 처리방침 자세히 보기</button>
        <h3 className="ld-sub">측정 방법과 주의 사항</h3>
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
          <h2 id="ld-start-t">스마트폰으로 시작하기</h2>
          <p>매일 같은 스마트폰으로 비슷한 환경에서 사진을 찍으면 붉은기를 비교하기 쉬워요.</p>
          <ol className="ld-pwa">
            <li>스마트폰 카메라로 QR 코드를 스캔하면 낯씨가 열려요.</li>
            <li>별도 앱 설치 없이 홈 화면에 추가해 사용할 수 있어요.
              <ul>
                <li>아이폰 Safari: 공유 버튼, 홈 화면에 추가</li>
                <li>안드로이드 Chrome: 메뉴, 홈 화면에 추가(또는 앱 설치)</li>
              </ul>
            </li>
            <li>가입 후 매일 얼굴 사진과 피부 증상을 기록해 주세요. 사진 기록이 7일 쌓이면 다음 사진부터 평소 붉은기와 비교할 수 있어요.</li>
          </ol>
          {onAuth && <button type="button" className="btn ld-signup ld-again" onClick={() => onAuth('signup')}>무료로 시작하기</button>}
        </div>
        <div className="ld-qr">
          <QR text={window.location.origin} label="스마트폰 카메라로 스캔하면 낯씨가 열리는 QR 코드" />
          <p className="small">스마트폰으로 QR 코드 스캔</p>
        </div>
      </section>

      <footer className="ld-foot">
        <div>
          <p>2026 AI 플랫폼 구축 경진대회 출품작, 팀 니얼굴</p>
          <p>낯씨의 결과는 참고용이에요. 의료 진단이 아니에요.</p>
        </div>
        <button className="link" onClick={() => onLegal('privacy')}>개인정보 처리방침</button>
      </footer>
    </div>
  )
}
