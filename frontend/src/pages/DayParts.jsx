// 날짜 하나의 얼굴 날씨를 보여 주는 조각들. 데모 다이어리(김서연)와 로그인한 '오늘' 화면이 함께 쓴다.
// 두 화면 모두 같은 판정 엔진의 기록(record)과 루틴 버전(version)을 받으므로 모양이 같다.
import { useState } from 'react'
import { fmt, LEVEL_CLASS } from '../api.js'
import { WEATHER, WeatherIcon, HeroSky } from '../weather.jsx'
import Gauge from '../gauge.jsx'
import KV from '../kv.jsx'

export const SYMPTOMS = ['따가움', '화끈', '가려움', '당김']

// 환경 줄. district가 있으면 어느 구의 실측값인지 밝힌다.
export function EnvLine({ e, district, day }) {
  const src = district ? `환경(${district} 실측)` : '환경'
  const has = e && (e.pm25 != null || e.humidity != null || e.temp != null)
  if (!has) return <span className="env-line"><b>{src}</b> <span className="muted">이날 측정값은 아직 없어요</span></span>
  const when = e.measured_on && e.measured_on !== day ? `${+e.measured_on.slice(5, 7)}/${+e.measured_on.slice(8)} 측정값` : ''
  return (
    <span className="env-line">
      <b>{src}</b> <span className="muted">{e.unusual ? '평소와 달라요' : '평소와 비슷해요'}</span>
      <KV className="small" items={[['초미세먼지', e.pm25 != null && e.pm25], ['습도', e.humidity != null && `${e.humidity}%`], ['기온', e.temp != null && `${e.temp}℃`]]} />
      {when && <span className="sub-line">{when}</span>}
    </span>
  )
}

// 큰 날씨 카드: 날씨 이름, 판정 문장, 이유, 게이지, 루틴 버전, 환경.
export function DayHero({ record, version, district, isToday, mine, showEnv = true }) {
  const v = record.verdict
  return (
    <div className={'hero ' + LEVEL_CLASS[v.level]}>
      <HeroSky level={v.level} />
      <p className="hero-label">{isToday ? (mine ? '오늘의 내 얼굴 날씨' : '오늘의 얼굴 날씨') : '이날의 얼굴 날씨'}</p>
      <h2 className="hero-name"><WeatherIcon level={v.level} size={48} />{WEATHER[v.level].name}</h2>
      <p className="hero-msg">{v.message}</p>
      {v.reasons.length > 0 && <ul className="hero-reasons">{v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {v.baseline && record.redness !== null && (
        <Gauge value={record.redness} low={v.baseline.low} high={v.baseline.high} base={v.baseline_version} />
      )}
      <div className="hero-meta">
        {version && <><b>{version.id}번째 루틴</b> {fmt.plain(version.label)}<span className="sub-line">이 루틴으로 {record.day_in_version}일째</span></>}
        {showEnv && <EnvLine e={record.env} district={district} day={record.date} />}
        {showEnv && record.env?.facts?.length > 0 && <><br />{record.env.facts.join(' ')}</>}
      </div>
    </div>
  )
}

// 이번 주 7일 줄(일요일 시작). 기록이 있는 날만 누를 수 있다.
export function weekOf(date, records) {
  const lv = Object.fromEntries(records.map((r) => [r.date, r.verdict.level]))
  const start = fmt.shift(date, -new Date(date + 'T00:00:00').getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const iso = fmt.shift(start, i)
    return { date: iso, has_record: iso in lv, level: lv[iso] || null }
  })
}

export function WeekStrip({ date, week, first, today, setDate }) {
  const move = (n) => {
    const next = fmt.shift(date, n * 7)
    setDate(next < first ? first : next > today ? today : next)
  }
  return (
    <div className="week">
      <button className="week-nav" onClick={() => move(-1)} disabled={week[0].date <= first} aria-label="이전 주 보기">‹</button>
      {week.map((w) => (
        <button key={w.date} disabled={w.date < first || w.date > today} className={'wd' + (w.date === date ? ' on' : '') + (w.has_record ? '' : ' empty')} aria-current={w.date === date ? 'date' : undefined}
          onClick={() => setDate(w.date)} aria-label={fmt.full(w.date) + (w.level ? ` ${WEATHER[w.level].name}` : ' 기록 없음')}>
          <span>{'일월화수목금토'[new Date(w.date + 'T00:00:00').getDay()]}</span>
          <b>{+w.date.slice(8)}</b>
          {w.level ? <WeatherIcon level={w.level} size={16} /> : <i className="dot none" />}
        </button>
      ))}
      <button className="week-nav" onClick={() => move(1)} disabled={week[6].date >= today} aria-label="다음 주 보기">›</button>
    </div>
  )
}

// 증상 한 줄: '따가움 2점, 당김 1점' 또는 '증상 없음'
export const symptomText = (s) => SYMPTOMS.filter((k) => s?.[k] > 0).map((k) => `${k} ${s[k]}점`).join(', ') || '증상 없음'

// 루틴을 바꾼 날로 바로 가는 줄. 데모는 '흐림 시작'도 함께 보여 준다.
export function ChangeDays({ records, versions, date, setDate, title, withSignal }) {
  const firstSignal = withSignal && records.find((r) => r.verdict.level === '신호 있음')
  const steps = [
    ...versions.slice(1).filter((v) => v.change).map((v) => ({ date: v.start, text: fmt.plain(v.change) })),
    firstSignal && { date: firstSignal.date, text: '흐림 시작' },
  ].filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))
  if (!steps.length) return null
  return (
    <nav className="story" aria-label={title}>
      <b>{title}</b>
      {steps.map((s) => (
        <button key={s.date + s.text} className={s.date === date ? 'on' : ''} aria-current={s.date === date ? 'date' : undefined}
          onClick={() => setDate(s.date)}>{fmt.md(s.date)} {s.text}</button>
      ))}
    </nav>
  )
}

// 주간 / 월간 보기 전환. 고른 보기는 이 브라우저에 기억한다(없어도 동작).
const PERIOD_KEY = 'natssi.period'
export function usePeriod() {
  const [p, setP] = useState(() => { try { return localStorage.getItem(PERIOD_KEY) === 'month' ? 'month' : 'week' } catch { return 'week' } })
  const set = (v) => { setP(v); try { localStorage.setItem(PERIOD_KEY, v) } catch { /* 저장이 막혀도 계속 */ } }
  return [p, set]
}
export function PeriodToggle({ value, onChange }) {
  return (
    <div className="period" role="group" aria-label="달력 보기">
      {[['week', '주간'], ['month', '월간']].map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  )
}

// 기록이 없는 날: 낯씨 캐릭터와 한 줄. action이 있으면 버튼을 함께 보여 준다(예: 오늘 기록하기).
export function EmptyDay({ isToday, action }) {
  return (
    <div className="empty-day" role="status">
      <img src="/logo.svg" alt="" className="empty-face" />
      <p className="empty-title">{isToday ? '오늘은 아직 기록이 없어요' : '이날은 기록이 없어요'}</p>
      <p className="muted small">{isToday ? '사진 한 장과 증상 네 가지면 돼요.' : '다른 날을 골라 보세요.'}</p>
      {action}
    </div>
  )
}
