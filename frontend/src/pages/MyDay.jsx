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
      <p className="notice env-today">사는 지역을 선택하면 초미세먼지, 습도, 기온도 함께 볼 수 있어요.{' '}
        <button className="link" onClick={onAccount}>내 계정에서 선택하기</button></p>
    )
  }
  const when = env?.measured_on && env.measured_on !== today ? `${+env.measured_on.slice(5, 7)}/${+env.measured_on.slice(8)} 측정값` : ''
  const has = env && (env.pm25 != null || env.humidity != null || env.temp != null)
  return (
    <div className="notice env-today">
      <p><b>{district} 환경 정보</b>{has && <span className="muted"> {env.unusual ? '평소와 다른 환경이에요.' : '평소와 비슷해요.'}</span>}</p>
      {has
        ? <KV className="small" items={[['초미세먼지', env.pm25 != null && env.pm25], ['습도', env.humidity != null && `${env.humidity}%`], ['기온', env.temp != null && `${env.temp}℃`]]} />
        : <p>오늘의 환경 정보는 아직 없어요. 보통 다음 날 아침에 확인할 수 있어요.</p>}
      {when && <span className="sub-line">{when}</span>}
      {env?.facts?.length > 0 && <p className="small">{env.facts.join(' ')}</p>}
    </div>
  )
}

