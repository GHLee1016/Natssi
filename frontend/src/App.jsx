import { useState } from 'react'
import { api } from './api.js'
import { useLoad, Status } from './useLoad.jsx'
import Diary from './pages/Diary.jsx'
import Change from './pages/Change.jsx'
import Capture from './pages/Capture.jsx'
import Routine from './pages/Routine.jsx'
import Report from './pages/Report.jsx'

const TABS = [
  { id: 'diary', label: '다이어리', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zm3 5h7M8 13h7' },
  { id: 'change', label: '변화', icon: 'M4 19h16M6 15l4-5 4 3 5-7' },
  { id: 'capture', label: '기록', icon: 'M4 8h3l2-3h6l2 3h3v11H4V8zm8 2.500a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7z' },
  { id: 'routine', label: '루틴', icon: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z' },
  { id: 'report', label: '리포트', icon: 'M5 5h14v10H10l-5 4V5z' },
]

export default function App() {
  const [tab, setTab] = useState('diary')
  const meta = useLoad(() => api.meta(), [])
  const [date, setDate] = useState(null)
  const day = date || meta.data?.today

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><img src="/logo.svg" alt="" />낯씨</div>
        <nav aria-label="주 메뉴">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>{t.label}
            </button>
          ))}
        </nav>
        <p className="side-foot">매일의 얼굴 날씨를 기록하는<br />AI 피부 일지</p>
      </aside>

      <main className="main">
        {meta.data && (
          <div className="demo-bar">
            {meta.data.persona.name} 님 · {meta.data.persona.note}
          </div>
        )}
        <Status {...meta} />
        {meta.data && tab === 'diary' && <Diary date={day} setDate={setDate} meta={meta.data} go={setTab} />}
        {meta.data && tab === 'change' && <Change meta={meta.data} />}
        {meta.data && tab === 'capture' && <Capture />}
        {meta.data && tab === 'routine' && <Routine />}
        {meta.data && tab === 'report' && <Report />}
      </main>

      <nav className="tabbar" aria-label="주 메뉴">
        {TABS.map((t) => (
          <button key={t.id} className={(tab === t.id ? 'on ' : '') + (t.id === 'capture' ? 'fab' : '')}
            aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span className="ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg></span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
