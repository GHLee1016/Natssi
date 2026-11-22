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
      <circle className="wi-sun" cx="12" cy="12" r="4" />
      <path className="wi-rays" d={RAYS(12, 12, 6.8, 9.2, [0, 45, 90, 135, 180, 225, 270, 315])} />
    </>
  ),
  '관찰 중': (  // 구름 조금
    <>
      <circle className="wi-sun" cx="8.500" cy="8.500" r="2.700" />
      <path className="wi-rays" d={RAYS(8.500, 8.500, 4.800, 6.400, [180, 225, 270, 315])} />
      <path className="wi-cloud" d="M9.500 19.500h8a3.250 3.250 0 0 0 .350-6.480 4.600 4.600 0 0 0-8.800 1.400A2.600 2.600 0 0 0 9.500 19.500z" />
    </>
  ),
  '신호 있음': (  // 흐림
    <>
      <path className="wi-cloud" d={CLOUD} />
      <path className="wi-cloud2" d="M17 7.200a3.700 3.700 0 0 0-6.600-1.300" />
    </>
  ),
  '구분 불가': (  // 안개
    <>
      <path className="wi-cloud" d="M7.500 13h9a3.250 3.250 0 0 0 .350-6.480A4.600 4.600 0 0 0 8 7.900 2.600 2.600 0 0 0 7.500 13z" />
      <path className="wi-fog1" d="M5 16.500h14" /><path className="wi-fog2" d="M7 20h10" />
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

// 날씨 카드 뒤에 까는 하늘. 그날 얼굴 날씨에 맞춰 카드 안에서만 아주 천천히 움직인다(글자 뒤, 누를 수 없음).
//   맑음: 햇살이 돌고 빛이 한 번씩 스친다 / 구름 조금: 구름이 해 앞을 오간다 / 흐림: 구름이 흘러간다 / 안개: 안개 띠가 흐른다
// 움직임은 styles.css의 sky-*. '움직임 줄이기' 설정이면 멈춘 그림으로 보인다. 큰 아이콘(hero-bg)의 부품(wi-*)도 여기서만 움직인다.
const SoftCloud = ({ n }) => (
  <i className={'sky-track sky-t' + n}><svg className="sky-c" viewBox="4 6 17 13.500"><path d={CLOUD} fill="currentColor" /></svg></i>
)
export function HeroSky({ level }) {
  const w = WEATHER[level]
  if (!w) return null
  return (
    <div className={'sky sky-' + w.cls} aria-hidden="true">
      {w.cls === 'ok' && <><i className="sky-glow" /><i className="sky-sweep" /></>}
      {w.cls === 'watch' && <><i className="sky-glow" /><SoftCloud n={1} /></>}
      {w.cls === 'signal' && <><i className="sky-veil" /><SoftCloud n={1} /><SoftCloud n={2} /><SoftCloud n={3} /></>}
      {w.cls === 'unknown' && <><i className="sky-fog sky-f1" /><i className="sky-fog sky-f2" /><i className="sky-fog sky-f3" /></>}
      <WeatherIcon level={level} size={220} className="hero-bg" />
    </div>
  )
}
