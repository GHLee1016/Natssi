// 촬영 정렬 가이드: 카메라 한 프레임의 얼굴 위치·크기·방향 → 맞는지와 안내 문구 한 줄.
// 기준은 품질 검사(backend/app/quality.py DEFAULT_THRESHOLDS)와 같은 항목이되, 찍은 뒤 떨어지지 않게 조금 더 엄격하게 둔다.
// 품질 검사가 최종 판정이고, 이 가이드는 '찍기 전에 맞추도록' 돕기만 한다.
export const GUIDE = {
  maxYaw: 8, maxPitch: 8, pitchOffset: 3.7, maxRoll: 6,     // 품질 검사: 10 / 10(보정 3.7) / 8
  minFace: 0.27, maxFace: 0.80,                              // 품질 검사: 0.25 이상(사진 폭 기준). maxFace는 화면 정보가 없을 때만 쓴다
  ovalMin: 0.55, ovalOffset: 0.18,                           // 보이는 타원 기준: 얼굴 폭이 타원 폭의 55% 이상, 가운데에서 18% 안
  centerX: 0.5, centerY: 0.46, maxOffset: 0.12,              // 화면의 타원 위치(styles.css .view .oval)와 맞춤
  brightLo: 80, brightHi: 200,                               // 품질 검사: 70~210
}

const HINT = {
  none: '얼굴이 화면에 들어오게 해 주세요',
  many: '한 사람의 얼굴만 화면에 담아 주세요',
  dark: '더 밝은 곳으로 가 주세요',
  bright: '빛이 너무 강해요. 조명이 덜 강한 곳으로 옮겨 주세요',
  far: '더 가까이 와 주세요',
  near: '살짝 뒤로 가 주세요',
  center: '얼굴을 타원 가운데에 맞춰 주세요',
  yaw: '정면을 바라봐 주세요',
  pitch: '스마트폰을 눈높이에 맞춰 주세요',
  roll: '고개를 기울이지 말아 주세요',
  ok: '좋아요, 그대로 있어 주세요',
}

const bad = (v, limit) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) > limit

// f: { nFaces, cx, cy (얼굴 상자 가운데, 0~1), faceRatio (얼굴 폭 / 화면 폭), yaw, pitch, roll, brightness (0~255) }
// 반환: { ok, key, hint } — key 는 무엇이 문제인지(화면 표시·테스트용)
export function checkFrame(f, g = GUIDE) {
  const pick = (key) => ({ ok: key === 'ok', key, hint: HINT[key] })
  if (typeof f.brightness === 'number' && f.brightness < g.brightLo) return pick('dark')
  if (typeof f.brightness === 'number' && f.brightness > g.brightHi) return pick('bright')
  if (!f.nFaces) return pick('none')
  if (f.nFaces > 1) return pick('many')
  if (f.faceRatio < g.minFace) return pick('far')
  if (f.faceRatio > g.maxFace) return pick('near')
  if (Math.hypot(f.cx - g.centerX, f.cy - g.centerY) > g.maxOffset) return pick('center')
  if (bad(f.yaw, g.maxYaw)) return pick('yaw')
  if (bad(typeof f.pitch === 'number' ? f.pitch - g.pitchOffset : NaN, g.maxPitch)) return pick('pitch')
  if (bad(f.roll, g.maxRoll)) return pick('roll')
  return pick('ok')
}

// 화면에 보이는 대로 판정한다. 전체 화면 카메라는 카메라 화면의 가운데만 잘라 보여 주고(object-fit: cover) 좌우를 뒤집으므로,
// 카메라 화면 전체 폭에 대한 얼굴 비율(faceRatio)만 보면 타원 안에서는 맞아 보여도 '뒤로 가 주세요'가 계속 나올 수 있다.
// f.box: 얼굴 상자(카메라 화면 기준 0~1). v: { vw, vh (카메라 화면 크기), el (영상이 놓인 칸), oval (타원) } — el과 oval은 화면 좌표.
// '뒤로 가 주세요'는 얼굴이 찍힐 사진의 가장자리에 닿을 때만 한다(볼을 다 잴 수 없을 때). 품질 검사에는 최대 크기가 없어서,
// 사진 안에 얼굴이 다 들어오면 화면에서 타원보다 크게 보여도 찍는다. 앞 카메라를 확대해 보내는 폰에서 '뒤로'가 끝나지 않던 문제.
// 사진 폭 기준 최소 크기(품질 검사)는 그대로 지킨다.
export function viewBox(f, v) {
  const s = Math.max(v.el.width / v.vw, v.el.height / v.vh)
  const dw = v.vw * s, dh = v.vh * s
  const ox = v.el.left + (v.el.width - dw) / 2, oy = v.el.top + (v.el.height - dh) / 2
  return { x0: ox + (1 - f.box.x1) * dw, x1: ox + (1 - f.box.x0) * dw, y0: oy + f.box.y0 * dh, y1: oy + f.box.y1 * dh }   // 좌우 뒤집힘
}
export function checkView(f, v, g = GUIDE) {
  if (!v || !f.box || !v.vw || !v.vh || !v.oval?.width) return checkFrame(f, g)
  const pick = (key) => ({ ok: key === 'ok', key, hint: HINT[key] })
  if (typeof f.brightness === 'number' && f.brightness < g.brightLo) return pick('dark')
  if (typeof f.brightness === 'number' && f.brightness > g.brightHi) return pick('bright')
  if (!f.nFaces) return pick('none')
  if (f.nFaces > 1) return pick('many')
  const b = viewBox(f, v), o = v.oval
  const w = b.x1 - b.x0
  const cut = f.box.x0 < 0.01 || f.box.x1 > 0.99 || f.box.y0 < 0.01 || f.box.y1 > 0.99      // 찍힐 사진(카메라 화면) 가장자리에 닿음
  if (f.faceRatio < g.minFace || w < g.ovalMin * o.width) return pick('far')
  if (cut) return pick('near')
  const dx = Math.abs((b.x0 + b.x1) / 2 - (o.left + o.width / 2)), dy = Math.abs((b.y0 + b.y1) / 2 - (o.top + o.height / 2))
  if (dx > g.ovalOffset * o.width || dy > g.ovalOffset * o.height) return pick('center')
  if (bad(f.yaw, g.maxYaw)) return pick('yaw')
  if (bad(typeof f.pitch === 'number' ? f.pitch - g.pitchOffset : NaN, g.maxPitch)) return pick('pitch')
  if (bad(f.roll, g.maxRoll)) return pick('roll')
  return pick('ok')
}

// 자동 촬영: 맞는 프레임이 이어지는 동안 세고, 기준(약 1초)을 넘기면 찍을 때라고 알려 준다. 어긋나면 처음부터.
export function nextStreak(streak, ok) {
  return ok ? streak + 1 : 0
}
export const AUTO_FRAMES = 8          // 프레임 간격 125ms × 8 ≈ 1초
