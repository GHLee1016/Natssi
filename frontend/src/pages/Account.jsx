import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { clearFaces, countFaces, dayFromName, facesOn, saveFace, setFacesOn } from '../faceStore.js'
import { measurePhoto, takeFace } from '../measure/browser.js'

// 이 기기에 얼굴 사진 보관(서버로 보내지 않음). 켜면 그날 처음 기록된 사진을 이 브라우저에만 남겨 두 날을 겹쳐 본다.
// '지난 사진 넣기': 앱 밖에서 찍어 둔 사진을 파일 이름의 날짜(2026-11-04 등)로 이 기기에 넣는다. 날짜마다 이름순 첫 사진.
function DeviceFaces({ email }) {
  const [on, setOn] = useState(() => facesOn(email))
  const [count, setCount] = useState(0)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(null)
  useEffect(() => { countFaces(email).then(setCount) }, [email, on, busy])
  const flip = async (v) => {
    await setFacesOn(email, v); setOn(v)
    setNote(v ? '이제 사진을 찍으면 그날 처음 기록된 얼굴 사진을 이 기기에 남겨요.' : '이 기기에 보관한 얼굴 사진을 모두 지웠어요.')
  }
  const add = async (e) => {
    const files = [...(e.target.files || [])]
    if (!files.length || busy) return                     // 같은 고르기에 input, change가 두 번 오기도 해서 빈 목록은 넘긴다
    e.target.value = ''
    const byDay = {}
    for (const f of files.sort((x, y) => x.name.localeCompare(y.name))) { const d = dayFromName(f.name); if (d && !byDay[d]) byDay[d] = f }
    const days = Object.keys(byDay).sort()
    if (!days.length) { setNote('파일 이름에서 날짜를 찾지 못했어요. 이름에 2026-11-04처럼 날짜가 있어야 해요.'); return }
    let done = 0
    for (const d of days) {
      setBusy(`${days.length}일 중 ${done + 1}일째 넣는 중…`)
      try { await measurePhoto(byDay[d]); const face = takeFace(); if (face) { await saveFace(email, d, face); done += 1 } } catch { /* 얼굴을 못 찾은 사진은 건너뜀 */ }
    }
    setBusy(null)
    setNote(`${done}일 치 사진을 이 기기에 넣었어요.${done < days.length ? ` 얼굴을 찾지 못한 ${days.length - done}일은 건너뛰었어요.` : ''}`)
  }
  return (
    <div className="card">
      <h2 className="h3">이 기기에 얼굴 사진 보관 <span className="muted small">(선택)</span></h2>
      <div className="row">
        <div><p className="muted small">켜면 그날 처음 기록된 얼굴 사진을 이 기기(브라우저)에만 보관해요. 변화 탭의 ‘날짜별 비교’에서 두 날짜의 얼굴을 겹쳐 볼 수 있어요. 서버로는 보내지 않아서, 다른 기기에서는 보이지 않아요. 끄면 이 기기에 보관한 사진을 바로 모두 지워요.</p></div>
        <label className="switch"><input type="checkbox" checked={on} disabled={!!busy} onChange={(e) => flip(e.target.checked)} aria-label="이 기기에 얼굴 사진 보관" /><span aria-hidden="true" /></label>
      </div>
      {on && <div className="row"><div><b>지난 사진 넣기</b><p className="muted small">앱 밖에서 찍어 둔 사진을 이 기기에 넣어요. 파일 이름에 날짜(예: 2026-11-04)가 있어야 해요. 지금 {count}일 치가 있어요.</p></div>
        <label className="btn ghost">{busy || '사진 고르기'}<input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={add} /></label></div>}
      {note && <p className="muted small" role="status">{note}</p>}
    </div>
  )
}

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
    district ? `거주 지역을 저장했어요: ${district}` : '거주 지역을 지웠어요.')

  const run = async (name, fn, okMsg) => {
    setBusy(name); setError(null); setMsg(null)
    try { await fn(); if (okMsg) setMsg(okMsg) } catch (e) { setError(e.message) } finally { setBusy(null) }
  }

  const download = () => run('export', async () => {
    const data = await api.exportMine()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'natssi-my-data.json'; a.click()
    URL.revokeObjectURL(url)
  }, '내 기록을 다운로드했어요.')

  const reset = () => run('reset', async () => { await api.resetMine(); onChanged() }, '증상 기록을 모두 삭제했어요.')
  const remove = () => run('delete', async () => { await api.deleteAccount(); await clearFaces(meta.viewer.email); onLoggedOut() })
  const flip = (key, on, done) => run('opt-' + key, async () => { await api.setOptional(key, on); onChanged() }, done)

  return (
    <section className="account">
      <header className="page-head"><div><h1>내 계정</h1><p className="muted small">{meta.viewer.email}</p></div>
        <button className="btn ghost" onClick={() => { api.logout(); onLoggedOut() }}>로그아웃</button></header>

      <div className="grid2">
      <div className="card">
        <h2 className="h3">내 기록 관리</h2>
        <div className="row"><div><b>내 기록 다운로드</b><p className="muted small">저장된 증상 기록, 루틴, 거주 지역 및 동의 기록을 파일로 다운로드할 수 있어요.</p></div>
          <button className="btn ghost" onClick={download} disabled={!!busy}>{busy === 'export' ? '준비 중…' : '다운로드'}</button></div>
        <div className="row"><div><b>증상 기록 전체 삭제</b><p className="muted small">계정은 유지하고 증상 기록만 삭제해요.</p></div>
          <button className="btn ghost" onClick={reset} disabled={!!busy}>{busy === 'reset' ? '삭제하는 중…' : '삭제'}</button></div>
        <div className="row"><div><b>사진</b><p className="muted small">얼굴 전체 사진은 서버로 보내지 않아요. 아래 ‘이 기기에 얼굴 사진 보관’을 켠 경우에만 이 기기에 남겨요.</p></div><span className="done">서버 저장 안 함</span></div>
      </div>

      <div className="card">
        <h2 className="h3">선택 동의</h2>
        <p className="muted small">동의하지 않아도 기본 기능을 이용할 수 있어요. 언제든 변경할 수 있어요.</p>
        {[['ai_report', 'AI로 피부 리포트 문장 다듬기', '동의하면 이름, 이메일, 날짜, 제품명을 제외한 가명 처리된 기록 요약을 미국의 AI 서비스(Anthropic Claude)에 보내 문장을 다듬어요. 동의하면 직접 물어보기도 쓸 수 있고, 그때는 적은 질문 문장도 함께 보내요. 동의하지 않으면 기본 문구로 피부 리포트를 제공해요.', 'AI 문장 다듬기 동의를 취소했어요.', 'AI 문장 다듬기에 동의했어요.', 'ai'],
          ['improve', '서비스 개선을 위한 얼굴 사진 제공', '켜면 낯씨가 얼굴 찾기, 사진 검사, 볼 붉은기 재는 방법을 더 정확하게 고칠 때 내 얼굴 사진을 쓸 수 있어요. 지금은 동의만 받고, 사진을 실제로 받기 시작하면 먼저 알려 드릴게요. 받은 사진은 3개월 뒤 지우고, 끄면 바로 지워요.', '서비스 개선용 사진 제공을 껐어요.', '서비스 개선용 사진 제공에 동의했어요.', 'improve']].map(([k, label, help, offMsg, onMsg, doc]) => (
          <div className="row" key={k}>
            <div><b>{label}</b><p className="muted small">{help} <button className="link" onClick={() => onLegal(doc)}>자세히</button></p></div>
            <label className="switch"><input type="checkbox" checked={!!meta.viewer?.[k]} disabled={!!busy}
              onChange={(e) => flip(k, e.target.checked, e.target.checked ? onMsg : offMsg)} aria-label={label} /><span aria-hidden="true" /></label>
          </div>
        ))}
      </div>

      <DeviceFaces email={meta.viewer.email} />

      <div className="card">
        <h2 className="h3">거주 지역 <span className="muted small">(선택)</span></h2>
        <p className="muted small">거주 지역을 선택하면 해당 지역의 미세먼지, 습도, 기온(에어코리아, 기상청 실측)을 피부 기록과 함께 확인할 수 있어요.</p>
        <p className="muted small">서울의 구 단위 지역만 저장해요. 정확한 주소나 GPS 위치는 수집하지 않아요.</p>
        <div className="district-row">
          <label className="sr-only" htmlFor="district">거주 지역</label>
          <select id="district" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!districts.length}>
            <option value="">선택 안 함</option>
            {districts.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="btn ghost" onClick={saveDistrict} disabled={!!busy || district === saved}>{busy === 'district' ? '저장 중…' : '저장'}</button>
        </div>
      </div>

      <div className="card danger">
        <h2 className="h3">회원 탈퇴</h2>
        <p className="muted small">회원 탈퇴 시 계정, 증상 기록, 볼 색상 측정값, 루틴, 거주 지역 정보가 삭제돼요. 삭제한 기록은 복구할 수 없어요.</p>
        {!confirmDelete ? (
          <div className="actions left"><button className="btn ghost warn" onClick={() => setConfirmDelete(true)}>탈퇴하기</button></div>
        ) : (
          <div>
            <label className="field"><span>회원 탈퇴를 확인하려면 ‘탈퇴’를 입력해 주세요.</span>
              <input value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" /></label>
            <div className="actions left">
              <button className="btn ghost" onClick={() => { setConfirmDelete(false); setWord('') }}>취소</button>
              <button className="btn warn" onClick={remove} disabled={word.trim() !== '탈퇴' || !!busy}>{busy === 'delete' ? '삭제하는 중…' : '회원 탈퇴 및 기록 삭제'}</button>
            </div>
          </div>
        )}
      </div>
      </div>
      {msg && <p className="ok-msg" role="status">{msg}</p>}
      {error && <p className="err" role="alert">{error}</p>}
      <p className="muted small">약관 시행일 {meta.consent_version}</p>
        <p className="muted small"><button className="link" onClick={() => onLegal('privacy')}>개인정보 처리방침 보기</button></p>
    </section>
  )
}
