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
    <div className="recap-map rs-map" aria-label={`${m}월 날짜별 얼굴 날씨`}>
      {[...'일월화수목금토'].map((w) => <i className="rm-dow" key={w}>{w}</i>)}
      {Array.from({ length: lead }, (_, k) => <i key={'b' + k} />)}
      {Array.from({ length: days }, (_, k) => {
        const iso = `${r.month}-${pad2(k + 1)}`, l = lv[iso]
        const cls = k + 1 > end ? 'future' : l ? WEATHER[l].cls : iso in lv ? 'nophoto' : 'none'
        return <i key={iso} className={'rm ' + cls} title={`${m}/${k + 1} ${l ? WEATHER[l].name : iso in lv ? '사진 없음' : k + 1 > end ? '' : '기록 없음'}`} />
      })}
    </div>
  )
}

function slides(r, today) {
  const m = +r.month.slice(5)
  const photoLv = LEVELS.filter((lv) => r.weather[lv] > 0)
  const top = photoLv.length ? photoLv.reduce((a, b) => (r.weather[b] > r.weather[a] ? b : a)) : null
  const s = span(r, today)
  return [
    {
      key: 'weather', tone: top ? WEATHER[top].cls : 'unknown',
      body: top ? (
        <>
          <p className="rs-kicker">{m}월의 얼굴 날씨는</p>
          <p className="rs-big"><WeatherIcon level={top} size={56} />{WEATHER[top].name}</p>
          <p className="rs-sub">{r.weather[top]}일로 가장 많았어요.</p>
          <ul className="rs-counts">{LEVELS.map((lv) => <li key={lv}><WeatherIcon level={lv} size={18} />{WEATHER[lv].name} <b>{r.weather[lv]}</b></li>)}</ul>
        </>
      ) : <><p className="rs-kicker">{m}월의 얼굴 날씨는</p><p className="rs-sub">아직 사진 기록이 없어요.</p></>,
    },
    {
      key: 'photos', tone: 'accent',
      body: (
        <>
          <p className="rs-kicker">{m}월에</p>
          <p className="rs-title">{r.photo_days}일 동안 사진을 남겼어요</p>
          <Ring value={r.photo_days} total={s.n} />
          <p className="rs-sub">{r.days > r.photo_days ? `증상만 남긴 날까지 더하면 ${r.days}일 기록했어요.` : '같은 자리, 같은 조명이면 비교가 더 정확해져요.'}</p>
        </>
      ),
    },
    {
      key: 'cloudy', tone: r.signal_spans.length ? 'signal' : 'ok',
      body: r.signal_spans.length ? (
        <>
          <p className="rs-kicker">가장 흐렸던 때</p>
          <p className="rs-title">{r.signal_spans.join(', ')}</p>
          <p className="rs-sub">볼 붉은기가 평소 범위를 넘었던 날이 {r.weather['신호 있음']}일 있었어요.</p>
          {r.back_on && <p className="rs-note">{fmt.md(r.back_on)}부터 다시 맑아졌어요.</p>}
        </>
      ) : (
        <>
          <p className="rs-kicker">흐렸던 때</p>
          <p className="rs-title">이달은 흐린 날이 없었어요</p>
          <p className="rs-sub">볼 붉은기가 평소 범위를 넘은 날이 없었어요.</p>
        </>
      ),
    },
    {
      key: 'routine', tone: 'watch',
      body: r.changes.length ? (
        <>
          <p className="rs-kicker">이달 바꾼 루틴</p>
          <p className="rs-title">{r.changes.length}번</p>
          <ul className="rs-list">{r.changes.map((c) => <li key={c.date + c.change}><b>{fmt.md(c.date)}</b> {fmt.plain(c.change)}</li>)}</ul>
          <p className="rs-sub">한 번에 하나씩 바꾸면 무엇 때문인지 알기 쉬워요.</p>
        </>
      ) : (
        <>
          <p className="rs-kicker">이달 바꾼 루틴</p>
          <p className="rs-title">그대로 지켰어요</p>
          <p className="rs-sub">루틴을 바꾸지 않은 달은 다음 변화를 비교할 좋은 기준이 돼요.</p>
        </>
      ),
    },
    {
      key: 'map', tone: 'paper',
      body: (
        <>
          <p className="rs-kicker">{m}월 한눈에</p>
          <MonthMap r={r} today={today} />
          <ul className="rs-lines">{r.lines.slice(1).map((t) => <li key={t}>{t}</li>)}</ul>
        </>
      ),
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
  if (!r) return <>{head}<Status {...q} /></>
  if (r.empty || !r.cal) return <>{head}<div className="card"><p className="muted">아직 Recap을 만들 기록이 없어요.</p></div></>
  const list = slides(r, today)
  const go = (n) => setI((x) => Math.max(0, Math.min(list.length - 1, x + n)))
  const s = list[i]
  return (
    <>
    {head}
    <div className="rs-wrap">
    <div className="rs" ref={box}>
      <div className="rs-bars" aria-hidden="true">{list.map((x, n) => <i key={x.key} className={n < i ? 'done' : n === i ? 'on' : ''} />)}</div>
      <section className={'rs-card t-' + s.tone} key={r.month + s.key} aria-roledescription="카드" aria-label={`${list.length}장 중 ${i + 1}번째`}
        tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1) }}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
        onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); touch.current = null }}>
        {s.body}
      </section>
      <div className="rs-nav">
        <button className="btn ghost" onClick={() => go(-1)} disabled={i === 0}>‹ 이전</button>
        <span className="muted small" aria-live="polite">{i + 1} / {list.length}</span>
        {i < list.length - 1
          ? <button className="btn" onClick={() => go(1)}>다음 ›</button>
          : <button className="btn ghost" onClick={() => setI(0)}>처음부터</button>}
      </div>
    </div>
    </div>
    </>
  )
}
