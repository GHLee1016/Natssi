import { useState } from 'react'
import { api } from '../api.js'

export default function Account({ meta, onLegal, onLoggedOut, onChanged }) {
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [word, setWord] = useState('')

  const run = async (name, fn, okMsg) => {
    setBusy(name); setError(null); setMsg(null)
    try { await fn(); if (okMsg) setMsg(okMsg) } catch (e) { setError(e.message) } finally { setBusy(null) }
  }

  const download = () => run('export', async () => {
    const data = await api.exportMine()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'natssi-my-data.json'; a.click()
    URL.revokeObjectURL(url)
  }, '내 데이터를 파일로 내려받았어요.')

  const reset = () => run('reset', async () => { await api.resetMine(); onChanged() }, '내 증상 체크인을 모두 지웠어요.')
  const remove = () => run('delete', async () => { await api.deleteAccount(); onLoggedOut() })

  return (
    <section className="account">
      <header className="page-head"><div><p className="eyebrow">내 계정</p><h1>{meta.viewer.email}</h1></div>
        <button className="btn ghost" onClick={() => { api.logout(); onLoggedOut() }}>로그아웃</button></header>

      <div className="grid2">
      <div className="card">
        <h2 className="h3">내 데이터</h2>
        <div className="row"><div><b>내려받기</b><p className="muted small">저장된 증상 체크인과 동의 기록을 파일로 받아요.</p></div>
          <button className="btn ghost" onClick={download} disabled={!!busy}>{busy === 'export' ? '준비 중…' : '내려받기'}</button></div>
        <div className="row"><div><b>체크인 모두 지우기</b><p className="muted small">계정은 남기고 내 증상 체크인만 지워요.</p></div>
          <button className="btn ghost" onClick={reset} disabled={!!busy}>{busy === 'reset' ? '지우는 중…' : '지우기'}</button></div>
        <div className="row"><div><b>사진</b><p className="muted small">얼굴 사진은 검사 후 바로 버려서 저장된 사진이 없어요.</p></div><span className="done">저장 안 함</span></div>
      </div>

      <div className="card danger">
        <h2 className="h3">탈퇴</h2>
        <p className="muted small">계정과 내 체크인이 모두 지워지고 되돌릴 수 없어요.</p>
        {!confirmDelete ? (
          <div className="actions left"><button className="btn ghost warn" onClick={() => setConfirmDelete(true)}>탈퇴하기</button></div>
        ) : (
          <div>
            <label className="field"><span>확인을 위해 ‘탈퇴’를 입력해 주세요</span>
              <input value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" /></label>
            <div className="actions left">
              <button className="btn ghost" onClick={() => { setConfirmDelete(false); setWord('') }}>취소</button>
              <button className="btn warn" onClick={remove} disabled={word.trim() !== '탈퇴' || !!busy}>{busy === 'delete' ? '지우는 중…' : '모두 지우고 탈퇴'}</button>
            </div>
          </div>
        )}
      </div>
      </div>
      {msg && <p className="ok-msg" role="status">{msg}</p>}
      {error && <p className="err" role="alert">{error}</p>}
      <p className="muted small">약관 버전 {meta.consent_version} · <button className="link" onClick={() => onLegal('privacy')}>개인정보 처리방침 보기</button></p>
    </section>
  )
}
