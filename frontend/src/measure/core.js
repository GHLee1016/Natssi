// 측정 계산(브라우저 API 없음). 검증 파이프라인(natssi_selfie_validation/code/measure_redness.py)과 같은 식입니다.
// 바꾸면 measure/core.test.mjs 로 파이썬 결과와 다시 맞춰 보세요.

export const FEATURE_VERSION = '2'
// MediaPipe Face Mesh 478점 기준 볼 영역(사진 기준 왼쪽/오른쪽). 팀원 사진·AI Hub 20명으로 위치 확인함.
export const CHEEK_IMG_LEFT = [116, 117, 118, 101, 36, 205, 187, 123]
export const CHEEK_IMG_RIGHT = [345, 346, 347, 330, 266, 425, 411, 352]

// ── 색 변환: sRGB(8bit) → CIELAB(D65) ──────────────────────────────
const M = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]]
const WHITE = [0.95047, 1.0, 1.08883]
const LIN = new Float64Array(256)
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const EPS = 216 / 24389, KAPPA = 24389 / 27
const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116)

export function srgbToLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b]
  const x = (M[0][0] * R + M[0][1] * G + M[0][2] * B) / WHITE[0]
  const y = (M[1][0] * R + M[1][1] * G + M[1][2] * B) / WHITE[1]
  const z = (M[2][0] * R + M[2][1] * G + M[2][2] * B) / WHITE[2]
  const fx = f(x), fy = f(y), fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

// numpy.round 과 같은 '짝수로 반올림'
export function roundHalfEven(v) {
  const r = Math.round(v)
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

export function median(arr) {
  const n = arr.length
  if (!n) return NaN
  const s = Float64Array.from(arr).sort()
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

// ── 다각형 채우기 (OpenCV fillPoly 와 같은 규칙: 정수 꼭짓점, 경계 포함) ────
export function polygonMask(width, height, pts) {
  const P = pts.map(([x, y]) => [roundHalfEven(x), roundHalfEven(y)])
  const mask = new Uint8Array(width * height)
  const n = P.length
  let ymin = Infinity, ymax = -Infinity
  for (const [, y] of P) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y) }
  const set = (x, y) => { if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 1 }
  for (let y = Math.max(0, ymin); y <= Math.min(height - 1, ymax); y++) {
    const xs = []
    for (let i = 0; i < n; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % n]
      if (y1 === y2) continue
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2)
      if (y < lo || y >= hi) continue                 // 반열린 구간: 꼭짓점을 두 번 세지 않음
      xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k] - 1e-9); x <= Math.floor(xs[k + 1] + 1e-9); x++) set(x, y)
    }
  }
  // 경계선(fillPoly 는 테두리 픽셀도 칠함)
  for (let i = 0; i < n; i++) {
    let [x0, y0] = P[i]
    const [x1, y1] = P[(i + 1) % n]
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      set(x0, y0)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }
  return mask
}

// ── 볼 영역 통계: 날아간 픽셀(어느 채널이든 ≥250)·아주 어두운 픽셀(최댓값 <20) 제외, a* 중앙값 ──
export function roiStats(img, mask) {
  const { data, width } = img           // data: RGBA (ImageData 형식)
  let total = 0, clipped = 0
  const Ls = [], as = [], bs = []
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const o = i * 4, r = data[o], g = data[o + 1], b = data[o + 2]
    total++
    if (r >= 250 || g >= 250 || b >= 250) { clipped++; continue }
    if (Math.max(r, g, b) < 20) continue
    const [L, a, B] = srgbToLab(r, g, b)
    Ls.push(L); as.push(a); bs.push(B)
  }
  void width
  if (!total) return { n: 0, clip_ratio: NaN, L: NaN, a: NaN, a_mean: NaN, b: NaN }
  if (!as.length) return { n: 0, clip_ratio: clipped / total, L: NaN, a: NaN, a_mean: NaN, b: NaN }
  return { n: as.length, clip_ratio: clipped / total, L: median(Ls), a: median(as),
    a_mean: as.reduce((s, v) => s + v, 0) / as.length, b: median(bs) }
}

