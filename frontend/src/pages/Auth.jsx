import { useRef, useState } from 'react'
import { api } from '../api.js'

// 입력 검사는 첫 번째로 칸을 벗어날 때(blur) 한다. 타이핑 중에는 오류를 보여주지 않고,
// 오류가 난 칸에 다시 들어가거나 고쳐 쓰기 시작하면 바로 지운다.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const checkEmail = (v) => (!v.trim() ? '이메일 주소를 입력해 주세요.' : EMAIL_RE.test(v.trim()) ? '' : 'name@example.com처럼 입력해 주세요.')
const checkPassword = (v, strict) => {
  if (!v) return '비밀번호를 입력해 주세요.'
  if (strict && (v.length < 8 || /^[0-9]+$/.test(v) || /^\p{L}+$/u.test(v))) return '8자 이상, 글자와 숫자를 섞어 써 주세요.'
  return ''
}
// 서버가 돌려준 문구가 특정 칸에 대한 것이면 그 칸 아래에 보여준다.
const fieldOf = (msg) => (msg.startsWith('이미 가입된') ? 'email' : /^(비밀번호|이전과 다른 비밀번호)/.test(msg) ? 'password' : null)

// 만 14세 미만은 법정대리인 동의가 필요해 가입을 받지 않는다(개인정보 보호법 제22조의2). 나이 확인은 본인 확인 체크로 받는다.
const CONSENTS = [['age14', '[필수] 만 14세 이상이에요'], ['terms', '[필수] 이용약관'], ['privacy', '[필수] 개인정보 수집·이용'], ['photo', '[필수] 얼굴 사진 처리 안내'], ['health', '[필수] 건강 정보(증상 점수) 수집·이용']]
// 선택 동의: 항목마다 따로 고른다. 동의하지 않아도 가입·모든 기본 기능을 쓸 수 있고, 내 계정에서 언제든 바꿀 수 있다.
const OPTIONALS = [['ai_report', '[선택] AI로 리포트 문장 다듬기(가명 요약, 국외 이전)', 'ai'],
  ['improve', '[선택] 서비스 개선을 위한 얼굴 사진 제공', 'improve']]

function Field({ id, label, error, helper, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <p id={id + '-err'} className="field-err" role="alert">{error}</p>
        : helper ? <small id={id + '-help'} className="muted">{helper}</small> : null}
    </div>
  )
}

