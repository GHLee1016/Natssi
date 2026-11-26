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

const KIND = { added: '추가', removed: '사용 중단', usage: '사용 횟수 변경' }

// 한 번에 하나만 바꾸기 14일 챌린지: 평소 7일 → 하나 바꾸기 → 바꾼 뒤 7일
export function ChallengeCard({ data, go }) {
  const { current: c, rounds } = data
  const pct = Math.round((c.progress / c.total) * 100)
  // 바꾼 것(제목)과 설명은 줄을 나눈다
  const what = (c.phase === 'watching' || c.phase === 'done') && c.round?.change
  const msg = {
    baseline: `지금 루틴 그대로 사진 기록을 ${c.need}일 남겨요. 이 기록이 비교 기준이에요. 지금 ${c.have}일째예요.`,
    ready: '이제 제품 하나만 더하거나, 빼거나, 빈도를 바꿔 보세요. 바꾼 날부터 7일을 지켜봐요.',
    watching: `바꾼 뒤 ${c.have}일째예요(${c.need}일 중). 다른 제품은 그대로 두고 기록을 이어 가요.`,
    done: '14일을 마쳤어요. 다음에도 한 번에 하나만 바꿔 보세요.',
  }[c.phase]
  const done = rounds.filter((r) => r.done)
  return (
    <div className="card challenge">
      <p className="eyebrow">14일 챌린지: 한 번에 하나만 바꾸기</p>
      <h2 className="h3">{{ watching: '바꾼 뒤 지켜보는 중', ready: '하나 바꿀 준비가 됐어요', done: '챌린지를 마쳤어요', baseline: '평소 기록 모으는 중' }[c.phase]}</h2>
      <div className="ch-bar" role="progressbar" aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.progress} aria-label={`14일 중 ${c.progress}일`}>
        <i style={{ width: pct + '%' }} /><span className="ch-mid" aria-hidden="true" />
      </div>
      <div className="ch-legend muted small"><span>평소 기록 7일</span><span>바꾼 뒤 7일</span></div>
      {what && <p className="ch-what"><b>{fmt.plain(what)}</b></p>}
      <p className="small">{msg}</p>
      {c.round?.too_soon && <p className="warn small">앞서 바꾼 지 7일이 안 됐어요. 무엇 때문인지 가리기 어려울 수 있어요.</p>}
      {c.phase === 'ready' && go && <div className="actions left"><button className="btn ghost" onClick={() => go('routine')}>루틴 관리에서 하나 바꾸기</button></div>}
      {done.length > 0 && (
        <details className="ch-rounds" open={c.phase !== 'watching'}>
          <summary>끝난 챌린지 {done.length}번</summary>
          {done.map((r) => (
            <div className="ch-round" key={r.version}>
              <span className="sub-line">{fmt.md(r.start)}</span>
              <b>{fmt.plain(r.change)}</b>
              <KV className="small" items={[
                ['바꾼 뒤 7일', LEVELS.filter((lv) => r.after_weather?.[lv]).map((lv) => `${WEATHER[lv].name} ${r.after_weather[lv]}일`).join(', ')],
                ['볼 붉은기 중앙값', r.delta != null && `${sign(r.before_median)} → ${sign(r.after_median)} (${sign(r.delta)})`],
              ]} />
              {r.delta != null && <p className="muted small">{r.beyond ? '측정 오차보다 큰 변화예요.' : '측정 오차 안의 변화예요.'}
                {r.short_before ? ` 바꾸기 전 기록이 ${r.before_days}일뿐이라 덜 정확해요.` : ''}</p>}
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
          <p><b>{fmt.plain(o.change)}</b> 뒤 {o.spans.join(', ')}에 붉은기가 평소 범위를 넘었어요.</p>
          {o.changed.map((c) => (
            <div className="small" key={c.name}>
              <p>{c.name} <span className="muted">({KIND[c.kind]})</span></p>
              <KV className="small" items={[['성분 계열', c.families.length ? c.families.join(', ') : '등록된 계열 없음']]} />
            </div>
          ))}
          {o.in_current.length > 0 && (
            <p className="small">지금 루틴에서 같은 계열이 든 제품: {o.in_current.map((i) => `${i.name}(${i.families.join(', ')})`).join(', ')}</p>
          )}
        </div>
      ))}
      </div>
      <div className="ov-note">
        <p className="muted small">시기가 겹쳤다는 뜻이에요. 제품이 원인이라고 단정할 수는 없어요. 다음 제품을 고를 때 참고해 보세요.</p>
        <p className="muted small">증상이 계속되면 사용을 멈추고 전문의와 상담해 주세요.</p>
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
          <p className="muted small">{fmt.md(v.start)} 시작</p>{v.reason && <p className="muted small">바꾼 이유: {v.reason}</p>}</div>
      </div>
    ))}
  </div>
)

// 루틴 탭의 보기 탭: 지금 루틴, 14일 챌린지, 루틴 점검, 변경 기록
export function RoutineTabs({ value, onChange }) {
  return <ViewTabs label="루틴 보기" value={value} onChange={onChange} items={[
    { id: null, label: '내 루틴' }, { id: 'challenge', label: '14일 챌린지' }, { id: 'versions', label: '변경 기록' }]} />
}

// 세부 보기 내용
export function RoutineView({ mine, which, versions, go }) {
  const q = useInsights(mine, null)
  if (which === 'versions') return <VersionList versions={versions} />
  if (!q.data) return <Status {...q} />
  if (which === 'challenge') return <ChallengeCard data={q.data.challenge} go={go} />
  return q.data.overlap.length ? <OverlapCard data={q.data.overlap} />
    : <div className="card"><p className="muted">흐림과 시기가 겹친 루틴 변경이 아직 없어요.</p></div>
}
