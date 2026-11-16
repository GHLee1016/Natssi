import { useEffect, useRef } from 'react'

const STEPS = [
  ['루틴은 한 번에 하나만 바꿔요', '제품을 더하거나 바꿀 때 한 가지만 바꾸면, 무엇이 달라졌는지 알 수 있어요.'],
  ['매일 얼굴 날씨를 기록해요', '셀카와 증상(따가움·화끈·가려움·당김)을 하루 한 번 남겨요.'],
  ['안 맞는 신호를 날씨로 봐요', '내 평소 범위와 비교해 맑음·흐림처럼 보여 드려요. 진단이 아니에요.'],
]

// 처음 들어온 사람에게 한 번만 보여주는 사용법. 지금 화면이 가상 예시라는 점도 여기서 알린다.
export default function Welcome({ onClose, onStart }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const opener = useRef(document.activeElement)       // 열기 전에 포커스가 있던 곳(자동 포커스보다 먼저 읽는다)
  useEffect(() => {
    const app = document.querySelector('.shell')
    app?.setAttribute('inert', '')                      // 시트가 열린 동안 뒤 화면은 키보드·스크린리더에서 제외
    const h = (e) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('keydown', h)
      app?.removeAttribute('inert')
      opener.current?.focus?.()
    }
  }, [])
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={onClose}>
      <div className="welcome-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">낯씨 사용법</p>
        <h2 id="welcome-title">얼굴 날씨로 보는 루틴 일기</h2>
        <ol>
          {STEPS.map(([title, body], i) => (
            <li key={title}><i aria-hidden="true">{i + 1}</i><div><b>{title}</b><p className="muted small">{body}</p></div></li>
          ))}
        </ol>
        <p className="muted small">지금 보이는 화면은 김서연(가상 페르소나)의 4주치 예시예요.</p>
        <div className="actions">
          {onStart && <button className="btn ghost" onClick={onStart}>내 기록 시작하기</button>}
          <button className="btn" onClick={onClose} autoFocus>예시 둘러보기</button>
        </div>
      </div>
    </div>
  )
}
