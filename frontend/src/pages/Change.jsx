import { useEffect, useMemo, useRef, useState } from 'react'
import { useSub, SubPage, AskButtons, AskHead, ICONS } from './Sub.jsx'
import { RoutineView } from './Insights.jsx'
import { api, fmt, LEVEL_CLASS } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import { WEATHER } from '../weather.jsx'
import { facesOn, getFaces } from '../faceStore.js'
import KV from '../kv.jsx'

const PAD = { l: 34, r: 12, t: 44, b: 34 }
const symptomLine = (s) => {
  const on = Object.entries(s || {}).filter(([, v]) => v > 0)
  return !s || !Object.keys(s).length ? '증상 기록 없음' : on.length ? on.map(([k, v]) => `${k === '화끈' ? '화끈거림' : k} ${v}점`).join(', ') : '증상 없음'
}

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
  const step = (W - PAD.l - PAD.r) / Math.max(records.length - 1, 1)
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
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart" role="group" aria-label="붉은기 변화 그래프. 그래프의 점을 누르면 그날 기록을 볼 수 있어요.">
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
        return i < 0 ? null : <text key={v.id} x={x(i) + 8} y={PAD.t + 4} className="vlabel">{v.id}번째</text>
      })}
      {base && <text x={W - PAD.r - 10} y={y(base.low) - 7} className="blabel" textAnchor="end">붉은기 범위</text>}
      {ticks.map((v) => <text key={v} x={PAD.l - 8} y={y(v) + 4} className="axis" textAnchor="end">{v > 0 ? '+' + v : v}</text>)}
      <path d={line} fill="none" stroke="#1f2a37" strokeWidth="2.600" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((r) => {
        const sig = r.verdict.level === '신호 있음', on = picked?.id === r.id
        return (
          <g key={r.id}>
            {(sig || on) && <circle cx={x(idx(r))} cy={y(r.redness)} r={on ? 12 : 10} fill={sig ? '#ff8a65' : '#1f2a37'} opacity=".2" pointerEvents="none" />}
            {/* 누르는 곳은 점이 아니라 그날 세로 한 줄 전체(점이 작고 촘촘해서 손가락으로 맞히기 어려움) */}
            <rect x={x(idx(r)) - step / 2} y={PAD.t - 12} width={step} height={floor - PAD.t + 12} fill="transparent" className="hit" tabIndex="0" role="button"
              aria-label={`${fmt.md(r.date)} 붉은기 수치 ${r.redness} ${WEATHER[r.verdict.level].name}`} aria-pressed={on}
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

// 비교할 기간 나누기: 첫 루틴 시작일보다 앞선 날은 '루틴 시작 전', 그 뒤는 'N번째 루틴'.
// 바로가기: 기간이 바뀌는 곳마다 '앞 기간의 마지막 날 ↔ 다음 기간의 마지막 날'(이 기기에 사진이 있는 날을 먼저 고름), 그리고 '처음 ↔ 지금'.
function periodsOf(dated, versions, has) {
  const first = versions?.[0]?.start
  const pre = (r) => first && r.date < first
  const label = (r) => (pre(r) ? '루틴 시작 전' : `${r.version}번째 루틴`)
  const groups = []
  for (const r of dated) {
    const k = pre(r) ? 0 : r.version
    let g = groups.find((x) => x.k === k)
    if (!g) groups.push(g = { k, label: label(r), days: [] })
    g.days.push(r)
  }
  const lastOf = (g) => ([...g.days].reverse().find((r) => has(r.date)) || g.days[g.days.length - 1]).date
  const short = (g) => (g.k === 0 ? '시작 전' : `${g.k}번째`)
  const presets = groups.slice(1).map((g, i) => ({ text: `${short(groups[i])} ↔ ${short(g)}`, a: lastOf(groups[i]), b: lastOf(g) }))
  if (groups.length > 2) {
    const firstDay = (dated.find((r) => has(r.date)) || dated[0]).date
    presets.push({ text: '처음 ↔ 지금', a: firstDay, b: lastOf(groups[groups.length - 1]) })
  }
  return { label, groups, presets }
}

// 두 날 각각의 붉은기 수치. 내 기록은 잰 값(a*) 그대로, 예시는 평소 대비 차이로 저장돼 있어 부호를 붙여 보여 준다.
function Val({ r, label, tag, mine, side, diff }) {
  if (r?.redness == null) return null
  const v = mine ? r.redness.toFixed(2) : `${r.redness > 0 ? '+' : ''}${r.redness.toFixed(2)}`
  return (
    <div className={'cmp-val ' + side}>
      <p className="muted small">{label}</p>
      <p className="cmp-val-date">{tag}</p>
      <b>{v}</b>
      <p className="muted small">{mine ? '붉은기 수치' : '붉은기(평소 대비)'}</p>
      {diff != null && <p className="cmp-val-diff">기준 날짜보다 {diff > 0 ? '+' : ''}{diff}</p>}
    </div>
  )
}

function Compare({ records, versions, mine, email }) {
  const dated = records.filter((r) => r.redness !== null)
  // 기본: 처음 루틴의 마지막 측정일 ↔ 붉은기가 가장 높았던 날. 측정 보류한 날은 고르지 않는다(선택 목록에 없음).
  const peak = dated.reduce((m, r) => (r.redness > m.redness ? r : m), dated[0])
  const before = [...dated].reverse().find((r) => r.version < peak.version) || dated[0]
  const [a, setA] = useState(before.date)
  const [b, setB] = useState(peak.date)
  const [pos, setPos] = useState(50)
  const q = useLoad(() => (mine ? api.myCompare(a, b) : api.compare(a, b)), [a, b])
  const c = q.data
  // 내 기록: '이 기기에 얼굴 사진 보관'을 켠 뒤 이 기기에 남은 사진이 두 날 모두 있으면 예시처럼 겹쳐 본다
  const [faces, setFaces] = useState({})
  const allDays = dated.map((r) => r.date).join(',')
  useEffect(() => { let on = true; if (mine && email) getFaces(email, allDays.split(',')).then((f) => on && setFaces(f)); return () => { on = false } }, [mine, email, allDays])
  const { label, groups, presets } = periodsOf(dated, versions, (d) => !mine || !!faces[d])
  const byDate = Object.fromEntries(dated.map((r) => [r.date, r]))
  const tagOf = (r) => `${fmt.md(r.date)} (${label(byDate[r.date] || r)})`
  const photo = (r) => (mine ? faces[r.date] : `/faces/${r.photo}.jpg`)
  const showFaces = !mine || (faces[a] && faces[b])
  const keepOn = mine && email && facesOn(email)
  const opt = (r) => <option key={r.date} value={r.date}>{fmt.md(r.date)}{mine && faces[r.date] ? ' (사진)' : ''}</option>
  const options = groups.map((g) => <optgroup key={g.k} label={g.label}>{g.days.map(opt)}</optgroup>)
  return (
    <div className="card">
      <h2 className="h3">{showFaces ? '사진으로 비교하기' : '날짜별 붉은기 비교'}</h2>
      {mine && !showFaces && <p className="muted small">{keepOn
        ? '두 날짜 중 이 기기에 사진이 없는 날이 있어 붉은기 측정값으로 비교해요.'
        : '얼굴 전체 사진 대신 날짜별 붉은기 측정값을 비교해요. 내 계정에서 ‘이 기기에 얼굴 사진 보관’을 켜면 두 날짜의 얼굴 사진을 겹쳐 볼 수 있어요.'}</p>}
      {presets.length > 0 && <div className="cmp-presets">
        <p className="muted small">루틴이 바뀐 때를 골라 보세요. 바뀌기 전 마지막 날과 바뀐 뒤 마지막 날을 비교해요.</p>
        <div className="chips">{presets.map((x) => (
          <button key={x.text} type="button" aria-pressed={a === x.a && b === x.b} onClick={() => { setA(x.a); setB(x.b) }}>{x.text}</button>
        ))}</div>
      </div>}
      <div className="pickers">
        <label>기준 날짜<select value={a} onChange={(e) => setA(e.target.value)}>{options}</select></label>
        <label>비교 날짜<select value={b} onChange={(e) => setB(e.target.value)}>{options}</select></label>
      </div>
      <Status {...q} />
      {c && (
        <>
          <div className={'cmp-row' + (showFaces ? ' has-photo' : '')}>
          <Val r={c.a} label="기준 날짜" tag={tagOf(c.a)} mine={mine} side="l" />
          {showFaces && <div className="cmp">
            <img src={photo(c.a)} alt={`${fmt.md(c.a.date)} 사진`} />
            <img src={photo(c.b)} alt={`${fmt.md(c.b.date)} 사진`} style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
            <div className="bar" style={{ left: pos + '%' }}><span>⇆</span></div>
            <span className="tag l">{tagOf(c.a)}</span>
            <span className="tag r">{tagOf(c.b)}</span>
            <span className="tag ai">{mine ? '이 기기에만 보관한 사진' : c.photo_note}</span>
            <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(+e.target.value)} aria-label="두 사진을 가르는 선 옮기기" />
          </div>}
          <Val r={c.b} label="비교 날짜" tag={tagOf(c.b)} mine={mine} side="r" diff={c.diff} />
          </div>
          <div className="diff">
            <div><p className="muted small">붉은기 차이</p>
              <b>{c.diff > 0 ? '+' : ''}{c.diff}</b>
              <p className={'diff-note ' + (c.beyond_error ? 'warn' : 'calm')}>
                {c.beyond_error ? '측정 오차보다 큰 차이가 있어요.' : '측정 오차 범위 안이라 뚜렷한 변화를 확인하기 어려워요.'}
              </p></div>
            <span className="muted small">예비 측정 오차: ±{c.mdc95}(팀원 반복 촬영 기준)</span>
          </div>
          <details className="tech"><summary>측정 정보</summary><p>붉은기는 Lab 색 공간의 a* 값이에요. 두 날짜의 차이(Δa*)는 비교 날짜의 값에서 기준 날짜의 값을 뺀 값이에요. 측정 오차는 MDC95 기준이에요.</p></details>
        </>
      )}
    </div>
  )
}

export default function Change({ onOpenDay, mine = false, email }) {
  const q = useLoad(() => (mine ? api.myTimeline() : api.timeline()), [mine])
  const [picked, setPicked] = useState(null)
  const dated = useMemo(() => q.data?.records.filter((r) => r.redness !== null) ?? [], [q.data])
  const step = (dir) => {
    if (!dated.length) return
    const i = picked ? dated.findIndex((r) => r.id === picked.id) : -1
    setPicked(i < 0 ? dated[dated.length - 1] : dated[Math.max(0, Math.min(dated.length - 1, i + dir))])
  }
  const cloudy = useMemo(() => q.data?.records.filter((r) => r.verdict.level === '신호 있음') ?? [], [q.data])
  const [sub, openSub, closeSub] = useSub()
  const canCompare = q.data?.records.some((r) => r.redness !== null)
  const head = <header className="page-head sr-head"><div><h1 className="sr-only">변화</h1></div></header>
  const ASK = { compare: '날짜별 비교', overlap: '흐린 날 보기' }
  const DESC = { compare: mine ? '두 날짜의 볼 붉은기 수치를 비교해요. 이 기기에 두 날짜의 사진이 있으면 겹쳐 볼 수도 있어요.' : '두 날짜의 사진을 겹쳐 피부 변화를 확인해요.', overlap: '흐린 날과 비슷한 시기에 바꾼 루틴과 그 제품의 성분 종류를 모아 봤어요. 제품이 원인인지는 알 수 없어요.' }
  const tabs = q.data && <AskButtons value={sub} onChange={(v) => (v ? openSub(v) : closeSub())} items={[
    canCompare && { id: 'compare', icon: ICONS.compare, label: ASK.compare }, { id: 'overlap', icon: ICONS.cloud, label: ASK.overlap }]} />
  if (q.data && sub) return (
    <SubPage head={head} tabs={tabs}>
      <AskHead title={ASK[sub]} desc={DESC[sub]} onClose={closeSub} />
      {sub === 'compare' ? <Compare records={q.data.records} versions={q.data.versions} mine={mine} email={email} /> : <RoutineView mine={mine} which="overlap" versions={q.data.versions} />}
    </SubPage>
  )
  return (
    <section>
      {head}
      {tabs}
      <Status {...q} />
      {q.data && (
        <div>
          <div className="card">
            <h2 className="h3">붉은기 변화</h2>
            <p className="muted small">평소 붉은기와 비교해 피부 변화를 확인해요. 그래프의 점을 누르면 그날 기록을 볼 수 있어요.</p>
            <Chart records={q.data.records} versions={q.data.versions} onPick={setPicked} picked={picked} />
            <div className="stepper">
              <button className="btn ghost" onClick={() => step(-1)} disabled={picked && picked.id === dated[0]?.id}>‹ 이전 날</button>
              <span className="muted small" aria-live="polite">{picked ? fmt.md(picked.date) : '날짜 선택'}</span>
              <button className="btn ghost" onClick={() => step(1)} disabled={picked && picked.id === dated[dated.length - 1]?.id}>다음 날 ›</button>
            </div>
            <div className="chart-legend" aria-label="그래프 범례">
              <span><i className="sw band" />붉은기 범위</span>
              {Object.values(WEATHER).map((w) => <span key={w.name}><i className={'sw dotsw ' + w.cls} />{w.name}</span>)}
            </div>
            <p className="muted small">세로축은 붉은기 수치예요. 값이 높을수록 사진 속 볼이 더 붉게 보였다는 뜻이며 피부 건강 점수는 아니에요. 안개는 사진 조건, 기록 부족 등으로 평소와 비교하기 어려운 날이에요.</p>
            {picked ? (
              <div className={'picked ' + LEVEL_CLASS[picked.verdict.level]}>
                <b>{fmt.full(picked.date)}</b>
                <KV className="small" items={[['얼굴 날씨', WEATHER[picked.verdict.level].name], ['붉은기 수치', `${picked.redness > 0 ? '+' : ''}${picked.redness}`], ['증상', symptomLine(picked.symptoms)]]} />
                {onOpenDay && <button className="link" onClick={() => onOpenDay(picked.date)}>다이어리에서 보기</button>}
              </div>
            ) : <p className="muted small hint">그래프의 점이나 날짜를 선택해 주세요.</p>}
            {cloudy.length > 0 && (
              <div className="jump">
                <p className="muted small">흐린 날</p>
                <div className="chips">
                  {cloudy.map((r) => <button key={r.id} onClick={() => setPicked(r)} aria-pressed={picked?.id === r.id}>{fmt.md(r.date)}</button>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
