import { useEffect, useMemo, useRef, useState } from 'react'
import { api, fmt, LEVEL_CLASS } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import { WEATHER } from '../weather.jsx'

const PAD = { l: 34, r: 12, t: 44, b: 34 }

// 점들을 부드러운 곡선으로 잇는다(단조 3차 보간: 점 사이에서 값이 튀어 오르거나 꺼지지 않는다).
function smooth(p) {
  if (p.length < 3) return p.map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join('')
  const n = p.length, dx = [], m = [], t = []
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i] }
  t[0] = m[0]; t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${p[i][0] + h},${p[i][1] + t[i] * h} ${p[i + 1][0] - h},${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]},${p[i + 1][1]}`
  }
  return d
}

function Chart({ records, versions, onPick, picked }) {
  // 그림을 카드 폭 그대로(1:1) 그려서, 좁은 카드에서도 글자가 줄어들지 않게 한다.
  const box = useRef(null)
  const [W, setW] = useState(520)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = Math.round(Math.max(250, Math.min(380, W * 0.62)))
  const pts = records.filter((r) => r.redness !== null)
  const base = [...records].reverse().find((r) => r.verdict.baseline)?.verdict.baseline
  const ys = pts.map((r) => r.redness).concat(base ? [base.low, base.high] : [])
  const min = Math.min(...ys) - 0.6, max = Math.max(...ys) + 1.6
  const x = (i) => PAD.l + (i / (records.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b)
  const idx = (r) => records.indexOf(r)
  const xy = pts.map((r) => [x(idx(r)), y(r.redness)])
  const line = smooth(xy)
  const floor = H - PAD.b
  const peak = pts.reduce((a, r) => (r.redness > a.redness ? r : a), pts[0])
  const ticks = [Math.ceil(min), 0, Math.floor(max)].filter((v, i, a) => a.indexOf(v) === i)
  const starts = versions.map((v) => records.findIndex((r) => r.version === v.id)).filter((i) => i >= 0)
  const xLabels = [...new Set([...starts, records.length - 1])]
  const peakOut = base && peak.redness > base.high
  return (
    <div ref={box}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart" role="group" aria-label="볼 붉은기 변화 그래프. 점을 누르면 그날 기록이 보여요.">
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9653f" stopOpacity=".16" /><stop offset="1" stopColor="#d9653f" stopOpacity="0" /></linearGradient>
        <clipPath id="plot"><rect x={PAD.l} y={PAD.t - 12} width={W - PAD.l - PAD.r} height={floor - PAD.t + 12} rx="14" /></clipPath>
      </defs>
      <g clipPath="url(#plot)">
        <rect x={PAD.l} y={PAD.t - 12} width={W - PAD.l - PAD.r} height={floor - PAD.t + 12} fill="#faf6f2" />
        {ticks.map((v) => <line key={v} x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e9e2dc" strokeWidth={v === 0 ? 1.200 : 1} strokeDasharray={v === 0 ? undefined : '3 4'} />)}
        {base && <rect x={PAD.l} y={y(base.high)} width={W - PAD.l - PAD.r} height={y(base.low) - y(base.high)} fill="#cfe9dc" opacity=".75" />}
        {base && <><line x1={PAD.l} x2={W - PAD.r} y1={y(base.high)} y2={y(base.high)} stroke="#6fb592" strokeWidth="1" strokeDasharray="4 4" /><line x1={PAD.l} x2={W - PAD.r} y1={y(base.low)} y2={y(base.low)} stroke="#6fb592" strokeWidth="1" strokeDasharray="4 4" /></>}
        {starts.slice(1).map((i) => <line key={i} x1={x(i) - 0.5} x2={x(i) - 0.5} y1={PAD.t - 12} y2={floor} stroke="#c9bfb6" strokeWidth="1.200" strokeDasharray="2 4" />)}
        <path d={`${line}L${xy[xy.length - 1][0]},${floor}L${xy[0][0]},${floor}Z`} fill="url(#area)" />
      </g>
      {versions.map((v) => {
        const i = records.findIndex((r) => r.version === v.id)
        return i < 0 ? null : <text key={v.id} x={x(i) + 8} y={PAD.t + 4} className="vlabel">버전 {v.id}</text>
      })}
      {base && <text x={W - PAD.r - 10} y={y(base.low) - 7} className="blabel" textAnchor="end">내 평소 범위</text>}
      {ticks.map((v) => <text key={v} x={PAD.l - 8} y={y(v) + 4} className="axis" textAnchor="end">{v > 0 ? '+' + v : v}</text>)}
      <path d={line} fill="none" stroke="#1f2a37" strokeWidth="2.600" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((r) => {
        const sig = r.verdict.level === '신호 있음', on = picked?.id === r.id
        return (
          <g key={r.id}>
            {(sig || on) && <circle cx={x(idx(r))} cy={y(r.redness)} r={on ? 12 : 10} fill={sig ? '#ff8a65' : '#1f2a37'} opacity=".2" pointerEvents="none" />}
            <circle cx={x(idx(r))} cy={y(r.redness)} r="11" fill="transparent" className="hit" tabIndex="0" role="button"
              aria-label={`${fmt.md(r.date)} 붉은기 ${r.redness} ${WEATHER[r.verdict.level].name}`} aria-pressed={on}
              onClick={() => onPick(r)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(r))} />
            <circle cx={x(idx(r))} cy={y(r.redness)} r={on ? 6.500 : sig ? 5.500 : 3.600}
              className={'pt ' + LEVEL_CLASS[r.verdict.level]} pointerEvents="none" />
          </g>
        )
      })}
      {peakOut && (() => {
        const px = x(idx(peak)), py = y(peak.redness), bx = px + 12 + 56 > W - PAD.r ? px - 68 : px + 12
        return (
          <g pointerEvents="none">
            <rect x={bx} y={py - 22} width="56" height="22" rx="11" fill="#1f2a37" />
            <text x={bx + 28} y={py - 7} textAnchor="middle" className="peak">최고 +{peak.redness.toFixed(1)}</text>
          </g>
        )
      })()}
      {xLabels.map((i) => (
        <text key={i} x={x(i)} y={H - 10} className="axis" textAnchor={i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle'}>{fmt.md(records[i].date)}</text>
      ))}
    </svg>
    </div>
  )
}

function Compare({ records }) {
  const dated = records.filter((r) => r.redness !== null)
  const [a, setA] = useState('2026-11-02')
  const [b, setB] = useState('2026-11-09')
  const [pos, setPos] = useState(50)
  const q = useLoad(() => api.compare(a, b), [a, b])
  const c = q.data
  const opt = (r) => <option key={r.date} value={r.date}>{fmt.md(r.date)} · 버전 {r.version}</option>
  return (
    <div className="card">
      <h2 className="h3">두 날의 사진 겹쳐 비교</h2>
      <div className="pickers">
        <label>앞 날짜<select value={a} onChange={(e) => setA(e.target.value)}>{dated.map(opt)}</select></label>
        <label>뒤 날짜<select value={b} onChange={(e) => setB(e.target.value)}>{dated.map(opt)}</select></label>
      </div>
      <Status {...q} />
      {c && (
        <>
          <div className="cmp">
            <img src={`/faces/${c.a.photo}.jpg`} alt={`${fmt.md(c.a.date)} 사진`} />
            <img src={`/faces/${c.b.photo}.jpg`} alt={`${fmt.md(c.b.date)} 사진`} style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
            <div className="bar" style={{ left: pos + '%' }}><span>⇆</span></div>
            <span className="tag l">버전 {c.a.version} · {fmt.md(c.a.date)}</span>
            <span className="tag r">버전 {c.b.version} · {fmt.md(c.b.date)}</span>
            <span className="tag ai">{c.photo_note}</span>
            <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(+e.target.value)} aria-label="비교 위치 조절" />
          </div>
          <div className="diff">
            <div><p className="muted small">두 날의 볼 붉은기 차이</p>
              <b>{c.diff > 0 ? '+' : ''}{c.diff}</b>
              <p className={'diff-note ' + (c.beyond_error ? 'warn' : 'calm')}>
                {c.beyond_error ? '측정 오차보다 커서, 달라진 것으로 보여요' : '측정 오차 안이라, 달라졌다고 보기 어려워요'}
              </p></div>
            <span className="muted small">측정 오차는 ±{c.mdc95} 정도예요 (팀원 반복 촬영 예비 측정)</span>
          </div>
          <details className="tech"><summary>기술 정보</summary><p>붉은기는 Lab 색공간의 a* 값이고, 위 차이는 Δa*(뒤 날짜 − 앞 날짜)예요. 측정 오차는 MDC95 기준이에요.</p></details>
        </>
      )}
    </div>
  )
}

export default function Change({ onOpenDay }) {
  const q = useLoad(() => api.timeline(), [])
  const [picked, setPicked] = useState(null)
  const dated = useMemo(() => q.data?.records.filter((r) => r.redness !== null) ?? [], [q.data])
  const step = (dir) => {
    if (!dated.length) return
    const i = picked ? dated.findIndex((r) => r.id === picked.id) : -1
    setPicked(i < 0 ? dated[dated.length - 1] : dated[Math.max(0, Math.min(dated.length - 1, i + dir))])
  }
  const changes = useMemo(() => q.data?.versions.filter((v) => v.change) ?? [], [q.data])
  const cloudy = useMemo(() => q.data?.records.filter((r) => r.verdict.level === '신호 있음') ?? [], [q.data])
  return (
    <section>
      <header className="page-head"><div><p className="eyebrow">최근 4주</p><h1>변화</h1></div></header>
      <Status {...q} />
      {q.data && (
        <div>
          <div className="card">
            <h2 className="h3">볼 붉은기의 흐름</h2>
            <p className="muted small">점수가 아니라 내 평소 범위와 비교해요. 점을 누르면 그날 기록이 보여요.</p>
            <Chart records={q.data.records} versions={q.data.versions} onPick={setPicked} picked={picked} />
            <div className="stepper">
              <button className="btn ghost" onClick={() => step(-1)} disabled={picked && picked.id === dated[0]?.id}>‹ 이전 날</button>
              <span className="muted small" aria-live="polite">{picked ? fmt.md(picked.date) : '날짜 고르기'}</span>
              <button className="btn ghost" onClick={() => step(1)} disabled={picked && picked.id === dated[dated.length - 1]?.id}>다음 날 ›</button>
            </div>
            <div className="chart-legend" aria-label="그래프 범례">
              <span><i className="sw band" />내 평소 범위</span>
              {Object.values(WEATHER).map((w) => <span key={w.name}><i className={'sw dotsw ' + w.cls} />{w.name}</span>)}
            </div>
            {picked ? (
              <div className={'picked ' + LEVEL_CLASS[picked.verdict.level]}>
                <b>{fmt.full(picked.date)} · 기록 {picked.id}</b>
                <span>{WEATHER[picked.verdict.level].name} · 붉은기 {picked.redness > 0 ? '+' : ''}{picked.redness} · 따가움 {picked.symptoms['따가움']}</span>
                <button className="link" onClick={() => onOpenDay(picked.date)}>다이어리에서 보기</button>
              </div>
            ) : <p className="muted small hint">점을 누르거나 아래에서 날짜를 골라 보세요.</p>}
            {cloudy.length > 0 && (
              <div className="jump">
                <p className="muted small">흐렸던 날</p>
                <div className="chips">
                  {cloudy.map((r) => <button key={r.id} onClick={() => setPicked(r)} aria-pressed={picked?.id === r.id}>{fmt.md(r.date)}</button>)}
                </div>
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="h3">루틴 변경 기록</h2>
            {changes.length === 0 && <p className="muted">아직 루틴을 바꾼 적이 없어요.</p>}
            {changes.map((v) => (
              <div className="ev" key={v.id}>
                <b>{fmt.md(v.start)}</b>
                <div>{v.change}<p className="muted small">버전 {v.id} · 바꾼 이유: {v.reason}</p></div>
              </div>
            ))}
          </div>
          <Compare records={q.data.records} />
        </div>
      )}
    </section>
  )
}
