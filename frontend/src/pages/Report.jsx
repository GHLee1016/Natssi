import { useEffect, useState } from 'react'
import { api, reportStore } from '../api.js'
import { useLoad, useSlow, Status } from '../useLoad.jsx'
import StartCard from './StartCard.jsx'
import { WEATHER } from '../weather.jsx'

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

// 답 아래 '그 기간 기록 보기' 버튼: 기록 번호 대신 날짜로 보여 주고, 누르면 근거가 된 첫 기록의 날짜로 이동한다.
function Cite({ item, dateOf, open }) {
  if (!item.cite_label) return null
  const dates = (item.cites || []).map((id) => dateOf[id]).filter(Boolean).sort()
  if (!dates.length) return null
  const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8)}`
  const range = dates.length > 1 ? `${md(dates[0])}~${md(dates[dates.length - 1])}` : md(dates[0])
  return <button className="link ev-open" onClick={() => open(dates[0])}>{range} 기록 보기</button>
}

const EVIDENCE_Q = '이 내용의 근거가 뭔가요?'

// 근거를 짧게 풀어 보여 준다: 같은 근거는 한 번만, 날짜 범위와 그 기간 기록의 요약(날씨·붉은기·증상·공기).
// 요약은 판정 기록 숫자에서 바로 만든다(AI 문장이 아님).
const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8)}`
const sgn = (v) => (v > 0 ? '+' : '') + v
function summarize(recs) {
  const out = []
  const counts = {}
  for (const r of recs) { const n = WEATHER[r.verdict.level]?.name; if (n) counts[n] = (counts[n] || 0) + 1 }
  out.push(Object.entries(counts).map(([n, c]) => `${n} ${c}일`).join(', '))
  const red = recs.filter((r) => r.redness != null)
  const base = red.find((r) => r.verdict.baseline)?.verdict.baseline
  if (red.length && base) {
    const top = red.reduce((a, r) => (r.redness > a.redness ? r : a))
    out.push(top.redness > base.high ? `붉은기 최고 ${sgn(top.redness.toFixed(1))} (평소 ${base.low.toFixed(1)}~${base.high.toFixed(1)})` : '붉은기 평소 범위 안')
  }
  const sym = {}
  for (const r of recs) for (const [k, v] of Object.entries(r.symptoms || {})) sym[k] = Math.max(sym[k] || 0, v)
  const [sk, sv] = Object.entries(sym).sort((a, b) => b[1] - a[1])[0] || []
  out.push(sv ? `${sk} 최고 ${sv}점` : '증상 없음')
  if (recs.some((r) => r.env?.measured_on)) out.push(recs.some((r) => r.env?.unusual) ? '공기가 평소와 달랐던 날 있음' : '공기는 평소와 비슷')
  return out.filter(Boolean)                  // 한 줄에 하나씩 보여 준다
}
function evidenceLinks(items, recById) {
  const seen = new Set(), out = []
  for (const e of items) {
    if (!e.cite_label || seen.has(e.cite_label)) continue
    seen.add(e.cite_label)
    const recs = (e.cites || []).map((id) => recById[id]).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))
    if (!recs.length) continue
    const first = recs[0].date, last = recs[recs.length - 1].date
    // 기간 안에서 근거에 빠진 날 = 사진 품질 때문에 붉은기를 재지 않은 날(측정 보류)
    const ids = new Set(recs.map((r) => r.id))
    const held = Object.values(recById).filter((r) => r.date > first && r.date < last && !ids.has(r.id) && r.redness == null).length
    out.push({ key: e.cite_label, date: first, range: first === last ? md(first) : `${md(first)}~${md(last)}`,
               days: recs.length > 1 ? `${recs.length}일치 기록${held ? `, 측정 보류 ${held}일 제외` : ''}` : '', summary: summarize(recs) })
  }
  return out
}

