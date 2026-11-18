import { useState } from 'react'
import { api, fmt } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'
import { ProductIcon } from '../icons.jsx'
import AddProduct from './AddProduct.jsx'
import { routineCopy } from '../copy/routine.js'

const TONE = { 레티노이드: '#ffe6da', '자외선 차단': '#fff3d9' }
const ICON = { 레티노이드: 'retinol', '자외선 차단': 'sun' }

// 로그인한 사용자의 루틴: 내가 등록한 제품만 보인다(김서연 데모와 섞지 않음). 판정·리포트와 달리 첫날부터 열려 있다.
export default function MyRoutine({ ocr }) {
  const t = routineCopy(ocr)
  const q = useLoad(() => api.myRoutine(), [])
  const [adding, setAdding] = useState(false)
  const [asking, setAsking] = useState(null)            // 사용 중단 확인 중인 제품 key
  const [warn, setWarn] = useState([])
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const r = q.data

  const saved = (data) => { q.setData(data); setAdding(false); setWarn(data.warnings || []); setNote('루틴에 등록했어요.') }
  const stop = async (key) => {
    setError(null)
    try { const data = await api.removeRoutineItem(key); q.setData(data); setAsking(null); setWarn(data.warnings || []); setNote('사용 중단으로 기록했어요.') }
    catch (e) { setError(e.message) }
  }

  return (
    <section>
      <header className="page-head"><div><p className="eyebrow">지금 쓰는 제품</p><h1>내 루틴</h1></div>
        {r && !adding && <button className="btn" onClick={() => { setAdding(true); setNote(''); setWarn([]) }}>제품 추가</button>}
      </header>
      <p className="sr-only" role="status">{note}</p>
      <Status {...q} />
      {r && (
        <>
        <div className="grid2">
          <div>
            {warn.map((w) => <p className="notice warn-note" role="alert" key={w}>{w}</p>)}
            {adding && <AddProduct usages={r.usages} ocr={ocr} onSaved={saved} onCancel={() => setAdding(false)} />}
            {!adding && (r.current ? (
              <div className="card">
                <h2 className="h3">버전 {r.current.id} · {fmt.md(r.current.start)}부터</h2>
                {r.current.items.map((it) => (
                  <div className="row" key={it.key}>
                    <ProductIcon name={ICON[it.family] || 'cream'} tone={TONE[it.family] || '#e8f2f8'} />
                    <div><b>{it.name}</b>
                      <p className="muted small">{it.usage}{it.ingredients.length ? ` · 성분 ${it.ingredients.length}개` : ' · 성분 미입력'}</p>
                      {it.families.length > 0 && <p className="fam">{it.families.map((f) => <span key={f}>{f}</span>)}</p>}
                    </div>
                    {asking === it.key ? (
                      <span className="ask"><button className="link" onClick={() => stop(it.key)}>중단할게요</button><button className="link" onClick={() => setAsking(null)}>취소</button></span>
                    ) : <button className="link" onClick={() => setAsking(it.key)} aria-label={`${it.name} 사용 중단`}>사용 중단</button>}
                  </div>
                ))}
                {error && <p className="err" role="alert">{error}</p>}
              </div>
            ) : (
              <div className="card">
                <h2 className="h3">{t.empty.title}</h2>
                <p className="muted">{t.empty.body}</p>
                <div className="actions left"><button className="btn" onClick={() => setAdding(true)}>{t.empty.cta}</button></div>
              </div>
            ))}
          </div>
          {r.versions.length > 0 && (
            <div className="card">
              <h3>루틴이 바뀐 기록</h3>
              {[...r.versions].reverse().map((v) => (
                <div className="ev" key={v.id}>
                  <b>버전 {v.id}</b>
                  <div>{v.change || '처음 등록한 루틴'}
                    <p className="muted small">{fmt.md(v.start)} 시작</p></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="notice wide">{t.guide.pre}<b>{t.guide.strong}</b>{t.guide.post}</p>
        </>
      )}
    </section>
  )
}
