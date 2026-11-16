import { useState } from 'react'
import { api, fmt } from '../api.js'
import { useLoad, Status } from '../useLoad.jsx'

const SYMPTOMS = ['따가움', '화끈', '가려움', '당김']
const BLANK = { 따가움: 0, 화끈: 0, 가려움: 0, 당김: 0 }
const line = (s) => SYMPTOMS.map((k) => `${k} ${s[k] ?? 0}`).join(' · ')

// 로그인한 사용자의 첫 화면: 오늘 체크인과 '평소 범위까지 N/7일'. 판정·리포트는 김서연 데모에서만 보여준다.
export default function MyDay({ go }) {
  const q = useLoad(() => api.me(), [])
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const d = q.data

  const save = async () => {
    setSaving(true); setError(null)
    try { q.setData(await api.checkin(draft)); setDraft(null) }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }
  const filled = d ? Math.min(d.days_recorded, d.needed) : 0

  return (
    <section>
      <header className="page-head">
        <div><p className="eyebrow">오늘</p><h1>{d ? fmt.full(d.today) : '내 기록'}</h1></div>
      </header>
      <Status {...q} />
      {d && (
        <div className="grid2">
          <div>
            <div className="card">
              <h3>내 평소 범위</h3>
              <div className="dots" role="img" aria-label={`${filled}일 기록 / 필요 ${d.needed}일`}>
                {Array.from({ length: d.needed }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
              </div>
              <p><b>{d.days_recorded}일</b> 기록했어요. {d.needed}일 이상 쌓이면 내 평소 범위를 만들 수 있어요.</p>
              <p className="muted small">붉은기 측정은 아직 준비 중이라, 지금은 증상 체크인만 쌓여요.</p>
            </div>

            <div className="card">
              <h3>오늘의 증상 체크인 {draft && <span className="muted small">0 없음 ~ 3 심함</span>}</h3>
              {draft ? (
                <>
                  {SYMPTOMS.map((s) => (
                    <div className="scale" key={s} role="group" aria-label={s}>
                      <span>{s}</span>
                      {[0, 1, 2, 3].map((n) => (
                        <button key={n} className={draft[s] === n ? 'on' : ''} aria-pressed={draft[s] === n}
                          onClick={() => setDraft({ ...draft, [s]: n })}>{n}</button>
                      ))}
                    </div>
                  ))}
                  {error && <p className="err" role="alert">{error}</p>}
                  <div className="actions">
                    <button className="btn ghost" onClick={() => { setDraft(null); setError(null) }}>취소</button>
                    <button className="btn" onClick={save} disabled={saving}>{saving ? '저장하는 중…' : '체크인 저장'}</button>
                  </div>
                </>
              ) : d.today_checkin ? (
                <div className="row">
                  <div><b>저장했어요</b><p className="muted small">{line(d.today_checkin)}</p></div>
                  <button className="link" onClick={() => setDraft({ ...BLANK, ...d.today_checkin })}>수정하기</button>
                </div>
              ) : (
                <div className="row">
                  <div><b>오늘은 아직이에요</b><p className="muted small">따가움·화끈·가려움·당김을 0~3으로 남겨요.</p></div>
                  <button className="btn" onClick={() => setDraft({ ...BLANK })}>체크인하기</button>
                </div>
              )}
            </div>

            <div className="card">
              <div className="row">
                <i className="thumb plain" />
                <div><b>셀카</b><p className="muted small">지금은 밝기·해상도만 검사하고 바로 버려요.</p></div>
                <button className="link" onClick={() => go('capture')}>촬영하기</button>
              </div>
            </div>
          </div>

          <div>
            <div className="card">
              <h3>최근 기록</h3>
              {d.recent.length === 0 && <p className="muted small">아직 기록이 없어요. 오늘 첫 체크인을 남겨 보세요.</p>}
              {d.recent.map((r) => (
                <div className="ev" key={r.date}>
                  <b>{fmt.md(r.date)}</b>
                  <div>{line(r.symptoms)}</div>
                </div>
              ))}
            </div>
            <p className="notice">판정과 리포트는 로그아웃하면 볼 수 있는 김서연 가상 데모에서 보여 드려요. 내 기록이 쌓이면 내 데이터로 보여 드릴게요.</p>
          </div>
        </div>
      )}
    </section>
  )
}
