"""R3 主体配额：配额内放行 / token、费用、并发超限 429 / role 级 / 管理 API。"""

import sqlalchemy as sa

from lubanagent.persistence.models import AgentRow, AgentVersionRow
from lubanagent.persistence.models.run import RunRow
from tests.lubanagent.api.conftest import create_demo_agent


async def _seed_run(
    db,
    agent_key: str,
    run_id: str,
    *,
    user_id: str,
    token_usage: dict | None = None,
    cost: float = 0.0,
    status: str = "completed",
) -> None:
    """直接插一条 Run（绕过 runtime），精确控制用量/费用/状态。"""
    async with db.session() as session:
        agent = await session.scalar(sa.select(AgentRow).where(AgentRow.key == agent_key))
        version = await session.scalar(
            sa.select(AgentVersionRow).where(AgentVersionRow.agent_id == agent.id)
        )
        session.add(
            RunRow(
                id=run_id,
                agent_id=agent.id,
                agent_version_id=version.id,
                status=status,
                user_id=user_id,
                input={},
                brain_profile="smart",
                token_usage=token_usage or {},
                cost=cost,
            )
        )
        await session.flush()


async def _set_quota(client, scope: str, scope_id: str, **limits):
    body = {
        "max_tokens": None,
        "max_cost": None,
        "max_concurrent_runs": None,
        "window": "total",
        **limits,
    }
    return await client.put(f"/v1/quotas/{scope}/{scope_id}", json=body)


async def test_quota_management_set_get_delete(client):
    await create_demo_agent(client)
    created = await _set_quota(
        client, "user", "u-mgr", max_tokens=1000, max_cost="12.5", max_concurrent_runs=2
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["scope"] == "user"
    assert body["scope_id"] == "u-mgr"
    assert body["max_tokens"] == 1000
    assert float(body["max_cost"]) == 12.5
    assert body["window"] == "total"

    fetched = await client.get("/v1/quotas/user/u-mgr")
    assert fetched.status_code == 200
    assert fetched.json()["max_tokens"] == 1000

    # upsert 覆盖
    updated = await _set_quota(client, "user", "u-mgr", max_tokens=7)
    assert updated.json()["max_tokens"] == 7
    assert updated.json()["max_cost"] is None

    # 未配置的查询返回 null
    missing = await client.get("/v1/quotas/user/ghost")
    assert missing.status_code == 200
    assert missing.json() is None

    deleted = await client.delete("/v1/quotas/user/u-mgr")
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}
    assert (await client.delete("/v1/quotas/user/u-mgr")).json() == {"deleted": False}
    assert (await client.get("/v1/quotas/user/u-mgr")).json() is None


async def test_quota_invalid_scope_rejected(client):
    response = await _set_quota(client, "bogus", "x", max_tokens=1)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_no_quota_allows_run(client):
    await create_demo_agent(client, key="free-agent")
    response = await client.post(
        "/v1/agents/free-agent/runs", json={"input": "你好", "user_id": "u-free"}
    )
    assert response.status_code == 200
    assert "event: run.completed" in response.text


async def test_quota_within_limit_allows_run(client, db):
    await create_demo_agent(client, key="quota-agent")
    await _seed_run(
        db,
        "quota-agent",
        "seed-1",
        user_id="u-ok",
        token_usage={"input_tokens": 10, "output_tokens": 5},
        cost=0.5,
    )
    limit = await _set_quota(client, "user", "u-ok", max_tokens=1000, max_cost="10")
    assert limit.status_code == 200
    response = await client.post(
        "/v1/agents/quota-agent/runs", json={"input": "你好", "user_id": "u-ok"}
    )
    assert response.status_code == 200
    assert "event: run.completed" in response.text


async def test_token_quota_exceeded_returns_429(client, db):
    await create_demo_agent(client, key="tok-agent")
    await _seed_run(
        db,
        "tok-agent",
        "seed-tok",
        user_id="u-tok",
        token_usage={"input_tokens": 20, "output_tokens": 5},
    )
    await _set_quota(client, "user", "u-tok", max_tokens=10)
    response = await client.post(
        "/v1/agents/tok-agent/runs", json={"input": "你好", "user_id": "u-tok"}
    )
    assert response.status_code == 429
    error = response.json()["error"]
    assert error["code"] == "QUOTA_EXCEEDED"
    assert error["details"]["dimension"] == "tokens"
    assert error["details"]["used"] == 25


async def test_cost_quota_exceeded_returns_429(client, db):
    await create_demo_agent(client, key="cost-agent")
    await _seed_run(db, "cost-agent", "seed-cost", user_id="u-cost", cost=5.0)
    await _set_quota(client, "user", "u-cost", max_cost="1")
    response = await client.post(
        "/v1/agents/cost-agent/runs", json={"input": "你好", "user_id": "u-cost"}
    )
    assert response.status_code == 429
    error = response.json()["error"]
    assert error["code"] == "QUOTA_EXCEEDED"
    assert error["details"]["dimension"] == "cost"


async def test_concurrent_quota_exceeded_returns_429(client, db):
    await create_demo_agent(client, key="conc-agent")
    await _seed_run(
        db,
        "conc-agent",
        "seed-conc",
        user_id="u-conc",
        token_usage={},
        status="running",
    )
    await _set_quota(client, "user", "u-conc", max_concurrent_runs=1)
    response = await client.post(
        "/v1/agents/conc-agent/runs", json={"input": "你好", "user_id": "u-conc"}
    )
    assert response.status_code == 429
    error = response.json()["error"]
    assert error["code"] == "QUOTA_EXCEEDED"
    assert error["details"]["dimension"] == "concurrent_runs"


async def test_role_quota_applies_to_member(client, db):
    """auth 关闭时默认主体是 anonymous 角色；role 级配额对其成员生效。"""
    await create_demo_agent(client, key="role-agent")
    await _seed_run(
        db,
        "role-agent",
        "seed-role",
        user_id="u-role",
        token_usage={"input_tokens": 50, "output_tokens": 50},
    )
    # 该用户没有 user 级配额，只有 anonymous 角色级配额
    limit = await _set_quota(client, "role", "anonymous", max_tokens=100)
    assert limit.status_code == 200
    response = await client.post(
        "/v1/agents/role-agent/runs", json={"input": "你好", "user_id": "u-role"}
    )
    assert response.status_code == 429
    error = response.json()["error"]
    assert error["code"] == "QUOTA_EXCEEDED"
    assert error["details"]["scope"] == "role"
    assert error["details"]["scope_id"] == "anonymous"

    # 放宽后放行
    await _set_quota(client, "role", "anonymous", max_tokens=10000)
    ok = await client.post(
        "/v1/agents/role-agent/runs", json={"input": "你好", "user_id": "u-role"}
    )
    assert ok.status_code == 200
