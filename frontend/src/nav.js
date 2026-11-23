// 폰의 '뒤로'(안드로이드 뒤로 버튼, 아이폰 밀어서 뒤로). 앱은 화면 이동을 주소에 남기지 않으므로, 브라우저 기록에 칸을 직접 쌓는다.
//   guard: 앱 안에서 처음 무언가를 누를 때 한 칸. 뒤로가 이 칸을 지우면 오늘 다이어리로 온다(다이어리에서 한 번 더 누르면 나감).
//   창과 화면: 사용법 창, 로그인, 계정, 처리방침, 탭 안의 세부 화면(Recap, 두 날 비교 등), 제품 추가 단계, 카메라를 열 때마다 한 칸.
//   뒤로를 누르면 맨 위 칸의 back()을 불러 그 화면만 닫는다.
// 닫기 버튼으로 닫거나 화면이 사라지면 그 칸은 지우지 않고 '지난 칸'(dead)으로 표시해 두고, 뒤로가 지난 칸에 닿으면 한 번 더 뒤로 간다.
// (history.back()은 늦게 실행돼 바로 뒤의 pushState와 순서가 꼬일 수 있어서 칸을 직접 지우지 않는다.)
import { useEffect, useRef } from 'react'

const stack = []            // [{ id, guard, back, dead }]
let seq = 0
const cfg = { intro: false, home: () => {} }     // App이 매번 채운다: 소개 페이지 위인가, guard를 지웠을 때 할 일

export const setNav = (c) => Object.assign(cfg, c)
const live = () => stack.filter((x) => !x.dead)

export function pushEntry(back, guard = false) {
  const e = { id: ++seq, guard, back }
  stack.push(e); window.history.pushState({ natssi: e.id }, '', window.location.href)
  return e
}
export const ensureGuard = () => { if (!cfg.intro && !live().length) pushEntry(null, true) }
export const killAll = () => stack.forEach((x) => { x.dead = true })      // 로고로 다이어리에 옴: 쌓인 칸은 모두 지난 칸

function onPop(e) {
  const at = e.state?.natssi || 0
  if (at > (stack.at(-1)?.id || 0)) { window.history.back(); return }        // 앞으로 가기로 지난 칸에 들어옴: 되돌린다
  const popped = []
  while (stack.length && stack.at(-1).id > at) popped.push(stack.pop())
  const acts = popped.filter((x) => !x.dead)
  if (!acts.length) { if (popped.length) window.history.back(); return }       // 지난 칸만 지났음: 한 번 더 뒤로
  if (acts.some((x) => x.guard)) { killAll(); cfg.home(); return }
  acts.forEach((x) => x.back())
}
function onClick(e) {
  if (e.target.closest?.('[data-home]')) return
  if (e.target.closest?.('button, a, label, input, select, summary, [role=button], [role=tab]')) ensureGuard()
}
let wired = false
export function wireNav() {
  if (wired) return
  wired = true
  document.addEventListener('click', onClick, true)
  window.addEventListener('popstate', onPop)
}

// 화면 깊이(0 = 닫힘)를 뒤로와 묶는다. 깊이가 늘면 늘어난 만큼 칸을 쌓고, 줄면(닫기 버튼 등) 위 칸을 지난 칸으로.
// 뒤로를 누르면 setDepth(한 단계 아래)를 부른다. 화면이 사라지면(탭 이동, 다이어리 새로 그리기) 남은 칸은 지난 칸이 된다.
export function useBackDepth(depth, setDepth, opts = {}) {
  const mine = useRef([])
  const set = useRef(setDepth); set.current = setDepth
  const noGuard = useRef(opts.noGuard); noGuard.current = opts.noGuard
  useEffect(() => {
    const m = mine.current
    while (m.length > depth) m.pop().dead = true
    while (m.length < depth) {
      const level = m.length
      if (!noGuard.current) ensureGuard()
      const e = pushEntry(() => { mine.current.splice(level); set.current(level) })
      m.push(e)
    }
  }, [depth])
  useEffect(() => () => { mine.current.forEach((x) => { x.dead = true }); mine.current = [] }, [])
}
export const useBackLayer = (open, close, opts) => useBackDepth(open ? 1 : 0, () => close(), opts)
