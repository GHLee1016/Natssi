"""로그인·데이터 분리·제한·업로드 검사. Supabase는 가짜 서버로 대신합니다."""
import io
import json
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import auth, config, llm, ratelimit, store
from app.main import app


class FakeSupabase:
    def __init__(self):
        self.users = {}        # email -> {id, password, meta}
        self.tokens = {}       # token -> id
        self.rows = {}         # (user_id, day) -> symptoms
        self.deleted = []

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
            return httpx.Response(200, json={"id": uid, "email": email, "user_metadata": u["meta"]})
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
    client = httpx.Client(transport=httpx.MockTransport(fake.handler))
    auth._client = store._client = client
    auth._cache.clear(); ratelimit.reset(); llm._cache.clear()
    yield fake, TestClient(app)
    auth._client = store._client = None


SIGNUP = {"consent_terms": True, "consent_privacy": True, "consent_photo": True}


def join(c, email, pw="abcd1234"):
    r = c.post("/api/auth/signup", json={"email": email, "password": pw, **SIGNUP})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def test_demo_is_read_only(env):
    _, c = env
    assert c.get("/api/timeline").status_code == 200
    assert c.get("/api/meta").json()["viewer"] is None
    assert c.post("/api/day/2026-11-16/checkin", json={"따가움": 1}).status_code == 401
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
    r = c.post("/api/day/2026-11-16/checkin", json={"따가움": 3}, headers=a)
    assert r.status_code == 200 and r.json()["record"]["symptoms"]["따가움"] == 3
    assert c.get("/api/day/2026-11-16", headers=a).json()["record"]["symptoms"]["따가움"] == 3
    assert c.get("/api/day/2026-11-16", headers=b).json()["record"]["symptoms"]["따가움"] != 3
    assert c.get("/api/day/2026-11-16").json()["record"]["symptoms"]["따가움"] != 3     # 데모도 안 섞임
    assert len(c.get("/api/account/export", headers=b).json()["checkins"]) == 0
    c.post("/api/reset", headers=b)                                                      # B의 초기화는 A에 영향 없음
    assert len(c.get("/api/account/export", headers=a).json()["checkins"]) == 1


def test_bad_token_is_rejected(env):
    _, c = env
    assert c.get("/api/timeline", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert c.post("/api/day/2026-11-16/checkin", json={"따가움": 1}, headers={"Authorization": "Bearer nope"}).status_code == 401
    assert c.get("/api/timeline", headers={"Authorization": "Basic abc"}).status_code == 401


def test_checkin_input_is_validated(env):
    _, c = env
    a = join(c, "a@test.kr")
    assert c.post("/api/day/2026-11-16/checkin", json={"따가움": 9}, headers=a).status_code == 422
    assert c.post("/api/day/2030-01-01/checkin", json={"따가움": 1}, headers=a).status_code == 404


def test_delete_account_removes_data_and_user(env):
    fake, c = env
    a = join(c, "a@test.kr"); b = join(c, "b@test.kr")
    c.post("/api/day/2026-11-16/checkin", json={"따가움": 2}, headers=a)
    c.post("/api/day/2026-11-16/checkin", json={"따가움": 1}, headers=b)
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


def jpeg(size=(640, 640), fmt="JPEG"):
    buf = io.BytesIO()
    Image.new("RGB", size, (150, 120, 110)).save(buf, fmt)
    return buf.getvalue()


def up(c, data, name="a.jpg", ctype="image/jpeg", headers=None):
    return c.post("/api/capture", files={"photo": (name, data, ctype)}, headers=headers or {})


def test_upload_limits(env):
    _, c = env
    assert up(c, jpeg()).status_code == 200
    assert up(c, b"x" * (config.MAX_UPLOAD_BYTES + 10)).status_code == 413
    assert up(c, b"not an image at all").status_code == 400
    assert up(c, jpeg(fmt="GIF"), "a.gif", "image/gif").status_code == 400            # 허용 형식 아님
    assert up(c, jpeg(fmt="BMP"), "a.bmp", "image/bmp").status_code == 400


def test_huge_dimensions_are_refused(env, monkeypatch):
    _, c = env
    monkeypatch.setattr(config, "MAX_IMAGE_PIXELS", 10_000)
    assert up(c, jpeg((640, 640))).status_code == 400


def test_photo_is_not_stored(env):
    fake, c = env
    h = join(c, "a@test.kr")
    assert up(c, jpeg(), headers=h).status_code == 200
    assert not fake.rows and not store._memory


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
    assert c.post("/api/day/2026-11-16/checkin", json={"따가움": 1}).status_code == 401
