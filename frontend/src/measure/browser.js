// 브라우저에서 사진을 측정합니다. 사진은 이 기기 밖으로 나가지 않고, 숫자(측정값)만 서버로 보냅니다.
// 순서는 검증 파이프라인과 같아요: 사진 방향 반영 → 얼굴 점 검출(긴 변 1600px로 줄여서) → 원본 해상도에서 볼 색 측정.
import { extractFeatures, eulerFromMatrix, distinctFaces, CHEEK_IMG_LEFT, CHEEK_IMG_RIGHT } from './core.js'

const WASM = '/mediapipe/wasm'                          // 빌드할 때 node_modules 에서 복사(scripts/copy-mediapipe.mjs)
const MODELS = ['/mediapipe/face_landmarker.task',        // 빌드할 때 받아 둔 모델
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task']
const DETECT_MAX_SIDE = 1600
const MEASURE_MAX_SIDE = 4032          // 이보다 큰 사진만 줄여서 잼(파이프라인은 원본, 팀원 사진은 모두 이 안)

// 사진 측정용(IMAGE)과 카메라 화면 실시간 가이드용(VIDEO)을 따로 만든다. 같은 모델을 모드만 바꿔 쓰면 서로 방해한다.
// 사용자에게 그대로 보여 줄 수 있는 오류(원인별 안내)
export const userError = (message) => Object.assign(new Error(message), { userMessage: message })

function createLandmarker(mode, extra, delegates = ['GPU', 'CPU']) {
  return (async () => {
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM)
    const make = (delegate, model) => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model, delegate }, runningMode: mode, numFaces: 2, ...extra,
    })
    let last
    for (const model of MODELS) {
      for (const delegate of delegates) {
        try { return await make(delegate, model) } catch (e) { last = e }
      }
    }
    throw last
  })()
}

let loading = null
export function loadLandmarker() {
  // 사진 측정은 CPU 먼저: 일부 안드로이드(GPU 대리 실행)에서 얼굴을 0개로 돌려주거나 같은 얼굴을 두 번 찾는 일이 있어서.
  loading = loading || createLandmarker('IMAGE', { outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true }, ['CPU', 'GPU'])
    .catch((e) => { loading = null; throw e })
  return loading
}

let liveLoading = null
export function loadLiveTracker() {
  // 실시간도 CPU 먼저: 일부 안드로이드(GPU 대리 실행)에서 얼굴 점 좌표가 터무니없는 값(4.5e18 등)으로 나와 '뒤로 가 주세요'가 끝나지 않았다
  liveLoading = liveLoading || createLandmarker('VIDEO', { outputFacialTransformationMatrixes: true }, ['CPU', 'GPU'])
    .catch((e) => { liveLoading = null; throw e })
  return liveLoading
}

// 카메라 한 프레임 → 가이드 판정에 필요한 숫자만(사진은 남기지 않음). 밝기는 작은 캔버스로 줄여서 잰다.
const probe = typeof document !== 'undefined' ? document.createElement('canvas') : null
export function trackFrame(tracker, video, ts) {
  const res = tracker.detectForVideo(video, ts)
  probe.width = 48; probe.height = 36
  const g = probe.getContext('2d', { willReadFrequently: true })
  g.drawImage(video, 0, 0, 48, 36)
  const d = g.getImageData(0, 0, 48, 36).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]
  const { count, main } = distinctFaces(res.faceLandmarks)
  const out = { nFaces: count, brightness: sum / (48 * 36 * 3) }
  if (!out.nFaces) return out
  let mnx = 1, mny = 1, mxx = 0, mxy = 0
  for (const p of res.faceLandmarks[main]) { mnx = Math.min(mnx, p.x); mny = Math.min(mny, p.y); mxx = Math.max(mxx, p.x); mxy = Math.max(mxy, p.y) }
  // 좌표가 깨진 프레임(숫자가 아니거나 화면 밖으로 크게 벗어남)은 얼굴을 못 찾은 것으로 본다. 다음 프레임에서 다시 본다
  const sane = (v) => Number.isFinite(v) && v > -0.5 && v < 1.5
  if (![mnx, mny, mxx, mxy].every(sane)) return { ...out, nFaces: 0 }
  Object.assign(out, { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2, faceRatio: mxx - mnx, box: { x0: mnx, x1: mxx, y0: mny, y1: mxy } })
  const m = res.facialTransformationMatrixes?.[main]
  if (m) Object.assign(out, eulerFromMatrix(m))
  return out
}

