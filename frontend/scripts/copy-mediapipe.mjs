// 빌드 전에 MediaPipe 실행 파일(wasm)과 얼굴 모델을 public/mediapipe 에 둡니다(우리 사이트에서 직접 제공).
// 모델 다운로드가 실패해도 빌드는 계속되고, 앱은 Google 주소에서 모델을 받습니다.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'mediapipe')
mkdirSync(out, { recursive: true })
cpSync(join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'), join(out, 'wasm'), { recursive: true })
console.log('[mediapipe] wasm 복사 완료')

const model = join(out, 'face_landmarker.task')
const URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
if (!existsSync(model)) {
  try {
    const r = await fetch(URL, { signal: AbortSignal.timeout(30000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    writeFileSync(model, Buffer.from(await r.arrayBuffer()))
    console.log('[mediapipe] 얼굴 모델 다운로드 완료')
  } catch (e) {
    console.warn(`[mediapipe] 얼굴 모델을 받지 못했어요(${e.message}). 앱이 실행 중에 Google 주소에서 받습니다.`)
  }
}
