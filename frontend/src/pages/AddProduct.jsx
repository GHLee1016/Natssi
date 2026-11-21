import { useEffect, useRef, useState } from 'react'
import { api, fmt } from '../api.js'
import { routineCopy } from '../copy/routine.js'
import { isBlurry, productThumbnail, readIngredientPhotos, wakeOcr } from '../ocr.js'
import KV from '../kv.jsx'

// 제품 하나를 루틴에 등록한다: 이름·사용 빈도 → 전성분(사진으로 읽기 또는 글자 붙여넣기) → 확인.
// 사진 읽기(OCR)는 서버 설정 NATSSI_OCR=1(/api/meta ocr)일 때만 보인다. 결과 모양이 글자 붙여넣기와 같아 확인 화면은 하나다.
// 서버가 식약처 성분 사전으로 표준 이름에 맞춘다(일치 / 보정 = 오타를 고침 / 확인 필요 = 사전에 없음). 지어내지 않고 사용자가 확인한다.
const STEPS = 3
// 같은 성분인지 비교하는 키: 띄어쓰기·기호·대소문자 무시(서버 match.norm과 같은 규칙)
const key = (s) => s.toLowerCase().replace(/[\s\-·‧ㆍ,./()[\]]/g, '')
// 받침 있으면 '은', 없으면 '는'(한글이 아니면 '은(는)')
const josa = (w) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  return c < 0 || c > 11171 ? '은(는)' : c % 28 ? '은' : '는'
}
// 같은 성분이 두 번 오면 처음 것만(사진 여러 장이 겹칠 때)
const uniq = (items) => { const seen = new Set(); return items.filter((i) => !seen.has(key(i.name)) && seen.add(key(i.name))) }
const MAX_PHOTOS = 3
const NOT_FOUND = '전성분을 찾지 못했어요. 전성분 부분이 화면을 가득 채우게 다시 찍거나, 쇼핑몰 상세 화면을 캡처해서 올려 주세요. 글자를 붙여 넣어도 돼요.'
// 둥근 통 찍는 법: 가장자리 글자는 눌려서 잘 못 읽으니, 통을 돌려 가며 가운데에 오게 여러 장
function RoundTip() {
  return (
    <details className="round-tip">
      <summary className="small">둥근 통이나 병이라면 이렇게 찍어 주세요</summary>
      <div className="round-tip-body">
        <svg viewBox="0 0 240 72" width="240" height="72" role="img" aria-label="통을 돌려 가며 세 번 찍는 그림">
          {[0, 1, 2].map((k) => (
            <g key={k} transform={`translate(${k * 80 + 10} 6)`}>
              <rect x="0" y="0" width="60" height="60" rx="10" className="rt-can" />
              <rect x={18 - k * 8} y="16" width="40" height="30" rx="3" className="rt-label" />
              <rect x="18" y="12" width="24" height="38" rx="3" className="rt-focus" />
            </g>
          ))}
          <path d="M66 36 h10 M146 36 h10" className="rt-arrow" />
        </svg>
        <ol className="small">
          <li>전성분이 시작되는 쪽이 화면 가운데에 오게 한 장</li>
          <li>통을 조금 돌려서 다음 부분이 가운데에 오게 한 장 (앞 사진과 1/3쯤 겹치게)</li>
          <li>끝까지 안 보이면 한 번 더 돌려서 한 장</li>
        </ol>
        <p className="muted small">세 장을 한꺼번에 고르면 겹친 성분은 하나로 합쳐요. 가장자리에서 휘어 보이는 글자는 잘 못 읽어요.</p>
      </div>
    </details>
  )
}
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

