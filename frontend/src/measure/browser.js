// 브라우저에서 사진을 측정합니다. 사진은 이 기기 밖으로 나가지 않고, 숫자(측정값)만 서버로 보냅니다.
// 순서는 검증 파이프라인과 같아요: 사진 방향 반영 → 얼굴 점 검출(긴 변 1600px로 줄여서) → 원본 해상도에서 볼 색 측정.
import { extractFeatures, eulerFromMatrix } from './core.js'

const WASM = '/mediapipe/wasm'                          // 빌드할 때 node_modules 에서 복사(scripts/copy-mediapipe.mjs)
const MODELS = ['/mediapipe/face_landmarker.task',        // 빌드할 때 받아 둔 모델
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task']
const DETECT_MAX_SIDE = 1600
const MEASURE_MAX_SIDE = 4032          // 이보다 큰 사진만 줄여서 잼(파이프라인은 원본, 팀원 사진은 모두 이 안)

// 사진 측정용(IMAGE)과 카메라 화면 실시간 가이드용(VIDEO)을 따로 만든다. 같은 모델을 모드만 바꿔 쓰면 서로 방해한다.
function createLandmarker(mode, extra) {
  return (async () => {
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM)
    const make = (delegate, model) => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model, delegate }, runningMode: mode, numFaces: 2, ...extra,
    })
    let last
    for (const model of MODELS) {
      for (const delegate of ['GPU', 'CPU']) {
        try { return await make(delegate, model) } catch (e) { last = e }
      }
    }
    throw last
  })()
}

let loading = null
export function loadLandmarker() {
  loading = loading || createLandmarker('IMAGE', { outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true })
    .catch((e) => { loading = null; throw e })
  return loading
}

let liveLoading = null
export function loadLiveTracker() {
  liveLoading = liveLoading || createLandmarker('VIDEO', { outputFacialTransformationMatrixes: true })
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
  const out = { nFaces: res.faceLandmarks?.length || 0, brightness: sum / (48 * 36 * 3) }
  if (!out.nFaces) return out
  let mnx = 1, mny = 1, mxx = 0, mxy = 0
  for (const p of res.faceLandmarks[0]) { mnx = Math.min(mnx, p.x); mny = Math.min(mny, p.y); mxx = Math.max(mxx, p.x); mxy = Math.max(mxy, p.y) }
  Object.assign(out, { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2, faceRatio: mxx - mnx })
  const m = res.facialTransformationMatrixes?.[0]
  if (m) Object.assign(out, eulerFromMatrix(m))
  return out
}

function canvasOf(w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
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
  const bmp = await createImageBitmap(src, { imageOrientation: 'from-image', colorSpaceConversion: 'none' })
  const s = Math.min(1, MEASURE_MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = canvasOf(Math.round(bmp.width * s), Math.round(bmp.height * s))
  const g = c.getContext('2d')
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c
}

export async function measurePhoto(src) {
  const lmk = await loadLandmarker()
  const full = await toCanvas(src)
  const { width: w, height: h } = full
  const s = Math.min(1, DETECT_MAX_SIDE / Math.max(w, h))
  let det = full
  if (s < 1) {
    det = canvasOf(Math.round(w * s), Math.round(h * s))
    const g = det.getContext('2d')
    g.imageSmoothingQuality = 'high'
    g.drawImage(full, 0, 0, det.width, det.height)
  }
  const res = lmk.detect(det)
  let face = null
  if (res.faceLandmarks?.length) {
    const blend = {}
    for (const c of res.faceBlendshapes?.[0]?.categories || []) blend[c.categoryName] = c.score
    face = {
      lm: res.faceLandmarks[0].map((p) => [p.x * w, p.y * h]),      // 정규화 좌표 → 원본 픽셀
      blend, matrix: res.facialTransformationMatrixes?.[0] || null, nFaces: res.faceLandmarks.length,
    }
  }
  const img = full.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h)
  const feat = extractFeatures(img, face)
  // 숫자가 아닌 값(NaN)은 null 로 보냄
  return Object.fromEntries(Object.entries(feat).map(([k, v]) => [k, typeof v === 'number' && !Number.isFinite(v) ? null : v]))
}
