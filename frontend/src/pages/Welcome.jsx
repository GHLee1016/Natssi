import { useEffect, useRef, useState } from 'react'

import { WeatherIcon, WEATHER } from '../weather.jsx'
const WEATHER_NAME = Object.fromEntries(Object.entries(WEATHER).map(([k, v]) => [k, v.name]))

// 로그인한 사람: 처음 7일부터 루틴을 바꿔 보기까지, 실제 탭과 버튼 이름으로 안내한다.
const MINE = [
  ['지금 쓰는 제품부터 등록해요', '사용 중인 제품을 등록하면 첫 번째 루틴이 만들어져요. 성분표를 찍거나 성분 목록을 붙여 넣으면 성분 종류(레티노이드, 향료 등)를 정리해 줘요.',
    '내 루틴 → 첫 제품 등록하기'],
  ['매일 사진과 피부 증상을 기록해요', '밝은 곳에서 얼굴을 화면의 타원에 맞추면 자동으로 촬영돼요. 따가움, 화끈거림, 가려움, 당김도 함께 기록해 주세요.',
    '기록 탭(모바일은 하단 카메라 버튼)'],
  ['첫 7일은 붉은기 범위를 만드는 기간이에요', '다이어리에서 오늘의 붉은기와 이전 기록의 차이를 확인할 수 있어요. 사진 기록이 7일 쌓이면 다음 사진부터 얼굴 날씨를 확인할 수 있어요.',
    '다이어리 탭'],
  ['얼굴 날씨는 이렇게 확인해요', null, null, 'weather'],
  ['루틴은 한 번에 하나만 바꿔요', '‘제품 추가’, ‘사용 횟수 변경’, ‘사용 중단’으로 루틴을 기록해요. 한 번에 하나씩 바꾸면 변경 전후의 붉은기 변화를 비교하기 쉬워요.',
    '내 루틴'],
  ['피부 변화를 확인해요', '변화 탭에서 루틴 변경 전후의 붉은기를 비교할 수 있어요. 피부 리포트에서는 기록을 요약해서 볼 수 있고, Monthly Skin Recap에서는 한 달간의 피부 기록을 돌아볼 수 있어요.',
    '변화, 피부 리포트, 다이어리 → Monthly Skin Recap'],
]
// 로그인 전: 가상 인물의 4주 예시에서 무엇을 보면 되는지 안내한다.
const DEMO = [
  ['4주간의 피부 기록을 살펴보세요', '레티놀 세럼을 추가한 뒤 흐린 날이 이어지고, 사용 횟수를 줄인 뒤 맑은 날이 나타난 예시예요. 달력에서 날짜별 기록을 확인해 보세요.',
    '다이어리 탭'],
  ['루틴 변경 전후의 피부 변화를 확인해요', '그래프의 점선은 루틴을 바꾼 날짜예요. 변경 전후의 붉은기를 확인하고, ‘날짜별 비교’와 ‘흐린 날 보기’도 이용해 보세요.',
    '변화 탭'],
  ['피부 리포트에서 기록을 확인해요', '리포트의 각 문장에서 참고한 날짜와 기록을 확인할 수 있어요. 아래 질문을 선택하면 자세한 설명을 볼 수 있어요.',
    '피부 리포트'],
  ['로그인 없이 피부 기록을 체험해 보세요', '로그인 없이 촬영 상태와 볼 붉은기를 확인할 수 있어요. 체험 결과는 저장하지 않아요. PC에서는 기록 탭의 QR 코드를 스마트폰으로 스캔해 주세요.',
    '기록 탭(모바일은 하단 카메라 버튼)'],
  ['얼굴 날씨는 이렇게 확인해요', null, null, 'weather'],
]
const LEGEND = [
  ['신호 없음', '평소와 비슷한 붉은기예요.'],
  ['관찰 중', '붉은기나 피부 증상을 조금 더 살펴봐 주세요.'],
  ['신호 있음', '평소보다 붉은기가 높아요.'],
  ['구분 불가', '사진 조건이나 기록 부족 등으로 평소와 비교하기 어려워요.'],
]

