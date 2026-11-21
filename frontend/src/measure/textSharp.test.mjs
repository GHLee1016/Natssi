// 흐린 사진 검사: 선명한 글자 무늬는 기준 위, 같은 무늬를 흐리게 하면 기준 아래, 빈 배경은 0
import assert from 'node:assert/strict'
import { BLUR_LIMIT, textSharpness } from './textSharp.js'

const W = 400, H = 300
const sharp = new Float64Array(W * H)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  // 글자처럼 가는 획: 4px마다 흰 줄, 줄 사이 18px마다 빈칸
  sharp[y * W + x] = (y % 18 < 12) && (x % 4 === 0 || (x + y) % 7 === 0) ? 255 : 30
}
const blur = (g, r) => {                      // 상자 흐림 r번
  let a = g
  for (let k = 0; k < r; k++) {
    const b = new Float64Array(W * H)
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a[(y + dy) * W + x + dx]
      b[y * W + x] = s / 9
    }
    a = b
  }
  return a
}
const s0 = textSharpness(sharp, W, H), s1 = textSharpness(blur(sharp, 4), W, H)
assert.ok(s0 > BLUR_LIMIT, `선명 ${s0}`)
assert.ok(s1 < BLUR_LIMIT, `흐림 ${s1}`)
assert.equal(textSharpness(new Float64Array(W * H).fill(128), W, H), 0)
assert.equal(textSharpness(sharp, 50, 50), 0)        // 너무 작으면 0(검사 안 함)
console.log('textSharp ok', Math.round(s0), Math.round(s1))
