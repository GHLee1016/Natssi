import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

export default function Capture() {
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
    try { setResult(await api.capture(blob)) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const shoot = () => {
    const v = video.current, c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    c.toBlob((b) => b && send(b), 'image/jpeg', 0.92)
  }

  return (
    <section className="capture">
      <header className="page-head"><div><p className="eyebrow">같은 장소, 같은 조명에서</p><h1>오늘의 얼굴 날씨 찍기</h1></div></header>
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
          {error && <p className="err" role="alert">{error}</p>}
          {result && (
            <div className="card">
              <h3>{result.passed ? '품질 검사 통과' : '다시 찍어 주세요'}</h3>
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
          <p className="notice">지금은 밝기와 해상도만 확인해요. 고개 각도·표정 검사와 붉은기 측정은 준비 중이에요. 찍은 사진은 검사에만 쓰고 저장하지 않아요.</p>
        </div>
      </div>
    </section>
  )
}
