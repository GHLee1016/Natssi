import { api, fmt } from '../api.js'
import KV from '../kv.jsx'
import { useLoad, Status } from '../useLoad.jsx'
import { ProductIcon } from '../icons.jsx'
import { routineCopy } from '../copy/routine.js'
import { RoutineTabs, RoutineView } from './Insights.jsx'
import { useSub } from './Sub.jsx'

const TONE = { 레티노이드: '#ffe6da', LED: '#ffe6da', '자외선 차단': '#fff3d9' }

export default function Routine() {
  const q = useLoad(() => api.routine(), [])
  const r = q.data
  const [sub, openSub, closeSub] = useSub()
  return (
    <section>
      <header className="page-head sr-head"><div><h1 className="sr-only">내 루틴</h1></div></header>
      {r && <RoutineTabs value={sub} onChange={(v) => (v ? openSub(v) : closeSub())} />}
      <Status {...q} />
      {r && sub && <div role="tabpanel"><RoutineView mine={false} which={sub} versions={r.versions} /></div>}
      {r && !sub && (
        <>
        <div className="routine-now">
          <div>
            <div className="card dark">
              <p className="small">지금 루틴</p>
              <h2>{r.current.id}번째 루틴<span className="sub-line">{fmt.md(r.current.start)}부터</span></h2>
              {r.current.change && <p className="small">최근 바꾼 것: {fmt.plain(r.current.change)} (이유: {r.current.reason})</p>}
            </div>
            <div className="card prod-list">
              {r.current.items.map((it) => (
                <div className="row" key={it.key}>
                  <ProductIcon name={it.key} tone={TONE[it.family] || '#e8f2f8'} />
                  <div><b>{it.name}</b>
                    <KV className="small" items={[['사용', fmt.plain(it.usage)], ['종류', it.kind === 'device' ? '디바이스' : it.family + ' 계열']]} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="notice wide">{routineCopy().demo}</p>
        </>
      )}
    </section>
  )
}
