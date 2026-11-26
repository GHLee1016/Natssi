import { useEffect, useRef, useState } from 'react'
import { useBackDepth } from '../nav.js'
import { symptomLabel } from '../kv.jsx'

// 증상 체크인을 한 화면에 한 문항씩 묻는다. 진행 막대, 큰 질문, 라디오 목록, 이전/다음 버튼.
// 점수(0~3)와 저장 형식은 그대로다.
const STEPS = [
  ['따가움', '오늘 피부가 따가웠나요?'],
  ['화끈', '오늘 피부가 화끈거렸나요?'],
  ['가려움', '오늘 피부가 가려웠나요?'],
  ['당김', '오늘 피부가 당겼나요?'],
]
const OPTIONS = ['전혀 없었어요', '조금 있었어요', '꽤 있었어요', '심했어요']

export default function CheckinSteps({ initial, saving, error, onSave, onCancel }) {
  const [i, setI] = useState(0)
  useBackDepth(i, setI)                                   // 폰의 뒤로: 앞 문항으로
  const [v, setV] = useState({})                        // 이번에 고른 답. 비어 있으면 '다음'을 막는다
  const head = useRef(null)
  const root = useRef(null)
  const [name, q] = STEPS[i]
  const last = i === STEPS.length - 1
  const picked = v[name] ?? initial?.[name]

  useEffect(() => { head.current?.focus({ preventScroll: true }); root.current?.scrollIntoView({ block: 'nearest' }) }, [i])

  const next = () => {
    if (picked === undefined) return
    const all = { ...v, [name]: picked }
    setV(all)
    if (!last) return setI(i + 1)
    onSave(Object.fromEntries(STEPS.map(([k]) => [k, all[k] ?? initial?.[k] ?? 0])))
  }

  return (
    <div className="steps" ref={root}>
      <div className="step-bars" role="img" aria-label={`${STEPS.length}문항 중 ${i + 1}번째`}>
        {STEPS.map((s, n) => <i key={s[0]} className={n <= i ? 'on' : ''} />)}
      </div>
      <span className="step-chip" aria-hidden="true">{i + 1}</span>
      <h3 className="step-q" tabIndex={-1} ref={head}>{q}</h3>
      <div role="radiogroup" aria-labelledby={undefined} aria-label={symptomLabel(name)} className="opts">
        {OPTIONS.map((label, n) => (
          <label className={'opt' + (picked === n ? ' on' : '')} key={n}>
            <input type="radio" name={'sym-' + name} checked={picked === n} onChange={() => setV({ ...v, [name]: n })} />
            <span className="opt-dot" aria-hidden="true" />{label}
          </label>
        ))}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="step-actions">
        <button className="btn ghost" onClick={i ? () => setI(i - 1) : onCancel}>{i ? '이전' : '취소'}</button>
        <button className="btn" onClick={next} disabled={picked === undefined || saving}>{saving ? '저장하는 중…' : last ? '증상 기록 저장' : '다음'}</button>
      </div>
    </div>
  )
}
