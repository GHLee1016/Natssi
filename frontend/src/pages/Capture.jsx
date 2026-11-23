import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import CheckinSteps from './CheckinSteps.jsx'
import { loadLandmarker, loadLiveTracker, measurePhoto, takeCheeks, trackFrame, userError, forServer, relRedness } from '../measure/browser.js'
import { checkView, viewBox, nextStreak, AUTO_FRAMES } from '../measure/guide.js'
import KV, { symptomItems } from '../kv.jsx'
import qrcode from 'qrcode-generator'
import { useBackLayer } from '../nav.js'

// 마우스를 쓰는 넓은 화면(PC)인가. PC에서는 카메라 대신 폰으로 여는 QR을 보여 준다:
// 웹캠과 폰 카메라는 색을 다르게 잡아서, 섞어 찍으면 날마다 붉은기를 비교할 수 없다.
const DESK_Q = '(min-width: 900px) and (hover: hover) and (pointer: fine)'
export function useDesk() {
  const [desk, setDesk] = useState(() => window.matchMedia?.(DESK_Q).matches ?? false)
  useEffect(() => {
    const m = window.matchMedia?.(DESK_Q); if (!m) return undefined
    const on = () => setDesk(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on)
  }, [])
  return desk
}

// 이 주소를 폰으로 여는 QR(그리기만 한다. 주소는 바깥으로 보내지 않음)
export function QR({ text, label = '폰 카메라로 비추면 낯씨 기록 화면이 열리는 QR 코드' }) {
  const q = qrcode(0, 'M'); q.addData(text); q.make()
  const n = q.getModuleCount(); let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  return <svg className="qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={label} shapeRendering="crispEdges"><rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" /><path d={d} fill="#1f2a37" /></svg>
}

// 분석하는 동안 보여 줄 단계(실제로 하는 일 순서). 각 단계는 끝난 뒤에 ✓가 붙는다.
const STAGES = ['얼굴 모델 준비', '얼굴과 고개 각도 찾기', '양 볼 색 재기', '사진 품질 판정']
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms))
// 주소에 ?camdebug=1 을 붙이면 촬영 화면 위에 가이드 판정 숫자를 보여 준다(실기기에서 원인 확인용)
const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('camdebug')
const NOTICE_KEY = 'natssi.photoNotice'   // 로그인 없이 쓰는 경우, 바뀐 사진 안내를 확인한 버전을 이 브라우저에만 기억

