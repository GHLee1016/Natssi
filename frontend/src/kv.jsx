// 이름표-값 묶음: '초미세먼지 23, 습도 40%'처럼 한 줄에 여러 값을 보여 줄 때.
// 가운데 점(·)으로 잇는 대신 이름표는 작고 흐리게, 값은 진하게 두어 크기와 색으로 위계를 준다.
// items: [[이름표, 값], ...] (값이 null/undefined/false면 그 칸은 뺀다)
export default function KV({ items, className = '' }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== false)
  if (!shown.length) return null
  return (
    <dl className={'kv ' + className}>
      {shown.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  )
}

// 증상 네 가지 → KV 항목
export const SYMPTOM_KEYS = ['따가움', '화끈', '가려움', '당김']
export const symptomItems = (s) => SYMPTOM_KEYS.map((k) => [k, s?.[k] ?? 0])
