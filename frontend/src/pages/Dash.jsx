// PC(넓은 화면) 다이어리 대시보드. 데모 다이어리와 로그인한 '오늘' 화면이 함께 쓴다.
// 주인공은 "루틴을 바꾼 시기와 볼 붉은기가 오른 시기가 겹치나"를 보여 주는 4주 그래프다.
//   1줄: 이달 요약 4칸(사진 기록, 평소보다 높은 날, 가장 붉었던 날, 맑은 날)
//   2줄: 4주 볼 붉은기 그래프(넓게, 루틴을 바꾼 날 세로선) | 그날의 날씨(작게)
//   3줄: 달력 | 그날의 기록
// 폰(1100px 미만)은 이 배치를 쓰지 않는다. 숫자는 모두 이미 받은 기록(timeline)에서 센 값이고, 새로 판정하지 않는다.
import { useEffect, useState } from 'react'
import { fmt, LEVEL_CLASS } from '../api.js'
import { WEATHER, WeatherIcon, HeroSky } from '../weather.jsx'
import Gauge from '../gauge.jsx'
import Calendar from './Calendar.jsx'

export const WIDE = '(min-width: 1100px)'
export function useMedia(q) {
  const [on, setOn] = useState(() => window.matchMedia?.(q).matches ?? false)
  useEffect(() => {
    const m = window.matchMedia?.(q); if (!m) return undefined
    const f = () => setOn(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [q])
  return on
}

const sgn = (x) => (x > 0 ? '+' : '') + x
const over = (r) => r.redness != null && r.verdict?.baseline && r.redness > r.verdict.baseline.high

function Kpi({ label, value, sub, empty }) {
  return (
    <div className={'kpi' + (empty ? ' empty' : '')}>
      <p className="kpi-l">{label}</p>
      <p className="kpi-v">{value}</p>
      {sub && <p className="kpi-s">{sub}</p>}
    </div>
  )
}

// 고른 날짜가 속한 달의 요약
function MonthKpis({ records, date }) {
  const ym = date.slice(0, 7), m = +ym.slice(5)
  const rows = records.filter((r) => r.date.startsWith(ym))
  const photos = rows.filter((r) => r.redness != null)
  const judged = photos.filter((r) => r.verdict?.baseline)
  const top = photos.length ? photos.reduce((a, r) => (r.redness > a.redness ? r : a)) : null
  const sunny = rows.filter((r) => r.verdict?.level === '신호 없음').length
  return (
    <div className="kpis">
      <Kpi label={`${m}월 사진 기록`} value={`${photos.length}일`} empty={!photos.length}
        sub={photos.length ? '볼 색을 잰 날' : '이달은 아직 사진 기록이 없어요'} />
      <Kpi label="평소보다 볼이 더 붉었던 날" value={judged.length ? `${judged.filter(over).length}일` : '아직 없어요'} empty={!judged.length}
        sub={judged.length ? `평소 범위와 비교한 ${judged.length}일 중` : '사진 7일이 모이면 평소 범위와 비교해요'} />
      <Kpi label="가장 붉었던 날" value={top ? fmt.md(top.date) : '아직 없어요'} empty={!top}
        sub={top ? `볼 붉은기 ${sgn(top.redness)}` : '사진을 찍으면 보여 드려요'} />
      <Kpi label={`${m}월 맑은 날`} value={judged.length ? `${sunny}일` : '아직 없어요'} empty={!judged.length}
        sub={judged.length ? `날씨를 판정한 ${judged.length}일 중` : '평소 범위가 생기면 날씨를 알려 드려요'} />
    </div>
  )
}

// 최근 4주 볼 붉은기. 점 색 = 그날 얼굴 날씨, 옅은 띠 = 평소 범위, 점선 = 루틴을 바꾼 날(누르면 그날로).
function Trend({ records, versions, date, onPick }) {
  const pts = records.filter((x) => x.redness != null).slice(-28)
  const changes = versions.slice(1)
  if (pts.length < 2) {
    return (
      <div className="card db-card db-empty">
        <h2 className="db-h">최근 4주 볼 붉은기</h2>
        <p>사진 기록이 이틀 이상 쌓이면 볼 붉은기 흐름을 그래프로 보여 드려요.</p>
      </div>
    )
  }
  const band = [...pts].reverse().find((x) => x.verdict?.baseline)?.verdict.baseline
  const W = 640, H = 340, L = 44, R = 16, T = 78, B = 34
  const t0 = new Date(pts[0].date).getTime(), t1 = new Date(pts[pts.length - 1].date).getTime()
  const x = (iso) => L + ((new Date(iso).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R)
  const vals = pts.map((p) => p.redness).concat(band ? [band.low, band.high] : [])
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5)
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const ticks = [lo, (lo + hi) / 2, hi].map((t) => Math.round(t * 10) / 10)
  // 이름표 자리: 앞 이름표와 겹치면 한 줄 아래로 내린다
  let prevRight = -Infinity, prevRow = 1
  const marks = changes.filter((v) => v.start > pts[0].date && v.start <= pts[pts.length - 1].date).map((v) => {
    const label = `${v.id}번째 루틴 ${fmt.md(v.start)}`, w = label.length * 12.5 + 20
    const mx = L + ((new Date(v.start).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R)
    const left = Math.min(Math.max(mx - w / 2, L), W - R - w)
    const row = left < prevRight + 6 ? 1 - prevRow : 0
    prevRight = left + w; prevRow = row
    return { v, label, w, mx, left, top: 4 + row * 32 }
  })
  const go = (e, iso) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(iso) } }
  return (
    <div className="card db-card">
      <div className="db-row">
        <h2 className="db-h">최근 4주 볼 붉은기</h2>
        <ul className="db-legend" aria-hidden="true">
          <li><i className="dt-dot-l ok" />맑음</li><li><i className="dt-dot-l watch" />구름 조금</li><li><i className="dt-dot-l signal" />흐림</li>
          {pts.some((p) => p.verdict?.level === '구분 불가' || !p.verdict) && <li><i className="dt-dot-l unknown" />비교하지 않은 날</li>}
          {band && <li><i className="dt-band-l" />평소 범위</li>}
          {marks.length > 0 && <li><i className="dt-mark-l" />루틴을 바꾼 날</li>}
        </ul>
      </div>
      <svg className="db-trend" viewBox={`0 0 ${W} ${H}`} role="group"
        aria-label={`${fmt.md(pts[0].date)}부터 ${fmt.md(pts[pts.length - 1].date)}까지 사진 기록 ${pts.length}일의 볼 붉은기`}>
        {ticks.map((t) => <g key={t} aria-hidden="true"><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="dt-grid" /><text x={L - 8} y={y(t) + 5} className="dt-tick" textAnchor="end">{sgn(t)}</text></g>)}
        {band && <rect x={L} width={W - L - R} y={y(band.high)} height={Math.max(2, y(band.low) - y(band.high))} className="dt-band" aria-hidden="true" />}
        <polyline points={pts.map((p) => `${x(p.date)},${y(p.redness)}`).join(' ')} className="dt-line" aria-hidden="true" />
        {pts.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.redness)} r={p.date === date ? 7 : 5}
            className={'dt-dot ' + (WEATHER[p.verdict?.level]?.cls || 'unknown') + (p.date === date ? ' sel' : '')} onClick={() => onPick(p.date)}>
            <title>{fmt.md(p.date)} {WEATHER[p.verdict?.level]?.name || ''} 볼 붉은기 {sgn(p.redness)}</title>
          </circle>
        ))}
        {/* 루틴을 바꾼 날: 세로선과 이름표. 누르거나(Enter, Space) 그날로 간다 */}
        {marks.map(({ v, label, w, mx, left, top }) => (
          <g key={v.id} className={'dt-m' + (v.start === date ? ' on' : '')} role="button" tabIndex={0}
            aria-label={`${fmt.md(v.start)} ${v.id}번째 루틴으로 바꾼 날: ${fmt.plain(v.change)}. 그날 보기`}
            onClick={() => onPick(v.start)} onKeyDown={(e) => go(e, v.start)}>
            <line x1={mx} x2={mx} y1={top + 28} y2={H - B} className="dt-hit" />
            <line x1={mx} x2={mx} y1={top + 28} y2={H - B} className="dt-mark" />
            <rect x={left} y={top} width={w} height={28} rx={14} className="dt-pill" />
            <text x={left + w / 2} y={top + 19} textAnchor="middle" className="dt-mlabel">{label}</text>
            <title>{fmt.plain(v.change)}</title>
          </g>
        ))}
        <text x={L} y={H - 8} className="dt-tick" aria-hidden="true">{fmt.md(pts[0].date)}</text>
        <text x={W - R} y={H - 8} className="dt-tick" textAnchor="end" aria-hidden="true">{fmt.md(pts[pts.length - 1].date)}</text>
      </svg>
      <p className="db-cap">
        {marks.length ? '주황 점선은 루틴을 바꾼 날이에요. 누르면 그날 기록으로 가요. 점선 뒤 점이 띠 위로 오르면 시기가 겹친 거예요(제품이 원인이라고 단정할 수는 없어요).'
          : changes.length ? '최근 4주에는 루틴을 바꾼 날이 없어요.'
            : '아직 루틴을 바꾼 적이 없어요. 바꾸면 이 그래프에 점선으로 표시돼서, 바꾼 뒤 붉은기가 오르는지 볼 수 있어요.'}
      </p>
    </div>
  )
}

