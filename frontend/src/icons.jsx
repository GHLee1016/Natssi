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
  tube: (  // 튜브
    <>
      <path d="M12 3h8v3h-8z" />
      <path d="M10.500 6h11l-1.500 21h-8z" />
      <path d="M13.500 12h5M14 16h4" />
    </>
  ),
  mist: (  // 미스트(스프레이)
    <>
      <path d="M14 5h4v4h-4z" />
      <path d="M18 6.500h2.500" />
      <path d="M22.500 5l1.500-1M23 6.500h2M22.500 8l1.500 1" />
      <path d="M12 9h8v2.500a2 2 0 0 0 1 1.700v11.800a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V13.200a2 2 0 0 0 1-1.700z" />
      <path d="M13.500 18h5" />
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

// 제품 사진 대신 고를 수 있는 모양(서버 routine.ICONS와 같은 키). 고르지 않으면(자동) 성분 계열로 정한다
export const ICON_CHOICES = [['cleanser', '펌프 병'], ['retinol', '스포이트 병'], ['cream', '크림 단지'], ['tube', '튜브'], ['mist', '미스트'], ['sun', '선크림']]
