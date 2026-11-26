// 김서연 데모를 다 본 사람이 이어서 내 기록을 시작할 수 있게 하는 안내 카드.
export default function StartCard({ onStart }) {
  return (
    <div className="card start">
      <div>
        <b>내 기록 시작하기</b>
        <p className="muted small">가입하면 오늘부터 내 증상 기록을 남기고, 기록이 7일 쌓이면 내 평소 범위를 만들어 드려요.</p>
      </div>
      <button className="btn" onClick={onStart}>가입하고 시작</button>
    </div>
  )
}
