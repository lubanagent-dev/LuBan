"""R5 终端用户账号：注册开关、登录、门户令牌解析、portal 关闭 404、哈希不回落明文。"""

import httpx
from fastapi import APIRouter, Request

from lubanagent.api.auth import parse_portal_token
from lubanagent.app import create_app
from lubanagent.persistence.repositories.portal_user import PortalUserRepository
from tests.lubanagent.api.conftest import make_client, make_settings

_PASSWORD = "portal-password-123"
_USERNAME = "portal_alice-1"


async def test_register_open_when_enabled(db, registry):
    async with await make_client(
        db, registry, portal_enabled=True, portal_registration_enabled=True
    ) as client:
        response = await client.post(
            "/v1/portal/register",
            json={"username": _USERNAME, "password": _PASSWORD, "display_name": "爱丽丝"},
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["subject"] == f"portal_user:{_USERNAME}"
    assert body["user"]["roles"] == ["portal_user"]


async def test_register_disabled_returns_403(db, registry):
    async with await make_client(db, registry, portal_enabled=True) as client:
        response = await client.post(
            "/v1/portal/register",
            json={"username": _USERNAME, "password": _PASSWORD},
        )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"


async def test_register_duplicate_username_rejected(db, registry):
    async with await make_client(
        db, registry, portal_enabled=True, portal_registration_enabled=True
    ) as client:
        payload = {"username": _USERNAME, "password": _PASSWORD}
        assert (await client.post("/v1/portal/register", json=payload)).status_code == 201
        duplicate = await client.post("/v1/portal/register", json=payload)
    assert duplicate.status_code == 422
    assert duplicate.json()["error"]["code"] == "VALIDATION_ERROR"


async def _register(client: httpx.AsyncClient) -> dict:
    response = await client.post(
        "/v1/portal/register",
        json={"username": _USERNAME, "password": _PASSWORD},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_login_success_and_failure(db, registry):
    async with await make_client(
        db, registry, portal_enabled=True, portal_registration_enabled=True
    ) as client:
        assert (await _register(client))["user"]["username"] == _USERNAME

        ok = await client.post(
            "/v1/portal/login",
            json={"username": _USERNAME, "password": _PASSWORD},
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["user"]["subject"] == f"portal_user:{_USERNAME}"

        wrong = await client.post(
            "/v1/portal/login",
            json={"username": _USERNAME, "password": "wrong-password-xyz"},
        )
        assert wrong.status_code == 401
        assert wrong.json()["error"]["code"] == "AUTH_FAILED"

        unknown = await client.post(
            "/v1/portal/login",
            json={"username": "nobody-here", "password": _PASSWORD},
        )
        assert unknown.status_code == 401


async def test_portal_token_parses_subject_and_roles(db, registry):
    # auth_enabled=False 时 get_principal 走匿名分支（既有语义），
    # 门户令牌解析发生在鉴权开启分支，故端到端用例开启鉴权；
    # 注册与 /me 用同一装配，保证派生签名密钥一致。
    settings = make_settings(
        portal_enabled=True,
        portal_registration_enabled=True,
        auth_enabled=True,
        api_key="test-key",
    )
    me = APIRouter(prefix="/v1/portal")

    @me.get("/me")
    async def portal_me(request: Request) -> dict:
        principal = request.state.principal
        return {"subject": principal.subject, "roles": principal.claims["user"]["roles"]}

    application = create_app(
        db=db, registry=registry, settings=settings, extra_routers=(me,)
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as authed:
        register = await authed.post(
            "/v1/portal/register",
            json={"username": _USERNAME, "password": _PASSWORD},
        )
        assert register.status_code == 201, register.text
        token = register.json()["access_token"]

        payload = parse_portal_token(token, settings.portal_secret)
        assert payload is not None
        assert payload["sub"] == f"portal_user:{_USERNAME}"
        assert payload["roles"] == ["portal_user"]

        response = await authed.get(
            "/v1/portal/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, response.text
        assert response.json() == {
            "subject": f"portal_user:{_USERNAME}",
            "roles": ["portal_user"],
        }

        # 篡改令牌必须被拒
        tampered = await authed.get(
            "/v1/portal/me",
            headers={"Authorization": f"Bearer {token}x"},
        )
        assert tampered.status_code == 401


async def test_portal_disabled_returns_404(db, registry):
    async with await make_client(db, registry, portal_enabled=False) as client:
        login = await client.post(
            "/v1/portal/login",
            json={"username": _USERNAME, "password": _PASSWORD},
        )
        register = await client.post(
            "/v1/portal/register",
            json={"username": _USERNAME, "password": _PASSWORD},
        )
    for response in (login, register):
        assert response.status_code == 404
        assert response.json() == {"detail": "Not Found"}


async def test_password_hash_never_stored_as_plaintext(db):
    async with db.session() as session:
        user = await PortalUserRepository(session).create_user(
            username=_USERNAME, password=_PASSWORD
        )
    stored = user["password_hash"]
    assert stored.startswith("scrypt$")
    assert _PASSWORD not in stored
    async with db.session() as session:
        repo = PortalUserRepository(session)
        assert await repo.verify_password(_PASSWORD, stored) is True
        assert await repo.verify_password("not-the-password", stored) is False
