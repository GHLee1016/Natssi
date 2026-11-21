"""루틴 등록: 전성분표 사진 → 성분 목록 → 표준 이름 → 성분 계열 (기획서 18~19쪽).

    from ingredients.pipeline import register
    result = register(["제품_1.jpg", "제품_2.jpg"])

흐름
1. ocr.read_text      사진에서 글자 읽기 (RapidOCR, 한국어 PP-OCRv5)
2. parse.split_list   '전성분' 뒤부터 주의사항 앞까지 잘라 쉼표로 나누기
3. match.Matcher      식약처 화장품 원료성분 사전으로 표준 이름 맞추기 (오타 보정)
4. families.tag       레티노이드·AHA·향료 같은 성분 계열로 묶기
"""
