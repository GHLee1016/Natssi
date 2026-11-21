import { useState } from 'react'
import { api, fmt, LEVEL_CLASS } from '../api.js'
import { WEATHER, WeatherIcon } from '../weather.jsx'
import Gauge from '../gauge.jsx'
import { useLoad, Status } from '../useLoad.jsx'
import CheckinSteps from './CheckinSteps.jsx'

const SYMPTOMS = ['따가움', '화끈', '가려움', '당김']
const BLANK = { 따가움: 0, 화끈: 0, 가려움: 0, 당김: 0 }
const line = (s) => SYMPTOMS.map((k) => `${k} ${s[k] ?? 0}`).join(' · ')

// 로그인한 사용자의 첫 화면: 오늘의 내 판정(사진을 찍은 날), 오늘 체크인, '평소 범위까지 N/7일'.
// 오늘 내 동네 환경값(실측). 구를 고르지 않았으면 고르는 곳을 알려 준다.
function EnvToday({ district, env, today, onAccount }) {
  if (!district) {
    return (
      <p className="notice env-today">사는 구를 고르면 오늘 동네의 미세먼지·습도·기온을 같이 보여 드려요.{' '}
        <button className="link" onClick={onAccount}>내 계정에서 고르기</button></p>
    )
  }
  const when = env?.measured_on && env.measured_on !== today ? ` (${+env.measured_on.slice(5, 7)}/${+env.measured_on.slice(8)} 측정값)` : ''
  const parts = env && [env.pm25 != null && `초미세먼지 ${env.pm25}`, env.humidity != null && `습도 ${env.humidity}%`, env.temp != null && `기온 ${env.temp}℃`].filter(Boolean)
  return (
    <p className="notice env-today">
      <b>오늘 {district}</b>{' · '}
      {parts?.length ? `${parts.join(' · ')}${when} · ${env.unusual ? '평소와 달라요' : '평소와 비슷'}` : '측정값은 아직 없어요(보통 다음 날 아침에 들어와요)'}
      {env?.facts?.length > 0 && <><br />{env.facts.join(' ')}</>}
    </p>
  )
}

// 처리방침이 바뀌었는데 아직 동의하지 않은 사용자에게 무엇이 바뀌었는지 한 번에 알린다(촬영 화면과 따로).
const POLICY_CHANGES = [
  ['2026-11-19', '얼굴 사진을 이 기기 안에서만 분석하고, 서버에는 측정한 숫자만 보내요.'],
  ['2026-11-20', '내 루틴(제품 이름·전성분·사용 빈도)을 저장해요.'],
  ['2026-11-21', '사는 구(선택)를 저장할 수 있어요.'],
  ['2026-11-22', '품질 검사를 통과한 사진의 볼 색 숫자(붉은기, 조명 확인용 노란기)를 하루 1번 내 기록에 남겨요(사진은 남기지 않아요). 동의해야 내 판정이 열려요.'],
]
function PolicyNotice({ mine, current, onLegal, onConsented }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  if (!mine || mine >= current) return null
  const changes = POLICY_CHANGES.filter(([v]) => v > mine && v <= current)
  const agree = async () => { setBusy(true); setErr(null); try { await api.consent(); onConsented?.() } catch (e) { setErr(e.message); setBusy(false) } }
  return (
    <div className="card policy-notice" role="region" aria-label="처리방침 변경 안내">
      <h2 className="h3">개인정보 처리방침이 바뀌었어요</h2>
      <ul>{changes.map(([v, t]) => <li key={v}>{t}</li>)}</ul>
      <div className="actions left">
        <button className="btn" onClick={agree} disabled={busy}>{busy ? '저장하는 중…' : '바뀐 내용에 동의해요'}</button>
        <button className="btn ghost" onClick={() => onLegal('privacy')}>처리방침 보기</button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  )
}

