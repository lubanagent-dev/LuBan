"""会话 API：创建/列表分页/消息读写/删除/跨主体 404/SSE 完成落库。"""

from sqlalchemy import select

from tests.lubanagent.api.conftest import create_demo_agent, sse_run_id


async def test_create_and_list_sessions(client):
    created = await client.post("/v1/sessions", json={"title": "第一问"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["subject_id"] == "anonymous"  # AUTH_ENABLED=false 固定默认主体
    assert body["agent_id"] is None

    for index in range(3):
        await client.post("/v1/sessions", json={"title": f"s{index}"})
    listed = await client.get("/v1/sessions", params={"offset": 0, "limit": 2})
    assert listed.status_code == 200
    assert len(listed.json()) == 2
    page_two = await client.get("/v1/sessions", params={"offset": 2, "limit": 2})
    assert len(page_two.json()) == 2


async def test_append_and_list_messages(client, db):
    session_id = (await client.post("/v1/sessions", json={})).json()["id"]
    first = await client.post(
        f"/v1/sessions/{session_id}/messages", json={"role": "user", "content": "你好"}
    )
    assert first.status_code == 201, first.text
    assert first.json()["seq"] == 1
    second = await client.post(
        f"/v1/sessions/{session_id}/messages", json={"role": "assistant", "content": "在的"}
    )
    assert second.json()["seq"] == 2

    messages = (await client.get(f"/v1/sessions/{session_id}/messages")).json()
    assert [item["seq"] for item in messages] == [1, 2]

    bad = await client.post(
        f"/v1/sessions/{session_id}/messages", json={"role": "robot", "content": "x"}
    )
    assert bad.status_code == 422


async def test_delete_session_and_cascade(client, db):
    from lubanagent.persistence.models.chat import MessageRow

    session_id = (await client.post("/v1/sessions", json={})).json()["id"]
    await client.post(f"/v1/sessions/{session_id}/messages", json={"role": "user", "content": "1"})
    deleted = await client.delete(f"/v1/sessions/{session_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}

    assert (await client.get(f"/v1/sessions/{session_id}/messages")).status_code == 404
    async with db.session() as session:
        rows = (
            (await session.execute(select(MessageRow).where(MessageRow.session_id == session_id)))
            .scalars()
            .all()
        )
    assert rows == []


async def test_subject_isolation_returns_404(client, db):
    """跨主体访问：他主体会话按 404 处理，不泄露存在性。"""
    from lubanagent.persistence import SessionRepository

    async with db.session() as session:
        other = await SessionRepository(session).create_session("user:999", title="别人的")
        other_id = other.id
    assert (await client.get(f"/v1/sessions/{other_id}/messages")).status_code == 404
    append = await client.post(
        f"/v1/sessions/{other_id}/messages", json={"role": "user", "content": "越权"}
    )
    assert append.status_code == 404
    assert (await client.delete(f"/v1/sessions/{other_id}")).status_code == 404
    # 列表也只出本主体会话
    listed = await client.get("/v1/sessions", params={"limit": 200})
    assert all(item["id"] != other_id for item in listed.json())


async def test_sse_run_completion_persists_turn(client, db):
    """SSE run 正常完成后，本轮 user/assistant 自动落库门户会话。"""
    await create_demo_agent(client, key="hook-agent")
    session_id = (await client.post("/v1/sessions", json={})).json()["id"]
    response = await client.post(
        "/v1/agents/hook-agent/runs",
        json={"input": "你好", "session_id": session_id},
    )
    assert response.status_code == 200
    assert "event: run.completed" in response.text

    messages = (await client.get(f"/v1/sessions/{session_id}/messages")).json()
    assert [item["role"] for item in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "你好"
    assert "你好，我是 LubanAgent。" in messages[1]["content"]


async def test_sse_run_non_portal_session_not_persisted(client):
    """session_id 未在会话表注册（老客户端直跑）→ 不落库、不影响 run。"""
    await create_demo_agent(client, key="raw-agent")
    response = await client.post(
        "/v1/agents/raw-agent/runs", json={"input": "你好", "session_id": "raw-s1"}
    )
    assert response.status_code == 200
    run_id = sse_run_id(response.text)
    run = (await client.get(f"/v1/runs/{run_id}")).json()
    assert run["status"] == "completed"
