// 촬영 정렬 가이드: 카메라 한 프레임의 얼굴 위치·크기·방향 → 맞는지와 안내 문구 한 줄.
// 기준은 품질 검사(backend/app/quality.py DEFAULT_THRESHOLDS)와 같은 항목이되, 찍은 뒤 떨어지지 않게 조금 더 엄격하게 둔다.
// 품질 검사가 최종 판정이고, 이 가이드는 '찍기 전에 맞추도록' 돕기만 한다.
export const GUIDE = {
  maxYaw: 8, maxPitch: 8, pitchOffset: 3.7, maxRoll: 6,     // 품질 검사: 10 / 10(보정 3.7) / 8
  minFace: 0.30, maxFace: 0.80,                              // 품질 검사: 0.25 이상
  centerX: 0.5, centerY: 0.46, maxOffset: 0.12,              // 화면의 타원 위치(styles.css .view .oval)와 맞춤
  brightLo: 80, brightHi: 200,                               // 품질 검사: 70~210
}

const HINT = {
  none: '얼굴이 화면에 들어오게 해 주세요',
  many: '한 명만 나오게 해 주세요',
  dark: '조금 더 밝은 곳으로 가 주세요',
  bright: '빛이 너무 세요. 그늘진 쪽으로 옮겨 주세요',
  far: '조금 더 가까이 와 주세요',
  near: '조금 뒤로 가 주세요',
  center: '얼굴을 타원 가운데에 맞춰 주세요',
  yaw: '정면을 봐 주세요',
  pitch: '폰을 눈높이에 맞춰 주세요',
  roll: '고개를 똑바로 세워 주세요',
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

// 자동 촬영: 맞는 프레임이 이어지는 동안 세고, 기준(약 1초)을 넘기면 찍을 때라고 알려 준다. 어긋나면 처음부터.
export function nextStreak(streak, ok) {
  return ok ? streak + 1 : 0
}
export const AUTO_FRAMES = 8          // 프레임 간격 125ms × 8 ≈ 1초
