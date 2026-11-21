// 촬영 정렬 가이드 판정 확인.   실행: npm test
import assert from 'node:assert/strict'
import { checkFrame, nextStreak, AUTO_FRAMES, GUIDE } from './guide.js'

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
