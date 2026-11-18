"""R9 审计事件 API：门户登录/注册、配额变更、会话删除留痕 + 过滤与权限。"""

from tests.lubanagent.api.conftest import make_client


async def test_portal_login_fail_and_quota_ops_audited(db, registry):
    client = await make_client(
        db, registry, portal_enabled=True, portal_registration_enabled=True
    )
    async with client:
        # 注册成功留痕
        registered = await client.post(
            "/v1/portal/register",
            json={"username": "auditu", "password": "p4ssw0rd-12chars!"},
        )
        assert registered.status_code == 201, registered.text

        # 登录失败留痕（denied）
        failed = await client.post(
            "/v1/portal/login",
            json={"username": "auditu", "password": "wrong-password-xx!"},
        )
        assert failed.status_code == 401

        # 配额 set + delete 留痕
        put = await client.put(
            "/v1/quotas/user/auditu",
            json={"max_tokens": 100, "max_cost": None, "max_concurrent_runs": None, "window": "day"},
        )
        assert put.status_code == 200, put.text
        deleted = await client.delete("/v1/quotas/user/auditu")
        assert deleted.json() == {"deleted": True}

        events = (await client.get("/v1/audit-events")).json()
        types = [e["event_type"] for e in events]
        assert "portal.register" in types
        assert "portal.login_failed" in types
        assert "quota.set" in types
        assert "quota.delete" in types

        denied = next(e for e in events if e["event_type"] == "portal.login_failed")
        assert denied["outcome"] == "denied"
        assert denied["actor"] == "portal_user:auditu"


async def test_session_delete_audited(client):
    created = await client.post("/v1/sessions", json={"title": "审计会话"})
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]

    deleted = await client.delete(f"/v1/sessions/{session_id}")
    assert deleted.json() == {"deleted": True}

    events = (await client.get("/v1/audit-events", params={"event_type": "session.delete"})).json()
    assert len(events) == 1
    assert events[0]["resource_id"] == session_id
    assert events[0]["resource_type"] == "session"


async def test_audit_query_filters_and_pagination(client):
    for i in range(3):
        created = await client.post("/v1/sessions", json={"title": f"s{i}"})
        await client.delete(f"/v1/sessions/{created.json()['id']}")
    page = await client.get(
        "/v1/audit-events", params={"event_type": "session.delete", "limit": 2}
    )
    assert len(page.json()) == 2
    page2 = await client.get(
        "/v1/audit-events",
        params={"event_type": "session.delete", "limit": 2, "offset": 2},
    )
    assert len(page2.json()) == 1
    ids = {e["id"] for e in page.json()}
    assert ids.isdisjoint({e["id"] for e in page2.json()})