// ── 흐림: 얼굴 영역을 256×256(INTER_AREA)로 줄이고 회색 → 라플라시안 분산 ──
function resizeArea(src, sw, sh, ch, dw, dh) {
  const out = new Uint8Array(dw * dh * ch)
  const sx = sw / dw, sy = sh / dh
  if (sx < 1 || sy < 1) {
    // 한쪽이라도 키우는 경우: OpenCV 는 INTER_AREA 계수로 정한 양선형 보간을 고정소수점(11비트)으로 계산
    const coefs = (dn, s, sn) => {
      const inv = 1 / s, out = []
      for (let d = 0; d < dn; d++) {
        let si = Math.floor(d * s)
        let fr = (d + 1) - (si + 1) * inv
        fr = fr <= 0 ? 0 : fr - Math.floor(fr)
        fr = Math.fround(fr)
        if (si < 0) { fr = 0; si = 0 }
        if (si + 1 >= sn) { fr = 0; si = sn - 1 }
        const c1 = roundHalfEven(fr * 2048), c0 = 2048 - c1
        out.push([si, Math.min(si + 1, sn - 1), c0, c1])
      }
      return out
    }
    const X = coefs(dw, sx, sw), Y = coefs(dh, sy, sh)
    for (let y = 0; y < dh; y++) {
      const [y0, y1, wy0, wy1] = Y[y]
      for (let x = 0; x < dw; x++) {
        const [x0, x1, wx0, wx1] = X[x]
        for (let c = 0; c < ch; c++) {
          const r0 = src[(y0 * sw + x0) * ch + c] * wx0 + src[(y0 * sw + x1) * ch + c] * wx1
          const r1 = src[(y1 * sw + x0) * ch + c] * wx0 + src[(y1 * sw + x1) * ch + c] * wx1
          const v = ((r0 * wy0 + r1 * wy1) + (1 << 21)) >> 22
          out[(y * dw + x) * ch + c] = Math.min(255, Math.max(0, v))
        }
      }
    }
    return out
  }
  // 줄이는 경우: 겹치는 넓이만큼 가중 평균(OpenCV INTER_AREA)
  const spans = (dn, s, sn) => {
    const r = []
    for (let d = 0; d < dn; d++) {
      const a = d * s, b = Math.min((d + 1) * s, sn), w = []
      for (let i = Math.floor(a); i < Math.ceil(b - 1e-12); i++) {
        const lo = Math.max(a, i), hi = Math.min(b, i + 1)
        if (hi - lo > 1e-12) w.push([i, (hi - lo) / s])
      }
      r.push(w)
    }
    return r
  }
  const X = spans(dw, sx, sw), Y = spans(dh, sy, sh)
  const acc = new Float64Array(ch)
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      acc.fill(0)
      for (const [iy, wy] of Y[y]) {
        for (const [ix, wx] of X[x]) {
          const w = wy * wx, o = (iy * sw + ix) * ch
          for (let c = 0; c < ch; c++) acc[c] += src[o + c] * w
        }
      }
      for (let c = 0; c < ch; c++) out[(y * dw + x) * ch + c] = Math.min(255, Math.max(0, roundHalfEven(acc[c])))
    }
  }
  return out
}

export function sharpness(img, box) {
  const { data, width, height } = img
  const x0 = Math.max(0, box[0]), y0 = Math.max(0, box[1])
  const x1 = Math.min(width, box[2]), y1 = Math.min(height, box[3])
  const w = x1 - x0, h = y1 - y0
  if (w <= 0 || h <= 0) return 0
  const crop = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y0 + y) * width + (x0 + x)) * 4, d = (y * w + x) * 3
    crop[d] = data[s]; crop[d + 1] = data[s + 1]; crop[d + 2] = data[s + 2]
  }
  const N = 256, sm = resizeArea(crop, w, h, 3, N, N)
  const g = new Int32Array(N * N)
  for (let i = 0; i < N * N; i++) g[i] = (sm[i * 3] * 4899 + sm[i * 3 + 1] * 9617 + sm[i * 3 + 2] * 1868 + 8192) >> 14
  const at = (x, y) => {                  // BORDER_REFLECT_101
    if (x < 0) x = -x; else if (x >= N) x = 2 * N - 2 - x
    if (y < 0) y = -y; else if (y >= N) y = 2 * N - 2 - y
    return g[y * N + x]
  }
  let s = 0, s2 = 0
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) - 4 * at(x, y)
    s += v; s2 += v * v
  }
  const m = s / (N * N)
  return s2 / (N * N) - m * m
}

