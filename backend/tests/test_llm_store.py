import json
import httpx
import pytest
from app import demo_data, judge, llm, report, store

rows = judge.judge_all(demo_data.build_records())
facts = report.build_facts(rows, demo_data.VERSIONS)
GOOD = {"sentences": [
    {"text": "레티놀 세럼을 추가한 뒤(버전 2) 4~7일째 양 볼 붉은기가 평소 범위를 넘었어요.", "cites": [18, 19, 20, 21]},
    {"text": "같은 기간 따가움 2점이 함께 기록됐어요.", "cites": [18, 19, 20, 21]},
]}


def fake(reply, status=200):
    def handler(request):
        body = json.loads(request.content)
        assert "김서연" not in request.content.decode()          # 이름을 보내지 않음
        assert body["models"][0].endswith(":free")
        return httpx.Response(status, json={"model": body["model"], "choices": [{"message": {"content": reply}}]})
    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    llm._cache.clear()
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    yield
    llm._client = None


def test_good_reply_is_used():
    llm._client = fake("```json\\n" + json.dumps(GOOD, ensure_ascii=False) + "\\n```")
    rep = report.build_report_llm(rows, demo_data.VERSIONS)
    assert rep["source"] == "llm" and rep["sentences"][0]["cite_label"] == "근거: 기록 18~21"


@pytest.mark.parametrize("bad", [
    {"sentences": [{"text": "레티놀 때문에 피부염이 생겼어요.", "cites": [18]}]},          # 금지어·단정
    {"sentences": [{"text": "붉은기가 35% 늘었어요.", "cites": [18]}]},                  # 없는 숫자
    {"sentences": [{"text": "붉은기가 평소 범위를 넘었어요.", "cites": [999]}]},           # 없는 기록
    {"sentences": [{"text": "붉은기가 평소 범위를 넘었어요.", "cites": []}]},              # 근거 없음
    {"sentences": [{"text": "같은 기간 따가움 1점이 기록됐어요.", "cites": [18, 19]}]},    # 기록과 다른 점수
    {"sentences": [{"text": "붉은기가 아직 평소 범위 밖이었어요.", "cites": [22, 23]}]},    # 신호(22)+평온(23) 혼합 인용
    {"sentences": [{"text": "그 뒤 붉은기가 평소 범위로 돌아왔어요.", "cites": [15, 16, 17]}]},  # 신호(18~21)보다 앞선 기록으로 회복 주장
])
def test_bad_reply_falls_back_to_template(bad):
    llm._client = fake(json.dumps(bad, ensure_ascii=False))
    rep = report.build_report_llm(rows, demo_data.VERSIONS)
    assert rep["source"] == "template" and rep["llm_error"]


def test_http_error_and_garbage_fall_back():
    for client in (fake("{}", status=429), fake("죄송해요, 잘 모르겠어요")):
        llm._cache.clear()
        llm._client = client
        assert report.build_report_llm(rows, demo_data.VERSIONS)["source"] == "template"


def test_no_key_means_no_call(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY")
    llm._client = None
    assert report.build_report_llm(rows, demo_data.VERSIONS)["source"] == "template"


UID_A = "11111111-1111-4111-8111-111111111111"
UID_B = "22222222-2222-4222-8222-222222222222"


def test_supabase_store_roundtrip_is_per_user(monkeypatch):
    db = {}

    def handler(request):
        assert request.headers["apikey"] == "svc"
        if request.method == "POST":
            row = json.loads(request.content); db[(row["user_id"], row["day"])] = row["symptoms"]
            assert "on_conflict=user_id%2Cday" in str(request.url) or "on_conflict=user_id,day" in str(request.url)
            return httpx.Response(201)
        uid = request.url.params["user_id"].removeprefix("eq.")
        if request.method == "DELETE":
            for k in [k for k in db if k[0] == uid]:
                del db[k]
            return httpx.Response(204)
        return httpx.Response(200, json=[{"day": k[1], "symptoms": v} for k, v in db.items() if k[0] == uid])

    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "svc")
    store._client = httpx.Client(transport=httpx.MockTransport(handler))
    try:
        assert store.backend_name() == "supabase"
        store.save(UID_A, "2026-11-16", {"따가움": 2})
        store.save(UID_B, "2026-11-16", {"따가움": 0})
        assert store.load_all(UID_A) == {"2026-11-16": {"따가움": 2}}
        assert store.load_all(UID_B) == {"2026-11-16": {"따가움": 0}}
        store.clear(UID_A)                                  # A만 지워지고 B는 남아야 함
        assert store.load_all(UID_A) == {} and store.load_all(UID_B) != {}
        with pytest.raises(ValueError):
            store.load_all("x' or 1=1 --")                  # 형식이 틀린 id는 거부
    finally:
        store._client = None
