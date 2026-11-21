// node frontend/src/cheeks.test.mjs — 색 변환 확인(흰색·회색·붉은 볼이 그럴듯한 색인지)
import assert from 'node:assert'
import { labToCss } from './cheeks.js'
assert.equal(labToCss(100, 0, 0), 'rgb(255,255,255)')
assert.equal(labToCss(50, 0, 0), 'rgb(119,119,119)')
const [r, g] = labToCss(65, 16, 17).match(/\d+/g).map(Number)
assert.ok(r > g + 30, '붉은기가 있으면 빨강이 초록보다 커야 함')
console.log('ok')
