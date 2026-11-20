"""Hugging Face Space (Gradio SDK, ZeroGPU 하드웨어) 시작 파일. build_space.py가 Space 맨 위 app.py로 복사한다.

두 가지 길을 함께 연다 (ZeroGPU에서 어느 쪽이 되는지 올려 봐야 알 수 있어서):
1) 우리 FastAPI 주소 그대로   /ocr /parse /manual /suggest /families /health, 테스트 페이지 /
2) Gradio API (Gradio가 늘 여는 길)   api_name: ocr, parse, manual, suggest
   → 앱에서는 @gradio/client:  (await Client.connect("<계정>/natssi-ocr")).predict("/ocr", {images: [file]})

ZeroGPU는 @spaces.GPU 함수가 하나도 없으면 시작하지 않는다. 우리 OCR은 CPU로 충분해서
GPU를 쓰지 않는 빈 함수만 하나 표시해 둔다 (호출하지 않으므로 GPU 할당량을 쓰지 않음).
"""
import json
import os

import gradio as gr

from ocr_server.app import app as api, pipeline, _shape, fam   # noqa: E402  (경로·사전 준비가 여기서 됨)
from ingredients import ocr  # noqa: E402

try:
    import spaces

    @spaces.GPU(duration=5)
    def _gpu_placeholder():     # ZeroGPU 시작 조건용. 쓰지 않는다.
        return True
except ImportError:             # 로컬·일반 CPU Space
    pass

# OCR 모델(약 20MB)을 미리 받아 둔다 → 첫 요청이 느리지 않게
ocr._engine(1.6)
ocr._engine(1.3)


def g_ocr(images):
    if not images:
        return {"ingredients": [], "message": "사진을 올려 주세요."}
    paths = [p if isinstance(p, str) else p.get("path") for p in images][:3]
    res = pipeline.register([open(p, "rb").read() for p in paths])
    return _shape(res, "ocr", res["seconds"])


def g_parse(text):
    t = text if "성분" in text else "전성분: " + text
    return _shape(pipeline.from_text(t, select_lines=False), "text", 0)


def g_manual(names, families):
    names = [n.strip() for n in (names or "").split(",") if n.strip()] if isinstance(names, str) else (names or [])
    families = [f for f in (families or []) if f in fam.RULES]
    return _shape(pipeline.from_names(names, families), "manual", 0)


def g_suggest(q):
    return [{"name": e["kor"], "inci": e.get("inci", ""), "families": fam.tag(e["kor"], e.get("inci", ""))}
            for e in pipeline.suggest(q or "", 8)] if q else []


with gr.Blocks(title="낯씨 전성분 OCR") as demo:
    gr.Markdown("## 낯씨 전성분 OCR\n사진은 처리 후 저장하지 않아요. 폰 테스트 페이지는 이 주소의 맨 앞(`/`)이에요.")
    with gr.Tab("사진"):
        imgs = gr.File(file_count="multiple", file_types=["image"], type="filepath", label="전성분표 사진 (1~3장)")
        out1 = gr.JSON(label="결과")
        gr.Button("성분 읽기").click(g_ocr, imgs, out1, api_name="ocr")
    with gr.Tab("글자"):
        txt = gr.Textbox(lines=5, label="전성분 붙여넣기")
        out2 = gr.JSON(label="결과")
        gr.Button("정리").click(g_parse, txt, out2, api_name="parse")
    with gr.Tab("직접 입력"):
        names = gr.Textbox(label="핵심 성분 (쉼표로)")
        fams = gr.CheckboxGroup(fam.ASK_FAMILIES, label="들어 있는 계열")
        out3 = gr.JSON(label="결과")
        gr.Button("등록").click(g_manual, [names, fams], out3, api_name="manual")
    with gr.Tab("자동완성"):
        q = gr.Textbox(label="검색어")
        out4 = gr.JSON(label="후보")
        q.change(g_suggest, q, out4, api_name="suggest")

if os.environ.get("NATSSI_GRADIO_ONLY"):
    # FastAPI 주소가 ZeroGPU에서 막히면 Space Settings > Variables에 NATSSI_GRADIO_ONLY=1 → Gradio 방식만
    demo.launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))
else:
    import uvicorn
    app = gr.mount_gradio_app(api, demo, path="/gradio")
    if __name__ == "__main__":
        uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 7860)))
