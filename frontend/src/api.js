const BASE = import.meta.env.VITE_API_BASE || ''

async function req(path, opts) {
  let res
  try {
    res = await fetch(BASE + path, opts)
  } catch {
    throw new Error('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  }
  if (!res.ok) {
    let msg = '요청을 처리하지 못했어요.'
    try { const j = await res.json(); if (typeof j.detail === 'string') msg = j.detail } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  meta: () => req('/api/meta'),
  day: (d) => req(`/api/day/${d}`),
  timeline: () => req('/api/timeline'),
  routine: () => req('/api/routine'),
  compare: (a, b) => req(`/api/compare?a=${a}&b=${b}`),
  report: () => req('/api/report'),
  answer: (id) => req(`/api/report/answer/${id}`),
  checkin: (d, body) => req(`/api/day/${d}/checkin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  capture: (blob) => { const f = new FormData(); f.append('photo', blob, 'selfie.jpg'); return req('/api/capture', { method: 'POST', body: f }) },
}

export const fmt = {
  md: (iso) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}` },
  full: (iso) => { const dt = new Date(iso + 'T00:00:00'); return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${'일월화수목금토'[dt.getDay()]})` },
  shift: (iso, n) => { const dt = new Date(iso + 'T00:00:00'); dt.setDate(dt.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}` },
}

export const LEVEL_CLASS = { '신호 없음': 'ok', '관찰 중': 'watch', '신호 있음': 'signal', '구분 불가': 'unknown' }
