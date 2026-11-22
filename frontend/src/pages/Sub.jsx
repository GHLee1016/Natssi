// 탭 안의 보기 전환. 페이지 제목 바로 아래 탭 버튼으로 핵심 화면과 세부 화면을 오간다(스크롤을 줄이려고 나눔).
// sub가 null이면 첫 보기(핵심), 아니면 세부 보기 id.
import { useState } from 'react'

export function useSub() {
  const [sub, setSub] = useState(null)
  return [sub, (id) => setSub(id), () => setSub(null)]
}

// 보기 탭. items: [{ id(null = 첫 보기), label }]. 화살표 키로도 옮길 수 있다.
export function ViewTabs({ items, value, onChange, label = '보기' }) {
  const list = items.filter(Boolean)
  const move = (e, i) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = list[(i + d + list.length) % list.length]
    onChange(next.id)
    requestAnimationFrame(() => document.getElementById('vt-' + (next.id || 'main'))?.focus())
  }
  return (
    <div className="view-tabs" role="tablist" aria-label={label}>
      {list.map((it, i) => {
        const on = (value || null) === it.id
        return (
          <button key={it.id || 'main'} id={'vt-' + (it.id || 'main')} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
            className={on ? 'on' : ''} onClick={() => onChange(it.id)} onKeyDown={(e) => move(e, i)}>{it.label}</button>
        )
      })}
    </div>
  )
}

// 세부 보기 화면: 같은 머리(제목)와 보기 탭 아래에 내용만 바꿔 보여 준다.
export function SubPage({ head, tabs, children }) {
  return <section>{head}{tabs}<div role="tabpanel">{children}</div></section>
}

// 버튼 줄: 첫 화면 위에 두고, 누르면 그 이름을 제목으로 한 세부 화면이 열린다.
// 열린 버튼을 다시 누르거나 ✕를 누르면 첫 화면으로 돌아온다. items: [{ id, icon(svg 경로), label }]
export function AskButtons({ items, value, onChange, label = '더 알아보기' }) {
  const list = items.filter(Boolean)
  return (
    <div className="ask-row" role="group" aria-label={label}>
      {list.map((it) => {
        const on = value === it.id
        return (
          <button key={it.id} type="button" className={'ask-btn' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onChange(on ? null : it.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={it.icon} /></svg>
            <span>{it.label}</span>
            {on && <i className="ask-x" aria-hidden="true">✕</i>}
          </button>
        )
      })}
    </div>
  )
}

// 세부 화면의 머리: 버튼 이름이 제목, 그 아래 설명 한 줄, 오른쪽에 닫기
export function AskHead({ title, desc, onClose }) {
  return (
    <div className="ask-head">
      <div><h2>{title}</h2>{desc && <p className="muted small">{desc}</p>}</div>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="닫고 돌아가기">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  )
}

export const ICONS = {
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3.500a1.500 1.500 0 1 0 0 3 1.500 1.500 0 0 0 0-3z',
  range: 'M4 12h16M7 8v8M17 8v8M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3',
  spark: 'M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800zM18.500 15.500l.8 2.200 2.200.8-2.200.8-.8 2.200-.8-2.200-2.200-.8 2.200-.8z',
  compare: 'M7 7h11l-3-3M17 17H6l3 3',
  cloud: 'M7.500 18h9a3.750 3.750 0 0 0 .400-7.480 5.250 5.250 0 0 0-10.100 1.600A3 3 0 0 0 7.500 18z',
}
