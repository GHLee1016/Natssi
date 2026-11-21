"""로그인·데이터 분리·제한·업로드 검사. Supabase는 가짜 서버로 대신합니다."""
import json
from datetime import date, timedelta
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from app import auth, config, llm, ratelimit, store
from app.main import app


class FakeSupabase:
    def __init__(self):
        self.users = {}        # email -> {id, password, meta}
        self.tokens = {}       # token -> id
        self.rows = {}         # (user_id, day) -> symptoms
        self.routines = {}     # user_id -> 루틴 데이터
        self.profiles = {}     # user_id -> 사는 구
        self.deleted = []
        self.recovered = []    # 재설정 메일을 요청한 이메일

    def handler(self, request: httpx.Request):
        path, body = request.url.path, (json.loads(request.content) if request.content else {})
        if path == "/auth/v1/signup":
            if body["email"] in self.users:
                return httpx.Response(422, json={"error_code": "user_already_exists"})
            uid = str(uuid.uuid4())
            self.users[body["email"]] = {"id": uid, "password": body["password"], "meta": body.get("data", {})}
            return httpx.Response(200, json=self._session(body["email"]))
        if path == "/auth/v1/token":
            grant = request.url.params["grant_type"]
            if grant == "password":
                u = self.users.get(body["email"])
                if not u or u["password"] != body["password"]:
                    return httpx.Response(400, json={"error_code": "invalid_credentials"})
                return httpx.Response(200, json=self._session(body["email"]))
            return httpx.Response(400, json={})
        if path == "/auth/v1/user":
            tok = request.headers["authorization"].removeprefix("Bearer ")
            uid = self.tokens.get(tok)
            if not uid:
                return httpx.Response(401, json={})
            email, u = next((e, u) for e, u in self.users.items() if u["id"] == uid)
            if request.method == "PUT" and "data" in body:          # 사용자 메타데이터(동의 기록) 갱신
                u["meta"].update(body["data"])
                return httpx.Response(200, json={"id": uid, "email": email, "user_metadata": u["meta"]})
            if request.method == "PUT":                              # 비밀번호 바꾸기
                if u["password"] == body["password"]:
                    return httpx.Response(422, json={"error_code": "same_password"})
                u["password"] = body["password"]
                return httpx.Response(200, json={"id": uid, "email": email})
            return httpx.Response(200, json={"id": uid, "email": email, "user_metadata": u["meta"]})
        if path == "/auth/v1/recover":
            if body["email"] == "outsider@test.kr":                   # 기본 메일 서비스: 팀 구성원이 아닌 주소
                return httpx.Response(400, json={"error_code": "email_address_not_authorized", "msg": "Email address not authorized"})
            if body["email"] == "boom@test.kr":                       # 목록에 없는 오류
                return httpx.Response(500, json={"error_code": "unexpected_failure", "msg": "Error sending recovery email"})
            self.recovered.append(body["email"])
            return httpx.Response(200, json={})
        if path.startswith("/auth/v1/admin/users/"):
            assert request.headers["apikey"] == "svc"          # 삭제는 service 키로만
            uid = path.rsplit("/", 1)[1]
            self.deleted.append(uid)
            self.users = {e: u for e, u in self.users.items() if u["id"] != uid}
            return httpx.Response(200, json={})
        if path == "/rest/v1/checkins":
            if request.method == "POST":
                r = body; self.rows[(r["user_id"], r["day"])] = r["symptoms"]; return httpx.Response(201)
            uid = request.url.params["user_id"].removeprefix("eq.")
            if request.method == "DELETE":
                self.rows = {k: v for k, v in self.rows.items() if k[0] != uid}; return httpx.Response(204)
            return httpx.Response(200, json=[{"day": k[1], "symptoms": v} for k, v in self.rows.items() if k[0] == uid])
        if path == "/rest/v1/profiles":
            if request.method == "POST":
                self.profiles[body["user_id"]] = body["district"]; return httpx.Response(201)
            uid = request.url.params["user_id"].removeprefix("eq.")
            if request.method == "DELETE":
                self.profiles.pop(uid, None); return httpx.Response(204)
            return httpx.Response(200, json=[{"district": self.profiles[uid]}] if uid in self.profiles else [])
        if path == "/rest/v1/routines":
            if request.method == "POST":
                self.routines[body["user_id"]] = body["data"]; return httpx.Response(201)
            uid = request.url.params["user_id"].removeprefix("eq.")
            if request.method == "DELETE":
                self.routines.pop(uid, None); return httpx.Response(204)
            return httpx.Response(200, json=[{"data": self.routines[uid]}] if uid in self.routines else [])
        return httpx.Response(404)

    def _session(self, email):
        tok = "tok-" + uuid.uuid4().hex
        self.tokens[tok] = self.users[email]["id"]
        return {"access_token": tok, "refresh_token": "r" * 20, "expires_in": 3600, "user": {"email": email}}