export default function MyDay({ go, onAccount, viewer, policyVersion, onLegal, onConsented }) {
  const q = useLoad(() => api.me(), [])
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState('')               // 스크린리더에 읽어 주는 저장 결과
  const d = q.data

  const save = async (vals) => {
    setSaving(true); setError(null)
    try { q.setData(await api.checkin(vals)); setDraft(null); setNote('오늘 체크인을 저장했어요.') }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }
  const filled = d ? Math.min(d.redness_days, d.needed) : 0
  const v = d?.today_verdict?.baseline ? d.today_verdict : null   // 평소 범위가 생긴 뒤에만(그 전은 아래 진행 카드가 알려 줌)

  return (
    <section>
      <header className="page-head">
        <div><h1>{d ? fmt.full(d.today) : '내 기록'}</h1></div>
      </header>
      <p className="sr-only" role="status">{note}</p>
      <Status {...q} />
      {d && (
        <>
        <PolicyNotice mine={viewer?.consent_version} current={policyVersion} onLegal={onLegal} onConsented={onConsented} />
        <EnvToday district={d.district} env={d.env} today={d.today} onAccount={onAccount} />
        {v && (
          <div className={'hero ' + LEVEL_CLASS[v.level]}>
            <WeatherIcon level={v.level} size={220} className="hero-bg" />
            <p className="hero-label">오늘의 내 얼굴 날씨</p>
            <h2 className="hero-name"><WeatherIcon level={v.level} size={48} />{WEATHER[v.level].name}</h2>
            <p className="hero-msg">{v.message}</p>
            {v.reasons.length > 0 && <ul className="hero-reasons">{v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            {v.baseline && <Gauge value={d.today_redness} low={v.baseline.low} high={v.baseline.high} base={v.baseline_version} />}
          </div>
        )}
        <div className="grid2">
          <div>
            <div className="card">
              <h2 className="h3">내 평소 범위</h2>
              <div className="dots" role="img" aria-label={`사진 기록 ${filled}일 / 필요 ${d.needed}일`}>
                {Array.from({ length: d.needed }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
              </div>
              <p className="bignum" aria-label={`사진 기록 ${d.redness_days}일, 필요 ${d.needed}일`}><span className="num">{d.redness_days}</span><span className="num-u">/ {d.needed}일 사진 기록</span></p>
              <p>{d.redness_days >= d.needed ? '평소 범위가 만들어졌어요. 사진을 찍은 날마다 평소와 비교해 알려 드려요.' : `볼 붉은기를 ${d.needed}일 남기면 그다음 날부터 내 평소 범위와 비교해요.`}</p>
              <p className="muted small">같은 폰·같은 장소·같은 시간대에 찍어야 비교할 수 있어요. 품질 검사를 통과한 사진의 볼 색 숫자만 남기고, 사진은 남기지 않아요.</p>
            </div>

            <div className="card">
              <h2 className="h3">오늘의 증상 체크인</h2>
              {draft ? (
                <CheckinSteps initial={draft} saving={saving} error={error}
                  onSave={(vals) => save(vals)} onCancel={() => { setDraft(null); setError(null) }} />
              ) : d.today_checkin ? (
                <div className="row">
                  <div><b>저장했어요</b><p className="muted small">{line(d.today_checkin)}</p></div>
                  <button className="link" onClick={() => setDraft({ ...BLANK, ...d.today_checkin })}>수정하기</button>
                </div>
              ) : (
                <div className="row">
                  <div><b>오늘은 아직이에요</b><p className="muted small">따가움·화끈·가려움·당김을 0~3으로 남겨요.</p></div>
                  <button className="btn" onClick={() => setDraft({})}>체크인하기</button>
                </div>
              )}
            </div>

            <div className="rec">
              <div className="rec-row">
                <span className="rec-k">셀카</span>
                <div className="rec-v"><div>{d.today_redness != null ? `오늘 볼 붉은기 ${d.today_redness > 0 ? '+' : ''}${d.today_redness}을 남겼어요.` : '고개 각도·표정·노출을 확인하고 볼 붉은기를 재요. 사진은 이 기기 안에서만 분석하고 남기지 않아요.'}</div></div>
                {d.today_redness == null && <button className="link" onClick={() => go('capture')}>촬영하기</button>}
              </div>
            </div>
          </div>

          <div>
            <div className="card">
              <h2 className="h3">최근 기록</h2>
              {d.recent.length === 0 && <p className="muted small">아직 기록이 없어요. 오늘 첫 체크인을 남겨 보세요.</p>}
              {d.recent.map((r) => (
                <div className="ev" key={r.date}>
                  <b>{fmt.md(r.date)}</b>
                  <div>{r.redness != null && r.level !== '구분 불가' ? `${WEATHER[r.level].name} · ` : ''}{r.redness != null ? `볼 붉은기 ${r.redness > 0 ? '+' : ''}${r.redness}` : '사진 없음'}{' · '}{r.symptoms ? line(r.symptoms) : '체크인 없음'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="notice wide">판정은 내 기록으로 해요. 진단이 아니에요. 증상이 계속되면 사용을 멈추고 보건소·전문의와 상담해 주세요. 변화·리포트 화면은 아직 로그아웃하면 볼 수 있는 김서연 가상 데모에서만 보여 드려요.</p>
        </>
      )}
    </section>
  )
}
