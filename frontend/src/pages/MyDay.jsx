import { useCallback, useState } from 'react'
import { api, fmt, LEVEL_CLASS } from '../api.js'
import { WEATHER, WeatherIcon, HeroSky } from '../weather.jsx'
import Gauge from '../gauge.jsx'
import { useLoad, Status } from '../useLoad.jsx'
import CheckinSteps from './CheckinSteps.jsx'
import { InstallHint } from '../install.jsx'
import KV, { symptomItems } from '../kv.jsx'
import Calendar from './Calendar.jsx'
import { useSub, SubPage, AskButtons, AskHead, ICONS } from './Sub.jsx'
import Recap from './Recap.jsx'
import { Dashboard, useMedia, WIDE } from './Dash.jsx'
import { DayHero, WeekStrip, weekOf, symptomText, ChangeDays, usePeriod, PeriodToggle, EmptyDay } from './DayParts.jsx'
import { useBackLayer } from '../nav.js'

const BLANK = { 따가움: 0, 화끈: 0, 가려움: 0, 당김: 0 }

// 로그인한 사용자의 첫 화면: 오늘의 내 판정(사진을 찍은 날), 오늘 체크인, '평소 범위까지 N/7일'.
// 오늘 내 동네 환경값(실측). 구를 고르지 않았으면 고르는 곳을 알려 준다.
function EnvToday({ district, env, today, onAccount }) {
  if (!district) {
    return (
      <p className="notice env-today">사는 구를 고르면 그 동네의 미세먼지, 습도, 기온이 여기 보여요.{' '}
        <button className="link" onClick={onAccount}>내 계정에서 고르기</button></p>
    )
  }
  const when = env?.measured_on && env.measured_on !== today ? `${+env.measured_on.slice(5, 7)}/${+env.measured_on.slice(8)} 측정값` : ''
  const has = env && (env.pm25 != null || env.humidity != null || env.temp != null)
  return (
    <div className="notice env-today">
      <p><b>오늘 {district}</b>{has && <span className="muted"> {env.unusual ? '평소와 달라요' : '평소와 비슷해요'}</span>}</p>
      {has
        ? <KV className="small" items={[['초미세먼지', env.pm25 != null && env.pm25], ['습도', env.humidity != null && `${env.humidity}%`], ['기온', env.temp != null && `${env.temp}℃`]]} />
        : <p>아직 측정값이 없어요. 보통 다음 날 아침에 들어와요.</p>}
      {when && <span className="sub-line">{when}</span>}
      {env?.facts?.length > 0 && <p className="small">{env.facts.join(' ')}</p>}
    </div>
  )
}

