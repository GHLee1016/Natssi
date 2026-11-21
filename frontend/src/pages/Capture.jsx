import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import CheckinSteps from './CheckinSteps.jsx'
import { loadLandmarker, loadLiveTracker, measurePhoto, takeCheeks, trackFrame, userError } from '../measure/browser.js'
import { checkFrame, nextStreak, AUTO_FRAMES } from '../measure/guide.js'

const NOTICE_KEY = 'natssi.photoNotice'   // 로그인 없이 쓰는 경우, 바뀐 사진 안내를 확인한 버전을 이 브라우저에만 기억

const SHOTS = [
  ['front', '정면, 눈높이', true],
  ['light', '밝고 그림자 없이', true],
  ['place', '매번 같은 자리에서', true],
  ['tilt', '고개를 기울이지 않기', false],
  ['hair', '앞머리로 볼 가리지 않기', false],
  ['mask', '마스크 쓰지 않기', false],
]
// 낯씨 캐릭터(로고의 얼굴). 촬영 팁마다 다른 동작을 반복한다. 움직임은 CSS로만 만들고, 모션 줄이기 설정이면 멈춘다.
// 모션을 끈 상태에서는 가린 모습(앞머리·마스크)이 그대로 보이도록 원래 좌표를 '가린 위치'에 둔다.
const HAIR = '#1f2a37'
function Face({ kind }) {
  return (
    <svg viewBox="12 0 176 164" aria-hidden="true" className={'face mc-' + kind}>
      {kind === 'place' && <rect className="mc-frame" x="20" y="8" width="160" height="148" rx="26" fill="none" stroke="#d9653f" strokeWidth="3" strokeDasharray="8 7" strokeLinecap="round" />}
      <g className="mc-body">
        {kind === 'hair' && <path d="M24 96 C10 34 52 2 100 2 C148 2 190 34 176 96 Z" fill={HAIR} />}
        <rect x="34" y="18" width="132" height="132" rx="48" fill="#ffb86b" />
        <ellipse cx="78" cy="98" rx="12" ry="8" fill="#ff6f61" opacity=".45" /><ellipse cx="146" cy="98" rx="12" ry="8" fill="#ff6f61" opacity=".45" />
        <g className="mc-eyes"><circle cx="88" cy="72" r="8" fill="#1f2a37" /><circle cx="136" cy="72" r="8" fill="#1f2a37" /></g>
        <circle cx="90.600" cy="69.400" r="2.400" fill="#fff" /><circle cx="138.600" cy="69.400" r="2.400" fill="#fff" />
        <path d="M100 100 q12 9 24 0" stroke="#1f2a37" strokeWidth="4" fill="none" strokeLinecap="round" />
        {kind === 'hair' && (
          <>
            <path d="M26 82 C10 34 52 2 100 2 C148 2 190 34 174 82 C166 58 140 42 108 36 C90 50 56 68 26 82 Z" fill={HAIR} />
            <path className="mc-lock-l" d="M38 40 C28 70 28 108 46 130 C58 112 60 76 58 40 Z" fill={HAIR} />
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
      {kind === 'front' && <path className="mc-line" d="M100 4 v156" stroke="#d9653f" strokeWidth="3" strokeDasharray="3 8" strokeLinecap="round" />}
      {kind === 'light' && (
        <>
          <clipPath id="mc-face"><rect x="34" y="18" width="132" height="132" rx="48" /></clipPath>
          <g clipPath="url(#mc-face)"><rect className="mc-shade" x="34" y="18" width="70" height="132" fill="#1f2a37" opacity=".28" /></g>
        </>
      )}
    </svg>
  )
}

const SYMPTOM_LINE = (s) => {
  const on = Object.entries(s || {}).filter(([, v]) => v > 0)
  return on.length ? on.map(([k, v]) => `${k} ${v}점`).join(' · ') : '증상 없음'
}

// 하루 기록 2단계 중 두 번째: 사진 결과 바로 아래에서 증상 4개를 이어서 묻는다(로그인한 사람만).
function TodaySymptoms({ photoDone, go }) {
  const [today, setToday] = useState(undefined)        // undefined: 불러오는 중, null: 아직 없음, {...}: 남긴 증상
  const [editing, setEditing] = useState(false)
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
      <p className="eyebrow">{done ? '오늘 기록 완료' : '2 / 2 · 오늘 증상'}</p>
      {done ? (
        <>
          <h2 className="h3">{photoDone ? '오늘 기록을 마쳤어요' : '오늘 증상을 남겼어요'}</h2>
          <p className="muted small">{photoDone ? '사진 ✓ · ' : ''}증상: {SYMPTOM_LINE(today)}</p>
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
  const [error, setError] = useState(null)
  const [agree, setAgree] = useState(false)
  const [guide, setGuide] = useState(null)   // 실시간 정렬 가이드 {ok, key, hint}. 못 쓰면 null(직접 찍기)
  const [auto, setAuto] = useState(true)     // 정렬이 맞으면 자동으로 찍기
  const [kept, setKept] = useState(false)    // [선택 동의] 볼 조각을 서버에 보관했는가
  const [symptomsOnly, setSymptomsOnly] = useState(false)   // 사진이 계속 안 될 때 증상만 먼저 남기기
  const [count, setCount] = useState(null)   // 자동 촬영 카운트다운 3·2·1
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
        try { r = checkFrame(trackFrame(tracker, v, performance.now())) } catch { r = null }
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
    try {
      setBusy('얼굴 모델 불러오는 중…')
      await Promise.race([loadLandmarker(), new Promise((_, no) => setTimeout(() => no(userError(
        '얼굴 모델을 불러오지 못했어요(처음 한 번 약 10MB). 와이파이에서 다시 시도해 주세요.')), 90000))])
      setBusy('검사하는 중…')
      const features = await measurePhoto(src)
      const parts = takeCheeks()
      const res = await api.capture(features)
      setKept(false)
      if (res.saved_on && viewer?.cheeks && parts) {   // 볼 부분 사진 보관에 동의한 사람만, 그날 처음 저장된 기록에
        try { await api.saveCheeks(parts); setKept(true) } catch { /* 조각만 못 남김: 숫자 기록은 그대로 */ }
      }
      setResult(res)
    } catch (e) {
      setError(e?.userMessage || (e?.status ? e.message : '사진을 분석하지 못했어요. 다른 사진으로 다시 시도하거나, [사진 찍기]로 찍어 주세요.'))
    } finally { setBusy(null) }
  }
  const shoot = () => { armed.current = false; if (video.current) send(video.current) }

  if (needConsent) {
    return (
      <section className="capture">
        <header className="page-head"><div><h1>오늘의 얼굴 날씨 찍기</h1></div></header>
        <div className="card">
          <h2 className="h3">{firstTime ? '촬영 전에 확인해 주세요' : '사진 처리 방식이 바뀌었어요'}</h2>
          <ul className="sentences">
            <li>사진은 <b>내 기기 안에서만</b> 분석하고 서버로 보내지 않아요.</li>
            <li>고개 각도·표정·선명도·노출을 확인하고, 양 볼의 색(볼 붉은기)을 재요.</li>
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

  return (
    <section className="capture">
      <header className="page-head"><div>{viewer && <p className="eyebrow">1 / 2 · 사진 → 2 / 2 · 증상</p>}<h1>{viewer ? '오늘 기록하기' : '오늘의 얼굴 날씨 찍기'}</h1></div></header>
      <div className="grid2">
        <div className={'view' + (cam === 'on' ? ' on' : '')}>
          <video ref={video} playsInline muted style={{ display: cam === 'on' ? 'block' : 'none' }} />
          {cam === 'on' && <div className={'oval' + (guide ? (guide.ok ? ' ok' : ' adjust') : '')} />}
          {cam === 'on' && guide && !count && <p className={'guide-hint' + (guide.ok ? ' ok' : '')} role="status">{guide.hint}</p>}
          {cam === 'on' && count && (
            <div className="countdown" role="status" aria-label={`${count}초 뒤에 찍어요`}>
              <b>{count}</b>
              <button className="btn ghost" onClick={cancelAuto}>취소</button>
            </div>
          )}
          {cam !== 'on' && (
            <div className="view-empty">
              <p>{cam === 'blocked' ? '카메라를 쓸 수 없어요. 브라우저에서 카메라 권한을 허용하거나, 사진을 골라 주세요.' : '얼굴이 타원 안에 들어오게 정면을 봐 주세요.'}</p>
              <button className="btn" onClick={start}>카메라 켜기</button>
            </div>
          )}
        </div>
        <div>
          <div className="actions left">
            <button className="btn" onClick={shoot} disabled={cam !== 'on' || !!busy}>{busy || '사진 찍기'}</button>
            <label className="btn ghost file">사진 고르기
              <input type="file" accept="image/*" disabled={!!busy} onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) send(f) }} />
            </label>
          </div>
          {cam === 'on' && guide && (
            <label className="row-check auto-shot"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (!e.target.checked) cancelAuto() }} />
              타원에 맞으면 자동으로 찍기</label>
          )}
          {!result && (
            <div className="card prep">
              <h2 className="h3">이렇게 찍어 주세요</h2>
              <div className="shots">
                {SHOTS.map(([k, t, ok]) => (
                  <figure className={'shot' + (ok ? ' ok' : ' no')} key={k}>
                    <Face kind={k} /><figcaption>{t}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="muted small">매번 같은 자리, 같은 조명, 같은 화장 상태로 찍으면 변화가 더 정확하게 보여요.</p>
            </div>
          )}
          {error && <p className="err" role="alert">{error}</p>}
          {result && (
            <div className="card">
              <h2 className="h3">{result.passed ? '사진이 잘 찍혔어요' : '한 번 더 찍어 볼까요?'}</h2>
              {result.passed ? <p className="muted small">{result.message}</p> : (
                <ul className="fix-list" aria-label="다시 찍을 때 고칠 점">
                  {result.checks.filter((c) => c.ok === false).map((c) => <li key={c.name}><b>{c.name}</b> {c.detail}</li>)}
                </ul>
              )}
              {result.redness !== null && (
                <div className="row">
                  <div><b>볼 붉은기 (a*)</b><p className="muted small">측정 오차 ±{mdc95} · 같은 폰·같은 장소에서 찍은 날끼리 비교해요</p></div>
                  <b>{result.redness.toFixed(1)}</b>
                </div>
              )}
              <p className="muted small">{result.note}{kept ? ' 볼 부분 사진(양 볼 네모)도 함께 보관했어요.' : ''}</p>
              {!result.passed && viewer && !symptomsOnly && (
                <button className="link" onClick={() => setSymptomsOnly(true)}>사진은 나중에 하고 증상만 먼저 남기기</button>
              )}
              <details className="tech checks-more"><summary>검사 항목 {result.checks.length}개 자세히</summary>
                {result.checks.map((c) => (
                  <div className="row" key={c.name}>
                    <div><b>{c.name}</b><p className="muted small">{c.detail}</p></div>
                    <span className={c.ok === null ? 'muted small' : c.ok ? 'done' : 'warn'}>{c.ok === null ? '확인 못 함' : c.ok ? '좋아요 ✓' : '아쉬워요'}</span>
                  </div>
                ))}
                {result.checks.map((c) => <p key={c.name + 't'}>{c.name} · {c.tech}</p>)}
              </details>
            </div>
          )}
          {viewer && go && ((result?.passed && result.saved) || symptomsOnly) && <TodaySymptoms photoDone={!!result?.saved} go={go} />}
        </div>
      </div>
  <div className="notice sentences wide">
    <p>사진은 이 기기 안에서만 분석하고 서버로 보내지 않아요.</p>
    <p>고개 각도·표정·선명도·노출을 확인하고, 통과하면 볼 붉은기를 보여 드려요.</p>
    <p>로그인했다면 통과한 사진의 볼 색 숫자(붉은기·노란기·밝기)만 오늘 기록에 남기고, 다른 측정값과 사진은 서버에 남기지 않아요.</p>
    <button className="link" onClick={() => onLegal('photo')}>사진 처리 안내</button>
  </div>
    </section>
  )
}