@pytest.fixture()
def env(monkeypatch):
    fake = FakeSupabase()
    for k, v in {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_ANON_KEY": "anon", "SUPABASE_SERVICE_KEY": "svc"}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setattr(config, "OPEN_MODE", False)
    monkeypatch.setattr(config, "RECOVERY_ENABLED", True)
    client = httpx.Client(transport=httpx.MockTransport(fake.handler))
    auth._client = store._client = client
    auth._cache.clear(); ratelimit.reset(); llm._cache.clear()
    yield fake, TestClient(app)
    auth._client = store._client = None


SIGNUP = {"consent_terms": True, "consent_privacy": True, "consent_photo": True, "consent_health": True}


def join(c, email, pw="abcd1234"):
    r = c.post("/api/auth/signup", json={"email": email, "password": pw, **SIGNUP})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def test_demo_is_read_only(env):
    _, c = env
    assert c.get("/api/timeline").status_code == 200
    assert c.get("/api/meta").json()["viewer"] is None
    assert c.post("/api/me/checkin", json={"따가움": 1}).status_code == 401
    assert c.post("/api/reset").status_code == 401
    assert c.get("/api/account/export").status_code == 401
    assert c.delete("/api/account").status_code == 401


def test_signup_needs_all_consents_and_decent_password(env):
    _, c = env
    base = {"email": "a@test.kr", "password": "abcd1234", **SIGNUP}
    for k in SIGNUP:
        assert c.post("/api/auth/signup", json={**base, k: False}).status_code == 400
    assert c.post("/api/auth/signup", json={**base, "password": "12345678"}).status_code == 400
    assert c.post("/api/auth/signup", json={**base, "password": "short1"}).status_code == 422
    assert c.post("/api/auth/signup", json={**base, "email": "not-an-email"}).status_code == 422


def test_consent_is_recorded_with_version(env):
    fake, c = env
    h = join(c, "a@test.kr")
    consent = c.get("/api/account/export", headers=h).json()["consent"]
    assert consent["version"] == config.CONSENT_VERSION and consent["photo"] and consent["at"]


def test_login_errors_are_friendly(env):
    _, c = env
    join(c, "a@test.kr")
    r = c.post("/api/auth/login", json={"email": "a@test.kr", "password": "wrongpass1"})
    assert r.status_code == 400 and "맞지 않아요" in r.json()["detail"]
    assert c.post("/api/auth/login", json={"email": "a@test.kr", "password": "abcd1234"}).status_code == 200


def test_users_cannot_see_each_others_checkins(env):
    fake, c = env
    a, b = join(c, "a@test.kr"), join(c, "b@test.kr")
    r = c.post("/api/me/checkin", json={"따가움": 3}, headers=a)
    assert r.status_code == 200 and r.json()["today_checkin"]["따가움"] == 3 and r.json()["days_recorded"] == 1
    assert c.get("/api/me", headers=a).json()["today_checkin"]["따가움"] == 3
    assert c.get("/api/me", headers=b).json()["today_checkin"] is None                    # B는 A의 기록이 안 보임
    assert c.get("/api/day/2026-11-16").json()["record"]["symptoms"]["따가움"] != 3     # 김서연 데모에도 안 섞임
    assert c.get("/api/me").status_code == 401
    assert len(c.get("/api/account/export", headers=b).json()["checkins"]) == 0
    c.post("/api/reset", headers=b)                                                      # B의 초기화는 A에 영향 없음
    assert len(c.get("/api/account/export", headers=a).json()["checkins"]) == 1


def test_bad_token_is_rejected(env):
    _, c = env
    assert c.get("/api/timeline", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert c.post("/api/me/checkin", json={"따가움": 1}, headers={"Authorization": "Bearer nope"}).status_code == 401
    assert c.get("/api/timeline", headers={"Authorization": "Basic abc"}).status_code == 401


def test_checkin_input_is_validated(env):
    _, c = env
    a = join(c, "a@test.kr")
    assert c.post("/api/me/checkin", json={"따가움": 9}, headers=a).status_code == 422
    c.post("/api/me/checkin", json={"따가움": 1}, headers=a)
    r = c.post("/api/me/checkin", json={"따가움": 2}, headers=a).json()                 # 같은 날 다시 저장하면 덮어씀
    assert r["days_recorded"] == 1 and r["today_checkin"]["따가움"] == 2 and r["needed"] == 7


def test_delete_account_removes_data_and_user(env):
    fake, c = env
    a = join(c, "a@test.kr"); b = join(c, "b@test.kr")
    c.post("/api/me/checkin", json={"따가움": 2}, headers=a)
    c.post("/api/me/checkin", json={"따가움": 1}, headers=b)
    assert c.delete("/api/account", headers=a).status_code == 200
    assert len(fake.deleted) == 1 and "a@test.kr" not in fake.users and "b@test.kr" in fake.users
    assert all(k[0] != fake.deleted[0] for k in fake.rows) and len(fake.rows) == 1       # B의 행은 남음


def test_rate_limits(env, monkeypatch):
    _, c = env
    monkeypatch.setitem(config.LIMITS, "report", (3, 60))
    codes = [c.get("/api/report").status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]
    assert "초 뒤" in c.get("/api/report").json()["detail"]
    ratelimit.reset()
    monkeypatch.setitem(config.LIMITS, "auth", (2, 60))
    codes = [c.post("/api/auth/login", json={"email": "z@test.kr", "password": "abcd1234"}).status_code for _ in range(4)]
    assert codes[2:] == [429, 429]


GOOD = dict(width=2316, height=3088, brightness=135.0, face_found=True, n_faces=1, face_ratio=0.72, sharpness=510.0,
            yaw=0.5, pitch=11.0, roll=-1.5, smile=0.001, blink=0.10, n_L=90000, n_R=95000,
            clip_ratio_L=0.0005, clip_ratio_R=0.002, L_L=60.0, L_R=76.0, a_L=11.5, a_R=10.5, b_L=16.0, b_R=16.5,
            a_star=11.0, L_star=68.0, L_diff=-16.0)


def up(c, body=None, headers=None):
    return c.post("/api/capture", json=GOOD if body is None else body, headers=headers or {})


def test_capture_takes_numbers_not_photos(env):
    _, c = env
    r = up(c)
    assert r.status_code == 200 and r.json()["passed"] and r.json()["redness"] == 11.0
    assert up(c, {**GOOD, "brightness": 999}).status_code == 422                 # 범위를 벗어난 값은 거절
    assert up(c, {"width": 10}).status_code == 422                                # 필수 값 없음
    files = {"photo": ("a.jpg", b"\xff\xd8" + b"x" * 100, "image/jpeg")}
    assert c.post("/api/capture", files=files).status_code == 422                # 사진 파일은 더 받지 않음


def test_only_one_redness_number_is_stored_per_day(env, monkeypatch):
    fake, c = env
    assert up(c).json()["saved"] is False                                       # 로그인 전(데모): 저장 안 함
    h = join(c, "a@test.kr")
    r = up(c, headers=h).json()
    assert r["saved"] and c.get("/api/me", headers=h).json()["today_redness"] == 11.0
    up(c, {**GOOD, "a_star": 5.0}, headers=h)                                   # 다시 찍어도 처음 값 유지
    c.post("/api/me/checkin", json={"따가움": 2}, headers=h)                     # 체크인이 붉은기를 지우지 않음
    me = c.get("/api/me", headers=h).json()
    assert me["today_redness"] == 11.0 and me["today_checkin"] == {"따가움": 2, "화끈": 0, "가려움": 0, "당김": 0}
    row = c.get("/api/account/export", headers=h).json()["checkins"][0]
    assert row["redness"] == 11.0 and row["b"] == 16.25 and "redness" not in row["symptoms"]
    assert "width" not in str(fake.rows) and "sharpness" not in str(fake.rows)   # 품질 측정값은 남기지 않음


def test_old_consent_does_not_store_redness(env):
    fake, c = env
    h = join(c, "b@test.kr")
    fake.users["b@test.kr"]["meta"]["consent"]["version"] = "2026-11-21"
    auth._cache.clear()
    assert up(c, headers=h).json()["saved"] is False and not fake.rows


def test_my_verdict_after_seven_days(env, monkeypatch):
    _, c = env
    h = join(c, "c@test.kr")
    day = date(2026, 12, 1)
    for i, a in enumerate([10, 10.5, 9.5, 10, 10.2, 9.8, 10.1, 16, 16]):        # 7일 평소 → 이틀 높음
        monkeypatch.setattr(config, "today_kst", lambda d=day + timedelta(days=i): d)
        up(c, {**GOOD, "a_star": a}, headers=h)
        me = c.get("/api/me", headers=h).json()
        if i == 6:
            assert me["today_verdict"]["level"] == "구분 불가" and me["redness_days"] == 7   # 평소 범위를 만드는 중
    assert me["today_verdict"]["level"] == "신호 있음" and me["recent"][0]["level"] == "신호 있음"
    assert "바꾸지 않았는데" in me["today_verdict"]["message"]                    # 루틴을 바꾼 적 없으면 '바꾼 시기' 문장을 쓰지 않음


def test_photo_consent_is_renewed(env):
    fake, c = env
    h = join(c, "b@test.kr")
    u = fake.users["b@test.kr"]
    u["meta"]["consent"]["version"] = "2026-11-18"                               # 예전 안내에 동의한 사용자
    auth._cache.clear()
    assert c.get("/api/meta", headers=h).json()["viewer"]["consent_version"] == "2026-11-18"
    assert c.post("/api/account/consent", json={"photo": False}, headers=h).status_code == 400
    r = c.post("/api/account/consent", json={"photo": True}, headers=h)
    assert r.status_code == 200 and r.json()["consent_version"] == config.CONSENT_VERSION
    assert u["meta"]["consent"]["version"] == config.CONSENT_VERSION and u["meta"]["consent"]["health"] is True
    assert c.get("/api/meta", headers=h).json()["viewer"]["consent_version"] == config.CONSENT_VERSION
    assert c.post("/api/account/consent", json={"photo": True}).status_code == 401   # 로그인 필요


def test_headers_and_cors(env):
    _, c = env
    r = c.get("/api/meta", headers={"Origin": "https://evil.example"})
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["cache-control"] == "no-store"
    assert r.headers["x-frame-options"] == "DENY"
    assert "access-control-allow-origin" not in r.headers


def test_no_secrets_in_meta_or_errors(env):
    _, c = env
    body = c.get("/api/meta").text
    for secret in ("svc", "anon", "supabase.co"):
        assert secret not in body


def test_auth_off_means_demo_only(monkeypatch):
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.setattr(config, "OPEN_MODE", False)
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"email": "a@test.kr", "password": "abcd1234"}).status_code == 503
    assert c.post("/api/me/checkin", json={"따가움": 1}).status_code == 401


