// 측정 계산이 검증 파이프라인(파이썬·OpenCV)과 같은지 확인합니다.   실행: npm test  (또는 node src/measure/core.test.mjs)
// 기준값은 파이썬 측정(11/19 셀카 검증 스크립트, 지금은 data_pipeline/analysis/color_robustness.py)으로 같은 그림을 재서 얻은 값이에요.
import assert from 'node:assert/strict'
import { srgbToLab, roiStats, polygonMask, sharpness, eulerFromMatrix, extractFeatures, roundHalfEven, median, distinctFaces, CHEEK_IMG_LEFT, CHEEK_IMG_RIGHT, NOSE_IMG } from './core.js'

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
  '콧등 측정과 상대 붉은기(볼 a* − 콧등 a*), 조명 색을 씌우면 상쇄'() {
    // 볼 두 곳과 콧등에 각각 단색 네모를 칠한 그림. 얼굴 점 478개 중 볼·콧등 점만 네모 꼭짓점에 둔다.
    const W = 300, H = 300
    const paint = (gain) => {
      const data = new Uint8ClampedArray(W * H * 4).fill(255)
      const rect = (x0, y0, x1, y1, [r, g, b]) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * W + x) * 4; data[o] = Math.min(255, r * gain[0]); data[o + 1] = Math.min(255, g * gain[1]); data[o + 2] = Math.min(255, b * gain[2]) } }
      rect(20, 150, 100, 230, [200, 120, 110]); rect(200, 150, 280, 230, [200, 120, 110]); rect(120, 60, 180, 140, [190, 140, 130])
      return { data, width: W, height: H }
    }
    const lm = Array.from({ length: 478 }, () => [150, 150])
    const put = (idx, x0, y0, x1, y1) => { const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; idx.forEach((i, k) => { lm[i] = c[Math.min(k, 3)] }) }
    put(CHEEK_IMG_LEFT, 30, 160, 90, 220); put(CHEEK_IMG_RIGHT, 210, 160, 270, 220); put(NOSE_IMG, 130, 70, 170, 130)
    const face = { lm, blend: {}, matrix: null, nFaces: 1 }
    const f = extractFeatures(paint([1, 1, 1]), face)
    const cheekA = srgbToLab(200, 120, 110)[1], noseA = srgbToLab(190, 140, 130)[1]
    close(f.a_star, cheekA, 1e-9, '볼 a*'); close(f.a_N, noseA, 1e-9, '콧등 a*'); close(f.a_rel, cheekA - noseA, 1e-9, '상대 붉은기')
    const pink = extractFeatures(paint([1, 0.9, 1]), face)                        // 분홍 틴트(초록 10% 내림)
    assert.ok(Math.abs(pink.a_star - f.a_star) > 2.35, `볼 a*는 크게 변함: ${pink.a_star - f.a_star}`)
    assert.ok(Math.abs(pink.a_rel - f.a_rel) < Math.abs(pink.a_star - f.a_star) / 3, `상대 붉은기는 덜 변함: ${pink.a_rel - f.a_rel}`)
  },
  '콧등·상대 붉은기가 파이썬 기준값과 같다(얼굴 점 위치·순서 포함)'() {
    // 기준값: data_pipeline/analysis/color_robustness.py(roi_stats, 볼 a*가 검증 파이프라인과 최대 0.009 차이)로 같은 그림·같은 점을 잰 값.
    // 볼·콧등 꼭짓점을 비뚤고 소수점 있는 자리에 둬서 반올림·채우기·점 순서(NOSE_IMG)까지 본다.
    const R = {"cheekL": [[100.4, 400.5], [150.5, 380.2], [200.7, 395.1], [215.2, 440.6], [190.5, 480.5], [140.9, 495.3], [105.5, 470.5], [95.2, 430.0]], "cheekR": [[440.4, 400.5], [490.5, 380.2], [540.7, 395.1], [545.2, 440.6], [520.5, 480.5], [470.9, 495.3], [435.5, 470.5], [425.2, 430.0]], "nose": [[300.5, 250.5], [338.2, 262.4], [345.7, 320.1], [342.6, 380.5], [320.5, 410.5], [298.4, 381.2], [294.6, 321.3], [301.2, 262.6]], "n_N": 6371, "a_N": -1.3982919796401427, "b_N": 14.385143113034626, "clip_N": 0.021502073414222087, "a_star": 0.7500547841341743, "a_rel": 2.1483467637743168}
    const lm = Array.from({ length: 478 }, () => [320, 600])
    CHEEK_IMG_LEFT.forEach((i, k) => { lm[i] = R.cheekL[k] }); CHEEK_IMG_RIGHT.forEach((i, k) => { lm[i] = R.cheekR[k] }); NOSE_IMG.forEach((i, k) => { lm[i] = R.nose[k] })
    const f = extractFeatures(testImage(), { lm, blend: {}, matrix: null, nFaces: 1 })
    close(f.n_N / R.n_N, 1, 0.005, '콧등 픽셀 수 비율'); close(f.clip_ratio_N, R.clip_N, 0.002, '콧등 날아간 비율')
    close(f.a_N, R.a_N, 0.05, '콧등 a*'); close(f.b_N, R.b_N, 0.05, '콧등 b*')
    close(f.a_star, R.a_star, 0.05, '볼 a*'); close(f.a_rel, R.a_rel, 0.05, '상대 붉은기')
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

