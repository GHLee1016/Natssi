import { useState } from 'react'
import { api, fmt } from '../api.js'
import KV from '../kv.jsx'
import { useLoad, Status } from '../useLoad.jsx'
import { ProductIcon } from '../icons.jsx'
import ThumbPicker from './ThumbPicker.jsx'
import AddProduct from './AddProduct.jsx'
import { RoutineTabs, RoutineView } from './Insights.jsx'
import { useSub } from './Sub.jsx'
import { routineCopy } from '../copy/routine.js'
import { useBackLayer } from '../nav.js'
import WhenPicker from './WhenPicker.jsx'

const TONE = { 레티노이드: '#ffe6da', '자외선 차단': '#fff3d9' }
const ICON = { 레티노이드: 'retinol', '자외선 차단': 'sun' }

// 로그인한 사용자의 루틴: 내가 등록한 제품만 보인다(김서연 데모와 섞지 않음). 판정·리포트와 달리 첫날부터 열려 있다.
export default function MyRoutine({ ocr }) {
  const t = routineCopy(ocr)
  const q = useLoad(() => api.myRoutine(), [])
  const [adding, setAdding] = useState(false)
  useBackLayer(adding, () => setAdding(false))            // 폰의 뒤로: 제품 추가를 닫고 루틴으로
  const [asking, setAsking] = useState(null)            // 사용 중단 확인 중인 제품 key
  const [editing, setEditing] = useState(null)          // 사용 빈도를 바꾸는 중인 제품 key
  const [on, setOn] = useState(null)                    // 바꾼 날(빈도 바꾸기, 사용 중단). null = 오늘
  const [startEdit, setStartEdit] = useState(null)      // 처음 루틴 시작일 고치는 중이면 날짜
  const [newUsage, setNewUsage] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [warn, setWarn] = useState([])
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [look, setLook] = useState(null)              // 섬네일을 바꾸는 제품 key
  const [lookBusy, setLookBusy] = useState(false)
  const r = q.data
  const [sub, openSub, closeSub] = useSub()

  const saved = (data) => { q.setData(data); setAdding(false); setWarn(data.warnings || []); setNote('루틴에 등록했어요.') }
  const openEdit = (it) => { setEditing(it.key); setNewUsage(''); setReason(''); setAsking(null); setError(null); setOn(null) }
  const change = async (key) => {
    setError(null); setSaving(true)
    try { const data = await api.changeRoutineUsage(key, newUsage, r.setup_day ? '' : reason, on && on !== r.today ? on : null); q.setData(data); setEditing(null); setWarn(data.warnings || []); setNote('사용 횟수를 바꿨어요.') }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  // 섬네일만 바꾼다(새 버전을 만들지 않음). photo가 있으면 사진, 없으면 아이콘(null = 자동)
  const setLookOf = async (key, photo, icon) => {
    setError(null); setLookBusy(true)
    try { q.setData(await api.changeRoutineLook(key, photo, icon)); setNote('제품 사진을 바꿨어요.') }
    catch (e) { setError(e.message) } finally { setLookBusy(false) }
  }
  const stop = async (key) => {
    setError(null)
    try { const data = await api.removeRoutineItem(key, on && on !== r.today ? on : null); q.setData(data); setAsking(null); setWarn(data.warnings || []); setNote('사용 중단으로 기록했어요.') }
    catch (e) { setError(e.message) }
  }

  const saveStart = async () => {
    setError(null); setSaving(true)
    try { q.setData(await api.setRoutineStart(startEdit)); setStartEdit(null); setNote('처음 루틴 시작일을 고쳤어요.') }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <section>
      <header className="page-head"><div><h1 className="sr-only">내 루틴</h1></div>
        {r && r.current && !adding && <button className="btn" onClick={() => { setAdding(true); setNote(''); setWarn([]) }}>제품 추가</button>}
      </header>
      {r && !adding && <RoutineTabs value={sub} onChange={(v) => (v ? openSub(v) : closeSub())} />}
      {r && !adding && sub && <div role="tabpanel"><RoutineView mine which={sub} versions={r.versions} go={() => closeSub()} /></div>}
      <p className="sr-only" role="status">{note}</p>
      <Status {...q} />
      {r && !(sub && !adding) && (
        <>
        <div className="routine-now">
          <div>
            {warn.map((w) => <p className="notice warn-note" role="alert" key={w}>{w}</p>)}
            {adding && <AddProduct usages={r.usages} askFamilies={r.ask_families} ocr={ocr} first={!r.current || r.setup_day} onSaved={saved} onCancel={() => setAdding(false)} today={r.today} changeFrom={r.change_from} />}
            {!adding && r.current?.id === 1 && r.current.items.some((it) => it.recent) && (
              <div className="card recent-note" role="note">
                <h2 className="h3">{t.recent.title}</h2>
                <p>{r.current.items.filter((it) => it.recent).map((it) => it.name).join(', ')}{t.recent.body}</p>
                <ol><li>{t.recent.rest}</li><li>{t.recent.keep}</li></ol>
              </div>
            )}
            {!adding && (r.current ? (
              <div className="card">
                <h2 className="h3">{r.current.id}번째 루틴<span className="sub-line">{fmt.md(r.current.start)}부터</span>
                  {r.current.id === 1 && startEdit === null && <button type="button" className="link start-fix" onClick={() => { setStartEdit(r.current.start); setError(null) }}>시작일 고치기</button>}</h2>
                {startEdit !== null && (
                  <div className="edit-usage">
                    <p className="small">처음 루틴을 등록하기 전부터 이 제품들을 썼다면, 실제로 쓰기 시작한 날로 고쳐요. 그날부터의 기록이 처음 루틴으로 묶여요.</p>
                    <input type="date" value={startEdit} max={r.today}
                      aria-label="처음 루틴 시작일" onChange={(e) => e.target.value && setStartEdit(e.target.value)} />
                    <div className="step-actions">
                      <button className="btn ghost" onClick={() => setStartEdit(null)}>취소</button>
                      <button className="btn" onClick={saveStart} disabled={saving}>{saving ? '저장하는 중…' : '고치기'}</button>
                    </div>
                  </div>
                )}
                <div className="prod-list">
                {r.current.items.map((it) => (
                  <div key={it.key}>
                    <div className="row">
                      {it.photo ? <img className="prod-photo" src={it.photo} alt={`${it.name} 사진`} />
                        : <ProductIcon name={it.icon || ICON[it.family] || 'cream'} tone={TONE[it.family] || '#e8f2f8'} />}
                      <div><b>{it.name}</b>
                        <KV className="small" items={[['사용', fmt.plain(it.usage)], ['성분', it.ingredients.length ? `${it.ingredients.length}개` : '미입력']]} />
                        {it.families.length > 0 && <p className="fam">{it.families.map((f) => <span key={f}>{f}</span>)}</p>}
                      </div>
                      {asking === it.key ? (
                        <span className="ask"><button className="link" onClick={() => stop(it.key)}>중단할게요</button><button className="link" onClick={() => setAsking(null)}>취소</button></span>
                      ) : (
                        <span className="ask">
                          <button className="link" onClick={() => { setLook(look === it.key ? null : it.key); setEditing(null); setAsking(null) }} aria-expanded={look === it.key} aria-label={`${it.name} 제품 사진 바꾸기`}>제품 사진</button>
                          <button className="link" onClick={() => { openEdit(it); setLook(null) }} aria-label={`${it.name} 사용 횟수 바꾸기`}>사용 횟수 바꾸기</button>
                          <button className="link" onClick={() => { setAsking(it.key); setEditing(null); setOn(null) }} aria-label={`${it.name} 사용 중단`}>사용 중단</button>
                        </span>
                      )}
                    </div>
                    {look === it.key && (
                      <div className="edit-look">
                        <ThumbPicker photo={it.photo} icon={it.icon} autoIcon={ICON[it.family] || 'cream'} busy={lookBusy} onError={setError}
                          onPhoto={(p) => setLookOf(it.key, p, null)} onIcon={(k) => setLookOf(it.key, null, k)} />
                        <button type="button" className="link" onClick={() => setLook(null)}>다 바꿨어요</button>
                      </div>
                    )}
                    {asking === it.key && (
                      <div className="edit-usage">
                        <WhenPicker id={'w-stop-' + it.key} label="언제부터 안 썼나요?" value={on} onChange={setOn} min={r.change_from} max={r.today} />
                      </div>
                    )}
                    {editing === it.key && (
                      <div className="edit-usage">
                        <p className="small"><b>{it.name}</b>을 얼마나 자주 쓰나요? <span className="muted">(지금: {fmt.plain(it.usage)})</span></p>
                        <div role="radiogroup" aria-label="새 사용 횟수" className="opts">
                          {r.usages.filter((u) => u !== it.usage).map((u) => (
                            <label className={'opt' + (newUsage === u ? ' on' : '')} key={u}>
                              <input type="radio" name={'u-' + it.key} checked={newUsage === u} onChange={() => setNewUsage(u)} />
                              <span className="opt-dot" aria-hidden="true" />{fmt.plain(u)}
                            </label>
                          ))}
                        </div>
                        {!r.setup_day && (
                          <>
                            <p className="muted small">바꾼 이유가 있나요? (선택)</p>
                            <div className="reasons" role="group" aria-label="바꾼 이유">
                              {r.reasons.map((x) => <button type="button" key={x} aria-pressed={reason === x} className={reason === x ? 'on' : ''} onClick={() => setReason(reason === x ? '' : x)}>{x}</button>)}
                            </div>
                          </>
                        )}
                        <WhenPicker id={'w-usage-' + it.key} label="언제 바꿨나요?" value={on} onChange={setOn} min={r.change_from} max={r.today} />
                        <div className="step-actions">
                          <button className="btn ghost" onClick={() => setEditing(null)}>취소</button>
                          <button className="btn" onClick={() => change(it.key)} disabled={!newUsage || saving}>{saving ? '저장하는 중…' : '바꾸기'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                </div>
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
        </div>
        <p className="notice wide">{t.guide.pre}<b>{t.guide.strong}</b>{t.guide.post}</p>
        </>
      )}
    </section>
  )
}
