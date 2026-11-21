import { useEffect, useState } from 'react'
import { api, reportStore } from '../api.js'
import { useLoad, useSlow, Status } from '../useLoad.jsx'
import StartCard from './StartCard.jsx'

// 리포트가 바로 나오면 이 표시는 보이지 않고, 0.4초 넘게 걸릴 때만 나타난다(AI가 문장을 쓰는 동안).
function Writing() {
  const [long, setLong] = useState(false)
  useEffect(() => { const t = setTimeout(() => setLong(true), 6000); return () => clearTimeout(t) }, [])
  return (
    <div className="chat">
      <div className="bubble ai" role="status" aria-live="polite">
        기록을 바탕으로 리포트를 쓰는 중이에요<span className="typing" aria-hidden="true"><i /><i /><i /></span>
        {long && <p className="muted small">AI가 문장을 쓰는 중이라 조금 더 걸려요.</p>}
      </div>
    </div>
  )
}

// 개발·문의용 기술 정보는 접어 두고 복사할 수 있게 한다(사용자에게는 쉬운 문구만 먼저 보인다).
function TechDetails({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true) } catch { /* 복사가 막힌 브라우저 */ } }
  return (
    <details className="tech">
      <summary>자세히 보기</summary>
      <p className="small">{text}</p>
      <button className="link" onClick={copy}>{copied ? '복사했어요' : '오류 정보 복사'}</button>
    </details>
  )
}

// 근거 라벨: 누르면 근거가 된 첫 기록의 날짜로 이동한다(날짜를 모르면 글자로만 보여준다).
function Cite({ item, dateOf, open }) {
  if (!item.cite_label) return null
  const date = dateOf[item.cites?.[0]]
  return date
    ? <button className="cite" onClick={() => open(date)} aria-label={`${item.cite_label}, ${date.slice(5).replace('-', '월 ')}일 기록 보기`}>[{item.cite_label}]</button>
    : <span className="cite">[{item.cite_label}]</span>
}

const EVIDENCE_Q = '이 내용의 근거가 뭔가요?'

export default function Report({ onOpenDay, canStart, onStart, cacheKey }) {
  const q = useLoad(() => reportStore.load(cacheKey, api.report), [cacheKey], reportStore.data(cacheKey))
  const writing = useSlow(q.loading, 400)
  const tl = useLoad(() => api.timeline(), [])
  const dateOf = Object.fromEntries((tl.data?.records || []).map((r) => [r.id, r.date]))
  const [thread, setThreadState] = useState(() => reportStore.thread(cacheKey))
  const setThread = (fn) => setThreadState((prev) => { const next = fn(prev); reportStore.setThread(cacheKey, next); return next })
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
  const askedEvidence = thread.some((m) => m.evidence)
  const showEvidence = () => setThread((t) => [...t, { me: EVIDENCE_Q }, { evidence: r.sentences.map((x) => ({ text: x.text, cites: x.cites, cite_label: x.cite_label })) }])
  return (
    <section className="report">
      <header className="page-head">
        <div><p className="eyebrow">기록을 근거로 설명해요</p><h1>리포트</h1></div>
        {r && <span className={'pill ' + (r.problems.length ? 'warn' : 'ok')}>{r.problems.length ? `근거 대조 실패 ${r.problems.length}건` : '모든 문장 근거 대조 통과'}</span>}
      </header>
      {!q.loading && <Status {...q} />}
      {q.loading && writing && <Writing />}
      {r && (
        <div className="chat">
          <div className="bubble ai">
            {r.sentences.map((s, i) => <p key={i}>{s.text}</p>)}
          </div>
          {thread.map((m, i) => m.me
            ? <div className="bubble me" key={i}>{m.me}</div>
            : m.evidence
              ? (
                <div className="bubble ai evidence" key={i}>
                  <p>리포트의 문장마다 이 기록을 보고 썼어요. 근거를 누르면 그날 기록으로 가요.</p>
                  <ol>
                    {m.evidence.map((e, j) => (
                      <li key={j}><span className="ev-text">{e.text}</span>
                        {e.cite_label ? <Cite item={e} dateOf={dateOf} open={onOpenDay} /> : <span className="muted small">기록이 아니라 낯씨의 안내 문장이에요</span>}</li>
                    ))}
                  </ol>
                  <p className="muted small">판정은 코드가 기록 숫자로 하고, AI는 문장만 다듬어요. 문장 속 숫자와 근거 번호는 판정 기록과 하나하나 대조했어요.</p>
                </div>
              )
              : <div className="bubble ai" key={i}><p>{m.text} <Cite item={m} dateOf={dateOf} open={onOpenDay} /></p></div>)}
          <p className="muted small">이어서 물어보기</p>
          <div className="chips">
            {!askedEvidence && <button onClick={showEvidence} disabled={busy !== null}>{EVIDENCE_Q}</button>}
            {r.questions.map((item) => (
              <button key={item.id} onClick={() => ask(item)} disabled={busy !== null}>
                {busy === item.id ? '답을 찾는 중…' : item.q}
              </button>
            ))}
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          {canStart && <StartCard onStart={onStart} />}
          <p className="disclaimer">ⓘ {r.disclaimer}</p>
          {r.source === 'llm'
            ? <p className="muted small">{`판정 기록을 바탕으로 AI가 문장을 썼어요 (${r.model}). 판정 자체는 AI가 하지 않아요.`}</p>
            : r.llm_error
              ? <>
                  <p className="muted small">AI 문장을 쓰지 못해, 정해진 틀의 문장으로 보여 드려요. 판정 내용은 같아요.</p>
                  <TechDetails text={`${r.llm_error}${r.llm_problems?.length ? ' · ' + r.llm_problems.join(' / ') : ''}`} />
                </>
              : <p className="muted small">판정 기록만으로 만든 문장이에요.</p>}
        </div>
      )}
    </section>
  )
}
