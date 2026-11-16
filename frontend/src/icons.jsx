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
