import { ViewTabs } from './Sub.jsx'
import { api, fmt } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import { WEATHER } from '../weather.jsx'
import KV from '../kv.jsx'

// 판정 결과를 세어 만든 요약 세 가지(서버 insights.py). 데모와 내 기록이 같은 화면을 쓴다.
const LEVELS = ['신호 없음', '관찰 중', '신호 있음', '구분 불가']
const sign = (v) => (v > 0 ? '+' : '') + v

export function useInsights(mine, month) {
  return useLoad(() => (mine ? api.myInsights(month) : api.insights(month)), [mine, month])
}

const KIND = { added: '새로 넣음', removed: '뺌', usage: '쓰는 횟수 바꿈' }

// 한 번에 하나만 바꾸기 14일 챌린지: 평소 7일 → 하나 바꾸기 → 바꾼 뒤 7일
export function ChallengeCard({ data, go }) {
  const { current: c, rounds } = data
  const pct = Math.round((c.progress / c.total) * 100)
  // 바꾼 것(제목)과 설명은 줄을 나눈다
  const what = (c.phase === 'watching' || c.phase === 'done') && c.round?.change
  const msg = {
    baseline: `현재 루틴을 유지하며 사진을 ${c.need}일 기록해 주세요. 이 기간의 기록이 비교 기준이 돼요. 현재 ${c.have}일을 기록했어요.`,
    ready: '루틴을 바꿀 계획이라면 제품이나 사용 횟수 중 하나만 바꿔 보세요. 변경 후 7일간 피부를 기록해 주세요.',
    watching: `루틴을 바꾼 뒤 ${c.have}일째예요(총 ${c.need}일). 다른 제품은 그대로 유지하며 피부를 기록해 주세요.`,
    done: '다음에 루틴을 바꿀 때도 한 번에 하나씩 바꿔 보세요.',
  }[c.phase]
  const done = rounds.filter((r) => r.done)
  return (
    <div className="card challenge">
      <p className="eyebrow">14일 동안 한 번에 하나만 바꾸기</p>
      <h2 className="h3">{{ watching: '변경 후 피부 기록 중', ready: '비교 기준이 만들어졌어요', done: '14일간의 기록을 마쳤어요', baseline: '비교 기준 만들기' }[c.phase]}</h2>
      <div className="ch-bar" role="progressbar" aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.progress} aria-label={`14일 중 ${c.progress}일`}>
        <i style={{ width: pct + '%' }} /><span className="ch-mid" aria-hidden="true" />
      </div>
      <div className="ch-legend muted small"><span>비교 기준 7일</span><span>변경 후 7일</span></div>
      {what && <p className="ch-what"><b>{fmt.plain(what)}</b></p>}
      <p className="small">{msg}</p>
      {c.round?.too_soon && <p className="warn small">앞선 루틴 변경 후 7일이 지나기 전에 바꿨어요. 변경 전후를 비교하기 어려울 수 있어요.</p>}
      {c.phase === 'ready' && go && <div className="actions left"><button className="btn ghost" onClick={() => go('routine')}>내 루틴으로 이동</button></div>}
      {done.length > 0 && (
        <details className="ch-rounds" open={c.phase !== 'watching'}>
          <summary>완료한 챌린지 {done.length}회</summary>
          {done.map((r) => (
            <div className="ch-round" key={r.version}>
              <span className="sub-line">{fmt.md(r.start)}</span>
              <b>{fmt.plain(r.change)}</b>
              <KV className="small" items={[
                ['변경 후 7일', LEVELS.filter((lv) => r.after_weather?.[lv]).map((lv) => `${WEATHER[lv].name} ${r.after_weather[lv]}일`).join(', ')],
                ['볼 붉은기 중간값', r.delta != null && `변경 전 ${sign(r.before_median)} → 변경 후 ${sign(r.after_median)} (차이 ${sign(r.delta)})`],
              ]} />
              {r.delta != null && <p className="muted small">{r.beyond ? '측정 오차보다 큰 차이가 있었어요.' : '측정 오차 범위 안의 차이예요.'}
                {r.short_before ? ` 변경 전 기록이 ${r.before_days}일뿐이어서 비교 결과는 참고해 주세요.` : ''}</p>}
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
      <div className="ov-items">
      {data.map((o) => (
        <div className="ov-item" key={o.version}>
          <p><b>{fmt.plain(o.change)}</b> 이후 {o.spans.join(', ')}에 평소보다 볼이 붉었어요.</p>
          {o.changed.map((c) => (
            <div className="small" key={c.name}>
              <p>{c.name} <span className="muted">({KIND[c.kind]})</span></p>
              <KV className="small" items={[['성분 계열', c.families.length ? c.families.join(', ') : '확인된 성분 계열 없음']]} />
            </div>
          ))}
          {o.in_current.length > 0 && (
            <p className="small">현재 루틴에서 같은 계열의 성분이 들어 있는 제품: {o.in_current.map((i) => `${i.name}(${i.families.join(', ')})`).join(', ')}</p>
          )}
        </div>
      ))}
      </div>
      <div className="ov-note">
        <p className="muted small">루틴을 바꾼 시기와 붉은기 변화가 겹쳤어요. 제품이나 성분이 원인인지는 이 기록만으로 알 수 없어요.</p>
        <p className="muted small">증상이 이어지면 그 제품을 그만 쓰고 전문의와 상담하세요.</p>
      </div>
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

const VersionList = ({ versions }) => (
  <div className="card">
    {[...versions].reverse().map((v) => (
      <div className="ev" key={v.id}>
        <b>{v.id}번째 루틴</b>
        <div>{fmt.plain(v.change) || v.label || '처음 등록한 루틴'}
          <p className="muted small">{fmt.md(v.start)}부터</p>{v.reason && <p className="muted small">변경 이유: {v.reason}</p>}</div>
      </div>
    ))}
  </div>
)

// 루틴 탭의 보기 탭: 지금 루틴, 14일 챌린지, 루틴 점검, 변경 기록
export function RoutineTabs({ value, onChange }) {
  return <ViewTabs label="루틴 보기" value={value} onChange={onChange} items={[
    { id: null, label: '현재 루틴' }, { id: 'challenge', label: '하나씩 바꾸기' }, { id: 'versions', label: '변경 기록' }]} />
}

// 세부 보기 내용
export function RoutineView({ mine, which, versions, go }) {
  const q = useInsights(mine, null)
  if (which === 'versions') return <VersionList versions={versions} />
  if (!q.data) return <Status {...q} />
  if (which === 'challenge') return <ChallengeCard data={q.data.challenge} go={go} />
  return q.data.overlap.length ? <OverlapCard data={q.data.overlap} />
    : <div className="card"><p className="muted">흐린 날과 비슷한 시기에 바꾼 루틴이 없어요.</p></div>
}
