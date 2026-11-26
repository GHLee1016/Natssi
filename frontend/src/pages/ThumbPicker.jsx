// 제품 섬네일 고르기: 제품 등록(AddProduct)과 루틴 목록(MyRoutine)이 함께 쓴다.
// 사진 등록은 capture 없이 파일 입력을 열어, 폰이 OS 기본 창(사진 찍기, 사진첩, 파일)을 띄우게 한다.
// 아이콘은 OS 창에 넣을 수 없어 앱 안의 작은 판(바로 아래에 펼쳐짐)에서 고른다. '자동'은 성분 계열로 정한다.
import { useEffect, useRef, useState } from 'react'
import { productThumbnail } from '../ocr.js'
import { ProductIcon, ICON_CHOICES } from '../icons.jsx'

export default function ThumbPicker({ photo, icon, autoIcon = 'cream', onPhoto, onIcon, busy, onError }) {
  const [open, setOpen] = useState(false)
  const panel = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    panel.current?.querySelector('[aria-checked="true"]')?.focus()
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [open])
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    try { setOpen(false); await onPhoto(await productThumbnail(f)) } catch { onError?.('사진이 열리지 않아요. JPG나 PNG로 골라 주세요.') }
  }
  const choose = async (k) => { setOpen(false); await onIcon(k) }
  const name = icon && ICON_CHOICES.find(([k]) => k === icon)?.[1]
  return (
    <div className="thumb-picker">
      <div className="prod-photo-row">
        {photo ? <img className="prod-photo" src={photo} alt="고른 제품 사진" /> : <ProductIcon name={icon || autoIcon} tone="#e8f2f8" />}
        <div className="thumb-links">
          <span className="small">{photo ? '고른 사진' : name ? `${name} 아이콘` : '자동 아이콘(성분 보고 골라요)'}</span>
          <span className="thumb-acts">
            <label className={'link file' + (busy ? ' off' : '')}>사진 등록
              <input type="file" accept="image/*" disabled={busy} onChange={pick} />
            </label>
            <button type="button" className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={busy}>아이콘 고르기</button>
          </span>
        </div>
      </div>
      {open && (
        <div className="icon-panel" ref={panel}>
          <div className="icon-panel-head">
            <b id="icon-panel-t">아이콘</b>
            <button type="button" className="icon-panel-x" onClick={() => setOpen(false)} aria-label="아이콘 고르기 닫기">✕</button>
          </div>
          <div className="icon-grid" role="radiogroup" aria-labelledby="icon-panel-t">
            <button type="button" role="radio" aria-checked={!photo && !icon} className={!photo && !icon ? 'on' : ''} onClick={() => choose(null)}>
              <i className="icon-auto" aria-hidden="true">자동</i><span>성분 보고</span></button>
            {ICON_CHOICES.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={!photo && icon === k} className={!photo && icon === k ? 'on' : ''} onClick={() => choose(k)}>
                <ProductIcon name={k} tone="#f4f1ee" /><span>{label}</span></button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
