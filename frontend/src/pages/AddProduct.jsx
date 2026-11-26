import { useEffect, useRef, useState } from 'react'
import { api, fmt } from '../api.js'
import { routineCopy } from '../copy/routine.js'
import { isBlurry, productThumbnail, readIngredientPhotos, wakeOcr } from '../ocr.js'
import ThumbPicker from './ThumbPicker.jsx'
import { useDesk, QR } from './Capture.jsx'
import { useBackDepth, useBackLayer } from '../nav.js'
import WhenPicker from './WhenPicker.jsx'

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
const FEW = 10                                   // 사진에서 이보다 적게 읽히면 일부만 찍혔을 수 있다고 알린다
const NOT_FOUND = '전성분을 찾지 못했어요. 전성분이 화면에 가득 차게 다시 찍거나, 쇼핑몰 상세 화면을 캡처해 올려 주세요. 글자를 붙여 넣어도 돼요.'
// 둥근 통 찍는 법: 가장자리 글자는 눌려서 잘 못 읽으니, 통을 돌려 가며 가운데에 오게 여러 장
function RoundTip() {
  return (
    <details className="round-tip">
      <summary className="small">둥근 통이나 병은 이렇게 찍어요</summary>
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
          <li>전성분이 시작되는 부분을 가운데에 두고 한 장</li>
          <li>통을 조금 돌려 다음 부분을 가운데에 두고 한 장 (앞 사진과 1/3쯤 겹치게)</li>
          <li>끝까지 안 보이면 한 번 더 돌려 한 장</li>
        </ol>
        <p className="muted small">세 장을 한 번에 고르면 겹친 성분은 하나로 합쳐요. 가장자리에서 휘어 보이는 글자는 잘 읽히지 않아요.</p>
      </div>
    </details>
  )
}
// 전성분 촬영 안내 그림: 좋은 사진 하나와 피할 사진 셋(기록 탭 안내 화면과 같은 배치)
const LINES = [0, 1, 2, 3, 4, 5].map((k) => <rect key={k} x="34" y={52 + k * 13} width={k % 3 === 2 ? 70 : 112} height="6" rx="3" className="lb-line" />)
function Label({ kind }) {
  return (
    <svg viewBox="0 0 180 150" aria-hidden="true" className={'lb lb-' + kind}>
      {kind === 'blur' && <defs><filter id="lb-blur"><feGaussianBlur stdDeviation="2.4" /></filter></defs>}
      {kind === 'glare' ? (
        <>
          <rect x="24" y="10" width="132" height="132" rx="40" className="lb-bottle" />
          <rect x="34" y="34" width="112" height="6" rx="3" className="lb-head" />{LINES}
          <path d="M112 14 L70 140 L92 140 L134 14 Z" className="lb-glare" />
        </>
      ) : (
        <>
          <rect x={kind === 'cut' ? 56 : 20} y="16" width="140" height="118" rx="10" className="lb-box" />
          <g filter={kind === 'blur' ? 'url(#lb-blur)' : undefined} transform={kind === 'cut' ? 'translate(36 0)' : undefined}>
            <rect x="34" y="34" width="60" height="8" rx="4" className="lb-head" />{LINES}
          </g>
          {kind === 'good' && <rect x="24" y="24" width="132" height="108" rx="8" className="lb-frame" />}
          {kind === 'cut' && <rect x="10" y="24" width="110" height="108" rx="8" className="lb-frame" />}
        </>
      )}
    </svg>
  )
}
const BAD_OCR = [['glare', '둥근 병은 빛 반사를 피해', '조금씩 돌려 가며 찍어요'], ['blur', '폰을 흔들리지 않게 잡고', '글자를 눌러 초점을 맞춰요'], ['cut', '전성분이 잘리지 않게', '처음부터 끝까지 담아요']]
const BAN_OCR = <svg className="cap-ban" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M5.600 5.600l12.800 12.800" /></svg>
// 분석 단계(실제로 하는 일 순서). 0은 이 기기에서 하는 흐림 검사, 1~3은 ocr.js가 알려 준다.
const OCR_STAGES = ['사진 선명도 확인', '사진 정리(위치 정보 지우기)', '읽기 서버 연결', '글자 읽고 성분 사전과 맞추기']

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

