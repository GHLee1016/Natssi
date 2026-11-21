import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './install.jsx'   // 설치 창(beforeinstallprompt)을 놓치지 않게 먼저 불러 둔다

createRoot(document.getElementById('root')).render(<App />)
