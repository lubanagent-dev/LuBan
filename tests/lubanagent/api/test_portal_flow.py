"""R7 后端链路：门户注册 → 会话创建 → Run 执行（portal:access）→ 消息落库归因。"""

import httpx

from lubanagent.app import seed_defaults

from tests.lubanagent.api.conftest import create_demo_agent, make_client, sse_run_id


async def _token_of(client: httpx.AsyncClient) -> str:
    """注册并登录拿门户令牌（client 已打开）。"""
    registered = await client.post(
        "/v1/portal/register",
        json={"username": "portalflow", "password": "{{SECRET_h4tzmv6q}}"},
    )
    if registered.status_code == 409:  # 已存在（同客户端二次调用）
        logged_in = await client.post(
            "/v1/portal/login",
            json={"username": "portalflow", "password": "{{SECRET_h4tzmv6q}}"},
        )
        return f"Bearer {logged_in.json()['access_token']}"
    assert registered.status_code == 201, registered.text
    return f"Bearer {registered.json()['access_token']}"


async def _register(client: httpx.AsyncClient) -> dict:
    """注册门户用户并返回 Bearer 头（client 必须已打开）。"""
    registered = await client.post(
        "/v1/portal/register",
        json={"username": "portalflow", "password": "{{SECRET_h4tzmv6q}}"},
    )
    assert registered.status_code == 201, registered.text
    return {"Authorization": f"Bearer {registered.json()['access_token']}"}


async def _portal_client(db, registry) -> tuple[httpx.AsyncClient, dict]:
    """门户开放客户端（未打开）+ 已注册用户的 Bearer 头。"""
    client = await make_client(
        db, registry, portal_enabled=True, portal_registration_enabled=True
    )
    await seed_defaults(db)
    async with client:
        headers = await _register(client)
    return client, headers


async def test_portal_session_run_and_message_attribution(db, registry):
    client = await make_client(
        db, registry, portal_enabled=True, portal_registration_enabled=True
    )
    await seed_defaults(db)
    async with client:
        headers = await _register(client)
        await create_demo_agent(client)  # 平台侧建 Agent（同一匿名客户端，AUTH_ENABLED=false）

        created = await client.post(
            "/v1/sessions", json={"agent_id": None, "title": "门户会话"}, headers=headers
        )
        assert created.status_code == 201, created.text
        assert created.json()["subject_id"] == "portal_user:portalflow"
        session_id = created.json()["id"]

        run = await client.post(
            "/v1/agents/demo-agent/runs",
            json={"input": "你好", "session_id": session_id},
            headers=headers,
        )
        assert run.status_code == 200, run.text
        assert sse_run_id(run.text)  # SSE 正常起流

        messages = (
            (await client.get(f"/v1/sessions/{session_id}/messages", headers=headers)).json()
        )
        assert messages, "Run 完成后应落库本轮对话"
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "你好"

        # 跨主体：匿名主体（另一客户端语义）看不到门户会话
        others = await client.get("/v1/sessions")
        assert all(item["id"] != session_id for item in others.json())


async def test_portal_run_requires_portal_token(db, registry):
    client = await make_client(
        db, registry, portal_enabled=True, portal_registration_enabled=True
    )
    await seed_defaults(db)
    async with client:
        await create_demo_agent(client)
        headers = {"Authorization": await _token_of(client)}
        portal_session = await client.post(
            "/v1/sessions", json={"title": "门户"}, headers=headers
        )
        assert portal_session.status_code == 201, portal_session.text
        session_id = portal_session.json()["id"]

        # 非法门户令牌不得获得门户身份：会话列表回落匿名主体，看不到门户会话
        sessions = await client.get(
            "/v1/sessions", headers={"Authorization": "Bearer portal.badtoken.sig"}
        )
        assert sessions.status_code == 200
        assert all(item["id"] != session_id for item in sessions.json())