// 내 리포트의 'AI로 문장 다듬기'(선택 동의). 켜면 가명 요약만 AI 모델로 간다(서버 report.pseudonymize).
function AiToggle({ on, onLegal, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const flip = async (next) => { setBusy(true); setErr(null); try { await api.setOptional('ai_report', next); onChanged?.() } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  return (
    <div className="card ai-toggle">
      <label className="row-check">
        <input type="checkbox" checked={!!on} disabled={busy} onChange={(e) => flip(e.target.checked)} aria-describedby="ai-help" />
        <b>AI로 문장 다듬기 (선택)</b>
      </label>
      <div id="ai-help" className="muted small">
        <p>켜면 제품 이름, 날짜, 이메일을 뺀 요약만 미국의 AI 서비스(Anthropic의 Claude)로 보내 문장을 다듬어요.</p>
        <p>보내는 요약: 바꾼 뒤 며칠째인지, 평소보다 붉었던 날, 따가움 점수</p>
        <p>판정은 낯씨가 해요. 끄면 정해진 틀 문장을 써요. <button className="link" onClick={() => onLegal?.('ai')}>자세히</button></p>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  )
}

export default function Report({ onOpenDay, canStart, onStart, cacheKey, mine = false, viewer, aiAvailable, onLegal, onChanged }) {
  const q = useLoad(() => reportStore.load(cacheKey, mine ? api.myReport : api.report), [cacheKey], reportStore.data(cacheKey))
  const writing = useSlow(q.loading, 400)
  const tl = useLoad(() => (mine ? api.myTimeline() : api.timeline()), [mine])
  const dateOf = Object.fromEntries((tl.data?.records || []).map((r) => [r.id, r.date]))
  const recById = Object.fromEntries((tl.data?.records || []).map((r) => [r.id, r]))
  const [thread, setThreadState] = useState(() => reportStore.thread(cacheKey))
  const setThread = (fn) => setThreadState((prev) => { const next = fn(prev); reportStore.setThread(cacheKey, next); return next })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const ask = async (item) => {
    setBusy(item.id); setError(null)
    try {
      const a = await (mine ? api.myAnswer(item.id) : api.answer(item.id))
      setThread((t) => [...t, { me: item.q }, a])
    } catch (e) { setError(e.message) } finally { setBusy(null) }
  }
  const r = q.data
  const askedEvidence = thread.some((m) => m.evidence)
  const showEvidence = () => setThread((t) => [...t, { me: EVIDENCE_Q }, { evidence: r.sentences.map((x) => ({ text: x.text, cites: x.cites, cite_label: x.cite_label })) }])
  return (
    <section className="report">
      <header className="page-head">
        <div><h1>리포트</h1></div>
        {r && <span className={'pill ' + (r.problems.length ? 'warn' : 'ok')}>{r.problems.length ? `기록과 맞지 않는 문장 ${r.problems.length}개` : '기록에서 확인한 내용만 썼어요'}</span>}
      </header>
      {mine && aiAvailable && <AiToggle on={viewer?.ai_report} onLegal={onLegal} onChanged={onChanged} />}
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
                  <p>이 리포트는 아래 기간의 기록을 보고 썼어요.</p>
                  <ul className="ev-links">
                    {evidenceLinks(m.evidence, recById).map((e) => (
                      <li key={e.key}>
                        <b>{e.range}</b>{e.days && <span className="sub-line">{e.days}</span>}
                        <ul className="ev-sum">{e.summary.map((t) => <li key={t}>{t}</li>)}</ul>
                        {onOpenDay && <button className="link ev-open" onClick={() => onOpenDay(e.date)}>{e.range.includes('~') ? '첫날' : '그날'} 기록 보기</button>}
                      </li>
                    ))}
                  </ul>
                  <p className="muted small">판정은 코드가 기록 숫자로 하고, AI는 문장만 다듬어요. 문장 속 숫자와 근거 기록은 판정 기록과 하나하나 대조했어요.</p>
                </div>
              )
              : <div className="bubble ai" key={i}><p>{m.text}</p>{m.cite_label && onOpenDay && <p className="ans-link"><Cite item={m} dateOf={dateOf} open={onOpenDay} /></p>}</div>)}
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
                  <TechDetails text={`${r.llm_error}${r.llm_problems?.length ? '. ' + r.llm_problems.join(', ') : ''}`} />
                </>
              : <p className="muted small">판정 기록만으로 만든 문장이에요.</p>}
        </div>
      )}
    </section>
  )
}