// 촬영 전 안내: 좋은 사진 한 장과 피해야 할 사진들(캐릭터 동작은 Face, 끝 자세가 그 모습)
const BAD = [
  ['tilt', '고개를 기울이지 말고', '정면을 봐 주세요'],
  ['hair', '앞머리나 머리카락이', '볼을 가리지 않게 해 주세요'],
  ['mask', '마스크를 벗고', '얼굴이 다 보이게 찍어 주세요'],
]
const BAN = <svg className="cap-ban" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M5.600 5.600l12.800 12.800" /></svg>
// 낯씨 캐릭터(로고의 얼굴). 촬영 팁마다 다른 동작을 4초마다 반복한다: 처음 자세 → 동작 → 끝 자세에서 멈춤 → 돌아가기.
// ✓ 팁은 틀린 자세에서 맞는 자세로 가고(끝 자세 = 맞는 모습), ✕ 팁은 하면 안 되는 자세로 간다(끝 자세 = 틀린 모습).
// 움직임은 CSS로만 만든다(styles.css의 mc-*). 모션 줄이기 설정이면 끝 자세로 멈춰 있도록, 원래 좌표와 기본 스타일을 끝 자세에 둔다.
const HAIR = '#1f2a37'
function Face({ kind }) {
  return (
    <svg viewBox="12 0 176 164" aria-hidden="true" className={'face mc-' + kind}>
      {kind === 'place' && <rect className="mc-frame" x="20" y="8" width="160" height="148" rx="26" fill="none" stroke="#d9653f" strokeWidth="3" strokeDasharray="8 7" strokeLinecap="round" />}
      {kind === 'light' && (
        <g className="mc-sun">
          <circle cx="33" cy="21" r="8" fill="#ffc94d" />
          <path d="M33 5 v5 M33 32 v5 M17 21 h5 M44 21 h5 M21.700 9.700 l3.500 3.500 M40.800 28.800 l3.500 3.500 M44.300 9.700 l-3.500 3.500 M25.200 28.800 l-3.500 3.500" stroke="#ffc94d" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      <g className="mc-body">
        {kind === 'hair' && <path d="M24 96 C10 34 52 2 100 2 C148 2 190 34 176 96 Z" fill={HAIR} />}
        <rect x="34" y="18" width="132" height="132" rx="48" fill="#ffb86b" />
        <g className="mc-feat">
          <ellipse cx="78" cy="98" rx="12" ry="8" fill="#ff6f61" opacity=".45" /><ellipse cx="146" cy="98" rx="12" ry="8" fill="#ff6f61" opacity=".45" />
          <g className="mc-eyes"><circle cx="88" cy="72" r="8" fill="#1f2a37" /><circle cx="136" cy="72" r="8" fill="#1f2a37" /></g>
          <circle cx="90.600" cy="69.400" r="2.400" fill="#fff" /><circle cx="138.600" cy="69.400" r="2.400" fill="#fff" />
          <path d="M100 100 q12 9 24 0" stroke="#1f2a37" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
        {kind === 'hair' && (
          <>
            <path d="M26 82 C10 34 52 2 100 2 C148 2 190 34 174 82 C166 58 140 42 108 36 C90 50 56 68 26 82 Z" fill={HAIR} />
            <path className="mc-lock-l" d="M38 40 C28 70 30 110 56 132 C74 112 78 76 66 40 Z" fill={HAIR} />
            <path className="mc-lock-r" d="M162 40 C172 70 172 108 154 130 C142 112 140 76 142 40 Z" fill={HAIR} />
          </>
        )}
        {kind === 'mask' && (
          <g className="mc-maskg">
            <path d="M34 98 q-8 0 -12 8 M166 98 q8 0 12 8" stroke="#9fb3c4" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M42 92 q58 -12 116 0 v26 a40 40 0 0 1 -40 32 h-36 a40 40 0 0 1 -40 -32 Z" fill="#eaf2f7" stroke="#9fb3c4" strokeWidth="3" strokeLinejoin="round" />
            <path d="M52 108 q48 6 96 0 M56 122 q44 6 88 0" stroke="#b7c8d6" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        )}
      </g>
      {kind === 'front' && (
        <g className="mc-cross" stroke="#d9653f" strokeWidth="3" strokeDasharray="3 8" strokeLinecap="round">
          <path d="M100 4 v156" /><path d="M22 72 h156" />
        </g>
      )}
      {kind === 'tilt' && <path className="mc-ref" d="M100 4 v156" stroke="#d9653f" strokeWidth="3" strokeDasharray="3 8" strokeLinecap="round" />}
      {kind === 'light' && (
        <>
          <clipPath id="mc-face"><rect x="34" y="18" width="132" height="132" rx="48" /></clipPath>
          <g clipPath="url(#mc-face)"><rect className="mc-shade" x="34" y="18" width="70" height="132" fill="#1f2a37" /></g>
        </>
      )}
    </svg>
  )
}


// 하루 기록 2단계 중 두 번째: 사진 결과 바로 아래에서 증상 4개를 이어서 묻는다(로그인한 사람만).
function TodaySymptoms({ photoDone, go }) {
  const [today, setToday] = useState(undefined)        // undefined: 불러오는 중, null: 아직 없음, {...}: 남긴 증상
  const [editing, setEditing] = useState(false)
  useBackLayer(editing, () => setEditing(false))          // 폰의 뒤로: 증상 고치기를 닫기
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  useEffect(() => { api.me().then((d) => setToday(d.today_checkin || null)).catch(() => setToday(null)) }, [])
  if (today === undefined) return null
  const save = async (vals) => {
    setSaving(true); setErr(null)
    try { const d = await api.checkin(vals); setToday(d.today_checkin); setEditing(false) } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }
  const done = today && !editing
  return (
    <div className="card today-step" aria-live="polite">
      <p className="eyebrow">{done ? '오늘 기록 완료' : '2단계: 오늘 증상'}</p>
      {done ? (
        <>
          <h2 className="h3">{photoDone ? '오늘 기록을 마쳤어요' : '오늘 증상을 남겼어요'}</h2>
          <KV className="small" items={[['사진', photoDone && '남김 ✓'], ...symptomItems(today)]} />
          <div className="actions left">
            <button className="btn" onClick={() => go('diary')}>오늘의 얼굴 날씨 보기</button>
            <button className="btn ghost" onClick={() => setEditing(true)}>증상 고치기</button>
          </div>
        </>
      ) : (
        <>
          <h2 className="h3">오늘 얼굴은 어땠나요?</h2>
          <p className="muted small">네 가지만 물어요. 사진과 함께 보면 붉은기가 증상과 겹치는지 알 수 있어요.</p>
          <CheckinSteps initial={today || {}} saving={saving} error={err} onSave={save}
            onCancel={() => (today ? setEditing(false) : go('diary'))} />
        </>
      )}
    </div>
  )
}

export default function Capture({ onLegal, viewer, photoVersion, mdc95, onConsented, go }) {
  const video = useRef(null)
  const stream = useRef(null)
  const [cam, setCam] = useState('idle')   // idle | on | blocked
  const [busy, setBusy] = useState(null)   // null | '얼굴 모델 불러오는 중…' | '검사하는 중…'
  const [result, setResult] = useState(null)
  const lastFeat = useRef(null)                     // 마지막으로 잰 숫자('그래도 이 사진으로 기록하기'에 다시 보냄)
  const [keeping, setKeeping] = useState(false)
  const [error, setError] = useState(null)
  const [agree, setAgree] = useState(false)
  const [guide, setGuide] = useState(null)   // 실시간 정렬 가이드 {ok, key, hint}. 못 쓰면 null(직접 찍기)
  const [auto, setAuto] = useState(true)     // 정렬이 맞으면 자동으로 찍기
  const [kept, setKept] = useState(false)    // [선택 동의] 볼 조각을 서버에 보관했는가
  const [symptomsOnly, setSymptomsOnly] = useState(false)   // 사진이 계속 안 될 때 증상만 먼저 남기기
  const [count, setCount] = useState(null)   // 자동 촬영 카운트다운 3, 2, 1
  const desk = useDesk()
  const ovalEl = useRef(null)
  const [debug, setDebug] = useState('')
  const [stage, setStage] = useState(0)      // 분석 단계(STAGES 번호). STAGES.length면 모두 끝남
  const streak = useRef(0)                   // 맞는 프레임이 이어진 수
  const armed = useRef(true)                 // 자동 촬영을 할 수 있는 상태(한 번 찍으면 내려감)
  const flags = useRef({ busy: false, auto: true, passed: false })
  const [seenLocal, setSeenLocal] = useState(() => { try { return localStorage.getItem(NOTICE_KEY) } catch { return null } })
  // 사진 처리 방식이 바뀐 날(photoVersion) 이후에 동의했으면 다시 묻지 않는다. 날짜 꼴(YYYY-MM-DD)이라 글자 비교로 충분.
  const agreed = viewer ? viewer.consent_version : seenLocal
  const needConsent = !(agreed && agreed >= photoVersion)
  const firstTime = !agreed

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null }
  useEffect(() => stop, [])
  useEffect(() => { flags.current = { busy: !!busy, auto, passed: !!result?.passed } }, [busy, auto, result])

  // 카메라가 켜져 있는 동안 125ms마다 한 프레임을 이 기기에서 보고 정렬 안내를 바꾼다(프레임은 저장하지 않음).
  // 정렬이 약 1초 이어지면 3·2·1을 세고 찍는다. 찍은 뒤에는 자동 촬영을 내려 두고, 통과하지 못했으면
  // 사용자가 자세를 바꿨다가(정렬이 한 번 어긋났다가) 다시 맞출 때 다시 켠다.
  useEffect(() => {
    if (cam !== 'on') return undefined
    let alive = true, timer = null, tracker = null, lastKey = '', lastCount = null
    const showCount = (n) => { if (n !== lastCount) { lastCount = n; setCount(n) } }
    const tick = () => {
      if (!alive) return
      const v = video.current
      if (tracker && v && v.readyState >= 2 && !flags.current.busy) {
        let r = null
        try {
          const f = trackFrame(tracker, v, performance.now())
          const rect = (el) => { const b = el?.getBoundingClientRect(); return b && { left: b.left, top: b.top, width: b.width, height: b.height } }
          const view = { vw: v.videoWidth, vh: v.videoHeight, el: rect(v), oval: rect(ovalEl.current) }
          r = checkView(f, view)
          if (DEBUG && f.box && view.oval) {            // 실기기 확인용: 카메라 화면 크기, 사진 폭 대비 얼굴, 타원 대비 얼굴
            const b = viewBox(f, view)
            setDebug(`${view.vw}x${view.vh} 얼굴/사진폭 ${f.faceRatio.toFixed(2)} 얼굴/타원 ${((b.x1 - b.x0) / view.oval.width).toFixed(2)} ${r.key}`)
          }
        } catch { r = null }
        if (r) {
          if (r.key !== lastKey) { lastKey = r.key; setGuide(r) }
          if (!r.ok && !armed.current && !flags.current.passed) armed.current = true
          streak.current = nextStreak(streak.current, r.ok)
          const s = streak.current - AUTO_FRAMES
          if (flags.current.auto && armed.current && s >= 0) {
            if (s >= 12) { armed.current = false; streak.current = 0; showCount(null); shoot() }
            else showCount(3 - Math.floor(s / 4))
          } else showCount(null)
        }
      }
      timer = setTimeout(tick, 125)
    }
    loadLiveTracker().then((t) => { tracker = t; tick() }).catch(() => setGuide(null))   // 못 불러오면 가이드 없이 직접 찍기
    return () => { alive = false; clearTimeout(timer); setGuide(null); setCount(null) }
  }, [cam])
  const cancelAuto = () => { armed.current = false; streak.current = 0; setCount(null) }

  const acceptNotice = async () => {
    setError(null)
    try {
      if (viewer) { await api.consent(); onConsented?.() }
      else { try { localStorage.setItem(NOTICE_KEY, photoVersion) } catch { /* 무시 */ } setSeenLocal(photoVersion) }
    } catch (e) { setError(e.message) }
  }

  const start = async () => {
    setError(null)
    try {
      // 해상도나 비율은 묻지 않는다: 비율을 정하면 브라우저가 카메라 화면을 잘라(확대해) 보낼 수 있어서.
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      video.current.srcObject = stream.current
      await video.current.play()
      setCam('on')
    } catch {
      setCam('blocked')
    }
    loadLandmarker().catch(() => {})       // 카메라를 켜는 동안 얼굴 모델을 미리 받아 둠
  }

  // 사진(또는 카메라 화면)을 이 기기에서 재고, 숫자만 서버로 보내 품질 판정을 받음
  const send = async (src) => {
    setError(null); setResult(null)
    // 단계가 너무 빨리 지나가 안 보이지 않게, 단계마다 잠깐(0.2초) 머문다. 순서와 내용은 실제로 하는 일 그대로.
    const step = async (n) => { setStage(n); await wait(200) }
    try {
      setBusy('얼굴 모델 불러오는 중…'); await step(0)
      await Promise.race([loadLandmarker(), new Promise((_, no) => setTimeout(() => no(userError(
        '얼굴 모델을 불러오지 못했어요(처음 한 번 약 10MB). 와이파이에서 다시 시도해 주세요.')), 90000))])
      setBusy('검사하는 중…'); await step(1)
      const features = await measurePhoto(src)
      lastFeat.current = features
      if (stream.current) { stop(); setCam('idle') }   // 찍은 뒤에는 카메라를 끈다(통과하든 못 하든 결과 화면으로)
      await step(2)
      const parts = takeCheeks()
      await step(3)
      const res = await api.capture(forServer(features))
      setKept(false)
      if (res.saved_on && viewer?.cheeks && parts) {   // 볼 부분 사진 보관에 동의한 사람만, 그날 처음 저장된 기록에
        try { await api.saveCheeks(parts); setKept(true) } catch { /* 조각만 못 남김: 숫자 기록은 그대로 */ }
      }
      await step(STAGES.length)
      setResult(res)
    } catch (e) {
      if (stream.current) { stop(); setCam('idle') }
      setError(e?.userMessage || (e?.status ? e.message : '사진을 분석하지 못했어요. 다른 사진으로 다시 시도하거나, [사진 찍기]로 찍어 주세요.'))
    } finally { setBusy(null) }
  }
  // 조명 색만 걸린 사진: 사용자가 다시 찍기 대신 그대로 기록할 수 있다. 판정은 그날 b*로 '조명 다름'을 가려내 단정하지 않는다.
  const keepAnyway = async () => {
    if (!lastFeat.current) return
    setKeeping(true); setError(null)
    try { setResult(await api.capture({ ...forServer(lastFeat.current), override: true })) }
    catch (e) { setError(e?.status ? e.message : '기록하지 못했어요. 잠시 뒤 다시 시도해 주세요.') }
    finally { setKeeping(false) }
  }
  const shoot = () => { armed.current = false; if (video.current) send(video.current) }
  const pick = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) send(f) }
  // 카메라를 켜기 전, 결과가 없을 때는 안내 화면(좋은 사진, 피할 사진, 아래 큰 버튼 두 개)을 보여 준다.
  // 카메라 화면(video)은 안내 화면 아래에 숨겨 두고 그대로 둔다: 켜는 동안 같은 video 요소에 영상을 붙여야 해서.
  const guideMode = cam !== 'on' && !result && !busy
  const again = () => { setResult(null); setSymptomsOnly(false); start() }
  const close = () => { cancelAuto(); stop(); setCam('idle') }   // 카메라 닫고 안내 화면으로
  useBackLayer(cam === 'on', () => close())                       // 폰의 뒤로: 카메라만 끄고 안내 화면으로
  useBackLayer(!!result, () => { setResult(null); setSymptomsOnly(false) })   // 폰의 뒤로: 결과를 닫고 안내 화면으로
  // 결과 항목: 고칠 것은 바로 보이게, 통과한 것은 접어 둔다
  const bad = result ? result.checks.filter((c) => c.ok === false) : []
  const rest = result ? result.checks.filter((c) => c.ok !== false) : []
  const item = (c) => (
    <div className={'res-item ' + (c.ok === null ? 'na' : c.ok ? 'ok' : 'no')} key={c.name}>
      <span className="res-chip">{c.ok === null ? '확인 못 함' : c.ok ? '좋아요' : '아쉬워요'}</span>
      <b>{c.name}</b>
      <p className="small">{c.detail}</p>
    </div>
  )

  if (needConsent) {
    return (
      <section className="capture">
        <header className="page-head"><div><h1>오늘의 얼굴 날씨 찍기</h1></div></header>
        <div className="card">
          <h2 className="h3">{firstTime ? '촬영 전에 확인해 주세요' : '사진 처리 방식이 바뀌었어요'}</h2>
          <ul className="sentences">
            <li>사진은 <b>내 기기 안에서만</b> 분석하고 서버로 보내지 않아요.</li>
            <li>고개 각도, 표정, 선명도, 노출을 확인하고, 양 볼의 색(볼 붉은기)을 재요.</li>
            <li>서버에는 측정한 숫자만 보내 품질을 판정해요. 로그인했다면 통과한 사진의 <b>볼 색 숫자 3개(붉은기, 조명 확인용 노란기, 밝기)</b>만 오늘 기록에 남겨요.</li>
          </ul>
          <button className="link" onClick={() => onLegal('photo')}>얼굴 사진 처리 안내 전체 보기</button>
          <label className="row-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> {firstTime ? '' : '바뀐 '}얼굴 사진 처리 안내({photoVersion})를 읽고 동의해요</label>
          <div className="actions left"><button className="btn" disabled={!agree} onClick={acceptNotice}>동의하고 촬영하기</button></div>
          {error && <p className="err" role="alert">{error}</p>}
        </div>
      </section>
    )
  }

  const title = guideMode ? <>얼굴이 잘 보이는 사진을<br />찍거나 골라 주세요</>
    : result ? (result.passed ? (result.lighting_off ? '조명이 달랐던 사진으로 기록했어요' : '사진이 잘 찍혔어요') : '한 번 더 찍어 볼까요?') : viewer ? '오늘 기록하기' : '오늘의 얼굴 날씨 찍기'
  return (
    <section className="capture">
      <header className="page-head"><div><h1>{title}</h1></div></header>
      {guideMode && (
        <div className="cap-guide">
          <p className="muted cap-lead">사진은 이 기기 안에서만 분석하고, 서버에는 볼 색 숫자만 보내요.</p>
          <div className="cap-cols">
          <section className="cap-col">
          <h2 className="cap-sec ok"><i aria-hidden="true">✓</i>이런 사진이 좋아요</h2>
          <figure className="cap-good">
            <div className="cap-frame"><Face kind="front" /></div>
            <figcaption>밝은 곳에서 정면을 보고<br />매번 같은 자리에서 찍어 주세요</figcaption>
          </figure>
          </section>
          <section className="cap-col">
          <h2 className="cap-sec no"><i aria-hidden="true">!</i>이런 사진은 피해 주세요</h2>
          <div className="cap-bad" tabIndex={0} aria-label="피해야 할 사진 예시, 옆으로 넘겨 보세요">
            {BAD.map(([k, a, b]) => (
              <figure key={k}>{BAN}<Face kind={k} /><figcaption>{a}<br />{b}</figcaption></figure>
            ))}
          </div>
          </section>
          </div>
          {cam === 'blocked' && <p className="err" role="alert">카메라를 쓸 수 없어요. 브라우저에서 카메라 권한을 허용하거나, 사진을 골라 주세요.</p>}
          {error && <p className="err" role="alert">{error}</p>}
          {desk ? (
            <div className="cap-qr">
              <QR text={`${window.location.origin}/?tab=capture`} />
              <div>
                <h2>폰으로 찍어 주세요</h2>
                <p>폰 카메라로 QR을 비추면 낯씨 기록 화면이 열려요.{viewer ? ' 폰에서도 같은 계정으로 로그인해 주세요.' : ''}</p>
                <p className="muted small">컴퓨터 카메라와 폰 카메라는 색을 다르게 잡아요. 매일 같은 폰으로 찍어야 붉은기를 비교할 수 있어요.</p>
                <label className="link file">이 컴퓨터에 있는 사진 고르기<input type="file" accept="image/*" onChange={pick} /></label>
              </div>
            </div>
          ) : (
            <div className="cap-actions">
              <button className="btn dark" onClick={start}>카메라로 촬영하기</button>
              <label className="btn ghost file">사진 고르기<input type="file" accept="image/*" onChange={pick} /></label>
            </div>
          )}
        </div>
      )}
      {/* 카메라: 켜면 화면 전체를 덮는다. video는 늘 붙어 있어야 해서(켜는 동안 영상을 붙임) 숨겨 둘 뿐 지우지 않는다 */}
      <div className={'camview' + (cam === 'on' ? ' on' : '')} hidden={cam !== 'on'} role="dialog" aria-modal="true" aria-label="얼굴 촬영">
        <video ref={video} playsInline muted />
        <div ref={ovalEl} className={'oval' + (guide ? (guide.ok ? ' ok' : ' adjust') : '')} />
        {DEBUG && debug && <p className="cam-debug">{debug}</p>}
        <div className="cam-top">
          <button className="cam-pill" onClick={close}>촬영 가이드</button>
          {guide && <label className="cam-pill"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (!e.target.checked) cancelAuto() }} />자동 촬영</label>}
        </div>
        {!count && <p className={'cam-hint' + (guide?.ok ? ' ok' : '')} role="status">{guide?.ok && <i aria-hidden="true">✓</i>}{guide ? guide.hint : '얼굴이 타원 안에 들어오게 정면을 봐 주세요'}</p>}
        {count && (
          <div className="countdown" role="status" aria-label={`${count}초 뒤에 찍어요`}>
            <b>{count}</b>
            <button className="btn ghost" onClick={cancelAuto}>취소</button>
          </div>
        )}
        <div className="cam-bar">
          <label className="cam-side">앨범<input type="file" accept="image/*" disabled={!!busy} onChange={pick} /></label>
          <button className="shutter" onClick={shoot} disabled={!!busy} aria-label="사진 찍기" />
          <button className="cam-side" onClick={close}>취소</button>
        </div>
      </div>
      {busy && (
        <div className="analyze" role="status" aria-live="polite">
          <div className="an-orb" aria-hidden="true" />
          <h2>얼굴 날씨를 재고 있어요</h2>
          <p className="muted small">사진은 이 기기 안에서만 분석해요.</p>
          <ul>
            {STAGES.map((t, n) => <li key={t} className={n < stage ? 'done' : n === stage ? 'now' : ''}><i aria-hidden="true" />{t}{n < stage && <span className="sr-only"> 완료</span>}</li>)}
          </ul>
        </div>
      )}
      {result && !busy && cam !== 'on' && (
        <div className="res">
          {result.passed && result.redness !== null && (
            <div className="res-hero">
              <p>오늘 볼 붉은기{result.lighting_off ? ' (조명 다름, 참고)' : ''}</p>
              <b>{result.redness.toFixed(1)}</b>
              <p className="small">측정 오차 ±{mdc95}. 같은 폰으로 같은 자리에서 찍은 날끼리 비교해요.</p>
              {relRedness(lastFeat.current) !== null && (           /* 이 기기에서만 계산한 참고값(서버로 보내지 않음) */
                <p className="small">조명 영향을 덜 받는 값(볼 − 콧등) {relRedness(lastFeat.current).toFixed(1)}</p>
              )}
            </div>
          )}
          <p className="res-msg">{result.passed || result.overridable ? result.message : '아쉬운 항목을 고쳐서 다시 찍어 주세요.'}</p>
          {!result.passed && result.overridable && (
            <div className="next-box">
              <p className="small">다시 찍기 어렵다면 이 사진으로 기록할 수 있어요. 조명 때문에 붉은기가 틀어졌을 수 있어서, 이날은 판정에서 단정하지 않고('안개') 평소 범위 계산에서도 빼요.</p>
              <button className="btn ghost" onClick={keepAnyway} disabled={keeping}>{keeping ? '기록하는 중…' : '그래도 이 사진으로 기록하기'}</button>
            </div>
          )}
          {bad.length > 0 && <><h2 className="res-sec">고칠 항목</h2><div className="res-grid">{bad.map(item)}</div></>}
          <details className="res-more">
            <summary>{bad.length ? `통과한 항목 ${rest.length}개` : `검사 항목 ${rest.length}개 모두 좋아요`}</summary>
            <div className="res-grid">{rest.map(item)}</div>
            <div className="tech">{result.checks.map((c) => <p key={c.name}>{c.name}: {c.tech}</p>)}</div>
          </details>
          <p className="muted small">{result.note}{kept ? ' 볼 부분 사진(양 볼 네모)도 함께 보관했어요.' : ''}</p>
          <div className="res-actions">
            <button className="btn dark" onClick={desk ? () => setResult(null) : again}>{desk ? '처음으로' : '다시 찍기'}</button>
            <label className="btn ghost file">사진 고르기<input type="file" accept="image/*" onChange={pick} /></label>
          </div>
          {!result.passed && viewer && !symptomsOnly && (
            <button className="link" onClick={() => setSymptomsOnly(true)}>사진은 나중에 하고 증상만 먼저 남기기</button>
          )}
        </div>
      )}
      {error && !guideMode && <p className="err" role="alert">{error}</p>}
      {viewer && go && ((result?.passed && result.saved) || symptomsOnly) && <TodaySymptoms photoDone={!!result?.saved} go={go} />}
      {guideMode && (
  <div className="notice sentences wide">
      <p>사진은 이 기기 안에서만 분석하고 서버로 보내지 않아요.</p>
      <p>로그인했다면 통과한 사진의 볼 색 숫자(붉은기, 노란기, 밝기)만 오늘 기록에 남겨요.</p>
      <button className="link" onClick={() => onLegal('photo')}>사진 처리 안내</button>
    </div>
      )}
    </section>
  )
}
