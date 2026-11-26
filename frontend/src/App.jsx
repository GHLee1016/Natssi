import { useEffect, useRef, useState } from 'react'
import { setNav, wireNav, ensureGuard, pushEntry, killAll, useBackLayer } from './nav.js'
import { api, session } from './api.js'
import { useLoad, Status } from './useLoad.jsx'
import Diary from './pages/Diary.jsx'
import MyDay from './pages/MyDay.jsx'
import Welcome from './pages/Welcome.jsx'
import Landing from './pages/Landing.jsx'
import { useDesk } from './pages/Capture.jsx'
import { InAppBanner } from './install.jsx'
import Splash from './pages/Splash.jsx'
import Change from './pages/Change.jsx'
import Capture from './pages/Capture.jsx'
import Routine from './pages/Routine.jsx'
import MyRoutine from './pages/MyRoutine.jsx'
import Report from './pages/Report.jsx'
import Auth from './pages/Auth.jsx'
import Legal from './pages/Legal.jsx'
import Account from './pages/Account.jsx'

const TABS = [
  { id: 'diary', label: '다이어리', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zm3 5h7M8 13h7' },
  { id: 'change', label: '변화', icon: 'M4 19h16M6 15l4-5 4 3 5-7' },
  { id: 'capture', label: '기록', icon: 'M4 8h3l2-3h6l2 3h3v11H4V8zm8 2.500a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7z' },
  { id: 'routine', label: '루틴', icon: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z' },
  { id: 'report', label: '리포트', icon: 'M5 5h14v10H10l-5 4V5z' },
]

// 로그인한 사용자의 변화·리포트: 사진 기록이 평소 범위를 만들 만큼(7일) 쌓이면 내 기록으로 열고, 그 전에는 진행 상황을 보여 준다.
function Locked({ title, go, have, need }) {
  return (
    <section>
      <header className="page-head"><div><h1>{title}</h1></div></header>
      <div className="card">
        <p>사진 기록이 {need}일 쌓이면 내 기록으로 보는 {title} 화면이 열려요. 지금 <b>{have} / {need}일</b>이에요.</p>
        <p className="muted small">어떤 화면인지는 로그아웃하면 김서연 가상 예시로 미리 볼 수 있어요.</p>
        <div className="actions left"><button className="btn" onClick={() => go('capture')}>오늘 기록하러 가기</button></div>
      </div>
    </section>
  )
}

function MineGate({ title, go, children }) {
  const q = useLoad(() => api.me(), [])
  if (!q.data) return <section><Status {...q} /></section>
  return q.data.unlocked ? children : <Locked title={title} go={go} have={q.data.redness_days} need={q.data.needed} />
}

// 비밀번호 재설정 메일의 링크는 #access_token=…&type=recovery 로 돌아온다(만료되면 #error_code=…).
const linkParams = () => new URLSearchParams(window.location.hash.replace(/^#/, ''))
const TAB_TITLES = { diary: '다이어리', change: '변화', capture: '기록', routine: '루틴', report: '리포트' }
const GUIDE_KEY = 'natssi_guide'
// PC 소개 페이지를 한 번 지나갔는지(예시 둘러보기를 누르거나 메뉴로 들어감). 저장이 막혀도 동작은 한다(매번 소개부터).
const LANDING_KEY = 'natssi.landingSeen'
const landingSeen = () => { try { return localStorage.getItem(LANDING_KEY) === '1' } catch { return false } }
const rememberLanding = () => { try { localStorage.setItem(LANDING_KEY, '1') } catch { /* 저장이 막혀도 계속 */ } }
const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === '1' } catch { return true } }

export default function App() {
  const [tab, setTab] = useState(() => { const t = new URLSearchParams(window.location.search).get('tab'); return TAB_TITLES[t] ? t : 'diary' })   // PC의 QR로 열면 ?tab=capture
  const [resetToken, setResetToken] = useState(() => { const h = linkParams(); return h.get('type') === 'recovery' ? h.get('access_token') : null })
  const [linkExpired] = useState(() => !!linkParams().get('error_code'))
  const [page, setPage] = useState(() => (resetToken || linkExpired ? 'auth' : null))          // null | 'auth' | 'legal' | 'account'
  const [anchor, setAnchor] = useState(null)
  const [homeN, setHomeN] = useState(0)             // 로고를 누를 때마다 올려서 다이어리를 새로 그린다(열린 달력 닫기)
  const [guide, setGuide] = useState(false)         // 사용법 시트
  const desk = useDesk()                            // PC(마우스, 900px 이상)
  // 소개 페이지: ?tab= 링크나 비밀번호 재설정 링크로 들어오면 건너뛴다. 실제로 보일지는 아래 showLanding(로그인 전 PC)
  const [landing, setLanding] = useState(() => !new URLSearchParams(window.location.search).get('tab') && !window.location.hash && !landingSeen())
  const [legalFromIntro, setLegalFromIntro] = useState(false)
  const [epoch, setEpoch] = useState(0)           // 로그인·로그아웃하면 화면 데이터를 새로 불러옴
  const meta = useLoad(() => api.meta(), [epoch])
  const [date, setDate] = useState(null)
  const day = date || meta.data?.today
  const viewer = meta.data?.viewer
  const refreshAll = () => setEpoch((n) => n + 1)
  const goHome = () => { setPage(null); setLanding(false); setTab('diary'); setDate(null); setHomeN((n) => n + 1); window.scrollTo(0, 0) }   // 오늘의 다이어리로
  const showLanding = landing && desk && !!meta.data && !viewer && !page
  const [authStart, setAuthStart] = useState('login')   // 소개 페이지 '무료로 시작하기'는 가입 화면으로 연다
  const intro = desk && !!meta.data && !viewer                                    // 소개 페이지를 쓸 수 있는 경우(PC, 로그인 전)
  const goIntro = () => { setPage(null); setLanding(true); window.scrollTo(0, 0) }                 // PC 로그인 전: 메뉴 아래 '낯씨 소개' 링크
  const explore = () => { rememberLanding(); try { localStorage.setItem(GUIDE_KEY, '1') } catch { /* 계속 */ } goHome() }
  const pickTab = (id) => { if (landing) { rememberLanding(); setLanding(false) } setPage(null); setTab(id) }
  const closeGuide = () => { try { localStorage.setItem(GUIDE_KEY, '1') } catch { /* 저장이 막혀도 계속 */ } setGuide(false); setAutoGuide(false) }
  useEffect(() => { if (window.location.hash && (resetToken || linkExpired)) window.history.replaceState(null, '', window.location.pathname + window.location.search) }, [])   // 토큰이 주소창에 남지 않게
  const firstNav = useRef(true)
  useEffect(() => {                                   // 화면이 바뀌면 제목을 갱신하고, 스크린리더·키보드 사용자를 새 제목으로 옮긴다
    const name = page === 'auth' ? '로그인 또는 가입' : page === 'legal' ? '약관과 개인정보 처리방침' : page === 'account' ? '내 계정' : showLanding ? '소개' : TAB_TITLES[tab]
    document.title = `${name} - 낯씨`
    if (firstNav.current) { if (meta.data) firstNav.current = false; return }   // 앱 정보를 받아 첫 화면이 그려질 때까지는 포커스를 옮기지 않는다
    const h = document.querySelector('.main h1')
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }) }
  }, [tab, page, showLanding, !!meta.data])
  // 폰의 '뒤로': 칸을 쌓는 방식은 nav.js. 여기서는 guard를 지웠을 때(오늘 다이어리로)와 사용법 창, 로그인, 계정, 처리방침 칸을 맡는다.
  // 소개 페이지 위에서는 guard를 두지 않는다(처리방침을 열어 소개가 잠시 가려져도). 첫 방문에 저절로 뜬 사용법 창도 guard 없이.
  // guard를 지웠는데 이미 오늘 다이어리 첫 화면이면(위 칸들이 먼저 닫혀서) 헛돌지 않게 그대로 한 번 더 뒤로 가서 나간다.
  const atHome = tab === 'diary' && !page && !date && !guide
  setNav({ intro: landing && desk && !viewer, home: () => { if (atHome) window.history.back(); else { setGuide(false); goHome() } } })
  useEffect(wireNav, [])
  const [autoGuide, setAutoGuide] = useState(false)
  useBackLayer(guide, () => closeGuide(), { noGuard: autoGuide })
  const pages = useRef([]), lastPage = useRef(page), expectPage = useRef(undefined)
  useEffect(() => {
    const prev = lastPage.current; lastPage.current = page
    if (prev === page) return
    if (expectPage.current === page) { expectPage.current = undefined; return }    // 뒤로로 바꾼 값
    expectPage.current = undefined
    const top = pages.current.at(-1)
    if (page === null) { pages.current.forEach((x) => { x.dead = true }); pages.current = [] }      // 닫기 버튼으로 창을 모두 닫음
    else if (top && top.prev === page) { top.dead = true; pages.current.pop() }                       // 처리방침의 '뒤로'처럼 이전 창으로
    else {                                                                                            // 새 창을 엶: 뒤로를 누르면 이전 창으로
      ensureGuard()
      const e = pushEntry(() => {
        pages.current = pages.current.filter((x) => x !== e)
        expectPage.current = prev
        if (prev === null) setLegalFromIntro(false)
        setPage(prev)
      })
      e.prev = prev; pages.current.push(e)
    }
  }, [page])
  // 로고로 다이어리에 오면 쌓아 둔 칸은 모두 지난 칸이 된다(다이어리에서 뒤로 = 나가기)
  const homeByLogo = () => { killAll(); setGuide(false); goHome() }
  const canStart = !!(meta.data?.auth && !viewer)
  const goLegal = (a) => { setAnchor(a); setPage('legal') }
  const loggedOut = () => { session.clear(); setPage(null); setDate(null); refreshAll() }

  useEffect(() => {
    const h = () => { setPage(null); refreshAll() }
    window.addEventListener('natssi:logout', h)
    return () => window.removeEventListener('natssi:logout', h)
  }, [])
  // 오래된 로그인 정보 때문에 처음부터 막히면 정리하고 데모로 돌아감
  useEffect(() => { if (meta.data && !meta.data.viewer && !guideSeen() && !resetToken && !linkExpired && !(landing && desk)) { setAutoGuide(true); setGuide(true) } }, [meta.data])   // 소개 페이지가 보이면 사용법 시트는 띄우지 않는다
  useEffect(() => {
    if (meta.error && session.get()) { session.clear(); refreshAll() }
  }, [meta.error])

  if (meta.loading && !meta.data) return <Splash />       // 앱 정보를 처음 받아오는 동안만

  return (
    <>
    <div className={'shell' + (showLanding ? ' intro' : '')}>
      {/* PC는 위쪽 메뉴, 폰은 아래 탭. 소개 페이지에서는 메뉴를 빼고 화면을 다 쓴다(들어가는 길은 '예시 둘러보기' 하나) */}
      <aside className="side" hidden={showLanding}>
        <div className="side-in">{/* PC: 화면 위에 붙는 한 줄(로고, 메뉴 5개, 사용법과 계정) */}
        <button className="brand" data-home onClick={homeByLogo} aria-label="낯씨 홈으로(오늘 다이어리)"><img src="/logo.svg" alt="" />낯씨</button>
        <nav aria-label="주 메뉴">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id && !showLanding ? 'on' : ''} aria-current={tab === t.id && !showLanding ? 'page' : undefined}
              onClick={() => pickTab(t.id)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>{t.label}
            </button>
          ))}
        </nav>
        {meta.data && (
          <div className="side-tools">{/* PC: 사용법과 계정은 위쪽 메뉴 오른쪽에(좁은 PC에서는 아이콘만, 이름은 화면 읽기용으로 남김) */}
            <button onClick={() => setGuide(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.600 9.300a2.500 2.500 0 1 1 3.400 2.300c-.700.300-1 .800-1 1.500v.6" /><circle cx="12" cy="17" r=".6" /></svg><span className="tl">사용법</span>
            </button>
            {meta.data.auth && (
              <button className={page === 'account' || page === 'auth' ? 'on' : ''} aria-current={page === 'account' || page === 'auth' ? 'page' : undefined} onClick={() => setPage(viewer ? 'account' : 'auth')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.500" r="3.800" /><path d="M4.500 20a7.500 7.500 0 0 1 15 0" /></svg><span className="tl">{viewer ? '내 계정' : '로그인 또는 가입'}</span>
              </button>
            )}
          </div>
        )}
        </div>
      </aside>

      <main className="main">
        <InAppBanner />
        {showLanding && <Landing onExplore={explore} onLegal={(a) => { setLegalFromIntro(true); goLegal(a) }}
          onAuth={meta.data.auth ? (m) => { setAuthStart(m); setPage('auth') } : null} />}
        {meta.data && !showLanding && (
          <div className="topline">
            {!viewer && <p className="demo-note"><span className="demo-badge">예시</span>{meta.data.persona.name}(가상 인물)의 기록</p>}
            <div className="top-actions">
              <button className="icon-btn" onClick={() => setGuide(true)} aria-label="사용법" title="사용법">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.600 9.300a2.500 2.500 0 1 1 3.400 2.300c-.700.300-1 .800-1 1.500v.6" /><circle cx="12" cy="17" r=".6" /></svg>
              </button>
              {meta.data.auth && (
                <button className={'icon-btn' + (page === 'account' || page === 'auth' ? ' on' : '')} onClick={() => setPage(viewer ? 'account' : 'auth')}
                  aria-label={viewer ? '내 계정' : '로그인 또는 가입'} title={viewer ? '내 계정' : '로그인 또는 가입'}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.500" r="3.800" /><path d="M4.500 20a7.500 7.500 0 0 1 15 0" /></svg>
                </button>
              )}
            </div>
          </div>
        )}
        <Status {...meta} />
        {meta.data && page === 'auth' && <Auth key={authStart} start={authStart} back={() => { setPage(null); setAuthStart('login') }} onLegal={goLegal} resetToken={resetToken} linkExpired={linkExpired} recovery={!!meta.data.recovery} onResetDone={() => setResetToken(null)} onDone={() => { setPage(null); setDate(null); refreshAll() }} />}
        {meta.data && page === 'legal' && <Legal anchor={anchor} version={meta.data.consent_version} back={() => { if (legalFromIntro) { setLegalFromIntro(false); setPage(null) } else setPage(viewer ? 'account' : 'auth') }} />}
        {meta.data && page === 'account' && viewer && <Account meta={meta.data} onLegal={goLegal} onLoggedOut={loggedOut} onChanged={refreshAll} />}
        {meta.data && !page && !showLanding && (
          <div key={epoch}>
            {tab === 'diary' && (viewer ? <MyDay key={homeN} mdc95={meta.data.mdc95} date={date} setDate={setDate} go={setTab} onAccount={() => setPage('account')} viewer={viewer} policyVersion={meta.data.consent_version} onLegal={goLegal} onConsented={refreshAll} /> : <Diary key={homeN} date={day} setDate={setDate} meta={meta.data} go={setTab} askLogin={() => setPage('auth')} />)}
            {tab === 'change' && (viewer ? <MineGate title="변화" go={setTab}><Change mine /></MineGate> : <Change onOpenDay={(iso) => { setDate(iso); setTab('diary') }} />)}
            {tab === 'capture' && <Capture onLegal={goLegal} viewer={viewer} photoVersion={meta.data.photo_notice_version} mdc95={meta.data.mdc95} onConsented={refreshAll} go={setTab} />}
            {tab === 'routine' && (viewer ? <MyRoutine ocr={!!meta.data.ocr} /> : <Routine />)}
            {tab === 'report' && (viewer ? <MineGate title="리포트" go={setTab}><Report mine viewer={viewer} aiAvailable={meta.data.ai_available} askAvailable={meta.data.ask_available} onLegal={goLegal} onChanged={refreshAll} cacheKey={'mine|' + viewer.email + '|' + meta.data.today + '|' + (viewer.ai_report ? 'ai' : 'tpl')} /></MineGate> : <Report onOpenDay={(iso) => { setDate(iso); setTab('diary') }} askAvailable={meta.data.ask_available} canStart={canStart} onStart={() => setPage('auth')} cacheKey={(viewer?.email || 'demo') + '|' + meta.data.today} />)}
          </div>
        )}
        {meta.data && !showLanding && (
          <footer className="app-foot">{/* PC: 위쪽 메뉴로 바꾸면서 메뉴 아래에 있던 링크를 페이지 맨 아래로 */}
            <span>매일의 얼굴 날씨를 기록하는 AI 피부 일지</span>
            {intro && <button className="link" onClick={goIntro}>낯씨 소개</button>}
            <button className="link" onClick={() => goLegal('privacy')}>개인정보 처리방침</button>
          </footer>
        )}
      </main>

      <nav className="tabbar" aria-label="주 메뉴">
        {TABS.map((t) => (
          <button key={t.id} className={(tab === t.id ? 'on ' : '') + (t.id === 'capture' ? 'fab' : '')}
            aria-current={tab === t.id ? 'page' : undefined} onClick={() => { setPage(null); setTab(t.id) }}>
            <span className="ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg></span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
    {guide && <Welcome onClose={closeGuide} mine={!!viewer} onStart={canStart ? () => { closeGuide(); setPage('auth') } : null}
      onExplore={() => { closeGuide(); goHome() }} onRecord={() => { closeGuide(); setPage(null); setTab('capture'); window.scrollTo(0, 0) }} />}
    </>
  )
}
