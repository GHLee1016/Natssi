import KV from './kv.jsx'
// 붉은기 수치를 '내 평소 범위' 위의 점으로 보여준다. 숫자를 몰라도 범위 안인지 밖인지 바로 읽힌다.
export default function Gauge({ value, low, high, base }) {
  const span = Math.max(high - low, 0.1)
  const min = Math.min(low, value) - span * 0.35
  const max = Math.max(high, value) + span * 0.35
  const pct = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
  const state = value > high ? '평소보다 볼이 붉어요.' : value < low ? '평소보다 붉은기가 낮아요.' : '붉은기가 평소 범위 안에 있어요.'
  const sign = (v) => (v > 0 ? '+' : '') + v
  return (
    <div className="gauge">
      <div className="gauge-track" role="img" aria-label={`볼 붉은기 ${sign(value)}, 붉은기 범위 ${low}에서 ${high}. ${state}`}>
        <i className="gauge-band" style={{ left: pct(low) + '%', width: pct(high) - pct(low) + '%' }} />
        <b className="gauge-dot" style={{ left: pct(value) + '%' }} />
      </div>
      <p className="gauge-text"><b>{state}</b></p>
      <details className="gauge-more">
        <summary>측정값 보기</summary>
        <KV items={[['볼 붉은기', sign(value)], ['붉은기 범위', `${sign(low)} ~ ${sign(high)}`]]} />
        {base && <p>붉은기 범위는 {base === 1 ? '처음 등록한 루틴' : `${base}번째 루틴`}의 사진 기록을 바탕으로 만들었어요.</p>}
      </details>
    </div>
  )
}
