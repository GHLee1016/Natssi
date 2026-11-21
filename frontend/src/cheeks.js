// CIELAB(D65) → 화면 색. 볼 평균 색을 색 칩으로 그릴 때 쓴다(사진 없이 전후 비교).
export function labToCss(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const inv = (t) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29))
  const X = 0.95047 * inv(fx), Y = inv(fy), Z = 1.08883 * inv(fz)
  const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z]
  const g = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))
  return `rgb(${lin.map(g).join(',')})`
}