export default function Auth({ onDone, onLegal, back, resetToken, linkExpired, onResetDone, recovery, start = 'login' }) {
  const [mode, setMode] = useState(resetToken ? 'reset' : linkExpired && recovery ? 'forgot' : start === 'signup' ? 'signup' : 'login')   // login | signup | forgot | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [c, setC] = useState({ age14: false, terms: false, privacy: false, photo: false, health: false })
  const [opt, setOpt] = useState({ ai_report: false, improve: false })
  const [errs, setErrs] = useState({})
  const [consentTried, setConsentTried] = useState(false)
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)          // null | signup | forgot | reset (끝난 뒤 안내 화면)
  const emailRef = useRef(null)
  const pwRef = useRef(null)
  const all = CONSENTS.every(([k]) => c[k])
  const signup = mode === 'signup'
  const strictPw = signup || mode === 'reset'

  const setErr = (k, v) => setErrs((e) => ({ ...e, [k]: v }))
  const validate = (k) => { const m = k === 'email' ? checkEmail(email) : checkPassword(password, strictPw); setErr(k, m); return m }
  const keepErr = useRef(false)             // 제출 때 코드로 오류 칸에 포커스를 줄 때는 방금 띄운 오류를 지우지 않는다
  const focusField = (ref) => { keepErr.current = true; ref.current?.focus(); keepErr.current = false }
  const touch = (k) => ({ onBlur: () => validate(k), onFocus: () => { if (!keepErr.current) setErr(k, '') } })
  const switchMode = (m) => { setMode(m); setErrs({}); setFormError(null); setConsentTried(false); setDone(null) }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setFormError(null)
    const need = mode === 'forgot' ? ['email'] : mode === 'reset' ? ['password'] : ['email', 'password']
    const bad = need.filter((k) => validate(k))                // 모든 칸을 검사해 오류를 한꺼번에 보여주고, 첫 칸으로 포커스
    if (bad.length) return focusField(bad[0] === 'email' ? emailRef : pwRef)
    if (signup && !all) {
      setConsentTried(true)
      const first = CONSENTS.find(([k]) => !c[k])
      return document.getElementById('consent-' + first[0])?.focus()
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const r = await api.signup({ email, password, consent_age14: c.age14, consent_terms: c.terms, consent_privacy: c.privacy, consent_photo: c.photo, consent_health: c.health, consent_ai_report: opt.ai_report, consent_improve: opt.improve })
        if (r.status === 'confirm_email') { setDone('signup'); return }
        onDone()
      } else if (mode === 'login') {
        await api.login({ email, password })
        onDone()
      } else if (mode === 'forgot') {
        await api.recover({ email })
        setDone('forgot')
      } else {
        await api.resetPassword({ access_token: resetToken, password })
        onResetDone?.()
        setDone('reset')
      }
    } catch (err) {
      const f = fieldOf(err.message)
      if (f) { setErr(f, err.message); focusField(f === 'email' ? emailRef : pwRef) } else setFormError(err.message)
    } finally { setBusy(false) }
  }

  if (done) {
    const text = {
      signup: ['메일을 확인해 주세요', `${email} 주소로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.`],
      forgot: ['메일을 확인해 주세요', `${email} 주소로 비밀번호를 새로 정하는 링크를 보냈어요. 가입된 이메일이면 곧 도착해요. 안 보이면 스팸함도 확인해 주세요.`],
      reset: ['비밀번호를 바꿨어요', '새 비밀번호로 로그인해 주세요.'],
    }[done]
    return (
      <section className="auth">
        <div className="card" role="status">
          <h2>{text[0]}</h2>
          <p className="muted">{text[1]}</p>
          <div className="actions"><button className="btn" onClick={() => { switchMode('login'); setPassword('') }}>로그인하러 가기</button></div>
        </div>
      </section>
    )
  }

  const title = { login: '로그인', signup: '가입하기', forgot: '비밀번호 찾기', reset: '새 비밀번호 정하기' }[mode]
  const submitText = busy ? '확인하는 중…' : { login: '로그인', signup: '동의하고 가입하기', forgot: '재설정 메일 받기', reset: '비밀번호 바꾸기' }[mode]
  const described = (id, hasErr, hasHelp) => (hasErr ? id + '-err' : hasHelp ? id + '-help' : undefined)

  return (
    <section className="auth">
      <header className="page-head"><div><h1>{title}</h1></div>
        <button className="btn ghost" onClick={back}>예시로 돌아가기</button></header>
      <div className="auth-wrap">
      <form className="card" onSubmit={submit} noValidate>
        {(mode === 'login' || mode === 'signup') && (
          <div className="seg" role="group" aria-label="로그인 또는 가입">
            <button type="button" aria-pressed={!signup} className={!signup ? 'on' : ''} onClick={() => switchMode('login')}>로그인</button>
            <button type="button" aria-pressed={signup} className={signup ? 'on' : ''} onClick={() => switchMode('signup')}>가입</button>
          </div>
        )}
        {linkExpired && mode === 'forgot' && (
          <p className="notice" role="status">재설정 링크가 만료됐거나 이미 쓰였어요. 이메일을 입력하면 새 링크를 보내요.</p>
        )}
        {mode === 'forgot' && !linkExpired && <p className="muted small">가입한 이메일을 입력하면 비밀번호를 새로 정하는 링크를 보내요.</p>}

        {mode !== 'reset' && (
          <Field id="auth-email" label="이메일" error={errs.email}>
            <input id="auth-email" ref={emailRef} type="email" inputMode="email" autoCapitalize="none" spellCheck={false} autoComplete="email"
              value={email} onChange={(e) => { setEmail(e.target.value); if (errs.email) setErr('email', '') }} {...touch('email')}
              aria-invalid={!!errs.email} aria-describedby={described('auth-email', !!errs.email, false)} placeholder="name@example.com" />
          </Field>
        )}
        {mode !== 'forgot' && (
          <Field id="auth-pw" label={mode === 'reset' ? '새 비밀번호' : '비밀번호'} error={errs.password}
            helper={strictPw ? '8자 이상, 글자와 숫자를 섞어 써 주세요.' : null}>
            <div className="pw-wrap">
              <input id="auth-pw" ref={pwRef} type={showPw ? 'text' : 'password'} autoComplete={strictPw ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => { setPassword(e.target.value); if (errs.password) setErr('password', '') }} {...touch('password')}
                aria-invalid={!!errs.password} aria-describedby={described('auth-pw', !!errs.password, strictPw)} />
              <button type="button" className="pw-toggle" aria-controls="auth-pw" aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                onClick={() => setShowPw((s) => !s)}>{showPw ? '숨기기' : '보기'}</button>
            </div>
          </Field>
        )}
        {mode === 'login' && recovery && (
          <button type="button" className="link forgot" onClick={() => switchMode('forgot')}>비밀번호 찾기</button>
        )}

        {signup && (
          <fieldset className="consents" aria-describedby={consentTried && !all ? 'consent-err' : undefined}>
            <legend>약관 동의</legend>
            <label className="check all"><input type="checkbox" checked={all}
              onChange={(e) => setC({ age14: e.target.checked, terms: e.target.checked, privacy: e.target.checked, photo: e.target.checked, health: e.target.checked })} />필수 항목 모두 동의</label>
            {CONSENTS.map(([k, label]) => {
              const bad = consentTried && !c[k]
              return (
                <div className="check-row" key={k}>
                  <label className={'check' + (bad ? ' bad' : '')}>
                    <input id={'consent-' + k} type="checkbox" checked={c[k]} aria-invalid={bad} onChange={(e) => setC({ ...c, [k]: e.target.checked })} />{label}
                  </label>
                  <button type="button" className="link" onClick={() => onLegal(k === 'age14' ? 'terms' : k)}>보기</button>
                </div>
              )
            })}
            {consentTried && !all && <p id="consent-err" className="field-err" role="alert">필수 항목에 모두 동의해 주세요.</p>}
            <p className="muted small opt-head">선택 항목은 동의하지 않아도 가입하고 기본 기능을 모두 쓸 수 있어요. 나중에 내 계정에서 바꿀 수 있어요.</p>
            {OPTIONALS.map(([k, label, doc]) => (
              <div className="check-row" key={k}>
                <label className="check"><input id={'consent-' + k} type="checkbox" checked={opt[k]} onChange={(e) => setOpt({ ...opt, [k]: e.target.checked })} />{label}</label>
                <button type="button" className="link" onClick={() => onLegal(doc)}>보기</button>
              </div>
            ))}
          </fieldset>
        )}
        {formError && <p className="err" role="alert">{formError}</p>}
        <div className="actions"><button className="btn wide" type="submit" disabled={busy} aria-busy={busy}>{submitText}</button></div>
        {mode === 'forgot' && <button type="button" className="link forgot" onClick={() => switchMode('login')}>로그인으로 돌아가기</button>}
      </form>
      <aside className="card auth-side" aria-label="낯씨 소개">
        <img src="/logo.svg" alt="" width="44" height="44" />
        <h2>루틴은 한 번에 하나만 바꾸고,<br />그 뒤 얼굴이 어땠는지 봐요</h2>
        <ul>
          <li><b>기록</b><span>매일 셀카 한 장과 증상을 남겨요.</span></li>
          <li><b>변화</b><span>루틴을 바꾼 날 전후로 볼 붉은기가 평소 범위를 넘었는지 봐요.</span></li>
          <li><b>리포트</b><span>기록에 있는 사실만 글로 정리해요. 진단은 하지 않아요.</span></li>
        </ul>
        <p className="small muted">김서연(가상 인물)의 예시는 로그인하지 않아도 볼 수 있어요. 가입하면 사진 기록이 7일 쌓인 다음 날부터 내 기록으로 얼굴 날씨를 알려요. 얼굴 사진은 내 기기 안에서 검사하고 서버로 보내지 않아요.</p>
      </aside>
      </div>
    </section>
  )
}
