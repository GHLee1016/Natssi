import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Account({ meta, onLegal, onLoggedOut, onChanged }) {
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [word, setWord] = useState('')
  const [district, setDistrict] = useState('')
  const [saved, setSaved] = useState('')
  const [districts, setDistricts] = useState([])
  useEffect(() => { api.myProfile().then((p) => { setDistricts(p.districts); setDistrict(p.district || ''); setSaved(p.district || '') }).catch(() => {}) }, [])
  const saveDistrict = () => run('district', async () => { await api.saveProfile(district); setSaved(district) },
    district ? `사는 구를 ${district}로 저장했어요.` : '사는 구를 지웠어요.')

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
  const flip = (key, on, done) => run('opt-' + key, async () => { await api.setOptional(key, on); onChanged() }, done)

  return (
    <section className="account">
      <header className="page-head"><div><h1>내 계정</h1><p className="muted small">{meta.viewer.email}</p></div>
        <button className="btn ghost" onClick={() => { api.logout(); onLoggedOut() }}>로그아웃</button></header>

      <div className="grid2">
      <div className="card">
        <h2 className="h3">내 데이터</h2>
        <div className="row"><div><b>내려받기</b><p className="muted small">저장된 증상 체크인, 루틴, 사는 구, 동의 기록을 파일로 받아요.</p></div>
          <button className="btn ghost" onClick={download} disabled={!!busy}>{busy === 'export' ? '준비 중…' : '내려받기'}</button></div>
        <div className="row"><div><b>체크인 모두 지우기</b><p className="muted small">계정은 남기고 내 증상 체크인만 지워요.</p></div>
          <button className="btn ghost" onClick={reset} disabled={!!busy}>{busy === 'reset' ? '지우는 중…' : '지우기'}</button></div>
        <div className="row"><div><b>사진</b><p className="muted small">얼굴 전체 사진은 서버에 보내지 않아요. 볼 부분 사진 보관에 동의했다면 양 볼 네모 조각만 보관해요.</p></div><span className="done">{meta.viewer?.cheeks ? '볼 조각만' : '저장 안 함'}</span></div>
      </div>

      <div className="card">
        <h2 className="h3">선택 동의</h2>
        <p className="muted small">동의하지 않아도 기본 기능은 모두 쓸 수 있어요. 언제든 바꿀 수 있어요.</p>
        {[['cheeks', '볼 부분 사진 보관', meta.viewer?.cheeks ? '양 볼 네모 조각(작은 사진)을 보관해 두 날을 눈으로 비교해요. 끄면 보관한 조각을 바로 모두 지워요.' : '켜면 그날 처음 저장된 사진의 양 볼 네모 조각만 보관해 두 날을 눈으로 비교할 수 있어요.', '끄면 보관한 볼 사진을 모두 지웠어요.', '볼 부분 사진 보관을 켰어요.', 'photo'],
          ['ai_report', 'AI로 리포트 문장 다듬기', '제품 이름, 날짜, 이메일을 뺀 가명 요약만 미국의 AI 서비스(Anthropic의 Claude)로 보내 리포트 문장을 다듬어요. 켜면 직접 물어보기도 쓸 수 있고, 그때는 적은 질문 문장도 함께 보내요. 끄면 정해진 틀 문장을 써요.', 'AI 문장 다듬기를 껐어요.', 'AI 문장 다듬기를 켰어요.', 'ai']].map(([k, label, help, offMsg, onMsg, doc]) => (
          <div className="row" key={k}>
            <div><b>{label}</b><p className="muted small">{help} <button className="link" onClick={() => onLegal(doc)}>자세히</button></p></div>
            <label className="switch"><input type="checkbox" checked={!!meta.viewer?.[k]} disabled={!!busy}
              onChange={(e) => flip(k, e.target.checked, e.target.checked ? onMsg : offMsg)} aria-label={label} /><span aria-hidden="true" /></label>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="h3">사는 구 <span className="muted small">(선택)</span></h2>
        <p className="muted small">고르면 그 구의 미세먼지, 습도, 기온(에어코리아와 기상청 실측)을 기록과 함께 보여 드려요.</p>
        <p className="muted small">구 단위만 저장하고 정확한 위치는 받지 않아요. 지금은 서울만 돼요.</p>
        <div className="district-row">
          <label className="sr-only" htmlFor="district">사는 구</label>
          <select id="district" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!districts.length}>
            <option value="">고르지 않음</option>
            {districts.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="btn ghost" onClick={saveDistrict} disabled={!!busy || district === saved}>{busy === 'district' ? '저장 중…' : '저장'}</button>
        </div>
      </div>

      <div className="card danger">
        <h2 className="h3">탈퇴</h2>
        <p className="muted small">계정과 함께 체크인, 볼 색 기록, 볼 부분 사진, 루틴, 사는 구가 모두 지워져요. 되돌릴 수 없어요.</p>
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
      <p className="muted small">약관 버전 {meta.consent_version}</p>
        <p className="muted small"><button className="link" onClick={() => onLegal('privacy')}>개인정보 처리방침 보기</button></p>
    </section>
  )
}
