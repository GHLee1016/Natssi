import { useCallback } from 'react'
import { api, fmt } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import Calendar from './Calendar.jsx'
import StartCard from './StartCard.jsx'
import FaceMap from './FaceMap.jsx'
import { DayHero, WeekStrip, ChangeDays, symptomText, weekOf, usePeriod, PeriodToggle, EmptyDay } from './DayParts.jsx'
import { useSub, SubPage, AskButtons, AskHead, ICONS } from './Sub.jsx'
import Recap from './Recap.jsx'
import { Dashboard, useMedia, WIDE } from './Dash.jsx'

// 데모 첫 화면(오늘 = 맑음)만 보면 흐림 → 빈도 조정 → 맑음 이야기가 안 보인다. 이야기의 날들로 바로 가는 줄.
function Story({ date, setDate }) {
  const q = useLoad(() => api.timeline(), [])
  if (!q.data) return null
  return <ChangeDays records={q.data.records} versions={q.data.versions} date={date} setDate={setDate} title="이 사람의 이야기" withSignal />
}

export default function Diary({ date, setDate, meta, go, askLogin }) {
  const q = useLoad(() => api.day(date), [date])
  const tl = useLoad(() => api.timeline(), [])                 // 주간 줄과 달력에 날마다 날씨를 붙인다
  const [period, setPeriod] = usePeriod()
  const loadTl = useCallback(() => Promise.resolve(tl.data), [tl.data])
  const d = q.data
  const isToday = date === meta.today
  const wide = useMedia(WIDE)                         // PC: 대시보드 배치
  const [sub, openSub, closeSub] = useSub()
  const ASK = { face: '재는 법 보기', recap: 'Recap' }
  const DESC = { face: '낯씨는 양 볼의 붉은기만 재요. 트러블은 찾지 않고, 진단하지 않아요.', recap: '한 달 기록을 카드로 넘겨 봐요.' }
  const tabs = d && <AskButtons value={sub} onChange={(v) => (v ? openSub(v) : closeSub())} items={[
    { id: 'face', icon: ICONS.target, label: ASK.face }, { id: 'recap', icon: ICONS.spark, label: ASK.recap }]} />
  const log = d && (
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
  )
  if (d && sub) return (
    <SubPage head={<header className="page-head"><div><h1>{fmt.full(date)}</h1></div></header>} tabs={tabs}>
      {sub !== 'recap' && <AskHead title={ASK[sub]} desc={DESC[sub]} onClose={closeSub} />}
      {sub === 'face' ? <FaceMap record={d.record} /> : <Recap mine={false} today={meta.today} desc={DESC.recap} onClose={closeSub} />}
    </SubPage>
  )

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>{fmt.full(date)}</h1>
        </div>
        <div className="head-actions">
          {!isToday && <button className="btn ghost" onClick={() => setDate(meta.today)}>오늘로 가기</button>}
          {!wide && <PeriodToggle value={period} onChange={setPeriod} />}
        </div>
      </header>
      {tabs}
      {!wide && tl.data && (period === 'month'
        ? <Calendar date={date} first={meta.first} today={meta.today} onPick={setDate} load={loadTl} />
        : <WeekStrip date={date} week={weekOf(date, tl.data.records)} first={meta.first} today={meta.today} setDate={setDate} />)}
      {wide && tl.data && (q.error || d) ? (
        <Dashboard today={meta.today} first={meta.first} date={date} records={tl.data.records} versions={tl.data.versions}
          rec={tl.data.records.find((r) => r.date === date) || d?.record} onPick={setDate} load={loadTl}
          empty={<p className="muted">이날은 기록이 없어요.</p>}
          log={<>{log || <p className="card muted">이날은 기록이 없어요. 달력에서 다른 날을 골라 보세요.</p>}{meta.auth && !meta.viewer && <StartCard onStart={askLogin} />}</>} />
      ) : q.error && !d ? <EmptyDay isToday={isToday} /> : <Status {...q} />}
      {d && !(wide && tl.data) && (
        <>
          <DayHero record={d.record} version={d.version} district={meta.env_district} isToday={date === meta.today} />

          <Story date={date} setDate={setDate} />
          {meta.auth && !meta.viewer && <StartCard onStart={askLogin} />}

          {log}
        </>
      )}
    </section>
  )
}
