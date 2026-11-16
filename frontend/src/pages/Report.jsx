import { useState } from 'react'
import { api } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import StartCard from './StartCard.jsx'

// 근거 라벨: 누르면 근거가 된 첫 기록의 날짜로 이동한다(날짜를 모르면 글자로만 보여준다).
function Cite({ item, dateOf, open }) {
  if (!item.cite_label) return null
  const date = dateOf[item.cites?.[0]]
  return date
    ? <button className="cite" onClick={() => open(date)} aria-label={`${item.cite_label}, ${date.slice(5).replace('-', '월 ')}일 기록 보기`}>[{item.cite_label}]</button>
    : <span className="cite">[{item.cite_label}]</span>
}

export default function Report({ onOpenDay, canStart, onStart }) {
  const q = useLoad(() => api.report(), [])
  const tl = useLoad(() => api.timeline(), [])
  const dateOf = Object.fromEntries((tl.data?.records || []).map((r) => [r.id, r.date]))
  const [thread, setThread] = useState([])
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const ask = async (item) => {
    setBusy(item.id); setError(null)
    try {
      const a = await api.answer(item.id)
      setThread((t) => [...t, { me: item.q }, a])
    } catch (e) { setError(e.message) } finally { setBusy(null) }
  }
  const r = q.data
  return (
    <section className="report">
      <header className="page-head">
        <div><p className="eyebrow">기록을 근거로 설명해요</p><h1>리포트</h1></div>
        {r && <span className={'pill ' + (r.problems.length ? 'warn' : 'ok')}>{r.problems.length ? `근거 대조 실패 ${r.problems.length}건` : '모든 문장 근거 대조 통과'}</span>}
      </header>
      <Status {...q} />
      {r && (
        <div className="chat">
          <div className="bubble ai">
            {r.sentences.map((s, i) => (
              <p key={i}>{s.text} <Cite item={s} dateOf={dateOf} open={onOpenDay} /></p>
            ))}
          </div>
          {thread.map((m, i) => m.me
            ? <div className="bubble me" key={i}>{m.me}</div>
            : <div className="bubble ai" key={i}><p>{m.text} <Cite item={m} dateOf={dateOf} open={onOpenDay} /></p></div>)}
          <p className="muted small">이어서 물어보기</p>
          <div className="chips">
            {r.questions.map((item) => (
              <button key={item.id} onClick={() => ask(item)} disabled={busy !== null}>
                {busy === item.id ? '답을 찾는 중…' : item.q}
              </button>
            ))}
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          {canStart && <StartCard onStart={onStart} />}
          <p className="disclaimer">ⓘ {r.disclaimer}</p>
          <p className="muted small">
            {r.source === 'llm'
              ? `판정 기록을 바탕으로 AI가 문장을 썼어요 (${r.model}). 판정 자체는 AI가 하지 않아요.`
              : r.llm_error
                ? `AI 문장을 쓰지 못해, 정해진 틀의 문장으로 보여 드려요. (${r.llm_error}${r.llm_problems?.length ? ' · ' + r.llm_problems.join(' / ') : ''})`
                : '판정 기록만으로 만든 문장이에요.'}
          </p>
        </div>
      )}
    </section>
  )
}