// ── 머리 자세: MediaPipe 4×4 변환 행렬 → (yaw, pitch, roll) 도 ──
// JS 결과의 data 는 1차원 배열이라 행/열 순서를 이동값(z, 얼굴이 카메라 앞에 있어 큰 음수) 위치로 판별합니다.
export function matrixRows(m) {
  const d = m.data || m
  const colMajor = Math.abs(d[14]) > Math.abs(d[11])
  const at = (r, c) => (colMajor ? d[c * 4 + r] : d[r * 4 + c])
  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => at(r, c)))
}

export function eulerFromMatrix(m) {
  const r = matrixRows(m)
  const deg = 180 / Math.PI
  const sy = Math.hypot(r[0][0], r[1][0])
  return { pitch: Math.atan2(r[2][1], r[2][2]) * deg, yaw: Math.atan2(-r[2][0], sy) * deg, roll: Math.atan2(r[1][0], r[0][0]) * deg }
}

// ── 사진 1장 → 측정값 (파이프라인 extract_features 와 같은 열) ──
// face: { lm: [[x,y]…] 원본 픽셀 좌표, blend: {이름: 점수}, matrix, nFaces } 또는 null
export function extractFeatures(img, face) {
  const { data, width, height } = img
  let sum = 0
  for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2]
  const out = { width, height, brightness: sum / (width * height * 3), face_found: false, n_faces: 0 }
  if (!face) return out
  const lm = face.lm
  out.face_found = true
  out.n_faces = face.nFaces
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
  for (const [x, y] of lm) { mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y) }
  const box = [Math.floor(mnx), Math.floor(mny), Math.ceil(mxx), Math.ceil(mxy)]
  out.face_ratio = (box[2] - box[0]) / width
  out.sharpness = sharpness(img, box)
  if (face.matrix) Object.assign(out, eulerFromMatrix(face.matrix))
  const bs = face.blend || {}
  if (Object.keys(bs).length) {
    out.smile = Math.max(bs.mouthSmileLeft || 0, bs.mouthSmileRight || 0)
    out.blink = Math.max(bs.eyeBlinkLeft || 0, bs.eyeBlinkRight || 0)
  }
  for (const [side, idx] of [['L', CHEEK_IMG_LEFT], ['R', CHEEK_IMG_RIGHT]]) {
    const st = roiStats(img, polygonMask(width, height, idx.map((i) => lm[i])))
    for (const [k, v] of Object.entries(st)) out[`${k}_${side}`] = v
  }
  const mean2 = (a, b) => (Number.isNaN(a) && Number.isNaN(b) ? NaN : Number.isNaN(a) ? b : Number.isNaN(b) ? a : (a + b) / 2)
  out.a_star = mean2(out.a_L, out.a_R)
  out.L_star = mean2(out.L_L, out.L_R)
  out.L_diff = out.L_L - out.L_R
  return out
}

// 같은 얼굴을 두 번 찾거나(일부 안드로이드 GPU), 뒤쪽 포스터·화면 속 작은 얼굴이 잡히는 경우를 거른다.
// faces: [[{x, y}, …], …] (0~1 좌표). 많이 겹치는 얼굴은 하나로 보고, 가장 큰 얼굴 폭의 40%보다 작은 얼굴은 세지 않는다.
// 돌려주는 값: { count: 실제 사람 수, main: 측정에 쓸 얼굴(가장 큰 얼굴)의 번호 }
export function distinctFaces(faces) {
  if (!faces?.length) return { count: 0, main: -1 }
  const boxes = faces.map((lm, i) => {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0
    for (const p of lm) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
    return { i, x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
  }).sort((a, b) => b.w - a.w)
  const big = boxes[0].w
  const overlaps = (a, b) => {
    const iw = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), ih = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
    return iw * ih >= 0.3 * Math.min(a.w * a.h, b.w * b.h)
  }
  const kept = []
  for (const b of boxes) {
    if (b.w < 0.4 * big) continue
    if (kept.some((k) => overlaps(k, b))) continue
    kept.push(b)
  }
  return { count: kept.length, main: boxes[0].i }
}
