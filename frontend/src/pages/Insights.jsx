import { useState } from 'react'
import { api, fmt } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import { WEATHER, WeatherIcon } from '../weather.jsx'

// 판정 결과를 세어 만든 요약 세 가지(서버 insights.py). 데모와 내 기록이 같은 화면을 쓴다.
const LEVELS = ['신호 없음', '관찰 중', '신호 있음', '구분 불가']
const sign = (v) => (v > 0 ? '+' : '') + v

export function useInsights(mine, month) {
  return useLoad(() => (mine ? api.myInsights(month) : api.insights(month)), [mine, month])
}

// 월간 Skin Recap: 한 달 기록을 날씨 개수와 사실 문장으로
export function RecapCard({ mine }) {
  const [month, setMonth] = useState(null)
  const q = useInsights(mine, month)
  const r = q.data?.recap
  if (!r) return <Status {...q} />
  if (r.empty) return null
  const i = r.months.indexOf(r.month)
  return (
    <div className="card recap">
      <div className="recap-head">
        <div><p className="eyebrow">월간 Skin Recap</p><h2 className="h3">{+r.month.slice(5)}월의 얼굴 날씨</h2></div>
        <div className="recap-nav">
          <button className="btn ghost" disabled={i <= 0} onClick={() => setMonth(r.months[i - 1])} aria-label="이전 달">‹</button>
          <button className="btn ghost" disabled={i >= r.months.length - 1} onClick={() => setMonth(r.months[i + 1])} aria-label="다음 달">›</button>
        </div>
      </div>
      <ul className="recap-weather" aria-label="날씨별 일수">
        {LEVELS.map((lv) => (
          <li key={lv} className={WEATHER[lv].cls}><WeatherIcon level={lv} size={22} /><b>{r.weather[lv]}</b><span>{WEATHER[lv].name}</span></li>
        ))}
      </ul>
      <ul className="recap-lines">{r.lines.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  )
}

const KIND = { added: '추가', removed: '사용 중단', usage: '빈도 변경' }

// 한 번에 하나만 바꾸기 14일 챌린지: 평소 7일 → 하나 바꾸기 → 바꾼 뒤 7일
export function ChallengeCard({ data, go }) {
  const { current: c, rounds } = data
  const pct = Math.round((c.progress / c.total) * 100)
  const msg = {
    baseline: `먼저 지금 루틴 그대로 사진 기록을 ${c.need}일 남겨요. 이 기록이 비교 기준이 돼요. (지금 ${c.have}일)`,
    ready: '평소 기록이 모였어요. 이제 제품 하나만 더하거나, 빼거나, 빈도를 바꿔 보세요. 바꾼 날부터 7일을 지켜봐요.',
    watching: `${c.round?.change} — 바꾼 뒤 ${c.have} / ${c.need}일째예요. 다른 제품은 그대로 두고 기록을 이어 가요.`,
    done: `${c.round?.change} — 14일을 마쳤어요. 아래 결과를 보고, 다음에 바꿀 것도 한 번에 하나만 바꿔 보세요.`,
  }[c.phase]
  const done = rounds.filter((r) => r.done)
  return (
    <div className="card challenge">
      <p className="eyebrow">한 번에 하나만 바꾸기 · 14일 챌린지</p>
      <h2 className="h3">{{ watching: '바꾼 뒤 지켜보는 중', ready: '하나 바꿀 준비가 됐어요', done: '챌린지를 마쳤어요', baseline: '평소 기록 모으는 중' }[c.phase]}</h2>
      <div className="ch-bar" role="progressbar" aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.progress} aria-label={`14일 중 ${c.progress}일`}>
        <i style={{ width: pct + '%' }} /><span className="ch-mid" aria-hidden="true" />
      </div>
      <div className="ch-legend muted small"><span>평소 기록 7일</span><span>바꾼 뒤 7일</span></div>
      <p className="small">{msg}</p>
      {c.round?.too_soon && <p className="warn small">앞서 바꾼 지 7일이 안 돼서 다시 바꿨어요. 무엇 때문인지 가리기 어려울 수 있어요.</p>}
      {c.phase === 'ready' && go && <div className="actions left"><button className="btn ghost" onClick={() => go('routine')}>루틴에서 하나 바꾸기</button></div>}
      {done.length > 0 && (
        <details className="ch-rounds" open={c.phase !== 'watching'}>
          <summary>끝난 챌린지 {done.length}번</summary>
          {done.map((r) => (
            <div className="ch-round" key={r.version}>
              <b>{fmt.md(r.start)} · {r.change}</b>
              <p className="small">
                바꾼 뒤 7일: {LEVELS.filter((lv) => r.after_weather?.[lv]).map((lv) => `${WEATHER[lv].name} ${r.after_weather[lv]}일`).join(' · ')}
              </p>
              {r.delta != null && (
                <p className="muted small">볼 붉은기 중앙값 {sign(r.before_median)} → {sign(r.after_median)} ({sign(r.delta)}) · {r.beyond ? '측정 오차보다 큰 변화예요' : '측정 오차 안의 변화예요'}
                  {r.short_before ? ` · 바꾸기 전 기록이 ${r.before_days}일뿐이라 덜 정확해요` : ''}</p>
              )}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

// 루틴 점검: 흐림과 시기가 겹친 변경과 그 제품의 성분 계열(원인이라는 뜻은 아님)
export function OverlapCard({ data }) {
  if (!data.length) return null
  return (
    <div className="card overlap">
      <p className="eyebrow">루틴 점검</p>
      <h2 className="h3">흐림과 시기가 겹친 변경</h2>
      {data.map((o) => (
        <div className="ov-item" key={o.version}>
          <p><b>{o.change}</b> 뒤 {o.spans.join(', ')}에 붉은기가 평소 범위를 넘었어요.</p>
          {o.changed.map((c) => (
            <p className="small" key={c.name}>{c.name} ({KIND[c.kind]}) · 성분 계열: {c.families.length ? c.families.join(', ') : '등록된 계열 없음'}</p>
          ))}
          {o.in_current.length > 0 && (
            <p className="small">지금 루틴에서 같은 계열이 든 제품: {o.in_current.map((i) => `${i.name}(${i.families.join(', ')})`).join(', ')}</p>
          )}
        </div>
      ))}
      <p className="muted small">시기가 겹쳤다는 뜻이지 원인이라는 뜻은 아니에요. 다음 제품을 고를 때 같은 계열이 들어 있는지 확인하는 데 참고해 보세요. 증상이 계속되면 사용을 멈추고 전문의와 상담해 주세요.</p>
    </div>
  )
}

// 루틴 탭 위쪽에 붙이는 묶음
export function RoutineInsights({ mine, go }) {
  const q = useInsights(mine, null)
  if (!q.data) return <Status {...q} />
  return (
    <>
      <ChallengeCard data={q.data.challenge} go={go} />
      <OverlapCard data={q.data.overlap} />
    </>
  )
}
