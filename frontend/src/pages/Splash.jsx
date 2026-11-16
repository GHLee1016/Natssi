import { useSlow } from '../useLoad.jsx'

// 앱 정보를 처음 받아오는 동안의 로고 화면. 0.3초 안에 끝나면 보이지 않는다.
// 서버가 잠들어 있다가 깨는 첫 접속은 몇 초 걸릴 수 있어서, 4초가 넘으면 안내를 덧붙인다.
export default function Splash() {
  const show = useSlow(true, 300)
  const long = useSlow(true, 4000)
  if (!show) return null
  return (
    <div className="splash" role="status" aria-live="polite">
      <img src="/logo.svg" alt="" />
      <b>낯씨</b>
      <p>얼굴 날씨를 불러오는 중이에요</p>
      {long && <p className="muted small">처음 접속하면 조금 더 걸릴 수 있어요</p>}
    </div>
  )
}
