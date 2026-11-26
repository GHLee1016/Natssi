// 데모(김서연) 사진 위에 낯씨가 붉은기를 재는 곳(양 볼)을 네모로 표시하고, 그날 결과를 쉬운 말로 알려 준다.
// 네모 위치는 앱의 얼굴 모델(MediaPipe)로 데모 사진 3장에서 볼 측정 영역(core.js CHEEK_IMG_LEFT/RIGHT)을 찾아
// 사진 크기 대비 비율로 적어 둔 값이다(2026-11-21). 사진을 바꾸면 다시 구해야 한다.
// 낯씨는 볼 붉은기만 잰다. 여드름 같은 트러블은 찾지 않으므로 표시하지 않는다(진단하지 않음).
// 네모를 누르면 그 볼 주변을 크게 보여 준다(같은 사진을 잘라 확대, 새로 받는 이미지 없음).
import { useState } from 'react'

const REGIONS = {                        // [x, y, w, h] (0~1)
  A: [[0.302, 0.463, 0.099, 0.071], [0.584, 0.468, 0.097, 0.071]],
  B: [[0.302, 0.464, 0.099, 0.071], [0.584, 0.469, 0.097, 0.071]],
  C: [[0.302, 0.464, 0.099, 0.072], [0.584, 0.468, 0.097, 0.071]],
}
const PAD = 0.35                         // 측정 영역이 작아 눈에 잘 띄게 네모를 조금 넓힌다
const IMG_W = 1086, IMG_H = 1448         // 데모 사진 크기(px)
const CTX = 2.6                          // 확대 화면에 보일 범위: 네모 크기의 몇 배(주변 피부와 비교되게)
const SIDES = ['사진 왼쪽 볼', '사진 오른쪽 볼']

// 네모 하나 → 확대 화면에 쓸 잘라 낼 범위(0~1)와, 그 안에서 네모가 놓일 자리
function zoomOf([x, y, w, h]) {
  const side = Math.max(w * IMG_W, h * IMG_H) * (1 + PAD) * CTX
  const cw = Math.min(1, side / IMG_W), ch = Math.min(1, side / IMG_H)
  const clamp = (v, max) => Math.min(Math.max(v, 0), max)
  const cx = clamp(x + w / 2 - cw / 2, 1 - cw), cy = clamp(y + h / 2 - ch / 2, 1 - ch)
  const bx = x - w * PAD / 2, by = y - h * PAD / 2, bw = w * (1 + PAD), bh = h * (1 + PAD)
  return {
    bg: { backgroundSize: `${100 / cw}% ${100 / ch}%`, backgroundPosition: `${(cx / (1 - cw)) * 100}% ${(cy / (1 - ch)) * 100}%` },
    box: { left: `${((bx - cx) / cw) * 100}%`, top: `${((by - cy) / ch) * 100}%`, width: `${(bw / cw) * 100}%`, height: `${(bh / ch) * 100}%` },
    times: Math.round(1 / cw),
  }
}

const sgn = (v) => (v > 0 ? '+' : '') + v.toFixed(1)

function state(record) {
  const v = record.verdict, r = record.redness, b = v.baseline
  if (r == null) return { key: 'hold', tag: '재지 않은 날', text: record.quality_note ? `${record.quality_note}. 이날은 붉은기를 재지 않았어요.` : '사진이 잘 찍히지 않아 이날은 붉은기를 재지 않았어요.' }
  if (!b) return { key: 'wait', tag: `붉은기 ${sgn(r)}`, text: '아직 평소 범위를 만드는 중이에요. 기록이 7일 넘게 쌓이면 평소와 비교해요.' }
  if (r > b.high) return { key: 'high', tag: `붉은기 ${sgn(r)}, 평소보다 높음`, text: `이날 양 볼 붉은기는 ${sgn(r)}로 평소 범위(${sgn(b.low)} ~ ${sgn(b.high)})보다 높았어요. 네모 안 볼이 평소보다 붉었어요.` }
  if (r < b.low) return { key: 'low', tag: `붉은기 ${sgn(r)}, 평소보다 낮음`, text: `이날 양 볼 붉은기는 ${sgn(r)}로 평소 범위(${sgn(b.low)} ~ ${sgn(b.high)})보다 낮았어요.` }
  return { key: 'ok', tag: `붉은기 ${sgn(r)}, 평소 범위 안`, text: `이날 양 볼 붉은기는 ${sgn(r)}로 평소 범위(${sgn(b.low)} ~ ${sgn(b.high)}) 안이었어요.` }
}

export default function FaceMap({ record }) {
  const boxes = REGIONS[record.photo]
  const [zoom, setZoom] = useState(null)     // 확대해서 보는 네모 번호(없으면 null)
  if (!boxes) return null
  const s = state(record)
  return (
    <div className={'facemap ' + s.key}>
      <div className="facemap-left">
      <div className="facemap-photo">
        <img src={`/faces/${record.photo}.jpg`} alt={`이날 셀카(AI로 만든 예시). 붉은기를 재는 양 볼에 네모가 있어요. ${s.tag}`} />
        {boxes.map(([x, y, w, h], i) => (
          <button key={i} type="button" className={'fm-box' + (zoom === i ? ' on' : '')} aria-expanded={zoom === i} aria-controls="fm-zoom"
            aria-label={`${SIDES[i]} 확대해서 보기`} onClick={() => setZoom(zoom === i ? null : i)}
            style={{ left: `${(x - w * PAD / 2) * 100}%`, top: `${(y - h * PAD / 2) * 100}%`, width: `${w * (1 + PAD) * 100}%`, height: `${h * (1 + PAD) * 100}%` }} />
        ))}
        <span className="fm-tag" aria-hidden="true">{s.tag}</span>
      </div>
      {zoom !== null && (() => {
        const z = zoomOf(boxes[zoom])
        return (
          <div className="fm-zoom" id="fm-zoom" role="region" aria-label={`${SIDES[zoom]} 확대`}
            onKeyDown={(e) => { if (e.key === 'Escape') setZoom(null) }}>
            <div className="fm-zoom-img" role="img" aria-label={`${SIDES[zoom]}을 약 ${z.times}배 확대한 모습(AI로 만든 예시)`}
              style={{ backgroundImage: `url(/faces/${record.photo}.jpg)`, ...z.bg }}>
              <i className="fm-box" aria-hidden="true" style={z.box} />
            </div>
            <div className="fm-zoom-bar">
              <span className="small"><b>{SIDES[zoom]}</b> 약 {z.times}배 확대</span>
              <button type="button" className="link" onClick={() => setZoom(null)} autoFocus>닫기</button>
            </div>
          </div>
        )
      })()}
      </div>
      <div className="facemap-text">
        <h3>얼굴에서 보기</h3>
        <p>{s.text}</p>
        <p className="muted small">네모를 누르면 그 부분이 크게 보여요.</p>
        <p className="muted small">네모 친 곳(양 볼)이 낯씨가 붉은기를 재는 자리예요. 여드름 같은 트러블은 찾지 않고 진단도 하지 않아요. 사진은 AI로 만든 예시예요.</p>
        <p className="muted small">실제 기록에는 얼굴 사진을 저장하지 않고 이 부위의 색만 칩으로 보여요. 선택 동의를 하면 작은 볼 조각 사진도 보관해요.</p>
      </div>
    </div>
  )
}
