// 전성분 사진이 흐린지(흔들림·초점 안 맞음). 사진 전체가 아니라 '가장 선명한 부분'을 본다:
// 배경은 원래 흐리게 찍히니(아웃포커스), 글자가 있는 부분만 선명하면 된다.
// 방법: 긴 변 1000px 회색 → 라플라시안 → 64px 칸마다 분산 → 위쪽 5%(95번째 백분위수) 값.
// 기준(2000)은 둥근 통 사진 5장으로 정했다: 선명한 사진 4,499~8,538 / 흔들린 사진 1,183 / 일부러 흐리게 한 사진 539.
export const SIDE = 1000
export const BLUR_LIMIT = 2000

export function grayOf(rgba, w, h) {
  const g = new Float64Array(w * h)
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]
  return g
}

export function textSharpness(gray, w, h, tile = 64) {
  const W = w - 2, H = h - 2
  if (W < tile || H < tile) return 0
  const vars = []
  for (let ty = 0; ty + tile <= H; ty += tile) {
    for (let tx = 0; tx + tile <= W; tx += tile) {
      let s = 0, s2 = 0
      for (let y = ty + 1; y < ty + tile + 1; y++) {
        const o = y * w
        for (let x = tx + 1; x < tx + tile + 1; x++) {
          const v = gray[o - w + x] + gray[o + w + x] + gray[o + x - 1] + gray[o + x + 1] - 4 * gray[o + x]
          s += v; s2 += v * v
        }
      }
      const n = tile * tile
      vars.push(s2 / n - (s / n) ** 2)
    }
  }
  vars.sort((a, b) => a - b)
  return vars[Math.min(vars.length - 1, Math.floor(0.95 * (vars.length - 1)))]
}