def test_password_recovery_flow(env, monkeypatch):
    fake, c = env
    monkeypatch.setitem(config.LIMITS, "auth", (50, 60))          # 이 테스트는 인증 호출이 많아 제한을 넉넉히
    tok = c.post("/api/auth/signup", json={"email": "a@test.kr", "password": "abcd1234", **SIGNUP}).json()["access_token"]
    # 메일 요청은 가입 여부와 상관없이 같은 답(가입된 이메일을 알아낼 수 없게)
    assert c.post("/api/auth/recover", json={"email": "a@test.kr"}).json() == {"status": "sent"}
    assert c.post("/api/auth/recover", json={"email": "nobody@test.kr"}).json() == {"status": "sent"}
    assert c.post("/api/auth/recover", json={"email": "not-an-email"}).status_code == 422
    # 새 비밀번호: 약한 것·같은 것·만료된 링크는 쉬운 문구로 거절
    assert c.post("/api/auth/reset", json={"access_token": tok, "password": "12345678"}).status_code == 400
    r = c.post("/api/auth/reset", json={"access_token": tok, "password": "abcd1234"})
    assert r.status_code == 400 and r.json()["detail"] == "이전과 다른 비밀번호를 써 주세요."
    r = c.post("/api/auth/reset", json={"access_token": "expired-token-xx", "password": "newpass99"})
    assert r.status_code == 401 and "다시 받아" in r.json()["detail"]
    assert c.post("/api/auth/reset", json={"access_token": tok, "password": "newpass99"}).json()["status"] == "ok"
    assert c.post("/api/auth/login", json={"email": "a@test.kr", "password": "abcd1234"}).status_code == 400
    assert c.post("/api/auth/login", json={"email": "a@test.kr", "password": "newpass99"}).status_code == 200


