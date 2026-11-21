// 홈 화면 앱 설치 조건(크롬의 '설치' 버튼은 fetch 처리기가 있는 서비스 워커를 요구)을 채우는 최소 서비스 워커.
// 아무것도 저장(캐시)하지 않는다: 건강 기록 앱이라 오래된 화면·데이터가 폰에 남지 않게. 화면 이동 요청만 다루고,
// 인터넷이 끊겼을 때만 안내 문장을 보여 준다. API·사진·얼굴 모델·OCR 요청은 건드리지 않는다.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const r = e.request
  if (r.method !== 'GET' || r.mode !== 'navigate') return
  e.respondWith(fetch(r).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>낯씨</title>' +
    '<p style="font-family:sans-serif;padding:32px;line-height:1.6">인터넷에 연결되지 않았어요.<br>연결된 뒤 다시 열어 주세요.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
})
