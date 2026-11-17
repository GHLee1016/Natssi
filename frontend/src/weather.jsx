// 판정 단계를 '얼굴 날씨'로 보여주는 이름과 아이콘. 판정 값(신호 없음 등)은 그대로 두고 화면 표시만 바꾼다.
export const WEATHER = {
  '신호 없음': { name: '맑음', cls: 'ok' },
  '관찰 중': { name: '구름 조금', cls: 'watch' },
  '신호 있음': { name: '흐림', cls: 'signal' },
  '구분 불가': { name: '안개', cls: 'unknown' },
}

const CLOUD = 'M7.500 19h9a3.750 3.750 0 0 0 .400-7.480 5.250 5.250 0 0 0-10.100 1.600A3 3 0 0 0 7.500 19z'
const RAYS = (cx, cy, r1, r2, angles) => angles.map((a) => {
  const t = (a * Math.PI) / 180
  return `M${(cx + r1 * Math.cos(t)).toFixed(2)} ${(cy + r1 * Math.sin(t)).toFixed(2)}L${(cx + r2 * Math.cos(t)).toFixed(2)} ${(cy + r2 * Math.sin(t)).toFixed(2)}`
}).join('')

const PICTURE = {
  '신호 없음': (  // 맑음
    <>
      <circle cx="12" cy="12" r="4" />
      <path d={RAYS(12, 12, 6.8, 9.2, [0, 45, 90, 135, 180, 225, 270, 315])} />
    </>
  ),
  '관찰 중': (  // 구름 조금
    <>
      <circle cx="8.500" cy="8.500" r="2.700" />
      <path d={RAYS(8.500, 8.500, 4.800, 6.400, [180, 225, 270, 315])} />
      <path d="M9.500 19.500h8a3.250 3.250 0 0 0 .350-6.480 4.600 4.600 0 0 0-8.800 1.400A2.600 2.600 0 0 0 9.500 19.500z" />
    </>
  ),
  '신호 있음': (  // 흐림
    <>
      <path d={CLOUD} />
      <path d="M17 7.200a3.700 3.700 0 0 0-6.600-1.300" />
    </>
  ),
  '구분 불가': (  // 안개
    <>
      <path d="M7.500 13h9a3.250 3.250 0 0 0 .350-6.480A4.600 4.600 0 0 0 8 7.900 2.600 2.600 0 0 0 7.500 13z" />
      <path d="M5 16.500h14M7 20h10" />
    </>
  ),
}

export function WeatherIcon({ level, size = 24, className = '' }) {
  const w = WEATHER[level]
  if (!w) return null
  return (
    <svg className={'wi ' + w.cls + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PICTURE[level]}</svg>
  )
}
