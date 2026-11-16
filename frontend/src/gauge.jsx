// 붉은기 수치를 '내 평소 범위' 위의 점으로 보여준다. 숫자를 몰라도 범위 안인지 밖인지 바로 읽힌다.
export default function Gauge({ value, low, high, base }) {
  const span = Math.max(high - low, 0.1)
  const min = Math.min(low, value) - span * 0.35
  const max = Math.max(high, value) + span * 0.35
  const pct = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
  const state = value > high ? '평소 범위보다 높아요' : value < low ? '평소 범위보다 낮아요' : '평소 범위 안이에요'
  const sign = (v) => (v > 0 ? '+' : '') + v
  return (
    <div className="gauge" role="img" aria-label={`볼 붉은기 ${sign(value)}, 평소 범위 ${low}에서 ${high}, ${state}`}>
      <div className="gauge-track" aria-hidden="true">
        <i className="gauge-band" style={{ left: pct(low) + '%', width: pct(high) - pct(low) + '%' }} />
        <b className="gauge-dot" style={{ left: pct(value) + '%' }} />
      </div>
      <p className="gauge-text"><b>볼 붉은기 {state}</b></p>
      <p className="gauge-sub">지금 {sign(value)} · 평소 {low} ~ {high}{base ? ` (버전 ${base} 기록 기준)` : ''}</p>
    </div>
  )
}
