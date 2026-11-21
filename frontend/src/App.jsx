import { useEffect, useRef, useState } from 'react'
import { api, session } from './api.js'
import { useLoad, Status } from './useLoad.jsx'
import Diary from './pages/Diary.jsx'
import MyDay from './pages/MyDay.jsx'
import Welcome from './pages/Welcome.jsx'
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
const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === '1' } catch { return true } }

export default function App() {
  const [tab, setTab] = useState('diary')
  const [resetToken, setResetToken] = useState(() => { const h = linkParams(); return h.get('type') === 'recovery' ? h.get('access_token') : null })
  const [linkExpired] = useState(() => !!linkParams().get('error_code'))
  const [page, setPage] = useState(() => (resetToken || linkExpired ? 'auth' : null))          // null | 'auth' | 'legal' | 'account'
  const [anchor, setAnchor] = useState(null)
  const [homeN, setHomeN] = useState(0)             // 로고를 누를 때마다 올려서 다이어리를 새로 그린다(열린 달력 닫기)
  const [guide, setGuide] = useState(false)         // 사용법 시트
  const [epoch, setEpoch] = useState(0)           // 로그인·로그아웃하면 화면 데이터를 새로 불러옴
  const meta = useLoad(() => api.meta(), [epoch])
  const [date, setDate] = useState(null)
  const day = date || meta.data?.today
  const viewer = meta.data?.viewer
  const refreshAll = () => setEpoch((n) => n + 1)
  const goHome = () => { setPage(null); setTab('diary'); setDate(null); setHomeN((n) => n + 1); window.scrollTo(0, 0) }   // 로고·이름을 누르면 오늘의 다이어리로
  const closeGuide = () => { try { localStorage.setItem(GUIDE_KEY, '1') } catch { /* 저장이 막혀도 계속 */ } setGuide(false) }
  useEffect(() => { if (window.location.hash && (resetToken || linkExpired)) window.history.replaceState(null, '', window.location.pathname + window.location.search) }, [])   // 토큰이 주소창에 남지 않게
  const firstNav = useRef(true)
  useEffect(() => {                                   // 화면이 바뀌면 제목을 갱신하고, 스크린리더·키보드 사용자를 새 제목으로 옮긴다
    const name = page === 'auth' ? '로그인 · 가입' : page === 'legal' ? '약관과 개인정보 처리방침' : page === 'account' ? '내 계정' : TAB_TITLES[tab]
    document.title = `${name} · 낯씨`
    if (firstNav.current) { firstNav.current = false; return }
    const h = document.querySelector('.main h1')
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }) }
  }, [tab, page])
  const canStart = !!(meta.data?.auth && !viewer)
  const goLegal = (a) => { setAnchor(a); setPage('legal') }
  const loggedOut = () => { session.clear(); setPage(null); setDate(null); refreshAll() }

  useEffect(() => {
    const h = () => { setPage(null); refreshAll() }
    window.addEventListener('natssi:logout', h)
    return () => window.removeEventListener('natssi:logout', h)
  }, [])
  // 오래된 로그인 정보 때문에 처음부터 막히면 정리하고 데모로 돌아감
  useEffect(() => { if (meta.data && !meta.data.viewer && !guideSeen() && !resetToken && !linkExpired) setGuide(true) }, [meta.data])
  useEffect(() => {
    if (meta.error && session.get()) { session.clear(); refreshAll() }
  }, [meta.error])

  if (meta.loading && !meta.data) return <Splash />       // 앱 정보를 처음 받아오는 동안만

  return (
    <>
    <div className="shell">
      <aside className="side">
        <button className="brand" onClick={goHome} aria-label="낯씨 홈으로"><img src="/logo.svg" alt="" />낯씨</button>
        <nav aria-label="주 메뉴">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => { setPage(null); setTab(t.id) }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>{t.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <p>매일의 얼굴 날씨를 기록하는<br />AI 피부 일지</p>
          <button className="link" onClick={() => goLegal('privacy')}>개인정보 처리방침</button>
        </div>
      </aside>

      <main className="main">
        <button className="brand-m" onClick={goHome} aria-label="낯씨 홈으로"><img src="/logo.svg" alt="" />낯씨</button>
        {meta.data && (
          <div className="topline">
            <div className="demo-bar">
              {viewer ? `${viewer.email} · 내 기록` : <><span className="demo-badge">예시 화면</span> {meta.data.persona.name}(가상 인물)의 기록이에요 · 읽기 전용</>}
            </div>
            <div className="top-actions">
              <button className="link" onClick={() => setGuide(true)}>사용법</button>
              {meta.data.auth && (viewer
                ? <button className="link" onClick={() => setPage('account')}>내 계정</button>
                : <button className="link strong" onClick={() => setPage('auth')}>로그인 · 가입</button>)}
            </div>
          </div>
        )}
        <Status {...meta} />
        {meta.data && page === 'auth' && <Auth back={() => setPage(null)} onLegal={goLegal} resetToken={resetToken} linkExpired={linkExpired} recovery={!!meta.data.recovery} onResetDone={() => setResetToken(null)} onDone={() => { setPage(null); setDate(null); refreshAll() }} />}
        {meta.data && page === 'legal' && <Legal anchor={anchor} version={meta.data.consent_version} back={() => setPage(viewer ? 'account' : 'auth')} />}
        {meta.data && page === 'account' && viewer && <Account meta={meta.data} onLegal={goLegal} onLoggedOut={loggedOut} onChanged={refreshAll} />}
        {meta.data && !page && (
          <div key={epoch}>
            {tab === 'diary' && (viewer ? <MyDay go={setTab} onAccount={() => setPage('account')} viewer={viewer} policyVersion={meta.data.consent_version} onLegal={goLegal} onConsented={refreshAll} /> : <Diary key={homeN} date={day} setDate={setDate} meta={meta.data} go={setTab} askLogin={() => setPage('auth')} />)}
            {tab === 'change' && (viewer ? <MineGate title="변화" go={setTab}><Change mine /></MineGate> : <Change onOpenDay={(iso) => { setDate(iso); setTab('diary') }} />)}
            {tab === 'capture' && <Capture onLegal={goLegal} viewer={viewer} photoVersion={meta.data.photo_notice_version} mdc95={meta.data.mdc95} onConsented={refreshAll} go={setTab} />}
            {tab === 'routine' && (viewer ? <MyRoutine ocr={!!meta.data.ocr} /> : <Routine />)}
            {tab === 'report' && (viewer ? <MineGate title="리포트" go={setTab}><Report mine viewer={viewer} aiAvailable={meta.data.ai_available} onLegal={goLegal} onChanged={refreshAll} cacheKey={'mine|' + viewer.email + '|' + meta.data.today + '|' + (viewer.ai_report ? 'ai' : 'tpl')} /></MineGate> : <Report onOpenDay={(iso) => { setDate(iso); setTab('diary') }} canStart={canStart} onStart={() => setPage('auth')} cacheKey={(viewer?.email || 'demo') + '|' + meta.data.today} />)}
          </div>
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
    {guide && <Welcome onClose={closeGuide} onStart={canStart ? () => { closeGuide(); setPage('auth') } : null} />}
    </>
  )
}
