"""전성분 글자 분석과 내 루틴(제품 등록·버전·경고·삭제). Supabase는 가짜 서버로 대신합니다."""
from datetime import date

from test_account_security import env, join   # noqa: F401  (픽스처와 가입 도우미 재사용)

from app import config, ingredients, routine, store

TEXT = "전성분: 정제수, 글리세린, 레티놀, 1,2-헥산다이올, 향료, 나이아신아마이드(2%), 병풀추출물 사용 시의 주의사항: 상처가 있는 부위에는 쓰지 마세요"


def test_analyze_cuts_section_and_tags_families():
    r = ingredients.analyze(TEXT)
    names = [i["name"] for i in r["ingredients"]]
    assert names == ["정제수", "글리세린", "레티놀", "1,2-헥산다이올", "향료", "나이아신아마이드", "병풀추출물"]
    assert r["families"] == ["나이아신아마이드", "레티노이드", "시카", "향료"]
    assert r["needs_review"] == []


def test_analyze_flags_garbage_and_dedupes():
    r = ingredients.analyze("정제수, 정제수, 1, ##, 글리세린")
    assert [i["name"] for i in r["ingredients"]] == ["정제수", "1", "##", "글리세린"]   # 같은 이름은 한 번만
    assert r["needs_review"] == ["1", "##"]                                          # 숫자뿐이거나 글자가 아닌 조각은 확인 필요
    try:
        ingredients.analyze("가" * (ingredients.MAX_TEXT + 1))
        assert False
    except ValueError:
        pass


def test_first_day_items_share_version_and_later_change_makes_new_one():
    d = {"versions": []}
    assert routine.add_item(d, date(2026, 11, 19), "클렌저", "아침·저녁", ["정제수"]) == []
    assert routine.add_item(d, date(2026, 11, 19), "크림", "매일 저녁", ["세라마이드엔피"]) == []
    assert len(d["versions"]) == 1 and len(d["versions"][0]["items"]) == 2           # 같은 날은 한 버전
    assert d["versions"][0]["change"] is None and routine.payload(d)["versions"][0]["label"] == "처음 등록한 루틴"
    assert routine.add_item(d, date(2026, 11, 22), "레티놀 세럼", "매일 저녁", ["레티놀"]) == []   # 첫 등록 직후 추가는 경고 없음
    assert [v["id"] for v in d["versions"]] == [1, 2]
    w = routine.add_item(d, date(2026, 11, 25), "비타민 앰플", "매일 아침", ["아스코빅애씨드"])
    assert len(d["versions"]) == 3 and w and "7일" in w[0]                             # 변경 직후 또 바꾸면 경고
    assert routine.add_item(d, date(2026, 12, 5), "선크림", "매일 아침", []) == []        # 7일 넘으면 경고 없음


def test_routine_validation():
    d = {"versions": []}
    for bad in [("", "매일 저녁"), ("A", "하루 열 번")]:
        try:
            routine.add_item(d, date(2026, 11, 19), bad[0], bad[1], [])
            assert False
        except routine.RoutineError:
            pass
    routine.add_item(d, date(2026, 11, 19), "A", "매일 저녁", [])
    try:
        routine.add_item(d, date(2026, 11, 19), "A", "매일 저녁", [])
        assert False
    except routine.RoutineError:
        pass


def test_routine_api_is_private_and_saved(env):
    fake, c = env
    assert c.get("/api/me/routine").status_code == 401                              # 로그인 필요
    assert c.post("/api/me/routine/items", json={"name": "A", "usage": "매일 저녁"}).status_code == 401
    ha, hb = join(c, "a@test.kr"), join(c, "b@test.kr")
    assert c.get("/api/me/routine", headers=ha).json()["current"] is None
    a = c.post("/api/me/routine/analyze", json={"text": TEXT}, headers=ha).json()
    assert "레티노이드" in a["families"]
    r = c.post("/api/me/routine/items", headers=ha,
               json={"name": "레티놀 세럼", "usage": "매일 저녁", "ingredients": [i["name"] for i in a["ingredients"]]})
    assert r.status_code == 200
    cur = r.json()["current"]
    assert cur["items"][0]["name"] == "레티놀 세럼"
    assert cur["items"][0]["families"] == ["나이아신아마이드", "레티노이드", "시카", "향료"]   # 서버가 성분에서 다시 계산
    assert c.get("/api/me/routine", headers=hb).json()["current"] is None            # 다른 사용자에게는 안 보임
    assert c.post("/api/me/routine/items", headers=ha, json={"name": "x", "usage": "하루 열 번"}).status_code == 400
    key = cur["items"][0]["key"]
    assert c.delete(f"/api/me/routine/items/{key}", headers=ha).status_code == 200
    assert c.delete("/api/me/routine/items/nope", headers=ha).status_code == 400


def test_routine_is_exported_and_deleted_with_account(env):
    fake, c = env
    h = join(c, "a@test.kr")
    c.post("/api/me/routine/items", headers=h, json={"name": "크림", "usage": "매일 저녁", "ingredients": ["정제수"]})
    exp = c.get("/api/account/export", headers=h).json()
    assert exp["routine"] and exp["routine"][0]["items"][0]["name"] == "크림"
    assert fake.routines
    assert c.post("/api/reset", headers=h).status_code == 200
    assert not fake.routines                                                         # 초기화하면 루틴도 지움


def test_ocr_copy_flag_is_off_by_default(env, monkeypatch):
    _, c = env
    assert c.get("/api/meta").json()["ocr"] is False            # 사진 읽기는 준비되기 전까지 꺼 둔다
    monkeypatch.setattr(config, "OCR_ENABLED", True)
    assert c.get("/api/meta").json()["ocr"] is True
