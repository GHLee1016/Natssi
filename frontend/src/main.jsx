import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './install.jsx'   // 설치 창(beforeinstallprompt)을 놓치지 않게 먼저 불러 둔다

createRoot(document.getElementById('root')).render(<App />)

// 홈 화면 앱 설치용 최소 서비스 워커(저장 없음, public/sw.js). 배포본에서만 등록한다.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