def test_login_short_password_gets_friendly_error(env):
    _, c = env
    join(c, "a@test.kr")
    r = c.post("/api/auth/login", json={"email": "a@test.kr", "password": "abc"})
    assert r.status_code == 400 and r.json()["detail"] == "이메일 또는 비밀번호가 맞지 않아요."


def test_store_errors_do_not_leak_details(env, monkeypatch):
    _, c = env
    a = join(c, "a@test.kr")

    def boom(uid):
        raise httpx.ConnectError("secret-host.supabase.co refused")
    monkeypatch.setattr(store, "load_all", boom)
    r = c.get("/api/me", headers=a)
    d = r.json()["detail"]
    assert r.status_code == 503 and "오류 번호" in d and "다시 시도" in d
    assert not any(w in d for w in ("Supabase", "secret-host", "ConnectError", "SUPABASE_URL"))


def test_unknown_auth_errors_get_a_ref_and_are_logged(env, monkeypatch, caplog):
    _, c = env
    monkeypatch.setitem(config.LIMITS, "auth", (50, 60))
    r = c.post("/api/auth/recover", json={"email": "outsider@test.kr"})        # 알려진 오류: 쉬운 문구
    assert r.status_code == 400 and "메일을 보낼 수 없어요" in r.json()["detail"]
    with caplog.at_level("WARNING", logger="natssi"):
        r = c.post("/api/auth/recover", json={"email": "boom@test.kr"})        # 모르는 오류: 번호만 보이고 원인은 로그에
    d = r.json()["detail"]
    assert r.status_code == 503 and "오류 번호" in d and "unexpected_failure" not in d and "Supabase" not in d
    ref = d.split("오류 번호 ")[1].rstrip(")")
    assert any(ref in m and "unexpected_failure" in m for m in caplog.messages)


