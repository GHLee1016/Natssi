import { useState } from 'react'
import { api, fmt, LEVEL_CLASS } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import { WEATHER, WeatherIcon } from '../weather.jsx'
import Calendar from './Calendar.jsx'
import Gauge from '../gauge.jsx'
import StartCard from './StartCard.jsx'
import FaceMap from './FaceMap.jsx'

const SYMPTOMS = ['따가움', '화끈', '가려움', '당김']

// 환경 줄. 김서연은 가상 인물이지만 환경값은 실제 측정값(에어코리아·기상청)이라 어느 구 값인지 밝힌다.
function envLine(e, district, day) {
  const src = district ? `환경(${district} 실측)` : '환경'
  const parts = [e.pm25 != null && `초미세먼지 ${e.pm25}`, e.humidity != null && `습도 ${e.humidity}%`, e.temp != null && `기온 ${e.temp}℃`].filter(Boolean)
  if (!parts.length) return `${src} · 이날 측정값은 아직 없어요`
  const when = e.measured_on && e.measured_on !== day ? ` (${+e.measured_on.slice(5, 7)}/${+e.measured_on.slice(8)} 측정값)` : ''
  return `${src} · ${parts.join(' · ')}${when} · ${e.unusual ? '평소와 달라요' : '평소와 비슷'}`
}

export default function Diary({ date, setDate, meta, go, askLogin }) {
  const q = useLoad(() => api.day(date), [date])
  const [calOpen, setCalOpen] = useState(false)
  const d = q.data

  const moveWeek = (n) => {
    const next = fmt.shift(date, n * 7)
    setDate(next < meta.first ? meta.first : next > meta.today ? meta.today : next)
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">{date === meta.today ? '오늘' : '지난 기록'}</p>
          <h1>{fmt.full(date)}</h1>
        </div>
        <div className="head-actions">
          {date !== meta.today && <button className="btn ghost" onClick={() => setDate(meta.today)}>오늘로 가기</button>}
          <button className="btn ghost" onClick={() => setCalOpen((o) => !o)} aria-expanded={calOpen}>{calOpen ? '달력 닫기' : '달력'}</button>
        </div>
      </header>
      {calOpen && <Calendar date={date} first={meta.first} today={meta.today} onPick={(iso) => { setDate(iso); setCalOpen(false) }} />}
      <Status {...q} />
      {d && (
        <>
          <div className={'hero ' + LEVEL_CLASS[d.record.verdict.level]}>
            <WeatherIcon level={d.record.verdict.level} size={220} className="hero-bg" />
            <p className="hero-label">{date === meta.today ? '오늘의 얼굴 날씨' : '이날의 얼굴 날씨'}</p>
            <h2 className="hero-name"><WeatherIcon level={d.record.verdict.level} size={48} />{WEATHER[d.record.verdict.level].name}</h2>
            <p className="hero-msg">{d.record.verdict.message}</p>
            {d.record.verdict.reasons.length > 0 && (
              <ul className="hero-reasons">{d.record.verdict.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            )}
            {d.record.verdict.baseline && d.record.redness !== null && (
              <Gauge value={d.record.redness} low={d.record.verdict.baseline.low} high={d.record.verdict.baseline.high}
                base={d.record.verdict.baseline_version} />
            )}
            <p className="hero-meta">
              루틴 버전 {d.version.id} · {d.version.label} · {d.record.day_in_version}일째<br />
              {envLine(d.record.env, meta.env_district, date)}
              {d.record.env.facts?.length > 0 && <><br />{d.record.env.facts.join(' ')}</>}
            </p>
          </div>

          <FaceMap record={d.record} />

          <div className="week">
            <button className="week-nav" onClick={() => moveWeek(-1)} disabled={d.week[0].date <= meta.first} aria-label="이전 주 보기">‹</button>
            {d.week.map((w) => (
              <button key={w.date} disabled={!w.has_record} className={'wd' + (w.date === date ? ' on' : '')} aria-current={w.date === date ? 'date' : undefined}
                onClick={() => setDate(w.date)} aria-label={fmt.full(w.date) + (w.level ? ` ${WEATHER[w.level].name}` : ' 기록 없음')}>
                <span>{'일월화수목금토'[new Date(w.date + 'T00:00:00').getDay()]}</span>
                <b>{+w.date.slice(8)}</b>
                {w.level ? <WeatherIcon level={w.level} size={16} /> : <i className="dot none" />}
              </button>
            ))}
            <button className="week-nav" onClick={() => moveWeek(1)} disabled={d.week[6].date >= meta.today} aria-label="다음 주 보기">›</button>
          </div>

          <div className="rec-sec">
            <h3>{date === meta.today ? '오늘의 기록' : '이날의 기록'}</h3>
            <div className="rec">
              <div className="rec-row">
                <span className="rec-k">셀카</span>
                <div className="rec-v"><i className="thumb round" style={{ backgroundImage: `url(/faces/${d.record.photo}.jpg)` }} />
                  <div>{d.record.quality_ok ? '사진이 잘 찍혔어요' : d.record.quality_note}<p className="muted small">AI로 생성된 이미지</p></div></div>
                <button className="link" onClick={() => go('capture')}>촬영하기</button>
              </div>
              <div className="rec-row">
                <span className="rec-k">증상</span>
                <div className="rec-v"><div>{SYMPTOMS.map((s) => `${s} ${d.record.symptoms[s]}`).join(' · ')}</div></div>
                <button className="link" onClick={askLogin}>로그인하고 기록</button>
              </div>
              <div className="rec-row">
                <span className="rec-k">루틴</span>
                <div className="rec-v"><div>{d.version.items.filter((i) => i.kind === 'cosmetic').map((i) => i.name).join(' · ')}</div></div>
                <span className="done" aria-label="사용함">✓</span>
              </div>
            </div>
          </div>
          {meta.auth && !meta.viewer && <StartCard onStart={askLogin} />}
        </>
      )}
    </section>
  )
}
