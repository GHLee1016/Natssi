import { useEffect, useRef } from 'react'

import { WeatherIcon, WEATHER } from '../weather.jsx'
const WEATHER_NAME = Object.fromEntries(Object.entries(WEATHER).map(([k, v]) => [k, v.name]))

// 로그인한 사람: 처음 7일부터 루틴을 바꿔 보기까지, 실제 탭과 버튼 이름으로 안내한다.
const MINE = [
  ['지금 쓰는 제품부터 등록해요', '쓰고 있는 제품을 모두 넣으면 첫 번째 루틴이 돼요. 전성분은 사진으로 찍거나 글자를 붙여 넣으면 성분 계열(레티노이드, 향료 등)을 정리해 줘요.',
    '루틴 탭 → 첫 제품 등록하기'],
  ['매일 셀카 한 장과 증상 네 가지를 남겨요', '밝은 곳에서 정면을 보고 얼굴을 타원에 맞추면 자동으로 찍혀요. 이어서 따가움, 화끈, 가려움, 당김을 0~3점으로 고르면 끝이에요. 1분이면 돼요.',
    '기록 탭(폰은 아래 가운데 카메라 버튼)'],
  ['첫 7일은 내 평소를 만드는 기간이에요', '다이어리 맨 위 \'오늘의 기록\'에서 볼 붉은기 숫자와 전날과의 차이를 볼 수 있어요. 사진 기록이 7일 모이면 그다음 날부터 얼굴 날씨를 알려 드려요.',
    '다이어리 탭'],
  ['얼굴 날씨는 이렇게 읽어요', null, null, 'weather'],
  ['루틴은 한 번에 하나만 바꿔요', '새 제품은 \'제품 추가\', 덜 쓰면 \'빈도 바꾸기\', 그만 쓰면 \'사용 중단\'을 눌러요. 바꾼 날이 기록돼서 그 뒤 붉은기가 달라졌는지 비교할 수 있어요. 한 가지만 바꿔야 무엇과 시기가 겹쳤는지 알 수 있어요.',
    '루틴 탭'],
  ['쌓인 기록으로 돌아봐요', '변화 탭의 4주 그래프에서 점선이 루틴을 바꾼 날이에요. 두 날을 겹쳐 비교하거나 흐린 날만 모아 볼 수 있어요. 리포트 탭은 기록을 근거로 쓴 문장과 질문을, 다이어리의 Recap은 한 달을 카드로 보여 줘요.',
    '변화 탭, 리포트 탭, 다이어리 → Recap'],
]
// 로그인 전: 가상 인물의 4주 예시에서 무엇을 보면 되는지 안내한다.
const DEMO = [
  ['다이어리에서 4주 이야기를 따라가 보세요', '레티놀 세럼을 추가한 뒤 흐린 날이 이어졌다가, 쓰는 횟수를 줄인 뒤 다시 맑아진 기록이에요. 주간, 월간을 바꾸거나 날짜를 누르면 그날 기록이 보여요.',
    '다이어리 탭'],
  ['변화 탭에서 시기가 겹쳤는지 봐요', '그래프의 점선이 루틴을 바꾼 날이에요. 점선 뒤에 붉은기가 평소 범위 위로 올랐는지 볼 수 있어요. 두 날 비교하기, 흐린 날 살펴보기도 눌러 보세요.',
    '변화 탭'],
  ['리포트에서 근거가 붙은 문장을 읽어요', '문장마다 어느 날 기록을 보고 썼는지 근거가 붙어 있어요. 아래 질문을 누르면 이어서 답해 줘요.',
    '리포트 탭'],
  ['내 얼굴로 촬영해 볼 수도 있어요', '로그인하지 않아도 사진 품질 검사와 볼 붉은기를 볼 수 있어요(저장은 하지 않아요). 사진은 폰 안에서만 분석해요. PC에서는 기록 탭의 QR로 폰에서 열어요.',
    '기록 탭(폰은 아래 가운데 카메라 버튼)'],
  ['얼굴 날씨는 이렇게 읽어요', null, null, 'weather'],
]
const LEGEND = [
  ['신호 없음', '평소 범위 안이에요'],
  ['관찰 중', '평소 범위 가장자리예요'],
  ['신호 있음', '평소보다 붉어요'],
  ['구분 불가', '조명이 달라 판정을 미룬 날이에요'],
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
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onClick={onClose}>
      <div className="welcome-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">낯씨 사용법</p>
        <h2 id="welcome-title">{mine ? '이렇게 쓰면 돼요' : '4주 예시를 둘러보세요'}</h2>
        {!mine && <p className="muted small welcome-note">지금 보이는 화면은 김서연(가상 인물)의 예시 기록이에요. 가입하면 내 기록으로 바뀌어요.</p>}
        <ol>
          {(mine ? MINE : DEMO).map(([title, body, where, kind], i) => (
            <li key={title}><i aria-hidden="true">{i + 1}</i><div>
              <b>{title}</b>
              {kind === 'weather' ? (
                <ul className="welcome-legend">
                  {LEGEND.map(([lv, t]) => <li key={lv}><WeatherIcon level={lv} size={20} /><span><b>{WEATHER_NAME[lv]}</b> {t}</span></li>)}
                </ul>
              ) : <p className="muted small">{body}</p>}
              {where && <span className="welcome-where">{where}</span>}
            </div></li>
          ))}
        </ol>
        <div className="welcome-tips muted small">
          {mine && <p>같은 폰으로, 같은 장소와 시간대에 찍어야 날마다 비교가 정확해요. 사는 구를 고르면 미세먼지, 습도, 기온도 함께 보여요(내 계정).</p>}
          <p>얼굴 날씨는 내 평소와 비교한 결과예요. 진단이 아니에요. 따가움이 계속되면 사용을 멈추고 전문의와 상담해 주세요.</p>
          <p>이 안내는 위쪽 사용법(?) 버튼으로 언제든 다시 볼 수 있어요.</p>
        </div>
        <div className="actions">
          {mine ? (
            <>
              <button className="btn ghost" onClick={onClose}>닫기</button>
              <button className="btn" onClick={onRecord} autoFocus>오늘 기록하기</button>
            </>
          ) : (
            <>
              {onStart && <button className="btn ghost" onClick={onStart}>내 기록 시작하기</button>}
              <button className="btn" onClick={onExplore} autoFocus>예시 둘러보기</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