def test_recovery_can_be_turned_off(env, monkeypatch):
    fake, c = env
    assert c.get("/api/meta").json()["recovery"] is True
    monkeypatch.setattr(config, "RECOVERY_ENABLED", False)
    assert c.get("/api/meta").json()["recovery"] is False
    r = c.post("/api/auth/recover", json={"email": "a@test.kr"})
    assert r.status_code == 503 and "비밀번호 찾기" in r.json()["detail"]
    assert fake.recovered == []                                  # Supabase에는 요청이 가지 않는다


def test_my_change_and_report_open_with_seven_photo_days(env, monkeypatch):
    _, c = env
    h = join(c, "d@test.kr")
    day = date(2026, 12, 1)
    for i, a in enumerate([10, 10.5, 9.5, 10, 10.2, 9.8, 10.1, 16, 16]):
        monkeypatch.setattr(config, "today_kst", lambda d=day + timedelta(days=i): d)
        if i == 6:
            assert c.get("/api/me/timeline", headers=h).status_code == 409       # 6일: 아직 잠김
            assert c.get("/api/me", headers=h).json()["unlocked"] is False
        up(c, {**GOOD, "a_star": a}, headers=h)
    assert c.get("/api/me", headers=h).json()["unlocked"] is True
    tl = c.get("/api/me/timeline", headers=h).json()
    assert len(tl["records"]) == 9 and tl["records"][-1]["verdict"]["level"] == "신호 있음"
    cmp = c.get("/api/me/compare", params={"a": "2026-12-01", "b": "2026-12-09"}, headers=h).json()
    assert cmp["diff"] == 6.0 and cmp["beyond_error"] is True
    rep = c.get("/api/me/report", headers=h).json()
    assert rep["source"] == "template" and rep["problems"] == [] and rep["sentences"]
    assert c.get("/api/me/report/answer/cause", headers=h).status_code == 200
    assert c.get("/api/me/timeline").status_code == 401                          # 로그인 필요


