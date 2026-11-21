// 측정 계산이 검증 파이프라인(파이썬·OpenCV)과 같은지 확인합니다.   실행: npm test  (또는 node src/measure/core.test.mjs)
// 기준값은 natssi_selfie_validation/code/measure_redness.py 로 같은 그림을 재서 얻은 값이에요.
import assert from 'node:assert/strict'
import { srgbToLab, roiStats, polygonMask, sharpness, eulerFromMatrix, extractFeatures, roundHalfEven, median, distinctFaces } from './core.js'

const REF = {"W": 640, "H": 800, "poly": [[150.4, 300.5], [260.5, 290.2], [300.7, 380.1], [240.2, 470.6], [160.9, 450.3], [120.5, 380.5]], "roi": {"n": 22668, "clip_ratio": 0.024234858594119925, "L": 56.61574359658328, "a": -0.049750771059481336, "a_mean": 0.9677647530593484, "b": 15.130836637853973}, "sharp_big": 3133.2447613400873, "sharp_small": 1144.0406893042382, "mat_col": [0.976807083442103, 0.05119229003114495, 0.20791169081775934, 0.0, -0.0807226856600027, 0.987396562469373, 0.1361318347907717, 0.0, -0.1983223884415696, -0.14975773056851757, 0.9686283355228664, 0.0, 0.5, -1.0, -42.0, 1.0], "euler": [-12.000000000000002, 7.999999999999998, 3.0000000000000004], "lab_white": [100.00000386666655, -1.6666666158293708e-05, 6.666666463317483e-06], "lab_red": [53.240794141307205, 80.09245959641115, 67.20319651585298]}

function testImage() {
  const { W, H } = REF, data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4
    let r = (x * 7 + y * 3) % 256, g = (x * 5 + y * 11 + 40) % 200 + 30, b = (x * 3 + y * 2 + 90) % 180 + 20
    if (y < 60) r = g = b = 255
    if (y >= 700) r = g = b = 8
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255
  }
  return { data, width: W, height: H }
}

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (허용 ${tol})`)
const tests = {
  '색 변환 기준색'() {
    srgbToLab(255, 255, 255).forEach((v, i) => close(v, REF.lab_white[i], 1e-6, '흰색'))
    srgbToLab(255, 0, 0).forEach((v, i) => close(v, REF.lab_red[i], 1e-6, '빨강'))
  },
  '반올림·중앙값'() {
    assert.deepEqual([0.5, 1.5, 2.5, -0.5, 2.4].map(roundHalfEven), [0, 2, 2, -0, 2])
    assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 2, 3]), 2.5)
  },
  '볼 영역 통계(a* 중앙값·날아간 비율)'() {
    const img = testImage(), st = roiStats(img, polygonMask(img.width, img.height, REF.poly))
    close(st.n / REF.roi.n, 1, 0.005, '픽셀 수 비율')
    close(st.a, REF.roi.a, 0.05, 'a*'); close(st.L, REF.roi.L, 0.05, 'L*'); close(st.b, REF.roi.b, 0.05, 'b*')
    close(st.clip_ratio, REF.roi.clip_ratio, 0.002, '날아간 비율')
  },
  '흐림(라플라시안 분산): 줄이기·키우기'() {
    const img = testImage()
    close(sharpness(img, [40, 50, 600, 760]) / REF.sharp_big, 1, 0.002, '큰 얼굴')
    close(sharpness(img, [100, 100, 230, 330]) / REF.sharp_small, 1, 0.002, '작은 얼굴')
  },
  '머리 자세: 행·열 순서 모두'() {
    const col = REF.mat_col, row = [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => col[c * 4 + r]))
    for (const d of [col, row]) {
      const e = eulerFromMatrix({ data: d })
      close(e.yaw, REF.euler[0], 1e-9, 'yaw'); close(e.pitch, REF.euler[1], 1e-9, 'pitch'); close(e.roll, REF.euler[2], 1e-9, 'roll')
    }
  },
  '같은 얼굴 중복·작은 배경 얼굴은 한 명, 떨어진 두 얼굴은 두 명'() {
    const face = (x, y, s) => [{ x, y }, { x: x + s, y: y + s }]
    assert.deepEqual(distinctFaces([]), { count: 0, main: -1 })
    assert.equal(distinctFaces([face(0.3, 0.3, 0.4), face(0.31, 0.29, 0.39)]).count, 1)
    assert.equal(distinctFaces([face(0.3, 0.3, 0.4), face(0.85, 0.05, 0.1)]).count, 1)
    assert.equal(distinctFaces([face(0.05, 0.3, 0.35), face(0.55, 0.3, 0.35)]).count, 2)
    assert.equal(distinctFaces([face(0.8, 0.05, 0.1), face(0.3, 0.3, 0.4)]).main, 1)
  },
  '얼굴 없음이면 밝기·해상도만'() {
    const f = extractFeatures(testImage(), null)
    assert.equal(f.face_found, false); assert.equal(f.width, 640); assert.ok(f.brightness > 0 && f.brightness < 255)
  },
}
let failed = 0
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('통과:', name) } catch (e) { failed++; console.log('실패:', name, '\n  ', e.message) }
}
process.exit(failed ? 1 : 0)

