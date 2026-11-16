import { useState } from 'react'
import { api, fmt, LEVEL_CLASS } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import { WEATHER, WeatherIcon } from '../weather.jsx'
import Calendar from './Calendar.jsx'

const SYMPTOMS = ['따가움', '화끈', '가려움', '당김']

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
          <span className="pill accent">루틴 버전 {d.version.id} · {d.version.label} · {d.record.day_in_version}일째</span>
          <p className="muted small env">
            환경 · 초미세먼지 {d.record.env.pm25} · 습도 {d.record.env.humidity}% · {d.record.env.unusual ? '평소와 달라요' : '평소와 비슷'}
          </p>

          <div className="week">
            <button className="week-nav" onClick={() => moveWeek(-1)} disabled={d.week[0].date <= meta.first} aria-label="이전 주 보기">‹</button>
            {d.week.map((w) => (
              <button key={w.date} disabled={!w.has_record} className={'wd' + (w.date === date ? ' on' : '')}
                onClick={() => setDate(w.date)} aria-label={fmt.full(w.date) + (w.level ? ` ${WEATHER[w.level].name}` : ' 기록 없음')}>
                <span>{'일월화수목금토'[new Date(w.date + 'T00:00:00').getDay()]}</span>
                <b>{+w.date.slice(8)}</b>
                {w.level ? <WeatherIcon level={w.level} size={16} /> : <i className="dot none" />}
              </button>
            ))}
            <button className="week-nav" onClick={() => moveWeek(1)} disabled={d.week[6].date >= meta.today} aria-label="다음 주 보기">›</button>
          </div>

          <div className="grid2">
            <div className={'card verdict ' + LEVEL_CLASS[d.record.verdict.level]}>
              <p className="small">{date === meta.today ? '오늘의 얼굴 날씨' : '이날의 얼굴 날씨'}</p>
              <h2><WeatherIcon level={d.record.verdict.level} size={30} />{WEATHER[d.record.verdict.level].name}</h2>
              <p>{d.record.verdict.message}</p>
              {d.record.verdict.reasons.length > 0 && (
                <ul>{d.record.verdict.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              )}
              {d.record.verdict.baseline && (
                <p className="small fine">
                  볼 붉은기 {d.record.redness > 0 ? '+' : ''}{d.record.redness} · 평소 범위 {d.record.verdict.baseline.low} ~ {d.record.verdict.baseline.high} (버전 {d.record.verdict.baseline_version} 기준)
                </p>
              )}
            </div>

            <div className="card">
              <h3>{date === meta.today ? '오늘의 기록' : '이날의 기록'}</h3>
              <div className="row">
                <i className="thumb" style={{ backgroundImage: `url(/faces/${d.record.photo}.jpg)` }} />
                <div><b>셀카</b><p className="muted small">{d.record.quality_ok ? '품질 검사 통과 · AI로 생성된 이미지' : d.record.quality_note}</p></div>
                <button className="link" onClick={() => go('capture')}>촬영하기</button>
              </div>
              <div className="row">
                <i className="thumb plain" />
                <div><b>증상 체크인</b>
                  <p className="muted small">{SYMPTOMS.map((s) => `${s} ${d.record.symptoms[s]}`).join(' · ')}</p></div>
                <button className="link" onClick={askLogin}>로그인하고 기록</button>
              </div>
              <div className="row">
                <i className="thumb plain" />
                <div><b>루틴 사용</b><p className="muted small">{d.version.items.filter((i) => i.kind === 'cosmetic').map((i) => i.name).join(' · ')}</p></div>
                <span className="done">✓</span>
              </div>
            </div>
          </div>

        </>
      )}
    </section>
  )
}
