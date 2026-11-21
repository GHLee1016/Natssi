import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { routineCopy } from '../copy/routine.js'

// 제품 하나를 루틴에 등록한다: 이름·사용 빈도 → 전성분 글자 → 확인. 사진으로 읽기(OCR)는 준비 중이라, 지금은 글자를 붙여 넣는다.
// 서버가 식약처 성분 사전으로 표준 이름에 맞춘다(일치 / 보정 = 오타를 고침 / 확인 필요 = 사전에 없음). 지어내지 않고 사용자가 확인한다.
const STEPS = 3
const SAMPLE = '정제수, 글리세린, 나이아신아마이드, 판테놀, 병풀추출물, 세라마이드엔피, 향료'

// 성분 이름 자동완성(식약처 사전). 글자를 칠 때 0.25초 기다렸다가 묻는다.
function useSuggest(q) {
  const [items, setItems] = useState([])
  useEffect(() => {
    const s = q.trim()
    if (s.length < 1) { setItems([]); return undefined }
    let alive = true
    const id = setTimeout(() => api.suggestIngredients(s).then((r) => alive && setItems(r.items)).catch(() => {}), 250)
    return () => { alive = false; clearTimeout(id) }
  }, [q])
  return items
}

export default function AddProduct({ usages, askFamilies = [], ocr, onSaved, onCancel }) {
  const t = routineCopy(ocr)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [usage, setUsage] = useState('')
  const [text, setText] = useState('')
  const [list, setList] = useState([])                 // [{name, status, ocr, families}]
  const [extra, setExtra] = useState('')
  const [ask, setAsk] = useState(askFamilies)          // 따로 물어볼 계열(이미 찾은 계열은 빼고)
  const [picked, setPicked] = useState([])             // 사용자가 '들어 있어요'라고 체크한 계열
  const [editing, setEditing] = useState(null)         // 고치는 중인 성분 이름
  const [editText, setEditText] = useState('')
  const hints = useSuggest(editing !== null ? editText : extra)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const head = useRef(null)
  const root = useRef(null)
  useEffect(() => { head.current?.focus({ preventScroll: true }); root.current?.scrollIntoView({ block: 'nearest' }) }, [step])

  const go = (n) => { setErr(null); setStep(n) }
  const next1 = () => {
    if (!name.trim()) return setErr('제품 이름을 입력해 주세요.')
    if (!usage) return setErr('사용 빈도를 골라 주세요.')
    go(1)
  }
  const analyze = async (skip) => {
    setBusy(true); setErr(null)
    try {
      if (skip || !text.trim()) { setList([]); setAsk(askFamilies) }
      else { const r = await api.analyzeIngredients(text); setList(r.ingredients); setAsk(r.ask_families) }
      setPicked([]); setEditing(null)
      setStep(2)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const addExtra = () => {
    const n = extra.trim()
    if (n && !list.some((i) => i.name === n)) setList([...list, { name: n, status: '직접 입력', ocr: n, families: [] }])
    setExtra('')
  }
  const saveEdit = () => {
    const n = editText.trim()
    if (n && !list.some((i) => i.name === n && i.name !== editing)) setList(list.map((i) => (i.name === editing ? { ...i, name: n, status: '직접 입력' } : i)))
    setEditing(null)
  }
  const togglePick = (f) => setPicked(picked.includes(f) ? picked.filter((x) => x !== f) : [...picked, f])
  const save = async () => {
    setBusy(true); setErr(null)
    try { onSaved(await api.addRoutineItem({ name: name.trim(), usage, ingredients: list.map((i) => i.name), families: picked })) }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  const review = list.filter((i) => i.status === '확인 필요').length
  const fixed = list.filter((i) => i.status === '보정')

  return (
    <div className="card steps" ref={root}>
      <div className="step-bars" role="img" aria-label={`${STEPS}단계 중 ${step + 1}번째`}>
        {Array.from({ length: STEPS }, (_, n) => <i key={n} className={n <= step ? 'on' : ''} />)}
      </div>
      <span className="step-chip" aria-hidden="true">{step + 1}</span>

      {step === 0 && (
        <>
          <h3 className="step-q" tabIndex={-1} ref={head}>{t.step1.title}</h3>
          <div className="field">
            <label htmlFor="p-name">{t.step1.name}</label>
            <input id="p-name" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setErr(null) }}
              placeholder="예: 레티놀 세럼" autoComplete="off" aria-describedby="p-name-help" />
            <small id="p-name-help" className="muted">{t.step1.hint}</small>
          </div>
          <div role="radiogroup" aria-label="사용 빈도" className="opts">
            <p className="muted small">{t.step1.usage}</p>
            {usages.map((u) => (
              <label className={'opt' + (usage === u ? ' on' : '')} key={u}>
                <input type="radio" name="usage" checked={usage === u} onChange={() => { setUsage(u); setErr(null) }} />
                <span className="opt-dot" aria-hidden="true" />{u}
              </label>
            ))}
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="step-actions">
            <button className="btn ghost" onClick={onCancel}>취소</button>
            <button className="btn" onClick={next1}>다음</button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h3 className="step-q" tabIndex={-1} ref={head}>{t.step2.title}</h3>
          <p className="muted small">{t.step2.body}</p>
          <p className="muted small">{t.step2.hint}</p>
          <div className="field">
            <label htmlFor="p-text">전성분</label>
            <textarea id="p-text" rows={6} value={text} maxLength={8000} onChange={(e) => { setText(e.target.value); setErr(null) }}
              placeholder="정제수, 글리세린, …" />
            <button type="button" className="link" onClick={() => setText(SAMPLE)}>예시 넣어 보기</button>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="step-actions">
            <button className="btn ghost" onClick={() => go(0)}>이전</button>
            <button className="btn" onClick={() => analyze(false)} disabled={busy || !text.trim()}>{busy ? '나누는 중…' : '다음'}</button>
          </div>
          <button type="button" className="link skip" onClick={() => analyze(true)} disabled={busy}>{t.step2.skip}</button>
        </>
      )}

      {step === 2 && (
        <>
          <h3 className="step-q" tabIndex={-1} ref={head}>{t.step3.title}</h3>
          <p className="small"><b>{name.trim()}</b> · {usage}</p>
          <datalist id="ing-hints">{hints.map((h) => <option key={h.name} value={h.name}>{h.inci}</option>)}</datalist>
          {list.length === 0 ? <p className="muted">{t.step3.none}</p> : (
            <>
              <p className="small">성분 {list.length}개
                {fixed.length > 0 && <> · 자동으로 고침 {fixed.length}개</>}
                {review > 0 && <> · <b className="warn">확인 필요 {review}개</b></>}</p>
              <p className="muted small">{review > 0 ? t.step3.review : t.step3.fix}</p>
              <ul className="ing">
                {list.map((i) => (editing === i.name ? (
                  <li key={i.name} className="editing">
                    <input autoFocus value={editText} list="ing-hints" aria-label={`${i.name} 고쳐 쓰기`} onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } if (e.key === 'Escape') setEditing(null) }} />
                    <button type="button" className="ok" onClick={saveEdit}>확인</button>
                  </li>
                ) : (
                  <li key={i.name} className={i.status === '확인 필요' ? 'chk' : i.status === '보정' ? 'fix' : ''}>
                    {i.name}
                    {i.status === '확인 필요' && <button type="button" className="edit" onClick={() => { setEditing(i.name); setEditText(i.name) }} aria-label={`${i.name} 고치기`}>고치기</button>}
                    <button type="button" aria-label={`${i.name} 지우기`} onClick={() => setList(list.filter((x) => x.name !== i.name))}>×</button>
                  </li>
                )))}
              </ul>
              {fixed.length > 0 && (
                <div className="fixed-list">
                  <p className="muted small">{t.step3.fixed}</p>
                  <ul>{fixed.map((i) => <li key={i.name}><s>{i.ocr}</s> → <b>{i.name}</b></li>)}</ul>
                </div>
              )}
            </>
          )}
          <div className="add-ing">
            <input value={extra} list="ing-hints" onChange={(e) => setExtra(e.target.value)} placeholder={t.step3.add} aria-label={t.step3.add}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra() } }} />
            <button type="button" className="btn ghost" onClick={addExtra}>추가</button>
          </div>
          {ask.length > 0 && (
            <fieldset className="ask-fam">
              <legend className="small">{t.step3.ask}</legend>
              {ask.map((f) => (
                <label key={f} className={'fam-check' + (picked.includes(f) ? ' on' : '')}>
                  <input type="checkbox" checked={picked.includes(f)} onChange={() => togglePick(f)} />{f}
                </label>
              ))}
            </fieldset>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          <div className="step-actions">
            <button className="btn ghost" onClick={() => go(1)}>이전</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? '저장하는 중…' : t.step3.save}</button>
          </div>
        </>
      )}
    </div>
  )
}
