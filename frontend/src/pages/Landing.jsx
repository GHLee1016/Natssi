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

export default function Landing({ onExplore, onLegal, onAuth }) {
  const toStart = () => {
    const el = document.getElementById('landing-start')
    el?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    el?.focus({ preventScroll: true })
  }
  return (
    <div className="landing">
      <header className="ld-top">
        <button type="button" className="ld-logo" onClick={() => window.scrollTo(0, 0)} aria-label="낯씨 소개 맨 위로"><img src="/logo.svg" alt="" />낯씨</button>
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
          <p className="ld-note">예시는 김서연(가상 인물)의 4주 기록이에요. 로그인하지 않아도 다이어리, 변화, 루틴, 리포트를 둘러볼 수 있어요.</p>
        </div>
        <figure className="ld-shot ld-hero-shot">
          <img src="/landing/web.jpg" width="1400" height="900" alt="PC에서 본 낯씨 다이어리 예시 화면. 이달 요약 숫자, 루틴을 바꾼 날이 점선으로 표시된 4주 볼 붉은기 그래프, 오늘의 얼굴 날씨 맑음." />
        </figure>
      </section>

      <section className="ld-sec" aria-labelledby="ld-how">
        <h2 id="ld-how">이렇게 써요</h2>
        <ol className="ld-steps">
          {STEPS.map(([t, d], i) => (
            <li key={t}><span className="ld-num" aria-hidden="true">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </section>

      <section className="ld-sec" aria-labelledby="ld-preview">
        <h2 id="ld-preview">화면 미리보기</h2>
        <div className="ld-previews">
          <figure className="ld-shot">
            <img src="/landing/phones.jpg" width="1600" height="847" loading="lazy"
              alt="폰 화면 네 장. 다이어리의 오늘 얼굴 날씨, 볼 붉은기 흐름 그래프, 내 루틴, 근거가 붙은 리포트." />
            <figcaption>폰에서 보는 다이어리, 변화, 루틴, 리포트</figcaption>
          </figure>
          <figure className="ld-shot">
            <img src="/landing/record_ocr.jpg" width="900" height="931" loading="lazy"
              alt="폰 화면 두 장. 좋은 사진과 피할 사진을 보여 주는 촬영 전 안내, 전성분 사진에서 읽은 성분 33개를 확인하는 화면." />
            <figcaption>셀카 기록과 전성분 사진 읽기</figcaption>
          </figure>
        </div>
      </section>

      <section className="ld-sec" aria-labelledby="ld-trust">
        <h2 id="ld-trust">믿고 쓸 수 있게</h2>
        <ul className="ld-trust">
          {TRUST.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
        </ul>
        <button className="link" onClick={() => onLegal('privacy')}>개인정보 처리방침 자세히 보기</button>
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
        </div>
        <div className="ld-qr">
          <QR text={window.location.origin} label="폰 카메라로 비추면 낯씨가 열리는 QR 코드" />
          <p className="small">폰 카메라로 비춰 주세요</p>
        </div>
      </section>

      <footer className="ld-foot">
        <p>2026 AI 플랫폼 구축 경진대회 출품작, 팀 니얼굴</p>
        <button className="link" onClick={() => onLegal('privacy')}>개인정보 처리방침</button>
      </footer>
    </div>
  )
}
