// 촬영 정렬 가이드 판정 확인.   실행: npm test
import assert from 'node:assert/strict'
import { checkFrame, checkView, nextStreak, AUTO_FRAMES, GUIDE } from './guide.js'

const GOOD = { nFaces: 1, cx: 0.5, cy: 0.46, faceRatio: 0.5, yaw: 1, pitch: 5, roll: 0, brightness: 130 }
const key = (patch) => checkFrame({ ...GOOD, ...patch }).key

const tests = {
  '정렬이 맞으면 통과'() {
    const r = checkFrame(GOOD)
    assert.equal(r.ok, true); assert.equal(r.key, 'ok')
  },
  '얼굴·사람 수'() {
    assert.equal(key({ nFaces: 0 }), 'none'); assert.equal(key({ nFaces: 2 }), 'many')
  },
  '밝기는 얼굴보다 먼저 본다(어두우면 얼굴도 못 찾을 수 있음)'() {
    assert.equal(key({ brightness: 40, nFaces: 0 }), 'dark'); assert.equal(key({ brightness: 230 }), 'bright')
  },
  '크기와 위치'() {
    assert.equal(key({ faceRatio: 0.2 }), 'far'); assert.equal(key({ faceRatio: 0.9 }), 'near')
    assert.equal(key({ cx: 0.75 }), 'center'); assert.equal(key({ cx: 0.55, cy: 0.5 }), 'ok')
  },
  '고개 방향(위아래는 3.7° 보정 후)'() {
    assert.equal(key({ yaw: -9 }), 'yaw')
    assert.equal(key({ pitch: 11 }), 'ok')                     // 11 − 3.7 = 7.3 → 통과
    assert.equal(key({ pitch: 12 }), 'pitch')                  // 8.3 → 걸림
    assert.equal(key({ roll: 7 }), 'roll')
  },
  '품질 검사보다 엄격하다(찍은 뒤 떨어지지 않게)'() {
    assert.ok(GUIDE.maxYaw < 10 && GUIDE.maxPitch < 10 && GUIDE.maxRoll < 8 && GUIDE.minFace > 0.25)
    assert.ok(GUIDE.brightLo > 70 && GUIDE.brightHi < 210)
  },
  '보이는 타원 기준: 세로 카메라 화면(720x1280)을 390x844 화면에 잘라 보여 줄 때'() {
    // 화면 390x844, 타원 273x364(가운데 195, 362). 카메라 화면이 더 넓어서 좌우가 잘려 보인다(보이는 폭 = 카메라 폭의 82%).
    const v = { vw: 720, vh: 1280, el: { left: 0, top: 0, width: 390, height: 844 }, oval: { left: 58.5, top: 180, width: 273, height: 364 } }
    const at = (w, h = w * 1.25, cx = 0.5, cy = 362 / 844, more = {}) => {   // w, h: 얼굴 상자의 카메라 화면 비율. 화면에서 타원 가운데에 오게
      const s = 844 / 1280, dw = 720 * s, ox = (390 - dw) / 2
      const x = (195 - ox) / dw                        // 화면 가로 195px 의 카메라 좌표(뒤집기 전후 같음: 가운데)
      return checkView({ ...GOOD, box: { x0: x - w / 2, x1: x + w / 2, y0: cy - h / 2 * (720 / 1280), y1: cy + h / 2 * (720 / 1280) }, faceRatio: w, ...more }, v).key
    }
    // 타원을 거의 채운 얼굴(화면 폭 230px ≈ 카메라 폭 0.48): 예전 기준(사진 폭 0.80 넘으면 뒤로)과 달리 통과
    assert.equal(at(0.48), 'ok')
    // 예전에는 사진 폭의 80%를 넘으면 '뒤로'였다. 이제는 사진 안에 얼굴이 다 들어오면 통과(품질 검사에는 최대 크기가 없음)
    assert.equal(at(0.70), 'ok')
    assert.equal(at(0.90), 'ok')
    // 사진 가장자리에 닿으면(볼을 다 잴 수 없음) 뒤로
    assert.equal(at(0.99), 'near')
    // 타원의 절반도 안 되면 가까이
    assert.equal(at(0.25), 'far')
    // 화면 정보가 없으면 예전 판정 그대로
    assert.equal(checkView({ ...GOOD }, null).key, 'ok')
  },
  '보이는 타원 기준: 가로 카메라 화면(640x480)이어도 사진 폭 최소 크기는 지킨다'() {
    // 가로 화면을 세로 화면에 채우면 카메라 폭의 35%만 보인다. 타원을 채워도 사진 폭의 24%라 품질 검사(25%)에 걸리므로 가까이 오게 한다.
    const v = { vw: 640, vh: 480, el: { left: 0, top: 0, width: 390, height: 844 }, oval: { left: 58.5, top: 180, width: 273, height: 364 } }
    const s = 844 / 480, dw = 640 * s, ox = (390 - dw) / 2, x = (195 - ox) / dw
    const f = (w) => ({ ...GOOD, faceRatio: w, box: { x0: x - w / 2, x1: x + w / 2, y0: 0.3, y1: 0.55 } })
    assert.equal(checkView(f(0.22), v).key, 'far')
    assert.equal(checkView(f(0.30), v).key, 'ok')
  },
  '자동 촬영은 이어진 프레임으로만'() {
    let s = 0
    for (let i = 0; i < AUTO_FRAMES - 1; i++) s = nextStreak(s, true)
    assert.ok(s < AUTO_FRAMES)
    assert.equal(nextStreak(s, false), 0)                      // 한 번 어긋나면 처음부터
    assert.equal(nextStreak(s, true), AUTO_FRAMES)
  },
}

let failed = 0
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('통과:', name) } catch (e) { failed++; console.error('실패:', name, '\n ', e.message) }
}
if (failed) { console.error(`${failed}개 실패`); process.exit(1) }
