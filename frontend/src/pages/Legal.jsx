import { useEffect } from 'react'

// 가입 동의와 처리방침 화면. 실제 서비스 전에는 법률 검토를 받고 [ ] 안의 값을 채워 주세요.
export default function Legal({ anchor, back, version }) {
  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: 'start' })
    else window.scrollTo(0, 0)
  }, [anchor])

  return (
    <section className="legal">
      <header className="page-head"><div><p className="eyebrow">시행 기준 {version}</p><h1>약관과 개인정보 처리방침</h1></div>
        <button className="btn ghost" onClick={back}>돌아가기</button></header>
      <p className="notice">공모전 시연용 <b>초안</b>이에요. 실제 서비스 전에 법률 검토를 받고, [대괄호] 항목을 채워야 해요.
        증상 점수는 건강에 관한 정보로 볼 수 있어 별도 동의가 필요한지 확인이 필요해요.</p>

      <div className="legal-body">
      <nav className="toc card" aria-label="목차">
        <h3>목차</h3>
        {[['terms', '이용약관'], ['privacy', '개인정보 수집·이용'], ['photo', '얼굴 사진 처리 안내'], ['health', '건강 정보(증상 점수) 별도 동의']].map(([id, label]) => (
          <button key={id} className="link" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{label}</button>
        ))}
      </nav>
      <div className="legal-text">
      <article className="card" id="terms">
        <h2>이용약관</h2>
        <ol>
          <li>낯씨는 매일의 얼굴 사진과 증상 체크인으로 루틴 변화 전후를 정리해 보여주는 기록 서비스예요.</li>
          <li><b>진단이나 치료를 하지 않아요.</b> 결과는 참고용이며, 증상이 계속되면 사용을 멈추고 보건소·전문의와 상담해 주세요.</li>
          <li>현재 화면의 기본 기록은 가상 데이터예요. 붉은기 측정은 아직 연결되지 않았고, 로그인하면 내 증상 체크인이 그 위에 반영돼요.</li>
          <li>제품 판매·광고·추천을 하지 않아요. 특정 제품을 사거나 쓰라고 권하지 않아요.</li>
          <li>이용자는 언제든 앱 안에서 내 데이터를 내려받거나 지우고 탈퇴할 수 있어요.</li>
          <li>서비스는 만 14세 이상이 쓸 수 있어요. (개인정보 보호법상 만 14세 미만은 법정대리인 동의가 필요해 받지 않아요.)</li>
        </ol>
      </article>

      <article className="card" id="privacy">
        <h2>개인정보 수집·이용 (처리방침)</h2>
        <h3>1. 수집하는 항목</h3>
        <ul>
          <li><b>가입 때:</b> 이메일, 비밀번호. 비밀번호는 로그인 서비스(Supabase)가 암호화해 보관하고, 낯씨 서버는 저장하지 않아요.</li>
          <li><b>이용 중:</b> 날짜별 증상 체크인 점수(따가움·화끈·가려움·당김, 각 0~3) — 건강에 관한 정보라서 아래 ‘건강 정보 별도 동의’로 따로 받아요.</li>
          <li><b>동의 기록:</b> 동의한 약관 버전과 시각.</li>
          <li>서버 접속 정보(IP 등)는 호출 횟수 제한을 위해 서버 메모리에서만 잠깐 쓰고 저장하지 않아요. 호스팅 업체(Vercel)의 서버 로그에는 남을 수 있어요.</li>
        </ul>
        <h3>2. 이용 목적</h3>
        <p>로그인 확인, 내 증상 체크인 저장과 변화 표시, 리포트 문장 생성에만 써요. 광고나 다른 목적으로 쓰지 않아요.</p>
        <h3>3. 보유 기간</h3>
        <p>가입부터 탈퇴까지 보관하고, 탈퇴하면 내 체크인과 계정 정보를 바로 지워요. 낯씨는 법령상 따로 보관해야 하는 정보를 수집하지 않아요. 호스팅 업체(Vercel)의 서버 로그는 업체 정책에 따라 일정 기간 뒤 자동으로 지워져요.</p>
        <h3>4. 처리를 맡기는 곳 (국외 이전 가능)</h3>
        <ul>
          <li><b>Supabase</b> — 로그인과 데이터베이스 (서버 위치: 일본 도쿄 리전 — 국외 이전)</li>
          <li><b>Vercel</b> — 서비스 호스팅</li>
          <li><b>OpenRouter 및 모델 제공 업체</b> — 리포트 문장 작성. <b>이메일·이름·사진은 보내지 않고</b>, 판정 요약(루틴 버전, 기간, 점수, 기록 번호)만 보내요.</li>
        </ul>
        <h3>5. 이용자의 권리</h3>
        <p>‘내 계정’ 화면에서 내 데이터를 파일로 내려받고(열람), 체크인을 모두 지우고, 탈퇴(삭제)할 수 있어요. 동의를 거부할 수 있지만, 필수 항목에 동의하지 않으면 가입할 수 없어요. 로그인 없이 쓰는 가상 데모는 계속 볼 수 있어요.</p>
        <h3>6. 안전성 확보 조치</h3>
        <p>전송 구간은 HTTPS로 보호하고, 데이터베이스는 본인 행만 접근할 수 있게 막아요. 비밀 키는 서버에만 두고 화면 코드에는 넣지 않아요. 반복 호출과 큰 파일은 제한해요.</p>
        <h3>7. 문의</h3>
        <p>개인정보 보호책임자: 낯씨 팀 (시연용 표기, 실제 서비스 전 지정 예정) · privacy@example.com</p>
      </article>

      <article className="card" id="health">
        <h2>건강 정보(증상 점수) 별도 동의</h2>
        <ul>
          <li><b>항목:</b> 따가움·화끈·가려움·당김 점수(각 0~3). 피부 상태에 관한 정보라 개인정보 보호법상 민감정보(건강 정보)로 볼 수 있어, 다른 동의와 따로 받아요.</li>
          <li><b>목적:</b> 내 변화 기록과 ‘안 맞는 제품 신호’ 표시, 리포트 문장 생성. 진단·광고·판매에는 쓰지 않아요.</li>
          <li><b>보유:</b> 탈퇴하거나 내 계정 화면에서 체크인을 지울 때까지.</li>
          <li><b>거부:</b> 동의하지 않을 수 있지만, 이 정보 없이는 가입해 체크인을 남길 수 없어요. 로그인 없는 가상 데모는 계속 볼 수 있어요.</li>
        </ul>
      </article>

      <article className="card" id="photo">
        <h2>얼굴 사진 처리 안내</h2>
        <ul>
          <li>촬영하거나 고른 사진은 <b>밝기와 해상도 검사를 위해 서버로 보내져요.</b> 검사가 끝나면 <b>바로 버리고 저장하지 않아요.</b></li>
          <li>사진은 AI 모델(리포트 작성)에 보내지 않아요.</li>
          <li>얼굴로 사람을 식별하지 않아요. 붉은기 측정은 아직 연결되지 않았고, 연결할 때는 이 안내를 먼저 바꾸고 다시 동의를 받을게요.</li>
          <li>사진은 JPG·PNG·WEBP, 4MB 이하만 올릴 수 있어요. 큰 사진은 올리기 전에 자동으로 줄여요.</li>
        </ul>
      </article>
      </div>
      </div>
    </section>
  )
}
