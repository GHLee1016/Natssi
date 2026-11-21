import { api, fmt } from '../api.js'
import KV from '../kv.jsx'
import { useLoad, Status } from '../useLoad.jsx'
import { ProductIcon } from '../icons.jsx'
import { routineCopy } from '../copy/routine.js'
import { RoutineInsights } from './Insights.jsx'

const TONE = { 레티노이드: '#ffe6da', LED: '#ffe6da', '자외선 차단': '#fff3d9' }

export default function Routine() {
  const q = useLoad(() => api.routine(), [])
  const r = q.data
  return (
    <section>
      <header className="page-head"><div><p className="eyebrow">지금 쓰는 제품과 기기</p><h1>내 루틴</h1></div></header>
      <Status {...q} />
      {r && (
        <>
        <RoutineInsights mine={false} />
        <div className="grid2">
          <div>
            <div className="card dark">
              <p className="small">지금 루틴</p>
              <h2>버전 {r.current.id}<span className="sub-line">{fmt.md(r.current.start)}부터</span></h2>
              {r.current.change && <p className="small">최근 바꾼 것: {fmt.plain(r.current.change)} (이유: {r.current.reason})</p>}
            </div>
            <div className="card">
              {r.current.items.map((it) => (
                <div className="row" key={it.key}>
                  <ProductIcon name={it.key} tone={TONE[it.family] || '#e8f2f8'} />
                  <div><b>{it.name}</b>
                    <KV className="small" items={[['사용', fmt.plain(it.usage)], ['종류', it.kind === 'device' ? '디바이스' : it.family + ' 계열']]} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>지난 버전</h3>
            {[...r.versions].reverse().map((v) => (
              <div className="ev" key={v.id}>
                <b>버전 {v.id}</b>
                <div>{fmt.plain(v.change) || v.label}
                  <p className="muted small">{fmt.md(v.start)} 시작</p>{v.reason && <p className="muted small">바꾼 이유: {v.reason}</p>}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="notice wide">{routineCopy().demo}</p>
        </>
      )}
    </section>
  )
}
