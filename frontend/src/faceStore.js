// 얼굴 사진을 이 기기(브라우저 IndexedDB)에만 보관한다. 서버로는 보내지 않는다.
// 켜고 끄는 건 계정마다 이 기기의 localStorage에 둔다. 끄면 이 기기에 보관한 그 계정의 사진을 모두 지운다.
const DB = 'natssi-faces', STORE = 'faces'
let dbp = null
function open() {
  if (!dbp) dbp = new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => { dbp = null; no(r.error) }
  })
  return dbp
}
async function run(mode, fn) {
  const db = await open()
  return new Promise((ok, no) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => ok(req?.result)
    t.onerror = () => no(t.error)
  })
}
// 이메일을 그대로 키에 쓰지 않도록 짧은 해시로
export const userKey = (email) => { let h = 5381; for (const c of email || '') h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return 'u' + h.toString(36) }
const key = (email, day) => `${userKey(email)}:${day}`
const ON = (email) => `natssi_faces_${userKey(email)}`

export function facesOn(email) { try { return localStorage.getItem(ON(email)) === '1' } catch { return false } }
export async function setFacesOn(email, on) {
  try { on ? localStorage.setItem(ON(email), '1') : localStorage.removeItem(ON(email)) } catch { /* 저장이 막히면 켜지지 않은 채로 */ }
  if (!on) await clearFaces(email)
}
export async function saveFace(email, day, dataUrl) {
  if (!email || !day || !dataUrl) return
  try { await run('readwrite', (s) => s.put(dataUrl, key(email, day))) } catch { /* 보관만 못 함: 기록은 그대로 */ }
}
export async function getFaces(email, days) {
  const out = {}
  try { for (const d of days) { const v = await run('readonly', (s) => s.get(key(email, d))); if (v) out[d] = v } } catch { /* 없으면 빈 칸 */ }
  return out
}
async function myKeys(email) {
  const p = userKey(email) + ':'
  return ((await run('readonly', (s) => s.getAllKeys())) || []).filter((k) => String(k).startsWith(p))
}
export async function countFaces(email) { try { return (await myKeys(email)).length } catch { return 0 } }
export async function clearFaces(email) {
  try { const ks = await myKeys(email); await run('readwrite', (s) => { ks.forEach((k) => s.delete(k)) }) } catch { /* 이미 비었거나 막힘 */ }
}
// 파일 이름에서 날짜: 2026-11-04, 2026_11_04, 20261104
export function dayFromName(name) {
  const m = /(20\d\d)[-_.]?([01]\d)[-_.]?([0-3]\d)/.exec(name || '')
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
