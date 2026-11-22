import { useEffect, useState } from 'react'
import { api, fmt } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import { WEATHER, WeatherIcon } from '../weather.jsx'

const pad = (n) => String(n).padStart(2, '0')

// 월 달력: 날마다 그날의 얼굴 날씨를 보여주고, 누르면 그 날짜로 이동한다.
// load: 기록을 불러오는 함수(데모는 api.timeline, 로그인한 사용자는 api.myTimeline)
export default function Calendar({ date, first, today, onPick, load = api.timeline }) {
  const q = useLoad(() => load(), [load])
  const [ym, setYm] = useState(date.slice(0, 7))
  useEffect(() => { setYm(date.slice(0, 7)) }, [date])          // 주간 화살표 등으로 날짜가 다른 달로 넘어가면 따라간다
  const [y, m] = ym.split('-').map(Number)
  const level = Object.fromEntries((q.data?.records || []).map((r) => [r.date, r.verdict.level]))
  const lead = new Date(y, m - 1, 1).getDay()
  const days = new Date(y, m, 0).getDate()
  const move = (n) => { const d = new Date(y, m - 1 + n, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`) }

  return (
    <div className="card cal">
      <div className="cal-head">
        <button onClick={() => move(-1)} disabled={ym <= first.slice(0, 7)} aria-label="이전 달">‹</button>
        <b aria-live="polite" aria-atomic="true">{y}년 {m}월</b>
        <button onClick={() => move(1)} disabled={ym >= today.slice(0, 7)} aria-label="다음 달">›</button>
      </div>
      <Status {...q} />
      {q.data && (
        <>
          <div className="cal-grid">
            {[...'일월화수목금토'].map((w) => <span className="dow" key={w}>{w}</span>)}
            {Array.from({ length: lead }, (_, i) => <i key={'b' + i} />)}
            {Array.from({ length: days }, (_, i) => {
              const iso = `${ym}-${pad(i + 1)}`, lv = level[iso]
              return (
                <button key={iso} disabled={iso < first || iso > today} className={'cd' + (iso === date ? ' on' : '') + (iso === today ? ' today' : '') + (lv ? '' : ' empty')}
                  onClick={() => onPick(iso)} aria-pressed={iso === date}
                  aria-label={`${fmt.full(iso)}${iso === today ? ' 오늘' : ''} ${lv ? WEATHER[lv].name : '기록 없음'}`}>
                  <span>{i + 1}</span>{lv && <WeatherIcon level={lv} size={18} />}
                </button>
              )
            })}
          </div>
          <div className="cal-legend">
            {Object.keys(WEATHER).map((lv) => <span key={lv}><WeatherIcon level={lv} size={16} />{WEATHER[lv].name}</span>)}
          </div>
        </>
      )}
    </div>
  )
}