def test_ai_report_is_opt_in_and_pseudonymized(env, monkeypatch):
    fake, c = env
    h = join(c, "e@test.kr")
    c.post("/api/me/routine/items", json={"name": "비밀세럼", "usage": "매일 저녁", "ingredients": []}, headers=h)
    day = date(2026, 12, 1)
    for i, a in enumerate([10, 10.5, 9.5, 10, 10.2, 9.8, 10.1, 10]):
        monkeypatch.setattr(config, "today_kst", lambda d=day + timedelta(days=i): d)
        up(c, {**GOOD, "a_star": a}, headers=h)
    sent = []
    monkeypatch.setenv("OPENROUTER_API_KEY", "x")
    monkeypatch.setattr(llm, "write_report", lambda facts: sent.append(facts) or {"error": "test"})
    assert c.get("/api/me/report", headers=h).json()["source"] == "template" and not sent     # 동의 전: AI 호출 없음
    assert c.get("/api/meta", headers=h).json()["viewer"]["ai_report"] is False
    assert c.post("/api/account/optional", json={"key": "ai_report", "on": True}, headers=h).json()["ai_report"] is True
    auth._cache.clear()
    c.get("/api/me/report", headers=h)
    assert sent and "비밀세럼" not in str(sent) and "e@test.kr" not in str(sent) and "2026-12" not in str(sent)
    c.post("/api/account/optional", json={"key": "ai_report", "on": False}, headers=h)
    auth._cache.clear(); sent.clear()
    c.get("/api/me/report", headers=h)
    assert not sent                                                                         # 끄면 다시 틀 문장만


