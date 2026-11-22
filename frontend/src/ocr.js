// 전성분 사진 읽기(OCR). 팀원이 허깅페이스 Space에 올린 OCR 서버(Gradio)를 브라우저에서 바로 부른다.
// 앱 서버(Vercel)는 거치지 않는다: OCR 라이브러리가 커서(약 290MB) Vercel 함수에 넣을 수 없어서.
// 사진은 보내기 전에 이 기기에서 다시 그려(최대 1800px JPEG) 촬영 위치 같은 메타데이터(EXIF)를 지운다.
// 주소를 바꾸면 vercel.json의 CSP connect-src도 같이 바꿔야 한다.
import { BLUR_LIMIT, SIDE, grayOf, textSharpness } from './measure/textSharp.js'

export const OCR_SPACE = 'https://alkadsdvs98py-natssi-ocr.hf.space'
const MAX_SIDE = 1800

let client = null
async function connect() {
  if (!client) {
    const { Client } = await import('@gradio/client')        // 처음 쓸 때만 내려받는다(번들 분리)
    client = Client.connect(OCR_SPACE).catch((e) => { client = null; throw e })
  }
  return client
}

// 무료 Space는 한동안 안 쓰면 잠든다. 사진을 고르기 전에 미리 깨워 둔다(실패해도 조용히 넘어감).
export function wakeOcr() { connect().catch(() => {}) }

async function clean(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9))
  if (!blob) throw new Error('사진을 열 수 없어요. JPG나 PNG로 골라 주세요.')
  return new File([blob], 'ingredients.jpg', { type: 'image/jpeg' })
}

// 흐린 사진 고르기: 보내기 전에 이 기기에서 검사한다(사진은 밖으로 나가지 않음). 검사를 못 하면 흐리지 않은 것으로 본다.
export async function isBlurry(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const s = Math.min(1, SIDE / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    return textSharpness(grayOf(g.getImageData(0, 0, w, h).data, w, h), w, h) < BLUR_LIMIT
  } catch { return false }
}

// 제품 사진 썸네일: 긴 변 240px JPEG data URL(약 10KB). 다시 그려서 EXIF(촬영 위치 등)도 지워진다. 서버가 240px 이하인지 다시 검사한다.
export async function productThumbnail(file, side = 240) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const s = Math.min(1, side / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s))
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c.toDataURL('image/jpeg', 0.82)
}

// 사진 1~3장 → {ingredients:[{name, status, ocr, families}], ask_families, message?} (글자 붙여넣기와 같은 모양)
// onStage(n): 1 사진 정리(위치 정보 지우기) → 2 읽기 서버 연결 → 3 글자 읽고 성분 사전과 맞추기. 화면의 분석 단계 표시용.
export async function readIngredientPhotos(files, onStage = () => {}) {
  onStage(1)
  const photos = await Promise.all([...files].slice(0, 3).map(clean))
  onStage(2)
  const [{ handle_file }, app] = await Promise.all([import('@gradio/client'), connect()])
  onStage(3)
  let out
  try {
    out = await app.predict('/ocr', { images: photos.map((f) => handle_file(f)) })
  } catch {
    throw new Error('성분 읽기 서버에 닿지 못했어요. 잠시 뒤 다시 시도하거나 전성분 글자를 붙여 넣어 주세요.')
  }
  const r = out?.data?.[0] || {}
  return { ingredients: r.ingredients || [], ask_families: r.ask_families || [], message: r.message, seconds: r.seconds }
}
