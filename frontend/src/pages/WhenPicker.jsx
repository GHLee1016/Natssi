// 루틴을 바꾼 날 고르기. 기본은 오늘이고, '어제'와 날짜 칸으로 지난 날을 고를 수 있다(min~max 안에서만).
// 제품을 바꾼 날 바로 기록하지 못했을 때를 위해서. 범위 확인은 서버(routine.change_day)가 다시 한다.
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`

export default function WhenPicker({ label, value, onChange, min, max, id }) {
  if (!max) return null
  const yday = addDays(max, -1)
  const v = value || max
  return (
    <div className="when" role="group" aria-labelledby={id + '-l'}>
      <p className="muted small" id={id + '-l'}>{label}</p>
      <div className="when-row">
        <button type="button" className={v === max ? 'on' : ''} aria-pressed={v === max} onClick={() => onChange(max)}>오늘</button>
        {(!min || yday >= min) && <button type="button" className={v === yday ? 'on' : ''} aria-pressed={v === yday} onClick={() => onChange(yday)}>어제</button>}
        <input type="date" id={id} value={v} min={min} max={max} aria-label={label}
          onChange={(e) => e.target.value && onChange(e.target.value)} />
      </div>
      {v !== max && <small className="muted">{md(v)}에 바꾼 것으로 남겨요. 그날 이후 기록부터 이 루틴으로 비교해요.</small>}
    </div>
  )
}