function canvasOf(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

// 사진 파일 → 비트맵. 갤럭시 50MP 이상 사진은 원본 크기로 풀면 메모리가 모자라 실패하므로, 큰 파일은 풀면서 줄인다.
// (작은 크기로 한 번 풀어 회전 반영 뒤 가로세로 비율을 알아낸 다음, 긴 변 MEASURE_MAX_SIDE로 다시 푼다)
const HEIF = /image\/hei[cf]|\.hei[cf]$/i
async function decodePhoto(file) {
  if (HEIF.test(file.type || '') || HEIF.test(file.name || '')) {
    throw userError("이 사진 형식(HEIF)은 브라우저에서 열 수 없어요. 카메라 설정에서 '고효율 사진'을 끄고 찍거나, 이 화면의 [사진 찍기]로 찍어 주세요.")
  }
  const opt = { imageOrientation: 'from-image', colorSpaceConversion: 'none' }
  try {
    if ((file.size || 0) <= 12 * 1024 * 1024) return await createImageBitmap(file, opt)
  } catch { /* 아래에서 줄여서 다시 시도 */ }
  try {
    const probe = await createImageBitmap(file, { ...opt, resizeWidth: 64, resizeQuality: 'low' })
    const ratio = probe.width / probe.height
    probe.close?.()
    const w = ratio >= 1 ? MEASURE_MAX_SIDE : Math.round(MEASURE_MAX_SIDE * ratio)
    return await createImageBitmap(file, { ...opt, resizeWidth: w, resizeQuality: 'high' })
  } catch {
    throw userError('사진을 열 수 없어요. JPG나 PNG 사진으로 골라 주세요.')
  }
}

// 파일·Blob(사진 고르기) 또는 <video>(카메라) → 원본 크기 캔버스
async function toCanvas(src) {
  if (src instanceof HTMLVideoElement) {
    const c = canvasOf(src.videoWidth, src.videoHeight)
    c.getContext('2d').drawImage(src, 0, 0)
    return c
  }
  // EXIF 회전은 반영하고, 색 프로필 변환은 하지 않는다(colorSpaceConversion: 'none').
  // 검증 파이프라인(OpenCV)은 ICC 프로필을 무시하고 저장된 값을 그대로 읽는다. 브라우저가 Display P3 사진(아이폰, 최신 갤럭시)을
  // sRGB로 바꾸면 a*가 약 3.5 높게 나오고 '볼 노출' 탈락이 늘어서, MDC95·기준값과 맞지 않게 된다(2026-11-21 팀원 사진 68장으로 확인).
  const bmp = await decodePhoto(src)
  const s = Math.min(1, MEASURE_MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = canvasOf(Math.round(bmp.width * s), Math.round(bmp.height * s))
  const g = c.getContext('2d')
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c
}

// 볼 조각(선택 기능): 마지막으로 잰 사진의 양 볼 네모를 96px로 잘라 둔다. 서버로 보내는 숫자에는 넣지 않는다.
let lastCheeks = null
export const takeCheeks = () => { const p = lastCheeks; lastCheeks = null; return p }
function cropCheeks(canvas, lm) {
  const out = {}
  for (const [side, idx] of [['L', CHEEK_IMG_LEFT], ['R', CHEEK_IMG_RIGHT]]) {
    const xs = idx.map((i) => lm[i][0]), ys = idx.map((i) => lm[i][1])
    const x0 = Math.min(...xs), y0 = Math.min(...ys)
    const size = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0)
    const c = canvasOf(96, 96)
    c.getContext('2d').drawImage(canvas, x0, y0, size, size, 0, 0, 96, 96)
    out[side] = c.toDataURL('image/jpeg', 0.82)
  }
  return out
}

export async function measurePhoto(src) {
  const lmk = await loadLandmarker()
  const full = await toCanvas(src)
  const { width: w, height: h } = full
  const detectAt = (side) => {
    const s = Math.min(1, side / Math.max(w, h))
    let det = full
    if (s < 1) {
      det = canvasOf(Math.round(w * s), Math.round(h * s))
      const g = det.getContext('2d')
      g.imageSmoothingQuality = 'high'
      g.drawImage(full, 0, 0, det.width, det.height)
    }
    return lmk.detect(det)
  }
  let res = detectAt(DETECT_MAX_SIDE)
  if (!res.faceLandmarks?.length) res = detectAt(960)        // 얼굴이 화면에 비해 크거나 작으면 다른 크기에서 찾힐 때가 있다
  let face = null
  const { count, main } = distinctFaces(res.faceLandmarks)
  if (count) {
    const blend = {}
    for (const c of res.faceBlendshapes?.[main]?.categories || []) blend[c.categoryName] = c.score
    face = {
      lm: res.faceLandmarks[main].map((p) => [p.x * w, p.y * h]),   // 정규화 좌표 → 원본 픽셀
      blend, matrix: res.facialTransformationMatrixes?.[main] || null, nFaces: count,
    }
  }
  const img = full.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h)
  const feat = extractFeatures(img, face)
  lastCheeks = face ? cropCheeks(full, face.lm) : null
  // 숫자가 아닌 값(NaN)은 null 로 보냄
  return Object.fromEntries(Object.entries(feat).map(([k, v]) => [k, typeof v === 'number' && !Number.isFinite(v) ? null : v]))
}