export default function AddProduct({ usages, askFamilies = [], ocr, first = false, onSaved, onCancel, today, changeFrom }) {
  const [on, setOn] = useState(today)                  // 추가한 날(기본 오늘). 지난 날도 고를 수 있다
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
  const [icon, setIcon] = useState(null)              // 사진 대신 고른 모양 아이콘(null = 성분 계열로 자동)
  const [ocrFiles, setOcrFiles] = useState([])        // 전성분을 읽은 사진들(첫 장은 제품 사진으로 쓸 수 있게, 더 찍어 다시 읽을 때 합침)
  const [fromPhotos, setFromPhotos] = useState(false)  // 지금 목록이 사진에서 읽은 것인가(사진 더하기 안내)
  const ocrFile = ocrFiles[0] || null
  const [useOcrPhoto, setUseOcrPhoto] = useState(true)
  const desk = useDesk()
  const [stage, setStage] = useState(0)                // 분석 단계(OCR_STAGES 번호)
  const [secs, setSecs] = useState(0)                  // 읽기 시작한 뒤 지난 초(오래 걸리면 안내)
  const [cam, setCam] = useState('idle')               // 전성분 카메라: idle | on | blocked
  const [shots, setShots] = useState([])               // 카메라로 찍은 사진(최대 3장)
  const [shotHint, setShotHint] = useState(null)       // 찍은 직후 안내(흔들림 등)
  const video = useRef(null)
  const stream = useRef(null)
  useEffect(() => {
    if (!reading) return undefined
    setSecs(0); const id = setInterval(() => setSecs((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [reading])
  const stopCam = () => { stream.current?.getTracks().forEach((tr) => tr.stop()); stream.current = null; setCam('idle') }
  useEffect(() => () => stream.current?.getTracks().forEach((tr) => tr.stop()), [])
  const startCam = async () => {
    setErr(null); setShots([]); setShotHint(null)
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      video.current.srcObject = stream.current
      await video.current.play()
      setCam('on')
    } catch { setCam('blocked') }
  }
  // 카메라 화면 한 장을 사진 파일로. 흔들렸으면 바로 알려 주고 넣지 않는다.
  const snap = async () => {
    const v = video.current
    if (!v?.videoWidth || reading) return
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92))
    if (!blob) return
    const f = new File([blob], `ingredients-${shots.length + 1}.jpg`, { type: 'image/jpeg' })
    if (await isBlurry(f)) return setShotHint({ bad: true, text: '흔들렸어요. 폰을 고정하고, 글자를 눌러 초점을 맞춘 뒤 다시 찍어요.' })
    const next = [...shots, f]
    setShots(next)
    if (next.length >= MAX_PHOTOS) return finishCam(next)
    setShotHint({ bad: false, text: `${next.length}장 찍었어요. 남은 전성분이 있으면 이어서 찍고, 다 찍었으면 완료를 눌러요.` })
  }
  const finishCam = (list) => { stopCam(); if (list.length) readPhotos(list, true) }
  const head = useRef(null)
  const root = useRef(null)
  useEffect(() => { head.current?.focus({ preventScroll: true }); root.current?.scrollIntoView({ block: 'nearest' }) }, [step])

  const go = (n) => { setErr(null); setStep(n) }
  useBackDepth(step, (n) => go(n))                        // 폰의 뒤로: 한 단계 앞으로(첫 단계면 제품 추가를 닫음)
  useBackLayer(cam === 'on', () => stopCam())              // 폰의 뒤로: 전성분 카메라만 끄기
  useEffect(() => { if (ocr && step === 1) wakeOcr() }, [ocr, step])   // 잠든 OCR 서버를 미리 깨운다
  // files: 읽을 사진 전부(최대 3장). checked: 이미 흐림 검사를 넘긴 앞쪽 장 수(사진을 더할 때 새 사진만 검사)
  const readPhotos = async (files, anyway = false, checked = 0) => {
    if (!files?.length) return
    files = files.slice(0, MAX_PHOTOS)
    setReading(true); setErr(null); setBlurry(null); setStage(0)
    try {
      if (!anyway) {                                     // 흐린 사진은 읽기 전에 알려 준다(30초 기다린 뒤 실패하지 않게)
        const fresh = files.slice(checked)
        const bad = (await Promise.all(fresh.map(isBlurry))).filter(Boolean).length
        if (bad) return setBlurry({ files, total: fresh.length, count: bad })
      }
      const r = await readIngredientPhotos(files, setStage)
      setOcrFiles(files)
      // 전성분을 못 찾았을 때는 앱 문구로(쇼핑몰 캡처 안내 포함). 사진을 못 연 경우 같은 다른 안내는 서버 문구 그대로
      if (!r.ingredients.length) return setErr(!r.message || r.message.startsWith('전성분을 찾지') ? NOT_FOUND : r.message)
      setList(uniq(r.ingredients)); setAsk(r.ask_families); setPicked([]); setEditing(null); setNote(null); setFromPhotos(true)
      setStep(2)
    } catch (e) { setErr(e.message) } finally { setReading(false) }
  }
  const next1 = () => {
    if (!name.trim()) return setErr('제품 이름을 적어 주세요.')
    if (!usage) return setErr('사용 횟수를 골라 주세요.')
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
  // 사용자가 넣은 이름을 서버 사전으로 표준 이름에 맞춘다('Glycerin'→'글리세린'). 사전과 딱 맞을 때만 바꾸고,
  // 오타로 보고 고치는 경우(보정)는 사용자가 쓴 그대로 둔다: 사용자가 사진을 보고 직접 고친 이름이 다시 바뀌지 않게.
  // 서버에 닿지 못하면 쓴 그대로.
  const standardize = async (n) => {
    try {
      const r = await api.analyzeIngredients(n)
      if (r.ingredients.length) return r.ingredients.map((i) => (i.status === '일치' ? i : { ...i, name: i.ocr || n, status: '직접 입력', families: i.status === '보정' ? [] : i.families }))
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
    if (fresh.length) setList([...list, ...fresh.map((i) => ({ ...i, added: true }))])   // 직접 추가: 라벨 순서 번호를 붙이지 않는다
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
      setNote(`${other.name}${josa(other.name)} 이미 있어서 하나로 합쳤어요.`)
    } else setList(list.map((i) => (i.name === was ? { ...first, ocr: i.ocr, added: i.added } : i)))
  }
  // 자동으로 고친 이름이 틀렸으면 사진에서 읽은 글자로 되돌린다(사용자가 확인한 이름으로 표시).
  const undoFix = (i) => {
    if (list.some((x) => x !== i && key(x.name) === key(i.ocr))) return setNote(`${i.ocr}${josa(i.ocr)} 이미 목록에 있어요.`)
    setList(list.map((x) => (x === i ? { ...x, name: i.ocr, status: '직접 입력', families: [] } : x)))
    setNote(`${i.name}을(를) 읽은 그대로 ${i.ocr}(으)로 되돌렸어요. 다시 고치려면 이름을 눌러요.`)
  }
  const togglePick = (f) => setPicked(picked.includes(f) ? picked.filter((x) => x !== f) : [...picked, f])
  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const pic = photo || (!icon && useOcrPhoto && ocrFile ? await productThumbnail(ocrFile) : null)   // 아이콘을 직접 골랐으면 전성분 사진을 쓰지 않는다
      onSaved(await api.addRoutineItem({ name: name.trim(), usage, ingredients: list.map((i) => i.name), families: picked, recent: first && recent, photo: pic, icon: pic ? null : icon, on: !first && on && on !== today ? on : null }))
    }
    catch (e) { setErr(e.message); setBusy(false) }
  }
  const review = list.filter((i) => i.status === '확인 필요').length
  const fixed = list.filter((i) => i.status === '보정')
  const fams = [...new Set(list.flatMap((i) => i.families || []))]
  // 라벨 순서 번호(1, 2, 3…): 사진이나 글자에서 읽은 성분만. 지우면 번호가 다시 매겨진다
  const no = {}
  list.filter((i) => !i.added).forEach((i, n) => { no[i.name] = n + 1 })

  const pickInput = (onFiles) => (
    <input type="file" accept="image/*" multiple disabled={reading || busy}
      onChange={(e) => { const f = e.target.files; if (f?.length) onFiles([...f]); e.target.value = '' }} />
  )
  const blurBox = blurry && (
    <div className="blur-warn" role="alert">
      <p className="small"><b>{blurry.total > 1 ? `사진 ${blurry.total}장 중 ${blurry.count}장이` : '사진이'} 흐려 보여요.</b> 흐린 사진은 성분을 잘못 읽거나 빠뜨려요.
        폰을 고정하고 화면에서 글자를 눌러 초점을 맞춘 뒤 다시 찍어 주세요.</p>
      <div className="step-actions">
        <label className="btn file">다시 고르기{pickInput((f) => readPhotos(step === 2 ? [...ocrFiles, ...f] : f, false, step === 2 ? ocrFiles.length : 0))}</label>
        <button type="button" className="btn ghost" onClick={() => readPhotos(blurry.files, true)}>그대로 읽기</button>
      </div>
    </div>
  )

  const camView = ocr && (
    <div className={'camview ocr-cam' + (cam === 'on' ? ' on' : '')} hidden={cam !== 'on'} role="dialog" aria-modal="true" aria-label="전성분 촬영">
      <video ref={video} playsInline muted />
      <div className="ocr-box" />
      <div className="cam-top">
        <button className="cam-pill" onClick={() => { stopCam(); setShots([]) }}>촬영 가이드</button>
        <span className="cam-pill" aria-live="polite">{shots.length}/{MAX_PHOTOS}장</span>
      </div>
      <p className={'cam-hint' + (shotHint && !shotHint.bad ? ' ok' : '')} role="status">
        {shotHint && !shotHint.bad && <i aria-hidden="true">✓</i>}{shotHint ? shotHint.text : '전성분을 네모 안에 가득 차게 맞춰요'}</p>
      {shots.length > 0 && <div className="ocr-shots" aria-hidden="true">{shots.map((f) => <img key={f.name} src={URL.createObjectURL(f)} alt="" />)}</div>}
      <div className="cam-bar">
        <label className="cam-side">앨범<input type="file" accept="image/*" multiple onChange={(e) => { const f = e.target.files; e.target.value = ''; if (f?.length) { stopCam(); readPhotos([...f]) } }} /></label>
        <button className="shutter" onClick={snap} aria-label="전성분 찍기" />
        <button className="cam-side" onClick={() => finishCam(shots)} disabled={!shots.length}>{shots.length ? `완료(${shots.length}장)` : '완료'}</button>
      </div>
    </div>
  )
  const analyzing = reading && (
    <div className="analyze" role="status" aria-live="polite">
      <div className="an-orb" aria-hidden="true" />
      <h2>전성분을 읽고 있어요</h2>
      <p className="muted small">사진에서 글자만 읽고, 사진은 저장하지 않아요.</p>
      <ul>
        {OCR_STAGES.map((x, n) => <li key={x} className={n < stage ? 'done' : n === stage ? 'now' : ''}><i aria-hidden="true" />{x}{n < stage && <span className="sr-only"> 완료</span>}</li>)}
      </ul>
      <p className="muted small an-wait">{secs >= 15 ? `${secs}초 지났어요. 처음이거나 오랜만에 쓰면 1~2분 걸리기도 해요. 이 화면에서 기다려 주세요.` : '보통 10~20초 걸려요.'}</p>
    </div>
  )

  return (
    <div className="card steps" ref={root}>
      {camView}
      {analyzing}
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
          <div role="radiogroup" aria-label="사용 횟수" className="opts">
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
          {/* 처음 루틴은 오늘로 함께 묶어 등록하고, 실제로 쓰기 시작한 날은 등록 뒤 '시작일 고치기'로 바꾼다(같은 날 묶음이 깨지지 않게) */}
          {first ? <small className="muted">전부터 쓰던 제품이면, 등록한 뒤 루틴 카드의 '시작일 고치기'에서 실제로 쓰기 시작한 날을 골라요.</small>
            : <WhenPicker id="p-when" label="언제 추가했나요?" value={on} onChange={setOn} min={changeFrom} max={today} />}
          <div className="field prod-photo-field">
            <span className="muted small">제품 사진 (선택)</span>
            <ThumbPicker photo={photo} icon={icon} onError={setErr}
              onPhoto={(p) => setPhoto(p)} onIcon={(k) => { setIcon(k); setPhoto(null) }} />
            <small className="muted">사진은 작게 줄여 저장해요. 나중에 루틴 목록에서 바꿔도 돼요.</small>
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
            <div className="ocr-guide">
              <div className="cap-cols">
                <section className="cap-col">
                  <h4 className="cap-sec ok"><i aria-hidden="true">✓</i>이런 사진이 좋아요</h4>
                  <figure className="cap-good"><div className="cap-frame lb-wrap"><Label kind="good" /></div>
                    <figcaption>상자 뒷면의 전성분이<br />화면에 가득 차게 찍어요</figcaption></figure>
                </section>
                <section className="cap-col">
                  <h4 className="cap-sec no"><i aria-hidden="true">!</i>이런 사진은 피해 주세요</h4>
                  <div className="cap-bad" tabIndex={0} aria-label="피해야 할 사진 예시, 옆으로 넘겨 보세요">
                    {BAD_OCR.map(([k, a1, b1]) => <figure key={k}>{BAN_OCR}<Label kind={k} /><figcaption>{a1}<br />{b1}</figcaption></figure>)}
                  </div>
                </section>
              </div>
              <RoundTip />
              {blurBox}
              {cam === 'blocked' && <p className="err" role="alert">카메라가 열리지 않아요. 브라우저에서 카메라 권한을 허용하거나 사진을 골라 주세요.</p>}
              {desk ? (
                <div className="ocr-actions">
                  <label className={'btn dark file' + (reading ? ' disabled' : '')} aria-disabled={reading}>사진 고르기 (쇼핑몰 캡처도 돼요){pickInput((f) => readPhotos(f))}</label>
                  <details className="ocr-phone">
                    <summary className="small">폰으로 찍으려면</summary>
                    <div><QR text={`${window.location.origin}/?tab=routine`} />
                      <p className="small">폰 카메라로 QR을 비추면 낯씨 루틴 화면이 열려요. 거기서 '제품 추가'를 눌러 찍어요.</p></div>
                  </details>
                </div>
              ) : (
                <div className="ocr-actions two">
                  <button type="button" className="btn dark" onClick={startCam} disabled={reading}>카메라로 찍기</button>
                  <label className={'btn ghost file' + (reading ? ' disabled' : '')} aria-disabled={reading}>사진 고르기{pickInput((f) => readPhotos(f))}</label>
                </div>
              )}
              <p className="muted small">사진은 최대 {MAX_PHOTOS}장까지 읽어요. 상자가 없으면 쇼핑몰 상세 화면 캡처도 돼요.</p>
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
              <div className="ocr-sum">
                <div><p>{fromPhotos ? '읽은 성분' : '나눈 성분'}</p><b>{list.length}개</b></div>
                <div><p>고친 오타</p><b>{fixed.length}개</b></div>
                <div className={review ? 'warn' : ''}><p>확인 필요</p><b>{review}개</b></div>
              </div>
              {fams.length > 0 && <p className="ocr-fams"><span className="muted small">찾은 성분 계열</span>{fams.map((f) => <b key={f}>{f}</b>)}</p>}
              {fromPhotos && list.length < FEW && (
                <div className="few-read" role="status">
                  <p><b>성분이 {list.length}개만 읽혔어요.</b> 전성분이 사진에 다 담겼는지 봐 주세요.</p>
                  <p>전성분이 화면에 가득 차게 다시 찍거나 쇼핑몰 상세 화면을 캡처해 올리면 더 많이 읽혀요.</p>
                  <label className={'btn ghost file' + (reading ? ' disabled' : '')} aria-disabled={reading}>
                    {reading ? '다시 읽는 중… (10~20초)' : '다른 사진으로 다시 읽기'}
                    {pickInput((f) => readPhotos(f))}
                  </label>
                  {ocrFiles.length >= MAX_PHOTOS && blurBox}
                </div>
              )}
              <p className="muted small">{review > 0 ? t.step3.review : t.step3.fix}</p>
              <ol className="ing">
                {list.map((i) => (editing === i.name ? (
                  <li key={i.name} className="editing">
                    <span className="ing-no" aria-hidden="true">{no[i.name] || '추가'}</span>
                    <input autoFocus value={editText} list="ing-hints" aria-label={`${i.name} 고쳐 쓰기`} onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } if (e.key === 'Escape') setEditing(null) }} />
                    <button type="button" className="ok" onClick={saveEdit}>확인</button>
                  </li>
                ) : (
                  <li key={i.name} className={i.status === '확인 필요' ? 'chk' : i.status === '보정' ? 'fix' : ''}>
                    <span className={'ing-no' + (no[i.name] ? '' : ' added')} aria-hidden="true">{no[i.name] || '추가'}</span>
                    {/* 사전에 있는 이름이어도 잘못 읽었거나 잘못 고쳐졌을 수 있어서, 어느 성분이든 눌러 고칠 수 있다 */}
                    <button type="button" className="ing-name" onClick={() => { setEditing(i.name); setEditText(i.name) }} aria-label={`${i.name} 고치기`}>{i.name}</button>
                    {i.status === '확인 필요' && <button type="button" className="edit" onClick={() => { setEditing(i.name); setEditText(i.name) }} aria-hidden="true" tabIndex={-1}>고치기</button>}
                    <button type="button" aria-label={`${i.name} 지우기`} onClick={() => setList(list.filter((x) => x.name !== i.name))}>×</button>
                  </li>
                )))}
              </ol>
              <p className="muted small ing-src">식약처 화장품 원료성분 사전 기준</p>
              {fixed.length > 0 && (
                <div className="fixed-list">
                  <p className="muted small">{t.step3.fixed}</p>
                  <ul>{fixed.map((i) => (
                    <li key={i.name}>{no[i.name] && <span className="ing-no" aria-hidden="true">{no[i.name]}</span>}<s>{i.ocr}</s> → <b>{i.name}</b>
                      <button type="button" className="link undo" onClick={() => undoFix(i)} aria-label={`${i.name}을 읽은 그대로 ${i.ocr}(으)로 되돌리기`}>읽은 그대로</button></li>
                  ))}</ul>
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
              <p className="small"><b>빠진 성분이 있나요?</b> 둥근 통은 조금 돌려 찍은 사진을 더해 다시 읽어요
                (지금 {ocrFiles.length}장, 최대 {MAX_PHOTOS}장). 다시 읽으면 위에서 고친 내용은 새 결과로 바뀌어요.</p>
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
          {!photo && !icon && ocrFile && (
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
