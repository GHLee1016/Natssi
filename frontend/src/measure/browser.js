// 브라우저에서 사진을 측정합니다. 사진은 이 기기 밖으로 나가지 않고, 숫자(측정값)만 서버로 보냅니다.
// 순서는 검증 파이프라인과 같아요: 사진 방향 반영 → 얼굴 점 검출(긴 변 1600px로 줄여서) → 원본 해상도에서 볼 색 측정.
import { extractFeatures } from './core.js'

const WASM = '/mediapipe/wasm'                          // 빌드할 때 node_modules 에서 복사(scripts/copy-mediapipe.mjs)
const MODELS = ['/mediapipe/face_landmarker.task',        // 빌드할 때 받아 둔 모델
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task']
const DETECT_MAX_SIDE = 1600
const MEASURE_MAX_SIDE = 4032          // 이보다 큰 사진만 줄여서 잼(파이프라인은 원본, 팀원 사진은 모두 이 안)

let loading = null
export function loadLandmarker() {
  loading = loading || (async () => {
    const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM)
    const make = (delegate, model) => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'IMAGE', numFaces: 2,
      outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
    })
    let last
    for (const model of MODELS) {
      for (const delegate of ['GPU', 'CPU']) {
        try { return await make(delegate, model) } catch (e) { last = e }
      }
    }
    throw last
  })().catch((e) => { loading = null; throw e })
  return loading
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
  const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' })   // EXIF 회전 반영
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
