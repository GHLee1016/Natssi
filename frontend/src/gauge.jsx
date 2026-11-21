// 붉은기 수치를 '내 평소 범위' 위의 점으로 보여준다. 숫자를 몰라도 범위 안인지 밖인지 바로 읽힌다.
export default function Gauge({ value, low, high, base }) {
  const span = Math.max(high - low, 0.1)
  const min = Math.min(low, value) - span * 0.35
  const max = Math.max(high, value) + span * 0.35
  const pct = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
  const state = value > high ? '평소 범위보다 높아요' : value < low ? '평소 범위보다 낮아요' : '평소 범위 안이에요'
  const sign = (v) => (v > 0 ? '+' : '') + v
  return (
    <div className="gauge">
      <div className="gauge-track" role="img" aria-label={`볼 붉은기 ${sign(value)}, 평소 범위 ${low}에서 ${high}, ${state}`}>
        <i className="gauge-band" style={{ left: pct(low) + '%', width: pct(high) - pct(low) + '%' }} />
        <b className="gauge-dot" style={{ left: pct(value) + '%' }} />
      </div>
      <p className="gauge-text"><b>볼 붉은기 {state}</b></p>
      <details className="gauge-more">
        <summary>숫자로 보기</summary>
        <p>오늘 {sign(value)} · 평소 범위 {sign(low)} ~ {sign(high)}</p>
        {base && <p>평소 범위는 처음 쓰던 루틴(버전 {base}) 기간의 기록으로 만들었어요. 루틴을 바꾼 뒤의 기록을 이 기준과 비교해요.</p>}
      </details>
    </div>
  )
}
