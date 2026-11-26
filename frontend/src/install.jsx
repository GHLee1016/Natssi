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
const samsung = () => /SamsungBrowser/i.test(navigator.userAgent)
const android = () => /android/i.test(navigator.userAgent)

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
        <p className="muted small">{deferred ? '홈 화면에서 낯씨를 바로 열어 피부를 기록할 수 있어요.'
          : ios() ? '사파리 아래쪽 공유 버튼(□↑)을 누르고 ‘홈 화면에 추가’를 고르면 앱처럼 열려요.'
            : samsung() ? '아래쪽 메뉴(≡)를 누르고 ‘현재 페이지 추가’ → ‘홈 화면’을 고르면 앱처럼 열려요.'
              : android() ? '오른쪽 위 메뉴(⋮)를 누르고 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 고르면 앱처럼 열려요.'
                : '브라우저 메뉴에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 고르면 다음부터 바로 열려요.'}</p>
        <div className="actions left">
          {deferred && <button className="btn" onClick={install}>홈 화면에 추가</button>}
          <button className="btn ghost" onClick={close}>{deferred ? '나중에' : '닫기'}</button>
        </div>
      </div>
    </div>
  )
}

// 카카오톡·인스타그램·네이버 등 '앱 속 브라우저'로 열면 카메라와 홈 화면 추가가 잘 안 된다. 맨 위에 기본 브라우저로 열기를 안내한다.
const INAPP = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|everytimeApp|DaumApps/i
export function InAppBanner() {
  const [hide, setHide] = useState(() => { try { return sessionStorage.getItem('natssi.inapp') === 'closed' } catch { return false } })
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (hide || !INAPP.test(ua)) return null
  const kakao = /KAKAOTALK/i.test(ua)
  const url = window.location.href
  const close = () => { try { sessionStorage.setItem('natssi.inapp', 'closed') } catch { /* 무시 */ } setHide(true) }
  return (
    <div className="inapp-banner" role="note">
      <p><b>{kakao ? '카카오톡' : '앱'} 내 브라우저에서는 카메라나 홈 화면 추가 기능이 작동하지 않을 수 있어요.</b> 기본 브라우저로 열어 주세요.{' '}
        {android() ? '' : ios() ? (kakao ? '오른쪽 아래 공유(⋯) → ‘Safari로 열기’를 눌러 주세요.' : '메뉴에서 ‘Safari로 열기’를 눌러 주세요.') : ''}</p>
      <div className="actions left">
        {android() && kakao && <a className="btn" href={'kakaotalk://web/openExternal?url=' + encodeURIComponent(url)}>기본 브라우저로 열기</a>}
        {android() && !kakao && <a className="btn" href={'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end'}>크롬으로 열기</a>}
        <button className="btn ghost" onClick={close}>닫기</button>
      </div>
    </div>
  )
}
