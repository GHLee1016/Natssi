import { reportStore } from './reportStore.js'

const BASE = import.meta.env.VITE_API_BASE || ''
const KEY = 'natssi.session'

// 로그인 정보는 이 브라우저에만 보관합니다(저장소를 못 쓰는 환경이면 메모리만 사용).
let memory = null
export const session = {
  get() {
    if (memory) return memory
    try { memory = JSON.parse(localStorage.getItem(KEY)) } catch { /* 무시 */ }
    return memory
  },
  set(s) { reportStore.clear(); memory = s; try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* 무시 */ } },
  clear() { reportStore.clear(); memory = null; try { localStorage.removeItem(KEY) } catch { /* 무시 */ } },
}

async function raw(path, opts = {}, token) {
  const headers = { ...(opts.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(BASE + path, { ...opts, headers })
  } catch {
    throw new Error('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  }
  return res
}

async function fail(res) {
  let msg = '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
  try {
    const j = await res.json()
    if (typeof j.detail === 'string') msg = j.detail
    else if (res.status === 422) msg = '입력한 내용을 확인해 주세요.'
  } catch { /* 무시 */ }
  const e = new Error(msg)
  e.status = res.status
  return e
}

let refreshing = null
async function refresh() {
  const s = session.get()
  if (!s?.refresh_token) return null
  refreshing = refreshing || (async () => {
    const res = await raw('/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    })
    if (!res.ok) { session.clear(); window.dispatchEvent(new Event('natssi:logout')); return null }
    const next = await res.json()
    session.set(next)
    return next
  })().finally(() => { refreshing = null })
  return refreshing
}

async function req(path, opts) {
  let s = session.get()
  if (s && s.expires_at && s.expires_at * 1000 - Date.now() < 60000) s = (await refresh()) || null
  let res = await raw(path, opts, s?.access_token)
  if (res.status === 401 && s) {                 // 토큰이 만료됐으면 한 번만 갱신해서 다시 시도
    const next = await refresh()
    if (next) res = await raw(path, opts, next.access_token)
  }
  if (!res.ok) throw await fail(res)
  return res.json()
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const api = {
  meta: () => req('/api/meta'),
  day: (d) => req(`/api/day/${d}`),
  timeline: () => req('/api/timeline'),
  routine: () => req('/api/routine'),
  compare: (a, b) => req(`/api/compare?a=${a}&b=${b}`),
  report: () => req('/api/report'),
  answer: (id) => req(`/api/report/answer/${id}`),
  ask: (q) => req('/api/ask', json('POST', { q })),
  me: () => req('/api/me'),
  myTimeline: () => req('/api/me/timeline'),
  insights: (month) => req('/api/insights' + (month ? `?month=${month}` : '')),
  myInsights: (month) => req('/api/me/insights' + (month ? `?month=${month}` : '')),
  myCompare: (a, b) => req(`/api/me/compare?a=${a}&b=${b}`),
  myReport: () => req('/api/me/report'),
  myAnswer: (id) => req(`/api/me/report/answer/${id}`),
  myAsk: (q) => req('/api/me/ask', json('POST', { q })),
  myProfile: () => req('/api/me/profile'),
  saveProfile: (district) => req('/api/me/profile', json('PUT', { district: district || null })),
  myRoutine: () => req('/api/me/routine'),
  suggestIngredients: (q) => req(`/api/me/routine/suggest?q=${encodeURIComponent(q)}`),
  analyzeIngredients: (text) => req('/api/me/routine/analyze', json('POST', { text })),
  addRoutineItem: (body) => req('/api/me/routine/items', json('POST', body)),
  changeRoutineUsage: (key, usage, reason) => req(`/api/me/routine/items/${encodeURIComponent(key)}`, json('PATCH', { usage, reason: reason || null })),
  changeRoutineLook: (key, photo, icon) => req(`/api/me/routine/items/${encodeURIComponent(key)}/look`, json('PUT', { photo: photo || null, icon: icon || null })),
  removeRoutineItem: (key) => req(`/api/me/routine/items/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  checkin: async (body) => { const r = await req('/api/me/checkin', json('POST', body)); reportStore.clear(); return r },
  capture: (features) => req('/api/capture', json('POST', features)),   // 사진이 아니라 브라우저가 잰 숫자만 보냄
  consent: () => req('/api/account/consent', json('POST', { photo: true })),
  setOptional: async (key, on) => { const r = await req('/api/account/optional', json('POST', { key, on })); reportStore.clear(); return r },   // 선택 동의: cheeks | ai_report
  saveCheeks: (parts) => req('/api/me/cheeks', json('POST', parts)),
  myCheeks: (dates) => req(`/api/me/cheeks?dates=${dates.join(',')}`),
  signup: async (body) => { const r = await req('/api/auth/signup', json('POST', body)); if (r.access_token) session.set(r); return r },
  login: async (body) => { const r = await req('/api/auth/login', json('POST', body)); session.set(r); return r },
  recover: (body) => req('/api/auth/recover', json('POST', body)),
  resetPassword: (body) => req('/api/auth/reset', json('POST', body)),
  logout: () => session.clear(),
  exportMine: () => req('/api/account/export'),
  resetMine: async () => { const r = await req('/api/reset', { method: 'POST' }); reportStore.clear(); return r },
  deleteAccount: async () => { const r = await req('/api/account', { method: 'DELETE' }); session.clear(); return r },   // clear()가 리포트도 비운다
}

// 사진을 올리기 전에 줄입니다(서버 한도 안에 들어오고, 불필요하게 큰 원본이 오가지 않게).
export async function shrinkImage(file, maxSide = 1600) {
  if (!file.type?.startsWith('image/')) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close?.()
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9))
    return blob || file
  } catch {
    return file
  }
}

export const fmt = {
  md: (iso) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}` },
  full: (iso) => { const dt = new Date(iso + 'T00:00:00'); return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${'일월화수목금토'[dt.getDay()]})` },
  // 저장된 값의 가운데 점(·)을 화면에서만 쉼표로: '아침·저녁' → '아침, 저녁'. 값 자체(서버 검사·저장)는 그대로 둔다.
  plain: (t) => (t == null ? t : String(t).replace(/\s*·\s*/g, ', ')),
  shift: (iso, n) => { const dt = new Date(iso + 'T00:00:00'); dt.setDate(dt.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}` },
}

export const LEVEL_CLASS = { '신호 없음': 'ok', '관찰 중': 'watch', '신호 있음': 'signal', '구분 불가': 'unknown' }

export { reportStore }
