import { useState } from 'react'
import { api } from '../api.js'

export default function Auth({ onDone, onLegal, back }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [c, setC] = useState({ terms: false, privacy: false, photo: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [mailSent, setMailSent] = useState(false)
  const all = c.terms && c.privacy && c.photo
  const signup = mode === 'signup'

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (signup && !all) return setError('필수 항목에 모두 동의해야 가입할 수 있어요.')
    setBusy(true)
    try {
      if (signup) {
        const r = await api.signup({ email, password, consent_terms: c.terms, consent_privacy: c.privacy, consent_photo: c.photo })
        if (r.status === 'confirm_email') { setMailSent(true); return }
      } else {
        await api.login({ email, password })
      }
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (mailSent) return (
    <section className="auth">
      <div className="card">
        <h2>메일을 확인해 주세요</h2>
        <p className="muted">{email} 으로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.</p>
        <div className="actions"><button className="btn" onClick={() => { setMailSent(false); setMode('login') }}>로그인하러 가기</button></div>
      </div>
    </section>
  )

  return (
    <section className="auth">
      <header className="page-head"><div><p className="eyebrow">내 기록은 나만 볼 수 있어요</p><h1>{signup ? '가입하기' : '로그인'}</h1></div>
        <button className="btn ghost" onClick={back}>김서연 데모로 돌아가기</button></header>
      <div className="auth-wrap">
      <form className="card" onSubmit={submit} noValidate>
        <div className="seg" role="tablist" aria-label="로그인 또는 가입">
          <button type="button" role="tab" aria-selected={!signup} className={!signup ? 'on' : ''} onClick={() => { setMode('login'); setError(null) }}>로그인</button>
          <button type="button" role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => { setMode('signup'); setError(null) }}>가입</button>
        </div>
        <label className="field"><span>이메일</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" /></label>
        <label className="field"><span>비밀번호</span>
          <input type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          {signup && <small className="muted">8자 이상, 글자와 숫자를 함께 써 주세요.</small>}</label>

        {signup && (
          <fieldset className="consents">
            <legend>약관 동의</legend>
            <label className="check all"><input type="checkbox" checked={all}
              onChange={(e) => setC({ terms: e.target.checked, privacy: e.target.checked, photo: e.target.checked })} />전체 동의</label>
            {[['terms', '[필수] 이용약관', 'terms'], ['privacy', '[필수] 개인정보 수집·이용', 'privacy'], ['photo', '[필수] 얼굴 사진 처리 안내', 'photo']].map(([k, label, anchor]) => (
              <div className="check-row" key={k}>
                <label className="check"><input type="checkbox" checked={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} />{label}</label>
                <button type="button" className="link" onClick={() => onLegal(anchor)}>보기</button>
              </div>
            ))}
          </fieldset>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions"><button className="btn wide" type="submit" disabled={busy || !email || !password}>
          {busy ? '확인하는 중…' : signup ? '동의하고 가입하기' : '로그인'}</button></div>
      </form>
      <aside className="card auth-side" aria-label="낯씨 소개">
        <img src="/logo.svg" alt="" width="44" height="44" />
        <h2>루틴을 한 번에 하나만 바꾸고,<br />내 얼굴이 어떻게 달랐는지 확인해요</h2>
        <ul>
          <li><b>기록</b><span>매일 셀카 한 장과 증상 체크인으로 남겨요.</span></li>
          <li><b>변화</b><span>루틴을 바꾼 날을 기준으로 평소 범위와 비교해요.</span></li>
          <li><b>리포트</b><span>기록에 있는 사실만 문장으로 정리해요. 진단은 하지 않아요.</span></li>
        </ul>
        <p className="small muted">로그인하지 않아도 김서연 데모는 읽기 전용으로 볼 수 있어요. 얼굴 사진은 검사 후 바로 버리고 저장하지 않아요.</p>
      </aside>
      </div>
    </section>
  )
}
