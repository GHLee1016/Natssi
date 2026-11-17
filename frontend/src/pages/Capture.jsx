import { useEffect, useRef, useState } from 'react'
import { api, shrinkImage } from '../api.js'

const SHOTS = [
  ['front', '정면, 눈높이', true],
  ['light', '밝고 그림자 없이', true],
  ['tilt', '고개를 기울이지 않기', false],
  ['hair', '앞머리·마스크로 볼 가리지 않기', false],
]
// 낯씨 캐릭터(로고의 얼굴+구름). 촬영 팁마다 다른 동작을 반복한다. 움직임은 CSS로만 만들고, 모션 줄이기 설정이면 멈춘다.
function Face({ kind }) {
  return (
    <svg viewBox="30 10 140 150" aria-hidden="true" className={'face mc-' + kind}>
      <g className="mc-body">
        <rect x="34" y="18" width="132" height="132" rx="48" fill="#ffb86b" />
        <ellipse cx="78" cy="98" rx="12" ry="8" fill="#ff6f61" opacity=".45" /><ellipse cx="146" cy="98" rx="12" ry="8" fill="#ff6f61" opacity=".45" />
        <g className="mc-eyes"><circle cx="88" cy="72" r="8" fill="#1f2a37" /><circle cx="136" cy="72" r="8" fill="#1f2a37" /></g>
        <circle cx="90.600" cy="69.400" r="2.400" fill="#fff" /><circle cx="138.600" cy="69.400" r="2.400" fill="#fff" />
        <path d="M100 100 q12 9 24 0" stroke="#1f2a37" strokeWidth="4" fill="none" strokeLinecap="round" />
        {kind === 'hair' && <path className="mc-bangs" d="M34 70 q8 -52 78 -52 q70 0 54 52 q-20 -22 -54 -22 q-36 0 -78 22 Z M34 92 h22 v44 h-22 Z M144 92 h22 v44 h-22 Z" fill="#1f2a37" />}
      </g>
      {kind === 'front' && <path className="mc-line" d="M112 8 v146" stroke="#d9653f" strokeWidth="3" strokeDasharray="3 8" strokeLinecap="round" />}
      {kind === 'light' && (
        <>
          <clipPath id="mc-face"><rect x="34" y="18" width="132" height="132" rx="48" /></clipPath>
          <g clipPath="url(#mc-face)"><rect className="mc-shade" x="34" y="18" width="70" height="132" fill="#1f2a37" opacity=".28" /></g>
        </>
      )}
    </svg>
  )
}

export default function Capture({ maxMb = 4, onLegal }) {
  const video = useRef(null)
  const stream = useRef(null)
  const [cam, setCam] = useState('idle')   // idle | on | blocked
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null }
  useEffect(() => stop, [])

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
  }

  const send = async (blob) => {
    setBusy(true); setError(null); setResult(null)
    try {
      const small = await shrinkImage(blob)
      if (small.size > maxMb * 1024 * 1024) throw new Error(`사진이 너무 커요 (${maxMb}MB 이하)`)
      setResult(await api.capture(small))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const shoot = () => {
    const v = video.current, c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    c.toBlob((b) => b && send(b), 'image/jpeg', 0.92)
  }

  return (
    <section className="capture">
      <header className="page-head"><div><h1>오늘의 얼굴 날씨 찍기</h1></div></header>
      <div className="grid2">
        <div className="view">
          <video ref={video} playsInline muted style={{ display: cam === 'on' ? 'block' : 'none' }} />
          {cam === 'on' && <div className="oval" />}
          {cam !== 'on' && (
            <div className="view-empty">
              <p>{cam === 'blocked' ? '카메라를 쓸 수 없어요. 브라우저에서 카메라 권한을 허용하거나, 사진을 골라 주세요.' : '얼굴이 타원 안에 들어오게 정면을 봐 주세요.'}</p>
              <button className="btn" onClick={start}>카메라 켜기</button>
            </div>
          )}
        </div>
        <div>
          <div className="actions left">
            <button className="btn" onClick={shoot} disabled={cam !== 'on' || busy}>{busy ? '검사하는 중…' : '사진 찍기'}</button>
            <label className="btn ghost file">사진 고르기
              <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && send(e.target.files[0])} />
            </label>
          </div>
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
              <h2 className="h3">{result.passed ? '품질 검사 통과' : '다시 찍어 주세요'}</h2>
              <p className="muted small">{result.message}</p>
              {result.checks.map((c) => (
                <div className="row" key={c.name}>
                  <div><b>{c.name}</b><p className="muted small">{c.detail}</p></div>
                  <span className={c.ok === null ? 'muted small' : c.ok ? 'done' : 'warn'}>{c.ok === null ? '준비 중' : c.ok ? '통과 ✓' : '확인 필요'}</span>
                </div>
              ))}
              <p className="muted small">{result.note}</p>
            </div>
          )}
          <p className="notice">지금은 밝기와 해상도만 확인해요. 고개 각도·표정 검사와 붉은기 측정은 준비 중이에요. 찍은 사진은 검사에만 쓰고 저장하지 않아요. <button className="link" onClick={() => onLegal('photo')}>사진 처리 안내</button></p>
        </div>
      </div>
    </section>
  )
}