def _jpeg(size=96):
    import base64, io
    from PIL import Image
    b = io.BytesIO(); Image.new("RGB", (size, size), (200, 150, 140)).save(b, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def test_signup_optional_consents_are_recorded_separately(env):
    _, c = env
    r = c.post("/api/auth/signup", json={"email": "o@test.kr", "password": "abcd1234", **SIGNUP, "consent_cheeks": True})
    h = {"Authorization": "Bearer " + r.json()["access_token"]}
    viewer = c.get("/api/meta", headers=h).json()["viewer"]
    assert viewer["cheeks"] is True and viewer["ai_report"] is False                  # 하나만 골라도 됨
    assert c.get("/api/account/export", headers=h).json()["consent"]["cheeks_at"]
    assert c.post("/api/account/optional", json={"key": "nope", "on": True}, headers=h).status_code == 400


def test_cheek_photos_only_with_consent_and_deleted_on_withdraw(env):
    fake, c = env
    h = join(c, "p@test.kr")                                                          # 선택 동의 안 함
    up(c, headers=h)
    body = {"L": _jpeg(), "R": _jpeg()}
    assert c.post("/api/me/cheeks", json=body, headers=h).status_code == 403
    c.post("/api/account/optional", json={"key": "cheeks", "on": True}, headers=h)
    auth._cache.clear()
    assert c.post("/api/me/cheeks", json={"L": "data:image/png;base64,AAAA", "R": _jpeg()}, headers=h).status_code == 400
    assert c.post("/api/me/cheeks", json={"L": _jpeg(400), "R": _jpeg()}, headers=h).status_code == 400   # 큰 사진(얼굴 전체 등) 거절
    assert c.post("/api/me/cheeks", json=body, headers=h).json()["saved"]
    c.post("/api/me/checkin", json={"따가움": 1}, headers=h)                            # 체크인이 조각을 지우지 않음
    me = c.get("/api/me", headers=h).json()
    assert me["today_cheeks"]["L"].startswith("data:image/jpeg") and me["today_checkin"]["따가움"] == 1
    day = me["today"]
    assert set(c.get("/api/me/cheeks", params={"dates": day}, headers=h).json()) == {day}
    assert c.get("/api/account/export", headers=h).json()["checkins"][0]["cheeks"]["L"]
    c.post("/api/account/optional", json={"key": "cheeks", "on": False}, headers=h)    # 철회하면 바로 삭제
    auth._cache.clear()
    assert c.get("/api/me/cheeks", params={"dates": day}, headers=h).json() == {}
    assert c.get("/api/me", headers=h).json()["today_redness"] == 11.0                  # 숫자 기록은 남음


def test_open_mode_is_ignored_on_vercel():
    """로그인 없이 쓰기(OPEN_MODE)는 로컬 전용. Vercel에서 환경변수가 켜져 있어도 무시한다."""
    import os, subprocess, sys
    code = "from app import config; print(config.OPEN_MODE)"
    run = lambda extra: subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                                       cwd=os.path.dirname(os.path.dirname(__file__)),
                                       env={k: v for k, v in {**os.environ, "NATSSI_OPEN_MODE": "1", **extra}.items()
                                            if not (k.startswith("VERCEL") and k not in extra)}).stdout.strip()
    assert run({}) == "True"
    assert run({"VERCEL": "1"}) == "False" and run({"VERCEL_ENV": "preview"}) == "False"


def test_client_ip_trusts_vercel_header_not_spoofed_forwarded_for(monkeypatch):
    from starlette.requests import Request
    def req(headers):
        return Request({"type": "http", "headers": [(k.encode(), v.encode()) for k, v in headers.items()], "client": ("10.0.0.1", 1)})
    spoof = {"x-forwarded-for": "1.2.3.4, 9.9.9.9"}
    assert ratelimit.client_ip(req({**spoof, "x-vercel-forwarded-for": "9.9.9.9"})) == "9.9.9.9"
    monkeypatch.setattr(config, "ON_VERCEL", True)
    assert ratelimit.client_ip(req(spoof)) == "9.9.9.9"                    # 사용자가 붙인 첫 값(1.2.3.4)을 믿지 않음
    monkeypatch.setattr(config, "ON_VERCEL", False)
    assert ratelimit.client_ip(req({})) == "10.0.0.1"


def test_read_endpoints_are_rate_limited(env):
    _, c = env
    h = join(c, "r@test.kr")
    codes = [c.get("/api/me", headers=h).status_code for _ in range(config.LIMITS["read"][0] + 1)]
    assert codes[0] == 200 and codes[-1] == 429
