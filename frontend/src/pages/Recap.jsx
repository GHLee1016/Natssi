// 월간 Recap: 연말 결산(음악, 영상 서비스의 Recap)처럼 한 달을 카드 몇 장으로 넘겨 본다.
// 1 이달의 날씨  2 사진 기록  3 흐렸던 때  4 바꾼 루틴  5 한 달 칸 지도와 요약
// 좌우 버튼, 화면 밀기(스와이프), 키보드 화살표로 넘긴다. 숫자와 문장은 모두 서버 Recap(기록에서 센 값)에서 온다.
import { useEffect, useRef, useState } from 'react'
import { fmt } from '../api.js'
import { Status } from '../useLoad.jsx'
import { WEATHER, WeatherIcon } from '../weather.jsx'
import { useInsights } from './Insights.jsx'

const LEVELS = ['신호 없음', '관찰 중', '신호 있음', '구분 불가']
const pad2 = (n) => String(n).padStart(2, '0')

// 그 달에 기록할 수 있던 날 수(첫 달은 처음 기록한 날부터, 이번 달은 오늘까지)
function span(r, today) {
  const [y, m] = r.month.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const firstRec = r.cal[0]?.date
  const start = r.month === r.months[0] && firstRec ? +firstRec.slice(8) : 1
  const end = today && today.slice(0, 7) === r.month ? +today.slice(8) : days
  return { days, end, n: Math.max(1, end - start + 1) }
}

function Ring({ value, total }) {
  const C = 2 * Math.PI * 52, pct = Math.min(1, value / total)
  return (
    <div className="rs-ring" role="img" aria-label={`사진 기록 ${value}일, 기록할 수 있던 날 ${total}일`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" className="rr-bg" />
        <circle cx="60" cy="60" r="52" className="rr-fg" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 60 60)" />
      </svg>
      <span><b>{value}</b>/{total}일</span>
    </div>
  )
}

function MonthMap({ r, today }) {
  const [y, m] = r.month.split('-').map(Number)
  const { days, end } = span(r, today)
  const lead = new Date(y, m - 1, 1).getDay()
  const lv = Object.fromEntries(r.cal.map((x) => [x.date, x.level]))
  return (
    <div className="rm-cal" role="img" aria-label={`${m}월 날짜별 얼굴 날씨. 맑음 ${r.weather['신호 없음']}일, 구름 조금 ${r.weather['관찰 중']}일, 흐림 ${r.weather['신호 있음']}일, 안개 ${r.weather['구분 불가']}일`}>
      {[...'일월화수목금토'].map((w) => <i className="rm-dow" key={w}>{w}</i>)}
      {Array.from({ length: lead }, (_, k) => <i key={'b' + k} />)}
      {Array.from({ length: days }, (_, k) => {
        const iso = `${r.month}-${pad2(k + 1)}`, l = lv[iso]
        const kind = k + 1 > end ? 'future' : l ? 'w' : iso in lv ? 'nophoto' : 'none'
        return (
          <span key={iso} className={'rm-d ' + kind}>
            <b>{k + 1}</b>{l ? <WeatherIcon level={l} size={18} /> : <i className="rm-mark" />}
          </span>
        )
      })}
    </div>
  )
}

// 달력 범례(날씨 네 가지, 사진 없이 증상만 남긴 날, 기록 없는 날)
function MapLegend() {
  return (
    <ul className="rm-legend" aria-hidden="true">
      {LEVELS.map((lv) => <li key={lv}><WeatherIcon level={lv} size={16} />{WEATHER[lv].name}</li>)}
      <li><i className="rm-mark nophoto" />사진 없음</li>
      <li><i className="rm-mark none" />기록 없음</li>
    </ul>
  )
}

// 날씨 네 가지를 막대로(가장 많은 날씨가 꽉 찬 막대)
function Bars({ r }) {
  const max = Math.max(1, ...LEVELS.map((lv) => r.weather[lv]))
  return (
    <ul className="rs-bars2" aria-label="얼굴 날씨별 날 수">
      {LEVELS.map((lv) => (
        <li key={lv}><span><WeatherIcon level={lv} size={18} />{WEATHER[lv].name}</span>
          <i>{r.weather[lv] > 0 && <b className={WEATHER[lv].cls} style={{ width: `${(r.weather[lv] / max) * 100}%` }} />}</i><em>{r.weather[lv]}일</em></li>
      ))}
    </ul>
  )
}

