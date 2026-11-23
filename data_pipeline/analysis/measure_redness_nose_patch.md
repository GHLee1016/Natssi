# measure_redness.py에 콧등 넣기 (검증 파이프라인 ↔ 앱 core.js 맞추기)

`natssi_selfie_validation/code/measure_redness.py`는 팀 저장소 밖에 있어서, 바꿀 내용을 여기 적어 둡니다.
앱(`frontend/src/measure/core.js`, FEATURE_VERSION 3)과 같은 결과가 나오게 하는 수정이에요.

## 1. 콧등 얼굴 점 (core.js `NOSE_IMG`와 같은 순서)

```python
# 볼 다각형 옆에
NOSE = [168, 351, 412, 437, 4, 217, 188, 122]   # 콧등(미간 아래 ~ 코끝 위). 순서가 다각형 순서라 바꾸지 말 것
```

## 2. extract_features에서 볼과 같은 방식으로 재기

볼을 재는 반복문(`for side, idx in (("L", CHEEK_LEFT), ("R", CHEEK_RIGHT))` 같은 곳)에 콧등을 더합니다.
볼과 **똑같은 ROI 함수**(cv2.fillPoly + 테두리, 포화 250 이상·어두운 20 미만 제외, Lab 중앙값)를 그대로 씁니다.

```python
for side, idx in (("L", CHEEK_LEFT), ("R", CHEEK_RIGHT), ("N", NOSE)):
    st = roi_stats(img, lm[idx])          # 볼과 같은 함수
    for k, v in st.items():
        feat[f"{k}_{side}"] = v            # n_N, clip_ratio_N, L_N, a_N, a_mean_N, b_N

# 양 볼 평균(a_star)을 낸 뒤
feat["a_rel"] = feat["a_star"] - feat["a_N"] if not (np.isnan(feat["a_star"]) or np.isnan(feat["a_N"])) else np.nan
```

- 품질 판정(`quality_flags`)에는 콧등을 넣지 않습니다(앱도 콧등으로는 탈락시키지 않음).
- 앱은 콧등이 번들거려 하얗게 날아간 비율이 5%를 넘으면 상대 붉은기를 보여 주지 않습니다(`clip_ratio_N > 0.05`).

## 3. 확인 방법

`frontend/src/measure/core.test.mjs`의 `'콧등·상대 붉은기가 파이썬 기준값과 같다'` 테스트에 넣은 그림·얼굴 점으로 measure_redness.py를 돌리면
아래 값이 나와야 합니다. 기준값은 `data_pipeline/analysis/color_robustness.py`의 `roi_stats`로 만든 값입니다(볼 a*가 measure_redness.py와 최대 0.009 차이).

| 항목 | 기준값 |
|---|---|
| n_N | 6371 |
| clip_ratio_N | 0.0215 |
| a_N | -1.398 |
| b_N | 14.385 |
| a_star | 0.750 |
| a_rel | 2.148 |

그림: 640×800, `r=(x*7+y*3)%256, g=(x*5+y*11+40)%200+30, b=(x*3+y*2+90)%180+20`, 위 60줄은 흰색(255), 700줄부터 검정(8).
얼굴 점 좌표는 core.test.mjs의 `R.cheekL / R.cheekR / R.nose`를 보세요.

measure_redness.py로 잰 값이 이 표와 다르면(허용: a·b 0.05, 픽셀 수 0.5%), core.test.mjs의 기준값을 measure_redness.py 값으로 바꿔 주세요.