// 처리방침이 바뀌었는데 아직 동의하지 않은 사용자에게 무엇이 바뀌었는지 한 번에 알린다(촬영 화면과 따로).
const POLICY_CHANGES = [
  ['2026-11-19', '얼굴 전체 사진은 기기에서 분석하고, 서버에는 측정값만 보내요.'],
  ['2026-11-20', '내 루틴(제품명, 성분 목록, 사용 횟수)을 저장해요.'],
  ['2026-11-21', '거주 지역을 저장해요(선택).'],
  ['2026-11-24', '루틴에 제품 사진을 작게 줄여 저장해요(선택).'],
  ['2026-11-23', '볼 밝기 측정값도 기록해요. 선택 동의로 AI로 피부 리포트 문장 다듬기가 생겼어요. 내 계정에서 선택할 수 있어요.'],
  ['2026-11-22', '촬영 조건을 충족한 사진의 볼 색상 측정값(붉은기, 조명 확인용 노란기)을 하루 1번 기록해요. 얼굴 사진은 저장하지 않아요. 동의해야 얼굴 날씨를 확인할 수 있어요.'],
  ['2026-11-26', 'AI로 피부 리포트 문장 다듬기에 동의하면 가명 처리한 기록 요약을 미국의 AI 서비스(Anthropic Claude)에 보내요. 볼 일부 사진 저장 동의는 없앴고, 서비스 개선을 위한 얼굴 사진 제공(선택 동의)이 생겼어요. 이 동의는 받기만 하고 아직 사진은 받지 않아요.'],
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
  if (!prev) return '첫 사진 기록이에요. 다음 사진부터 이전 기록과 비교할 수 있어요.'
  const gap = Math.round((Date.parse(d.today) - Date.parse(prev.date)) / 86400000)
  const wa = gap === 1 ? '어제와' : `${gap}일 전(${fmt.md(prev.date)})과`
  const diff = Math.round((d.today_redness - prev.redness) * 10) / 10
  if (diff === 0) return `볼 붉은기가 ${wa} 같아요.`
  const amt = `${diff > 0 ? '+' : '-'}${Math.abs(diff).toFixed(1)}`
  return Math.abs(diff) <= mdc95
    ? `${wa} 붉은기 차이는 ${amt}예요. 측정 오차 범위(±${mdc95}) 안이라 뚜렷한 변화는 확인하기 어려워요.`
    : `${wa} 붉은기 차이는 ${amt}예요. 측정 오차(±${mdc95})보다 큰 차이예요. 아직 붉은기 범위를 만드는 중이라 평소와 비교할 수 없어요.`
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
        <span className="fw-step">비교 기준 만들기 {Math.min(d.redness_days, d.needed)}/{d.needed}일</span>
      </div>
      {d.today_redness == null ? (
        <>
          <p className="fw-empty">오늘은 아직 사진이 없어요</p>
          <p className="muted small">사진 한 장과 피부 증상을 기록해 보세요.</p>
          <div className="actions left"><button className="btn" onClick={() => go('capture')}>오늘의 피부 기록하기</button></div>
        </>
      ) : (
        <>
          <div className="fw-main">
            <div>
              <p className="fw-k">오늘 볼 붉은기</p>
              <p className="fw-big">{d.today_redness.toFixed(1)}</p>
            </div>
          </div>
          {range && <p className="fw-range">지금까지의 붉은기 범위 <b>{range.lo} ~ {range.hi}</b> <span className="muted">(사진 {range.n}일)</span></p>}
          <details className="fw-what">
            <summary>붉은기 수치란?</summary>
            <p>사진 속 양쪽 볼이 얼마나 붉게 보이는지 나타내는 수치예요. 클수록 붉고, 0이면 붉지도 초록빛이 돌지도 않는 색이에요. 색을 숫자로 나타내는 Lab 방식의 a* 값이에요.</p>
            <p>사람마다 피부색이 다르기 때문에 숫자 하나만으로 피부 상태를 평가할 수 없어요. 그래서 7일 동안 기록한 사진으로 붉은기 범위를 만들고, 그 범위와 비교해요.</p>
            <p>예비 측정 오차는 약 ±{mdc95 ?? 2.35}예요. 같은 얼굴을 다시 찍어도 이만큼은 달라질 수 있어서, 두 날의 차이가 이보다 작으면 실제 변화인지 구분하기 어려워요.</p>
          </details>
          {cmp && <p className="fw-cmp">{cmp}</p>}
          <ul className="fw-list">
            <li><span className="fw-k">사진</span>{todayRec?.light ? '사진을 기록했어요. 다만 조명이 평소와 달라 비교하지 않았어요.' : '사진이 비교하기에 적합해요.'}</li>
            <li><span className="fw-k">증상</span>{d.today_checkin ? symptomText(d.today_checkin) : '아직 증상을 기록하지 않았어요.'}</li>
          </ul>
          {!d.today_checkin && !draft && <div className="actions left"><button className="btn" onClick={onSymptoms}>증상 기록하기</button></div>}
        </>
      )}
      <p className="fw-foot">{left > 0
        ? `아직 붉은기 범위를 만드는 중이에요. 사진 기록이 ${left}일 더 쌓이면 다음 사진부터 얼굴 날씨를 확인할 수 있어요.`
        : '비교에 필요한 사진 기록이 쌓였어요. 다음 사진부터 얼굴 날씨를 확인할 수 있어요.'}</p>
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
            <span className="rec-k">얼굴 사진</span>
            <div className="rec-v"><div>{rec.redness != null ? `볼 붉은기 ${sgn(rec.redness)}` : rec.quality_note}<p className="muted small">얼굴 전체 사진은 서버에 저장하지 않아요. 볼 색상 측정값만 기록해요.</p></div></div>
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
    try { q.setData(await api.checkin(vals)); setDraft(null); setNote('오늘의 피부 증상을 저장했어요.') }
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
              <h2 className="h3">붉은기 범위</h2>
              <div className="dots" role="img" aria-label={`필요한 ${d.needed}일 중 ${filled}일 사진 기록`}>
                {Array.from({ length: d.needed }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
              </div>
              {d.redness_days >= d.needed
                ? <KV items={[['비교 기준', `${d.needed}일 충족`], ['누적 사진 기록', `${d.redness_days}일`]]} />   /* 최소 필요 일수와 누적 일수를 섞어 보이지 않게 */
                : <p className="bignum" aria-label={`사진 기록 ${d.redness_days}일, 필요 ${d.needed}일`}><span className="num">{d.redness_days}</span><span className="num-u">/ {d.needed}일 사진 기록</span></p>}
              <p>{d.redness_days >= d.needed ? '붉은기 범위가 만들어졌어요. 사진을 기록하면 평소와 비교한 결과를 확인할 수 있어요.' : `사진 기록이 ${d.needed}일 쌓이면 다음 사진부터 평소와 비교할 수 있어요.`}</p>
              <p className="muted small">같은 스마트폰으로 비슷한 장소와 시간대에 촬영해 주세요. 얼굴 전체 사진은 서버에 저장하지 않아요.</p>
            </div>
  )
  const ASK = d && { baseline: '붉은기 확인하기', recap: 'Monthly Skin Recap' }
  const DESC = { baseline: '사진 기록을 바탕으로 만든 나의 붉은기 비교 기준이에요.', recap: '한 달간의 피부 기록을 돌아보세요.' }
  const tabs = d && <AskButtons value={sub} onChange={(v) => (v ? openSub(v) : closeSub())} items={[
    d.unlocked && { id: 'baseline', icon: ICONS.range, label: ASK.baseline }, { id: 'recap', icon: ICONS.spark, label: ASK.recap }]} />
  // 오늘 화면 조각들: 폰(한 열)과 PC 대시보드가 같은 조각을 다른 자리에 놓는다
  const todayHero = d && (
    v ? (rec
  ? <DayHero record={rec} version={ver} district={d.district} isToday mine showEnv={false} />
  : (
    <div className={'hero ' + LEVEL_CLASS[v.level]}>
      <HeroSky level={v.level} />
      <p className="hero-label">오늘의 얼굴 날씨</p>
      <h2 className="hero-name"><WeatherIcon level={v.level} size={48} />{WEATHER[v.level].name}</h2>
      <p className="hero-msg">{v.message}</p>
      {v.reasons.length > 0 && <ul className="hero-reasons">{v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {v.baseline && <Gauge value={d.today_redness} low={v.baseline.low} high={v.baseline.high} base={v.baseline_version} />}
    </div>
  )) : <EmptyDay isToday action={<button className="btn" onClick={() => go('capture')}>오늘의 피부 기록하기</button>} />)
  const todayRow = d && (
    <div className="rec rec-wide">
  <div className="rec-row">
    <span className="rec-k">얼굴 사진</span>
    <div className="rec-v"><div>{
      d.today_redness == null ? '사진 한 장과 피부 증상을 기록해 보세요.'
        : !d.today_checkin ? '오늘의 사진을 기록했어요. 피부 증상도 기록해 주세요.'
          : `오늘의 피부 기록을 저장했어요. 볼 붉은기 ${d.today_redness > 0 ? '+' : ''}${d.today_redness}`}</div></div>
    {d.today_redness == null && <button className="btn" onClick={() => go('capture')}>오늘의 피부 기록하기</button>}
    {d.today_redness != null && !d.today_checkin && !draft && (
      <button className="btn" onClick={() => { setDraft({}); setTimeout(() => document.getElementById('today-checkin')?.scrollIntoView({ block: 'center' }), 0) }}>증상 기록하기</button>
    )}
  </div>
</div>
  )
  const checkinCard = d && (
    <div className="card" id="today-checkin">
  <h2 className="h3">{d.today_checkin && !draft ? '오늘의 피부 기록' : '오늘의 피부 기록하기'}</h2>
  {draft ? (
    <CheckinSteps initial={draft} saving={saving} error={error}
      onSave={(vals) => save(vals)} onCancel={() => { setDraft(null); setError(null) }} />
  ) : d.today_checkin ? (
    <div className="row">
      <div><b>저장했어요</b><KV className="small" items={symptomItems(d.today_checkin)} /></div>
      <button className="link" onClick={() => setDraft({ ...BLANK, ...d.today_checkin })}>증상 수정</button>
    </div>
  ) : (
    <div className="row">
      <div><b>아직 증상을 기록하지 않았어요.</b><p className="muted small">따가움, 화끈거림, 가려움, 당김을 기록해 주세요.</p></div>
      <button className="btn" onClick={() => setDraft({})}>증상 기록하기</button>
    </div>
  )}
    </div>
  )
  const notice = d && (
    <div className="notice wide">
  <p>얼굴 날씨는 평소 붉은기와 비교한 결과이며 의료 진단이 아니에요.</p>
  <p>따가움이나 화끈거림이 계속되면 해당 제품 사용을 중단하고 피부과 전문의와 상담해 주세요.</p>
  {!d.unlocked && <p>사진 기록이 {d.needed}일 쌓이면 달력, 변화, 피부 리포트에서 내 기록을 볼 수 있어요. 지금까지 {d.redness_days}일이에요.</p>}
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
            : <><p>오늘은 아직 사진이 없어요.</p><button className="btn" onClick={() => go('capture')}>오늘의 피부 기록하기</button></>}
          log={past ? (rec ? <PastLog rec={rec} ver={ver} /> : <p className="card muted">이날은 기록이 없어요. 달력에서 다른 날짜를 선택해 주세요.</p>)
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