// 그날의 날씨(작게): 이름, 한 줄 문장, 게이지
function DayMini({ rec, isToday, empty }) {
  const v = rec?.verdict
  if (!v) return <div className="card db-mini db-mini-empty"><p className="db-mini-l">{isToday ? '오늘의 얼굴 날씨' : '이날의 얼굴 날씨'}</p>{empty}</div>
  return (
    <div className={'hero db-mini ' + LEVEL_CLASS[v.level]}>
      <HeroSky level={v.level} />
      <p className="hero-label">{isToday ? '오늘의 얼굴 날씨' : `${fmt.md(rec.date)} 얼굴 날씨`}</p>
      <h2 className="hero-name"><WeatherIcon level={v.level} size={36} />{WEATHER[v.level].name}</h2>
      <p className="hero-msg">{v.message}</p>
      {v.baseline && rec.redness != null && <Gauge value={rec.redness} low={v.baseline.low} high={v.baseline.high} base={v.baseline_version} />}
    </div>
  )
}

export function Dashboard({ today, first, date, records, versions, rec, onPick, load, empty, log, after }) {
  return (
    <div className="db">
      <MonthKpis records={records} date={date} />
      <div className="db-trendw"><Trend records={records} versions={versions} date={date} onPick={onPick} /></div>
      <div className="db-day"><DayMini rec={rec} isToday={date === today} empty={empty} /></div>
      <div className="db-cal"><Calendar date={date} first={first} today={today} onPick={onPick} load={load} /></div>
      <div className="db-log">{log}</div>
      {after && <div className="db-full">{after}</div>}
    </div>
  )
}