// 카드 한 장 = 글(text) + 그림(vis). 폰은 위아래, PC는 좌우로 놓는다.
// 마지막 카드 요약 2~3줄: 서버 Recap에서 센 숫자만 쓴다(원인은 말하지 않는다).
function summary(r) {
  const w = r.weather
  const out = [`사진 ${r.photo_days}일 가운데 맑음 ${w['신호 없음']}일, 흐림 ${w['신호 있음']}일이었어요.`]
  if (r.changes.length) out.push(`루틴을 ${r.changes.length}번 바꿨어요.${r.signal_spans.length ? ` 흐렸던 때는 ${r.signal_spans.join(', ')}예요.` : ''}`)
  else if (r.signal_spans.length) out.push(`흐렸던 때는 ${r.signal_spans.join(', ')}예요.`)
  if (r.back_on) out.push(`${fmt.md(r.back_on)}부터 다시 맑아졌어요.`)
  return out.slice(0, 3)
}

function slides(r, today, restart) {
  const m = +r.month.slice(5)
  const photoLv = LEVELS.filter((lv) => r.weather[lv] > 0)
  const top = photoLv.length ? photoLv.reduce((a, b) => (r.weather[b] > r.weather[a] ? b : a)) : null
  const s = span(r, today)
  return [
    {
      key: 'weather', tone: top ? WEATHER[top].cls : 'unknown',
      text: top ? (
        <>
          <p className="rs-kicker">{m}월의 얼굴 날씨는</p>
          <p className="rs-big">{WEATHER[top].name}</p>
          <p className="rs-sub">{r.weather[top]}일로 가장 많았어요.</p>
        </>
      ) : <><p className="rs-kicker">{m}월의 얼굴 날씨는</p><p className="rs-title">아직 몰라요</p><p className="rs-sub">사진 기록이 쌓이면 알 수 있어요.</p></>,
      vis: top && <><span className="rs-icon"><WeatherIcon level={top} size={120} /></span><Bars r={r} /></>,
    },
    {
      key: 'photos', tone: 'accent',
      text: (
        <>
          <p className="rs-kicker">{m}월에</p>
          <p className="rs-title">{r.photo_days}일 동안<br />사진을 남겼어요</p>
          <p className="rs-sub">{r.days > r.photo_days ? `증상만 남긴 날을 더하면 ${r.days}일이에요.` : '같은 자리, 같은 조명에서 찍을수록 비교가 정확해요.'}</p>
        </>
      ),
      vis: <Ring value={r.photo_days} total={s.n} />,
    },
    {
      key: 'cloudy', tone: r.signal_spans.length ? 'signal' : 'ok',
      text: r.signal_spans.length ? (
        <>
          <p className="rs-kicker">가장 흐렸던 때</p>
          <p className="rs-title">{r.signal_spans.join(', ')}</p>
          <p className="rs-sub">볼 붉은기가 평소 범위를 넘은 날이 {r.weather['신호 있음']}일이었어요.</p>
          {r.back_on && <p className="rs-note">{fmt.md(r.back_on)}부터 다시 맑아졌어요</p>}
        </>
      ) : (
        <>
          <p className="rs-kicker">흐렸던 때</p>
          <p className="rs-title">이달은 흐린 날이<br />없었어요</p>
          <p className="rs-sub">볼 붉은기가 평소 범위를 넘은 날이 하루도 없었어요.</p>
        </>
      ),
      vis: r.signal_spans.length > 0 && (
        <dl className="rs-facts">
          <div><dt>흐린 날</dt><dd>{r.weather['신호 있음']}일</dd></div>
          <div><dt>흐렸던 기간</dt><dd>{r.signal_spans.length}번</dd></div>
          {r.back_on && <div><dt>다시 맑아진 날</dt><dd>{fmt.md(r.back_on)}</dd></div>}
        </dl>
      ),
    },
    {
      key: 'routine', tone: 'routine',
      text: r.changes.length ? (
        <>
          <p className="rs-kicker">이달 바꾼 루틴</p>
          <p className="rs-big">{r.changes.length}번</p>
          <p className="rs-sub">하나씩 바꿔야 어느 변화와 시기가 겹쳤는지 가리기 쉬워요.</p>
        </>
      ) : (
        <>
          <p className="rs-kicker">이달 바꾼 루틴</p>
          <p className="rs-title">그대로 지켰어요</p>
          <p className="rs-sub">바꾸지 않은 달은 다음에 바꿀 때 비교 기준이 돼요.</p>
        </>
      ),
      vis: r.changes.length > 0 && (
        <ol className="rs-timeline">{r.changes.map((c) => <li key={c.date + c.change}><b>{fmt.md(c.date)}</b><span>{fmt.plain(c.change)}</span></li>)}</ol>
      ),
    },
    {
      key: 'map', tone: 'paper',
      text: (
        <>
          <p className="rs-kicker">{m}월 정리</p>
          <ul className="rs-sum">{summary(r).map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="rs-end">다음 달에도 하나씩만 바꿔 봐요.</p>
          {restart}
        </>
      ),
      vis: <><MonthMap r={r} today={today} /><MapLegend /></>,
    },
  ]
}

export default function Recap({ mine, today, desc, onClose }) {
  const [month, setMonth] = useState(null)
  const q = useInsights(mine, month)
  const r = q.data?.recap
  const [i, setI] = useState(0)
  const touch = useRef(null)
  const box = useRef(null)
  useEffect(() => { setI(0) }, [r?.month])
  const refocus = useRef(false)
  const swiped = useRef(false)
  useEffect(() => { if (refocus.current) { refocus.current = false; box.current?.querySelector('.rs-card')?.focus({ preventScroll: true }) } }, [i])
  // 폰 이야기 모드: 뒤 화면 스크롤을 막고, Esc로 닫는다(포커스가 어디 있든)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    document.body.classList.add('rs-lock')
    const esc = (e) => { if (e.key === 'Escape') closeRef.current?.() }
    window.addEventListener('keydown', esc)
    return () => { document.body.classList.remove('rs-lock'); window.removeEventListener('keydown', esc) }
  }, [])
  const ym = r?.month || today.slice(0, 7)
  const k = r ? r.months.indexOf(r.month) : -1
  const head = (
    <div className="ask-head rs-head">
      <div>
        <h2>
          {r && <button className="icon-btn rs-arrow" disabled={k <= 0} onClick={() => setMonth(r.months[k - 1])} aria-label="이전 달">‹</button>}
          <span>{ym.slice(0, 4) !== today.slice(0, 4) && `${+ym.slice(0, 4)}년 `}{+ym.slice(5)}월 Recap</span>
          {r && <button className="icon-btn rs-arrow" disabled={k >= r.months.length - 1} onClick={() => setMonth(r.months[k + 1])} aria-label="다음 달">›</button>}
        </h2>
        {desc && <p className="muted small">{desc}</p>}
      </div>
      {onClose && <button type="button" className="icon-btn" onClick={onClose} aria-label="닫고 돌아가기">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>}
    </div>
  )
  // 폰(900px 미만)에서는 .recap-root가 화면 전체를 덮는다(아래 탭 바 위로). Esc로도 닫는다.
  const root = (body) => (
    <div className="recap-root" role="region" aria-label="Recap">{head}{body}</div>
  )
  if (!r) return root(<Status {...q} />)
  if (r.empty || !r.cal) return root(<div className="card"><p className="muted">아직 Recap을 만들 기록이 없어요. 사진 기록을 남기면 만들어져요.</p></div>)
  const restart = () => { setI(0); setTimeout(() => box.current?.querySelector('.rs-card')?.focus(), 0) }   // 첫 카드로 가고 포커스도 옮긴다
  const list = slides(r, today, <button className="btn dark rs-again" onClick={restart}>처음부터 다시 보기</button>)
  // 카드를 넘기면 새 카드가 그려지므로, 키보드로 넘길 때는 포커스를 새 카드로 옮긴다(←/→를 이어서 누를 수 있게)
  const go = (n) => { refocus.current = box.current?.contains(document.activeElement); setI((x) => Math.max(0, Math.min(list.length - 1, x + n))) }
  const tap = (n) => { if (swiped.current) { swiped.current = false; return } go(n) }
  const s = list[i]
  return root(
    <div className="rs-wrap">
    <div className="rs" ref={box}>
      <section className={'rs-card t-' + s.tone} key={r.month + s.key} aria-roledescription="카드" aria-label={`${list.length}장 중 ${i + 1}번째`}
        tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1) }}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
        onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (Math.abs(dx) > 40) { swiped.current = true; go(dx < 0 ? 1 : -1) } touch.current = null }}>
        {/* 이야기 카드처럼 화면을 눌러 넘긴다: 왼쪽 1/3은 이전 카드, 나머지는 다음 카드. 밀어서 넘긴 직후의 누름은 무시 */}
        <button type="button" className="rs-tap prev" onClick={() => tap(-1)} disabled={i === 0} aria-label="이전 카드" />
        <button type="button" className="rs-tap next" onClick={() => tap(1)} disabled={i === list.length - 1} aria-label="다음 카드" />
        <div className="rs-top" aria-hidden="true">
          <div className="rs-bars">{list.map((x, n) => <i key={x.key} className={n < i ? 'done' : n === i ? 'on' : ''} />)}</div>
          <p className="rs-brand"><img src="/logo.svg" alt="" />낯씨 {+r.month.slice(5)}월 Recap</p>
        </div>
        <div className="rs-text">{s.text}</div>
        {s.vis && <div className="rs-vis">{s.vis}</div>}
        {i === 0 && <p className="rs-hint" aria-hidden="true">화면을 누르면 다음 카드로 넘어가요</p>}
      </section>
      <p className="sr-only" aria-live="polite">{list.length}장 중 {i + 1}번째 카드</p>
    </div>
    </div>
  )
}
