"""R8 后端：/v1/assignments 授权/撤销/列表 + 授权变更审计留痕。"""

from tests.lubanagent.api.conftest import create_demo_agent


async def _grant(client, **overrides):
    body = {
        "resource_type": "knowledge",
        "resource_id": "kb-1",
        "grantee_type": "user",
        "grantee_id": "portal_user:u1",
        "perm": "use",
        **overrides,
    }
    return await client.post("/v1/assignments", json=body), body


async def test_grant_idempotent_and_list(client):
    await create_demo_agent(client)
    first, body = await _grant(client)
    assert first.status_code == 201, first.text
    second, _ = await _grant(client)
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]  # 同五元组幂等

    # 不同 perm 是另一条授权
    third, _ = await _grant(client, perm="manage")
    assert third.json()["id"] != first.json()["id"]

    listed = await client.get("/v1/assignments", params={"resource_type": "knowledge"})
    assert listed.status_code == 200
    assert len(listed.json()) == 2

    by_grantee = await client.get(
        "/v1/assignments", params={"grantee_id": "portal_user:u1"}
    )
    assert len(by_grantee.json()) == 2

    none = await client.get("/v1/assignments", params={"grantee_id": "ghost"})
    assert none.json() == []


async def test_grant_invalid_resource_type_422(client):
    response, _ = await _grant(client, resource_type="galaxy")
    assert response.status_code == 422


async def test_revoke_and_missing(client):
    await create_demo_agent(client)
    created, _ = await _grant(client)
    assert created.status_code == 201

    deleted = await client.delete(
        "/v1/assignments",
        params={
            "resource_type": "knowledge",
            "resource_id": "kb-1",
            "grantee_type": "user",
            "grantee_id": "portal_user:u1",
            "perm": "use",
        },
    )
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}

    missing = await client.delete(
        "/v1/assignments",
        params={
            "resource_type": "knowledge",
            "resource_id": "kb-1",
            "grantee_type": "user",
            "grantee_id": "portal_user:u1",
            "perm": "use",
        },
    )
    assert missing.json() == {"deleted": False}

    listed = await client.get("/v1/assignments")
    assert listed.json() == []


async def test_grant_and_revoke_audited(client):
    await create_demo_agent(client)
    created, body = await _grant(client, perm="view")
    assert created.status_code == 201

    await client.delete(
        "/v1/assignments",
        params={
            "resource_type": body["resource_type"],
            "resource_id": body["resource_id"],
            "grantee_type": body["grantee_type"],
            "grantee_id": body["grantee_id"],
            "perm": body["perm"],
        },
    )
    events = await client.get("/v1/audit-events")
    assert events.status_code == 200
    types = [e["event_type"] for e in events.json()]
    assert "assignment.grant" in types
    assert "assignment.revoke" in types
    grant_event = next(e for e in events.json() if e["event_type"] == "assignment.grant")
    assert grant_event["resource_id"] == "kb-1"
    assert grant_event["detail"]["perm"] == "view"
