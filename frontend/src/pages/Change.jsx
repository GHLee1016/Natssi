import { useMemo, useState } from 'react'
import { api, fmt, LEVEL_CLASS } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import { WEATHER } from '../weather.jsx'

const W = 520, H = 290, PAD = { l: 30, r: 10, t: 28, b: 30 }
const BAND = ['#f6f3f0', '#fff1e9', '#eef5f9']

function Chart({ records, versions, onPick, picked }) {
  const pts = records.filter((r) => r.redness !== null)
  const base = [...records].reverse().find((r) => r.verdict.baseline)?.verdict.baseline
  const ys = pts.map((r) => r.redness).concat(base ? [base.low, base.high] : [])
  const min = Math.min(...ys) - 0.5, max = Math.max(...ys) + 0.5
  const x = (i) => PAD.l + (i / (records.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b)
  const idx = (r) => records.indexOf(r)
  const half = (W - PAD.l - PAD.r) / (records.length - 1) / 2
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="group" aria-label="볼 붉은기 변화 그래프. 점을 누르면 그날 기록이 보여요.">
      {versions.map((v, i) => {
        const first = records.findIndex((r) => r.version === v.id)
        const last = records.length - 1 - [...records].reverse().findIndex((r) => r.version === v.id)
        const x0 = Math.max(PAD.l, x(first) - half), x1 = Math.min(W - PAD.r, x(last) + half)
        return (
          <g key={v.id}>
            <rect x={x0} y={PAD.t - 18} width={x1 - x0} height={H - PAD.t - PAD.b + 18} fill={BAND[i % 3]} />
            <text x={x0 + 6} y={PAD.t - 5} className="vlabel">버전 {v.id}</text>
          </g>
        )
      })}
      {base && (
        <g>
          <rect x={PAD.l} y={y(base.high)} width={W - PAD.l - PAD.r} height={y(base.low) - y(base.high)} fill="#cfe9dc" opacity=".85" />
          <text x={PAD.l + 6} y={y(base.low) - 5} className="blabel">내 평소 범위</text>
        </g>
      )}
      {[Math.ceil(min), 0, Math.floor(max)].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
        <text key={v} x={PAD.l - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
      ))}
      <polyline fill="none" stroke="#1f2a37" strokeWidth="2.200" strokeLinejoin="round"
        points={pts.map((r) => `${x(idx(r))},${y(r.redness)}`).join(' ')} />
      {pts.map((r) => (
        <g key={r.id}>
          <circle cx={x(idx(r))} cy={y(r.redness)} r="10" fill="transparent" className="hit" tabIndex="0" role="button"
            aria-label={`${fmt.md(r.date)} 붉은기 ${r.redness} ${WEATHER[r.verdict.level].name}`} aria-pressed={picked?.id === r.id}
            onClick={() => onPick(r)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(r))} />
          <circle cx={x(idx(r))} cy={y(r.redness)} r={picked?.id === r.id ? 7 : r.verdict.level === '신호 있음' ? 5 : 3.200}
            className={'pt ' + LEVEL_CLASS[r.verdict.level]} pointerEvents="none" />
        </g>
      ))}
      {[0, Math.floor(records.length / 2), records.length - 1].map((i) => (
        <text key={i} x={x(i)} y={H - 8} className="axis" textAnchor={i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle'}>{fmt.md(records[i].date)}</text>
      ))}
    </svg>
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
            <div><p className="muted small">볼 붉은기 차이 (Δa*)</p>
              <b>{c.diff > 0 ? '+' : ''}{c.diff}</b>{' '}
              <span className={c.beyond_error ? 'warn' : 'calm'}>{c.beyond_error ? '오차 범위 밖' : '오차 범위 안'}</span></div>
            <span className="muted small">측정 오차 ±{c.mdc95} (예시 값)</span>
          </div>
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
        <div className="grid2 wide-left">
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