// 처리방침이 바뀌었는데 아직 동의하지 않은 사용자에게 무엇이 바뀌었는지 한 번에 알린다(촬영 화면과 따로).
const POLICY_CHANGES = [
  ['2026-11-19', '얼굴 사진을 이 기기 안에서만 분석하고, 서버에는 측정한 숫자만 보내요.'],
  ['2026-11-20', '내 루틴(제품 이름, 전성분, 사용 횟수)을 저장해요.'],
  ['2026-11-21', '사는 구를 저장해요(선택).'],
  ['2026-11-24', '루틴에 제품 사진을 작게 줄여 저장해요(선택).'],
  ['2026-11-23', '볼 밝기 숫자도 남겨서 두 날의 볼 색을 색 칩으로 비교해요. 선택 동의가 두 가지 생겼어요. 볼 부분 사진 보관과 AI로 리포트 문장 다듬기이고, 내 계정에서 고르면 돼요.'],
  ['2026-11-22', '잘 찍혔는지 확인을 통과한 사진의 볼 색 숫자(붉은기, 조명 확인용 노란기)를 하루 1번 내 기록에 남겨요. 사진은 남기지 않아요. 동의해야 내 얼굴 날씨를 볼 수 있어요.'],
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

const sgn = (x) => (x > 0 ? '+' : '') + x

// 첫 7일(평소 범위가 생기기 전): 빈 날씨 카드 자리에 '오늘 남긴 것'을 한 장으로 보여 준다.
// 판정(맑음, 흐림)은 하지 않는다. 직전 사진 기록과의 차이는 측정 오차(MDC95)와만 견주어 참고로 보여 준다.
// MDC95는 같은 사람의 두 측정이 '진짜로 달라졌다'고 볼 최소 차이라서, 평소 범위 없이도 두 날 비교에 쓸 수 있다.
export function compareLine(d, mdc95) {
  if (d.today_redness == null || !mdc95) return null
  const today = d.recent?.find((r) => r.date === d.today)
  if (today?.light) return '오늘 사진은 조명 색이 평소와 달라 다른 날과 비교하지 않았어요.'
  const prev = d.recent?.find((r) => r.date < d.today && r.redness != null && !r.light)
  if (!prev) return '첫 사진 기록이에요. 내일부터는 전날 기록과 비교해요.'
  const gap = Math.round((Date.parse(d.today) - Date.parse(prev.date)) / 86400000)
  const when = gap === 1 ? '어제' : `${gap}일 전(${fmt.md(prev.date)})`
  const diff = Math.round((d.today_redness - prev.redness) * 10) / 10
  const wa = gap === 1 ? '어제와' : `${gap}일 전과`
  if (diff === 0) return `볼 붉은기가 ${wa} 같아요.`
  const amt = `${Math.abs(diff).toFixed(1)} ${diff > 0 ? '높' : '낮'}`
  return Math.abs(diff) <= mdc95
    ? `볼 붉은기가 ${when}보다 ${amt}지만, 같은 얼굴을 다시 찍어도 생기는 차이(±${mdc95}) 안이라 ${wa} 비슷한 걸로 봐요.`
    : `볼 붉은기가 ${when}보다 ${amt}아요. 같은 얼굴을 다시 찍어도 생기는 차이(±${mdc95})보다 커서 ${wa} 달라 보여요. 아직 평소 범위가 없어서 좋고 나쁨은 따지지 않아요.`
}

function FirstWeekCard({ d, mdc95, go, onSymptoms, draft }) {
  const left = Math.max(0, d.needed - d.redness_days)
  const todayRec = d.recent?.find((r) => r.date === d.today)
  const cmp = compareLine(d, mdc95)
  // 지금까지 내 기록의 범위(조명이 달랐던 날 빼고). 2일 이상일 때만
  const vals = (d.recent || []).filter((r) => r.redness != null && !r.light).map((r) => r.redness)
  const range = vals.length >= 2 ? { lo: Math.min(...vals).toFixed(1), hi: Math.max(...vals).toFixed(1), n: vals.length } : null
  return (
    <div className="card first-week" aria-labelledby="fw-title">
      <div className="fw-head">
        <h2 className="h3" id="fw-title">오늘의 기록</h2>
        <span className="fw-step">평소 범위까지 {Math.min(d.redness_days, d.needed)}/{d.needed}일</span>
      </div>
      {d.today_redness == null ? (
        <>
          <p className="fw-empty">오늘은 아직 사진이 없어요</p>
          <p className="muted small">사진 한 장 찍고 증상 네 가지를 고르면 돼요. 1분쯤 걸려요.</p>
          <div className="actions left"><button className="btn" onClick={() => go('capture')}>오늘 기록하기</button></div>
        </>
      ) : (
        <>
          <div className="fw-main">
            <div>
              <p className="fw-k">오늘 볼 붉은기</p>
              <p className="fw-big">{d.today_redness.toFixed(1)}</p>
            </div>
            {d.today_cheeks && (
              <span className="cheek-pair small">{['L', 'R'].map((k) => <img key={k} src={d.today_cheeks[k]} alt={k === 'L' ? '오늘 왼쪽 볼' : '오늘 오른쪽 볼'} />)}</span>
            )}
          </div>
          {range && <p className="fw-range">지금까지 내 기록 <b>{range.lo} ~ {range.hi}</b> <span className="muted">(사진 {range.n}일)</span></p>}
          <details className="fw-what">
            <summary>이 숫자는 뭔가요?</summary>
            <p>양 볼이 얼마나 붉은지를 숫자로 나타냈어요. 클수록 붉고, 0이면 붉지도 초록빛이 돌지도 않는 색이에요. 색을 숫자로 나타내는 Lab 방식의 a* 값이에요.</p>
            <p>타고난 피부색이 사람마다 달라서 숫자 하나만으로는 높은지 낮은지 말할 수 없어요. 그래서 7일 동안 찍은 사진으로 내 평소 범위를 만들고, 그 범위와 비교해요.</p>
            <p>같은 얼굴을 다시 찍어도 ±{mdc95 ?? 2.35} 정도는 달라질 수 있어요(측정 오차). 두 날 차이가 이보다 작으면 비슷한 걸로 봐요.</p>
          </details>
          {cmp && <p className="fw-cmp">{cmp}</p>}
          <ul className="fw-list">
            <li><span className="fw-k">사진</span>{todayRec?.light ? '조명 색이 평소와 달랐던 사진으로 기록했어요' : '밝기, 각도, 선명도, 조명 모두 괜찮았어요'}</li>
            <li><span className="fw-k">증상</span>{d.today_checkin ? symptomText(d.today_checkin) : '아직 안 남겼어요'}</li>
          </ul>
          {!d.today_checkin && !draft && <div className="actions left"><button className="btn" onClick={onSymptoms}>증상 남기기</button></div>}
        </>
      )}
      <p className="fw-foot">{left > 0
        ? `사진 기록이 ${left}일 더 쌓이면 내 평소 볼 붉은기 범위가 생겨요. 그다음 날부터 그 범위와 비교한 얼굴 날씨가 보여요.`
        : '평소 범위를 만들 사진 기록이 다 모였어요. 다음에 찍는 사진부터 얼굴 날씨가 보여요.'}</p>
    </div>
  )
}

// 지난 날 하나: 데모 다이어리와 같은 모양(날씨 카드, 이번 주 줄, 그날의 기록)
function PastDay({ rec, ver, district, changes }) {
  if (!rec) return <EmptyDay />
  return (
    <>
      <DayHero record={rec} version={ver} district={district} />
      {changes}
      <PastLog rec={rec} ver={ver} />
    </>
  )
}

function PastLog({ rec, ver }) {
  return (
      <div className="rec-sec">
        <h3>이날의 기록</h3>
        <div className="rec">
          <div className="rec-row">
            <span className="rec-k">셀카</span>
            <div className="rec-v"><div>{rec.redness != null ? `볼 붉은기 ${sgn(rec.redness)}` : rec.quality_note}<p className="muted small">사진은 남기지 않고 볼 색 숫자만 남겨요</p></div></div>
          </div>
          <div className="rec-row">
            <span className="rec-k">증상</span>
            <div className="rec-v"><div>{Object.keys(rec.symptoms || {}).length ? symptomText(rec.symptoms) : '증상 기록 없음'}</div></div>
          </div>
          {ver?.items?.length > 0 && (
            <div className="rec-row">
              <span className="rec-k">루틴</span>
              <div className="rec-v"><div>{ver.items.filter((i) => i.kind !== 'device').map((i) => i.name).join(', ')}</div></div>
            </div>
          )}
        </div>
      </div>
  )
}

export default function MyDay({ go, onAccount, viewer, policyVersion, onLegal, onConsented, date, setDate, mdc95 }) {
  const q = useLoad(() => api.me(), [])
  const [period, setPeriod] = usePeriod()
  const [draft, setDraft] = useState(null)
  useBackLayer(!!draft, () => { setDraft(null); setError(null) })   // 폰의 뒤로: 적던 증상 체크인을 닫기
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState('')               // 스크린리더에 읽어 주는 저장 결과
  const d = q.data
  const wide = useMedia(WIDE)                         // PC: 대시보드 배치

  const save = async (vals) => {
    setSaving(true); setError(null)
    try { q.setData(await api.checkin(vals)); setDraft(null); setNote('오늘 증상 기록을 저장했어요.') }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }
  const filled = d ? Math.min(d.redness_days, d.needed) : 0
  const v = d?.today_verdict?.baseline ? d.today_verdict : null   // 평소 범위가 생긴 뒤에만(그 전은 아래 진행 카드가 알려 줌)

  // 달력과 지난 날 보기: 사진 기록이 평소 범위를 만들 만큼(7일) 쌓인 뒤에만 열린다(서버도 그 전에는 409).
  const tl = useLoad(() => (d?.unlocked ? api.myTimeline() : Promise.resolve(null)), [d])
  const records = tl.data?.records || []
  const day = d && date && date !== d.today ? date : d?.today
  const past = !!d && day !== d.today
  const rec = records.find((r) => r.date === day)
  const ver = rec && tl.data.versions.find((x) => x.id === rec.version)
  const first = records[0]?.date
  const loadMine = useCallback(() => Promise.resolve(tl.data), [tl.data])
  const pick = (iso) => { setDate(iso === d?.today ? null : iso) }
  // 루틴을 바꾼 날로 바로 가기(데모의 '이 사람의 이야기'와 같은 줄). 바꾼 날이 없으면 보이지 않는다.
  const changes = tl.data && <ChangeDays records={records} versions={tl.data.versions} date={day} setDate={pick} title="루틴을 바꾼 날" />

  const [sub, openSub, closeSub] = useSub()
  const baselineCard = d && (
            <div className="card">
              <h2 className="h3">내 평소 범위</h2>
              <div className="dots" role="img" aria-label={`필요한 ${d.needed}일 중 ${filled}일 사진 기록`}>
                {Array.from({ length: d.needed }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
              </div>
              <p className="bignum" aria-label={`사진 기록 ${d.redness_days}일, 필요 ${d.needed}일`}><span className="num">{d.redness_days}</span><span className="num-u">/ {d.needed}일 사진 기록</span></p>
              <p>{d.redness_days >= d.needed ? '평소 범위가 생겼어요. 이제 사진을 찍는 날마다 평소와 비교해요.' : `볼 붉은기 기록이 ${d.needed}일 쌓이면 그다음 날부터 평소 범위와 비교해요.`}</p>
              <p className="muted small">비교하려면 같은 폰으로 같은 장소, 같은 시간대에 찍어 주세요. 사진은 서버에 남기지 않아요.</p>
            </div>
  )
  const ASK = d && { baseline: '평소 범위 보기', recap: 'Recap' }
  const DESC = { baseline: '내 사진 기록으로 만든 평소 볼 붉은기 범위예요.', recap: '한 달 기록을 카드로 넘겨 봐요.' }
  const tabs = d && <AskButtons value={sub} onChange={(v) => (v ? openSub(v) : closeSub())} items={[
    d.unlocked && { id: 'baseline', icon: ICONS.range, label: ASK.baseline }, { id: 'recap', icon: ICONS.spark, label: ASK.recap }]} />
  // 오늘 화면 조각들: 폰(한 열)과 PC 대시보드가 같은 조각을 다른 자리에 놓는다
  const todayHero = d && (
    v ? (rec
  ? <DayHero record={rec} version={ver} district={d.district} isToday mine showEnv={false} />
  : (
    <div className={'hero ' + LEVEL_CLASS[v.level]}>
      <HeroSky level={v.level} />
      <p className="hero-label">오늘의 내 얼굴 날씨</p>
      <h2 className="hero-name"><WeatherIcon level={v.level} size={48} />{WEATHER[v.level].name}</h2>
      <p className="hero-msg">{v.message}</p>
      {v.reasons.length > 0 && <ul className="hero-reasons">{v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {v.baseline && <Gauge value={d.today_redness} low={v.baseline.low} high={v.baseline.high} base={v.baseline_version} />}
    </div>
  )) : <EmptyDay isToday action={<button className="btn" onClick={() => go('capture')}>오늘 기록하기</button>} />)
  const todayRow = d && (
    <div className="rec rec-wide">
  <div className="rec-row">
    <span className="rec-k">셀카</span>
    <div className="rec-v"><div>{
      d.today_redness == null ? '사진 한 장 찍고 증상 네 가지를 고르면 돼요. 1분쯤 걸려요.'
        : !d.today_checkin ? `오늘 볼 붉은기 ${d.today_redness > 0 ? '+' : ''}${d.today_redness}. 증상까지 남기면 오늘 기록이 끝나요.`
          : `오늘 기록을 마쳤어요. 볼 붉은기 ${d.today_redness > 0 ? '+' : ''}${d.today_redness}`}</div></div>
    {d.today_cheeks && (
      <span className="cheek-pair small">{['L', 'R'].map((k) => <img key={k} src={d.today_cheeks[k]} alt={k === 'L' ? '오늘 왼쪽 볼' : '오늘 오른쪽 볼'} />)}</span>
    )}
    {d.today_redness == null && <button className="btn" onClick={() => go('capture')}>오늘 기록하기</button>}
    {d.today_redness != null && !d.today_checkin && !draft && (
      <button className="btn" onClick={() => { setDraft({}); setTimeout(() => document.getElementById('today-checkin')?.scrollIntoView({ block: 'center' }), 0) }}>증상 남기기</button>
    )}
  </div>
</div>
  )
  const checkinCard = d && (
    <div className="card" id="today-checkin">
  <h2 className="h3">오늘의 증상 기록</h2>
  {draft ? (
    <CheckinSteps initial={draft} saving={saving} error={error}
      onSave={(vals) => save(vals)} onCancel={() => { setDraft(null); setError(null) }} />
  ) : d.today_checkin ? (
    <div className="row">
      <div><b>저장했어요</b><KV className="small" items={symptomItems(d.today_checkin)} /></div>
      <button className="link" onClick={() => setDraft({ ...BLANK, ...d.today_checkin })}>수정하기</button>
    </div>
  ) : (
    <div className="row">
      <div><b>오늘은 아직이에요</b><p className="muted small">따가움, 화끈, 가려움, 당김을 0~3점으로 골라요.</p></div>
      <button className="btn" onClick={() => setDraft({})}>증상 기록하기</button>
    </div>
  )}
    </div>
  )
  const notice = d && (
    <div className="notice wide">
  <p>얼굴 날씨는 내 평소 기록과 비교한 결과일 뿐, 진단이 아니에요.</p>
  <p>따가움이나 화끈거림이 계속되면 제품 사용을 멈추고 보건소나 피부과 전문의와 상담해 주세요.</p>
  {!d.unlocked && <p>사진 기록이 {d.needed}일 쌓이면 달력, 변화, 리포트에서 내 기록을 볼 수 있어요. 지금까지 {d.redness_days}일이에요.</p>}
</div>
  )
  if (d && sub) return (
    <SubPage head={<header className="page-head"><div><h1>{fmt.full(day)}</h1></div></header>} tabs={tabs}>
      {sub !== 'recap' && <AskHead title={ASK[sub]} desc={DESC[sub]} onClose={closeSub} />}
      {sub === 'baseline' ? baselineCard : <Recap mine today={d.today} desc={DESC.recap} onClose={closeSub} />}
    </SubPage>
  )
  return (
    <section>
      <header className="page-head">
        <div>
          <h1>{d ? fmt.full(day) : '내 기록'}</h1>
        </div>
        {d && (
          <div className="head-actions">
            {past && <button className="btn ghost" onClick={() => setDate(null)}>오늘로 가기</button>}
            {tl.data && first && !wide && <PeriodToggle value={period} onChange={setPeriod} />}
          </div>
        )}
      </header>
      {tabs}
      {!wide && tl.data && first && (period === 'month'
        ? <Calendar date={day} first={first} today={d.today} onPick={pick} load={loadMine} />
        : <WeekStrip date={day} week={weekOf(day, records)} first={first} today={d.today} setDate={pick} />)}
      <p className="sr-only" role="status">{note}</p>
      <Status {...q} />
      {d && wide && tl.data && first && (
        <>
        <PolicyNotice mine={viewer?.consent_version} current={policyVersion} onLegal={onLegal} onConsented={onConsented} />
        <Dashboard today={d.today} first={first} date={day} records={records} versions={tl.data.versions} rec={rec}
          onPick={pick} load={loadMine}
          empty={past ? <p className="muted">이날은 기록이 없어요.</p>
            : <><p>오늘은 아직 사진이 없어요.</p><button className="btn" onClick={() => go('capture')}>오늘 기록하기</button></>}
          log={past ? (rec ? <PastLog rec={rec} ver={ver} /> : <p className="card muted">이날은 기록이 없어요. 달력에서 다른 날을 골라 보세요.</p>)
            : <><EnvToday district={d.district} env={d.env} today={d.today} onAccount={onAccount} />{todayRow}{checkinCard}</>}
          after={!past && notice} />
        </>
      )}
      {d && !(wide && tl.data && first) && past && (
        <PastDay rec={rec} ver={ver} district={d.district} changes={changes} />
      )}
      {d && !(wide && tl.data && first) && !past && (
        <>
        <PolicyNotice mine={viewer?.consent_version} current={policyVersion} onLegal={onLegal} onConsented={onConsented} />
        <EnvToday district={d.district} env={d.env} today={d.today} onAccount={onAccount} />
        {v && todayHero}
        {!d.unlocked && <FirstWeekCard d={d} mdc95={mdc95} go={go} draft={draft}
          onSymptoms={() => { setDraft({}); setTimeout(() => document.getElementById('today-checkin')?.scrollIntoView({ block: 'center' }), 0) }} />}
        {changes}
        {d.unlocked && todayRow}
        <InstallHint />
        <div className="today-cards">
          <div>
            {!d.unlocked && baselineCard}
            {checkinCard}
          </div>

        </div>
        {notice}
        </>
      )}
    </section>
  )
}