export default function AddProduct({ usages, askFamilies = [], ocr, first = false, onSaved, onCancel }) {
  const t = routineCopy(ocr)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [usage, setUsage] = useState('')
  const [recent, setRecent] = useState(false)          // 처음 등록 때만: 최근 2주 안에 쓰기 시작했나
  const [text, setText] = useState('')
  const [list, setList] = useState([])                 // [{name, status, ocr, families}]
  const [extra, setExtra] = useState('')
  const [ask, setAsk] = useState(askFamilies)          // 따로 물어볼 계열(이미 찾은 계열은 빼고)
  const [picked, setPicked] = useState([])             // 사용자가 '들어 있어요'라고 체크한 계열
  const [editing, setEditing] = useState(null)         // 고치는 중인 성분 이름
  const [editText, setEditText] = useState('')
  const hints = useSuggest(editing !== null ? editText : extra)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)               // '이미 목록에 있어요' 같은 안내
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)       // 사진에서 성분 읽는 중(사진 1장 10초 안팎)
  const [blurry, setBlurry] = useState(null)          // 흐려 보이는 사진: { files, count } — 다시 찍거나 그대로 읽기
  const [photo, setPhoto] = useState(null)            // 제품 사진(선택): 240px 썸네일 data URL
  const [ocrFiles, setOcrFiles] = useState([])        // 전성분을 읽은 사진들(첫 장은 제품 사진으로 쓸 수 있게, 더 찍어 다시 읽을 때 합침)
  const [fromPhotos, setFromPhotos] = useState(false)  // 지금 목록이 사진에서 읽은 것인가(사진 더하기 안내)
  const ocrFile = ocrFiles[0] || null
  const [useOcrPhoto, setUseOcrPhoto] = useState(true)
  const head = useRef(null)
  const root = useRef(null)
  useEffect(() => { head.current?.focus({ preventScroll: true }); root.current?.scrollIntoView({ block: 'nearest' }) }, [step])

  const go = (n) => { setErr(null); setStep(n) }
  useEffect(() => { if (ocr && step === 1) wakeOcr() }, [ocr, step])   // 잠든 OCR 서버를 미리 깨운다
  // files: 읽을 사진 전부(최대 3장). checked: 이미 흐림 검사를 넘긴 앞쪽 장 수(사진을 더할 때 새 사진만 검사)
  const readPhotos = async (files, anyway = false, checked = 0) => {
    if (!files?.length) return
    files = files.slice(0, MAX_PHOTOS)
    setReading(true); setErr(null); setBlurry(null)
    try {
      if (!anyway) {                                     // 흐린 사진은 읽기 전에 알려 준다(30초 기다린 뒤 실패하지 않게)
        const fresh = files.slice(checked)
        const bad = (await Promise.all(fresh.map(isBlurry))).filter(Boolean).length
        if (bad) return setBlurry({ files, total: fresh.length, count: bad })
      }
      const r = await readIngredientPhotos(files)
      setOcrFiles(files)
      // 전성분을 못 찾았을 때는 앱 문구로(쇼핑몰 캡처 안내 포함). 사진을 못 연 경우 같은 다른 안내는 서버 문구 그대로
      if (!r.ingredients.length) return setErr(!r.message || r.message.startsWith('전성분을 찾지') ? NOT_FOUND : r.message)
      setList(uniq(r.ingredients)); setAsk(r.ask_families); setPicked([]); setEditing(null); setNote(null); setFromPhotos(true)
      setStep(2)
    } catch (e) { setErr(e.message) } finally { setReading(false) }
  }
  const next1 = () => {
    if (!name.trim()) return setErr('제품 이름을 입력해 주세요.')
    if (!usage) return setErr('사용 빈도를 골라 주세요.')
    go(1)
  }
  const analyze = async (skip) => {
    setBusy(true); setErr(null)
    try {
      if (skip || !text.trim()) { setList([]); setAsk(askFamilies) }
      else { const r = await api.analyzeIngredients(text); setList(uniq(r.ingredients)); setAsk(r.ask_families) }
      setNote(null); setFromPhotos(false)
      setPicked([]); setEditing(null)
      setStep(2)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  // 사용자가 넣은 이름을 서버 사전으로 표준 이름에 맞춘다('Glycerin'→'글리세린'). 서버에 닿지 못하면 쓴 그대로.
  const standardize = async (n) => {
    try {
      const r = await api.analyzeIngredients(n)
      if (r.ingredients.length) return r.ingredients.map((i) => ({ ...i, status: i.status === '일치' ? '일치' : '직접 입력' }))
    } catch { /* 아래로 */ }
    return [{ name: n, status: '직접 입력', ocr: n, families: [] }]
  }
  const addExtra = async () => {
    const n = extra.trim()
    if (!n || busy) return
    setBusy(true); setNote(null)
    const found = await standardize(n)
    const have = new Set(list.map((i) => key(i.name)))
    const fresh = found.filter((i) => !have.has(key(i.name)) && have.add(key(i.name)))
    const dup = found.filter((i) => !fresh.includes(i)).map((i) => i.name)
    if (fresh.length) setList([...list, ...fresh])
    if (dup.length) setNote(`${dup.join(', ')}${josa(dup[dup.length - 1])} 이미 목록에 있어요.`)
    setExtra(''); setBusy(false)
  }
  const saveEdit = async () => {
    const n = editText.trim()
    const was = editing
    setEditing(null); setNote(null)
    if (!n || n === was) return
    const [first] = await standardize(n)
    const other = list.find((i) => i.name !== was && key(i.name) === key(first.name))
    if (other) {          // 이미 있는 성분으로 고쳤으면 하나로 합친다
      setList(list.filter((i) => i.name !== was))
      setNote(`${other.name}${josa(other.name)} 이미 목록에 있어서 하나로 합쳤어요.`)
    } else setList(list.map((i) => (i.name === was ? { ...first, ocr: i.ocr } : i)))
  }
  const togglePick = (f) => setPicked(picked.includes(f) ? picked.filter((x) => x !== f) : [...picked, f])
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const pic = photo || (useOcrPhoto && ocrFile ? await productThumbnail(ocrFile) : null)
      onSaved(await api.addRoutineItem({ name: name.trim(), usage, ingredients: list.map((i) => i.name), families: picked, recent: first && recent, photo: pic }))
    }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  const review = list.filter((i) => i.status === '확인 필요').length
  const fixed = list.filter((i) => i.status === '보정')

  const pickInput = (onFiles) => (
    <input type="file" accept="image/*" multiple disabled={reading || busy}
      onChange={(e) => { const f = e.target.files; if (f?.length) onFiles([...f]); e.target.value = '' }} />
  )
  const blurBox = blurry && (
    <div className="blur-warn" role="alert">
      <p className="small"><b>{blurry.total > 1 ? `사진 ${blurry.total}장 중 ${blurry.count}장이` : '사진이'} 흐려 보여요.</b> 흐리면 성분을 잘못 읽거나 빠뜨려요.
        폰을 고정하고 화면의 글자 부분을 톡 눌러 초점을 맞춘 뒤 다시 찍어 주세요.</p>
      <div className="step-actions">
        <label className="btn file">다시 고르기{pickInput((f) => readPhotos(step === 2 ? [...ocrFiles, ...f] : f, false, step === 2 ? ocrFiles.length : 0))}</label>
        <button type="button" className="btn ghost" onClick={() => readPhotos(blurry.files, true)}>그대로 읽기</button>
      </div>
    </div>
  )

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
                <span className="opt-dot" aria-hidden="true" />{fmt.plain(u)}
              </label>
            ))}
          </div>
          {first && (
            <label className="row-check">
              <input type="checkbox" checked={recent} onChange={(e) => setRecent(e.target.checked)} aria-describedby="p-recent-help" /> {t.recent.ask}
            </label>
          )}
          {first && <small id="p-recent-help" className="muted">{t.recent.help}</small>}
          <div className="field prod-photo-field">
            <span className="muted small">제품 사진 (선택)</span>
            <div className="prod-photo-row">
              {photo && <img className="prod-photo" src={photo} alt="고른 제품 사진" />}
              <label className="btn ghost file">{photo ? '다른 사진' : '사진 찍거나 고르기'}
                <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { setPhoto(await productThumbnail(f)) } catch { setErr('사진을 열 수 없어요. JPG나 PNG로 골라 주세요.') } } }} />
              </label>
              {photo && <button type="button" className="link" onClick={() => setPhoto(null)}>빼기</button>}
            </div>
            <small className="muted">루틴 목록에서 제품을 알아보기 쉽게 작게 줄여 저장해요.</small>
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
          {ocr && (
            <div className="ocr-pick">
              <label className={'btn file' + (reading ? ' disabled' : '')} aria-disabled={reading}>
                {reading ? '성분 읽는 중… (10~20초)' : `전성분 사진 고르기 (최대 ${MAX_PHOTOS}장)`}
                {pickInput((f) => readPhotos(f))}
              </label>
              {blurBox}
              {reading
                ? <p className="muted small" aria-live="polite">처음 쓰거나 오래 안 썼으면 1~2분 걸릴 수 있어요. 이 화면에서 기다려 주세요.</p>
                : <div className="muted small" aria-live="polite">
                    <p>전성분은 보통 상자 뒷면에 있어요. 얼굴이 나오지 않게, 전성분 부분을 화면 가득 찍어 주세요.</p>
                    <p>상자가 없으면 쇼핑몰 상세 화면을 캡처해서 올려도 돼요.</p>
                  </div>}
              {!reading && <RoundTip />}
              <p className="or"><span>또는 글자 붙여넣기</span></p>
            </div>
          )}
          <div className="field">
            <label htmlFor="p-text">전성분</label>
            <textarea id="p-text" rows={6} value={text} maxLength={8000} onChange={(e) => { setText(e.target.value); setErr(null) }}
              placeholder="정제수, 글리세린, …" />
            <button type="button" className="link" onClick={() => setText(SAMPLE)}>예시 넣어 보기</button>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="step-actions">
            <button className="btn ghost" onClick={() => go(0)}>이전</button>
            <button className="btn" onClick={() => analyze(false)} disabled={busy || reading || !text.trim()}>{busy ? '나누는 중…' : '다음'}</button>
          </div>
          <button type="button" className="link skip" onClick={() => analyze(true)} disabled={busy}>{t.step2.skip}</button>
        </>
      )}

      {step === 2 && (
        <>
          <h3 className="step-q" tabIndex={-1} ref={head}>{t.step3.title}</h3>
          <p className="small"><b>{name.trim()}</b><span className="sub-line">{fmt.plain(usage)}</span></p>
          <datalist id="ing-hints">{hints.map((h) => <option key={h.name} value={h.name}>{h.inci}</option>)}</datalist>
          {list.length === 0 ? <p className="muted">{t.step3.none}</p> : (
            <>
              <KV items={[['성분', `${list.length}개`], ['자동으로 고침', fixed.length > 0 && `${fixed.length}개`], ['확인 필요', review > 0 && <b className="warn">{review}개</b>]]} />
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
            <button type="button" className="btn ghost" onClick={addExtra} disabled={busy}>추가</button>
          </div>
          {note && <p className="muted small" role="status">{note}</p>}
          {fromPhotos && ocrFiles.length < MAX_PHOTOS && (
            <div className="more-photos">
              <p className="small"><b>빠진 성분이 있나요?</b> 둥근 통이면 통을 조금 돌려 찍은 사진을 더해 다시 읽을 수 있어요
                (지금 {ocrFiles.length}장, 최대 {MAX_PHOTOS}장). 다시 읽으면 위 목록에서 고친 내용은 새 결과로 바뀌어요.</p>
              <label className={'btn ghost file' + (reading ? ' disabled' : '')} aria-disabled={reading}>
                {reading ? '다시 읽는 중… (10~20초)' : '돌려 찍은 사진 더해서 다시 읽기'}
                {pickInput((f) => readPhotos([...ocrFiles, ...f], false, ocrFiles.length))}
              </label>
              {blurBox}
            </div>
          )}
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
          {!photo && ocrFile && (
            <label className="row-check">
              <input type="checkbox" checked={useOcrPhoto} onChange={(e) => setUseOcrPhoto(e.target.checked)} />
              전성분을 읽은 사진을 제품 사진으로 쓰기(작게 줄여 저장)
            </label>
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