// 사용법 시트. 처음 들어온 사람에게 한 번 보여 주고, 위쪽 '?' 버튼으로 다시 연다.
// 로그인 전(mine=false)에는 지금 화면이 가상 예시라는 점을 알리고, '예시 둘러보기'로 예시 다이어리 첫 화면에 데려간다.
// 로그인한 사람(mine)에게는 예시 안내 대신 '오늘 기록하기'를 보여 준다.
export default function Welcome({ onClose, onStart, onExplore, onRecord, mine = false }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const opener = useRef(document.activeElement)       // 열기 전에 포커스가 있던 곳(자동 포커스보다 먼저 읽는다)
  useEffect(() => {
    const app = document.querySelector('.shell')
    app?.setAttribute('inert', '')                      // 시트가 열린 동안 뒤 화면은 키보드·스크린리더에서 제외
    const h = (e) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('keydown', h)
      app?.removeAttribute('inert')
      opener.current?.focus?.()
    }
  }, [])
  // 한 화면에 단계 하나. 다음/이전 버튼, 좌우로 밀기, 키보드 화살표로 넘긴다. 마지막 장에 요령과 시작 버튼을 둔다.
  const steps = mine ? MINE : DEMO
  const [i, setI] = useState(0)
  const last = i === steps.length - 1
  const go = (n) => setI((x) => Math.max(0, Math.min(steps.length - 1, x + n)))
  const touch = useRef(null)
  const nextRef = useRef(null)
  useEffect(() => {
    const k = (e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  useEffect(() => { nextRef.current?.focus({ preventScroll: true }) }, [i])
  const [title, body, where, kind] = steps[i]
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={onClose}>
      <div className="welcome-sheet paged" onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
        onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? e.changedTouches[0].clientX); if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touch.current = null }}>
        <div className="welcome-top">
          <p className="eyebrow">{mine ? '낯씨 사용법' : '4주간의 피부 기록 둘러보기'}</p>
          <span className="welcome-count" aria-hidden="true">{i + 1} / {steps.length}</span>
        </div>
        <div className="welcome-dots" role="img" aria-label={`${steps.length}단계 중 ${i + 1}단계`}>
          {steps.map((_, n) => <i key={n} className={n === i ? 'on' : n < i ? 'done' : ''} />)}
        </div>
        <div className="welcome-page" key={i} aria-live="polite">
          <span className="welcome-num" aria-hidden="true">{i + 1}</span>
          <h2 id="welcome-title">{title}</h2>
          {i === 0 && !mine && <p className="muted small welcome-note">현재 화면은 가상 인물 김서연의 예시 기록이에요. 가입하면 내 피부를 기록할 수 있어요.</p>}
          {kind === 'weather' ? (
            <ul className="welcome-legend">
              {LEGEND.map(([lv, t]) => <li key={lv}><WeatherIcon level={lv} size={22} /><span><b>{WEATHER_NAME[lv]}</b> {t}</span></li>)}
            </ul>
          ) : <p className="welcome-body">{body}</p>}
          {where && <span className="welcome-where">{where}</span>}
          {last && (
            <div className="welcome-tips muted small">
              {mine && <p>같은 스마트폰으로 비슷한 장소와 시간대에 찍으면 비교하기 쉬워요. 내 계정에서 지역을 선택하면 초미세먼지, 습도, 기온도 볼 수 있어요.</p>}
              <p>얼굴 날씨는 평소 붉은기와 비교한 참고 정보예요. 피부 증상이 계속되면 해당 제품 사용을 중단하고 피부과 전문의와 상담해 주세요.</p>
              <p>상단의 사용법(?)에서 이 안내를 다시 확인할 수 있어요.</p>
            </div>
          )}
        </div>
        <div className="actions">
          {i > 0
            ? <button className="btn ghost" onClick={() => go(-1)}>이전</button>
            : <button className="btn ghost" onClick={mine ? onClose : onExplore}>건너뛰기</button>}
          {!last ? <button className="btn" ref={nextRef} onClick={() => go(1)}>다음</button>
            : mine ? <><button className="btn ghost" onClick={onClose}>닫기</button><button className="btn" ref={nextRef} onClick={onRecord}>오늘의 피부 기록하기</button></>
              : (
                <>
                  {onStart && <button className="btn ghost" onClick={onStart}>내 기록 시작하기</button>}
                  <button className="btn" ref={nextRef} onClick={onExplore}>예시 둘러보기</button>
                </>
              )}
        </div>
      </div>
    </div>
  )
}
