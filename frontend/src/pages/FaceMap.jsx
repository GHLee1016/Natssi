// 데모(김서연) 사진 위에 낯씨가 붉은기를 재는 곳(양 볼)을 네모로 표시하고, 그날 결과를 쉬운 말로 알려 준다.
// 네모 위치는 앱의 얼굴 모델(MediaPipe)로 데모 사진 3장에서 볼 측정 영역(core.js CHEEK_IMG_LEFT/RIGHT)을 찾아
// 사진 크기 대비 비율로 적어 둔 값이다(2026-11-21). 사진을 바꾸면 다시 구해야 한다.
// 낯씨는 볼 붉은기만 잰다. 여드름 같은 트러블은 찾지 않으므로 표시하지 않는다(진단하지 않음).
const REGIONS = {                        // [x, y, w, h] (0~1)
  A: [[0.302, 0.463, 0.099, 0.071], [0.584, 0.468, 0.097, 0.071]],
  B: [[0.302, 0.464, 0.099, 0.071], [0.584, 0.469, 0.097, 0.071]],
  C: [[0.302, 0.464, 0.099, 0.072], [0.584, 0.468, 0.097, 0.071]],
}
const PAD = 0.35                         // 측정 영역이 작아 눈에 잘 띄게 네모를 조금 넓힌다

const sgn = (v) => (v > 0 ? '+' : '') + v.toFixed(1)

function state(record) {
  const v = record.verdict, r = record.redness, b = v.baseline
  if (r == null) return { key: 'hold', tag: '측정 보류', text: record.quality_note ? `${record.quality_note}. 그래서 이날은 붉은기를 재지 않았어요.` : '이날은 사진 품질 때문에 붉은기를 재지 않았어요.' }
  if (!b) return { key: 'wait', tag: `붉은기 ${sgn(r)}`, text: '아직 평소 범위를 만드는 중이에요. 기록이 7일 넘게 쌓이면 평소와 비교해 알려 드려요.' }
  if (r > b.high) return { key: 'high', tag: `붉은기 ${sgn(r)}, 평소보다 높음`, text: `이날 양 볼 붉은기가 ${sgn(r)}로, 평소 범위(${sgn(b.low)} ~ ${sgn(b.high)})보다 높았어요. 네모 안 볼이 평소보다 붉게 보인 날이에요.` }
  if (r < b.low) return { key: 'low', tag: `붉은기 ${sgn(r)}, 평소보다 낮음`, text: `이날 양 볼 붉은기가 ${sgn(r)}로, 평소 범위(${sgn(b.low)} ~ ${sgn(b.high)})보다 낮았어요.` }
  return { key: 'ok', tag: `붉은기 ${sgn(r)}, 평소 범위`, text: `이날 양 볼 붉은기는 ${sgn(r)}로, 평소 범위(${sgn(b.low)} ~ ${sgn(b.high)}) 안이었어요.` }
}

export default function FaceMap({ record }) {
  const boxes = REGIONS[record.photo]
  if (!boxes) return null
  const s = state(record)
  return (
    <div className={'facemap ' + s.key}>
      <div className="facemap-photo">
        <img src={`/faces/${record.photo}.jpg`} alt={`이날 셀카(AI로 만든 예시). 양 볼에 붉은기 측정 영역 표시: ${s.tag}`} />
        {boxes.map(([x, y, w, h], i) => (
          <i key={i} className="fm-box" aria-hidden="true"
            style={{ left: `${(x - w * PAD / 2) * 100}%`, top: `${(y - h * PAD / 2) * 100}%`, width: `${w * (1 + PAD) * 100}%`, height: `${h * (1 + PAD) * 100}%` }} />
        ))}
        <span className="fm-tag" aria-hidden="true">{s.tag}</span>
      </div>
      <div className="facemap-text">
        <h3>얼굴에서 보기</h3>
        <p>{s.text}</p>
        <p className="muted small">네모는 낯씨가 붉은기를 재는 곳(양 볼)이에요. 여드름 같은 트러블은 찾지 않고, 진단하지 않아요. 사진은 AI로 만든 예시예요.</p>
      </div>
    </div>
  )
}
