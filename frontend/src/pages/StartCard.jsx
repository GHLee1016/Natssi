// 김서연 데모를 다 본 사람이 이어서 내 기록을 시작할 수 있게 하는 안내 카드.
export default function StartCard({ onStart }) {
  return (
    <div className="card start">
      <div>
        <b>내 기록 시작하기</b>
        <p className="muted small">가입하면 오늘부터 내 얼굴과 증상을 기록해요. 사진 기록이 7일 쌓이면 내 평소 볼 색 범위가 생겨요.</p>
      </div>
      <button className="btn" onClick={onStart}>가입하고 시작</button>
    </div>
  )
}
