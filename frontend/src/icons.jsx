// 목록 줄 앞에 쓰는 작은 선 아이콘. 빈 사각형 대신 무엇에 대한 줄인지 보여준다.
const PATHS = {
  check: 'M9 4h6v3H9zM7 5.500H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6.500a1 1 0 0 0-1-1h-1M8.500 13l2.200 2.200L15.500 11',
  routine: 'M9 3h6v3H9zM7.500 6h9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM6.500 12h11',
  camera: 'M4 8h3l1.500-2.500h7L17 8h3v11H4zM12 10.500a3.250 3.250 0 1 0 0 6.500 3.250 3.250 0 0 0 0-6.500z',
}

export function RowIcon({ name }) {
  return (
    <i className="thumb plain ico-row" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.700"
        strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[name]} /></svg>
    </i>
  )
}

// 루틴 화면의 제품 아이콘. 특정 브랜드나 실제 제품 사진 대신 종류만 보여주는 선 그림이다(중립 원칙).
const PRODUCT = {
  cleanser: (  // 펌프 병
    <>
      <path d="M13 5h5l2.500 2M16 5v3" />
      <path d="M14 8h4v3h-4z" />
      <path d="M10 11h12v14a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z" />
      <path d="M13 17h6M13 21h4" />
    </>
  ),
  retinol: (  // 스포이트 병
    <>
      <path d="M14.500 3h3a1 1 0 0 1 1 1v4h-5V4a1 1 0 0 1 1-1z" />
      <path d="M12.500 8h7v2h-7z" />
      <path d="M11 10h10v15a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2z" />
      <path d="M16 15c1.600 2 2.500 3.100 2.500 4.300a2.500 2.500 0 0 1-5 0c0-1.200.9-2.300 2.500-4.300z" />
    </>
  ),
  cream: (  // 크림 단지
    <>
      <path d="M8 9h16v4H8z" />
      <path d="M9 13h14v11a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3z" />
      <path d="M13 19.500h6" />
    </>
  ),
  sun: (  // 선크림 튜브 + 해
    <>
      <path d="M12 4h8v3h-8z" />
      <path d="M10 7h12l-1.500 20h-9z" />
      <circle cx="16" cy="16.500" r="2.200" />
      <path d="M16 11.800v.9M16 20.300v.9M11.800 16.500h.9M19.300 16.500h.9" />
    </>
  ),
  led: (  // LED 디바이스
    <>
      <rect x="6" y="11" width="20" height="14" rx="5" />
      <circle cx="12" cy="18" r="1.300" /><circle cx="16" cy="18" r="1.300" /><circle cx="20" cy="18" r="1.300" />
      <path d="M12 6.500l-1 2M16 5.500v2.500M20 6.500l1 2" />
    </>
  ),
}

export function ProductIcon({ name, tone }) {
  return (
    <i className="prod-ico" style={{ background: tone }} aria-hidden="true">
      <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.600"
        strokeLinecap="round" strokeLinejoin="round">{PRODUCT[name]}</svg>
    </i>
  )
}
