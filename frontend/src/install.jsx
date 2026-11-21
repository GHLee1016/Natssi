import { useEffect, useState } from 'react'

// '홈 화면에 추가' 안내. 안드로이드·크롬은 브라우저가 주는 설치 창을 버튼으로 띄우고, 아이폰 사파리는 방법을 글로 알려 준다.
// beforeinstallprompt 는 페이지가 뜨자마자 한 번만 오므로 모듈이 불릴 때 바로 받아 둔다(main.jsx에서 import).
let deferred = null
const subs = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f()) })
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()) })
}

const KEY = 'natssi.installHint'
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function InstallHint() {
  const [, tick] = useState(0)
  const [hidden, setHidden] = useState(() => { try { return standalone() || localStorage.getItem(KEY) === 'closed' } catch { return standalone() } })
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => subs.delete(f) }, [])
  if (hidden) return null
  const close = () => { try { localStorage.setItem(KEY, 'closed') } catch { /* 무시 */ } setHidden(true) }
  const install = async () => { const e = deferred; if (!e) return; e.prompt(); const r = await e.userChoice; deferred = null; if (r.outcome === 'accepted') close(); else tick((n) => n + 1) }
  return (
    <div className="card install-hint" role="region" aria-label="홈 화면에 추가">
      <img src="/icon-192.png" alt="" width="44" height="44" />
      <div>
        <b>홈 화면에 낯씨를 추가해 두세요</b>
        <p className="muted small">{deferred ? '앱처럼 아이콘을 눌러 매일 바로 기록할 수 있어요.'
          : ios() ? '사파리 아래쪽 공유 버튼(□↑)을 누르고 ‘홈 화면에 추가’를 고르면 앱처럼 열려요.'
            : '브라우저 메뉴에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 고르면 매일 바로 열 수 있어요.'}</p>
        <div className="actions left">
          {deferred && <button className="btn" onClick={install}>홈 화면에 추가</button>}
          <button className="btn ghost" onClick={close}>{deferred ? '나중에' : '닫기'}</button>
        </div>
      </div>
    </div>
  )
}
