import { useState } from 'react'
import { api, fmt } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import Calendar from './Calendar.jsx'
import StartCard from './StartCard.jsx'
import FaceMap from './FaceMap.jsx'
import { DayHero, WeekStrip, ChangeDays, symptomText } from './DayParts.jsx'

// 데모 첫 화면(오늘 = 맑음)만 보면 흐림 → 빈도 조정 → 맑음 이야기가 안 보인다. 이야기의 날들로 바로 가는 줄.
function Story({ date, setDate }) {
  const q = useLoad(() => api.timeline(), [])
  if (!q.data) return null
  return <ChangeDays records={q.data.records} versions={q.data.versions} date={date} setDate={setDate} title="이 사람의 이야기" withSignal />
}

export default function Diary({ date, setDate, meta, go, askLogin }) {
  const q = useLoad(() => api.day(date), [date])
  const [calOpen, setCalOpen] = useState(false)
  const d = q.data

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
          <DayHero record={d.record} version={d.version} district={meta.env_district} isToday={date === meta.today} />

          <Story date={date} setDate={setDate} />
          <FaceMap record={d.record} />
          {meta.auth && !meta.viewer && <StartCard onStart={askLogin} />}

          <WeekStrip date={date} week={d.week} first={meta.first} today={meta.today} setDate={setDate} />

          <div className="rec-sec">
            <h3>{date === meta.today ? '오늘의 기록' : '이날의 기록'}</h3>
            <div className="rec">
              <div className="rec-row">
                <span className="rec-k">셀카</span>
                <div className="rec-v"><i className="thumb round" style={{ backgroundImage: `url(/faces/${d.record.photo}.jpg)` }} />
                  <div>{d.record.quality_ok ? '사진이 잘 찍혔어요' : d.record.quality_note}<p className="muted small">AI로 생성된 이미지</p></div></div>
                <button className="link" onClick={() => go('capture')}>내 얼굴 기록해 보기</button>
              </div>
              <div className="rec-row">
                <span className="rec-k">증상</span>
                <div className="rec-v"><div>{symptomText(d.record.symptoms)}</div></div>
                <button className="link" onClick={askLogin}>로그인하고 기록</button>
              </div>
              <div className="rec-row">
                <span className="rec-k">루틴</span>
                <div className="rec-v"><div>{d.version.items.filter((i) => i.kind === 'cosmetic').map((i) => i.name).join(', ')}</div></div>
                <span className="done" aria-label="사용함">✓</span>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
