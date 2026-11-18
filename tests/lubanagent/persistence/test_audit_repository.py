"""R9 审计仓储：追加留痕、过滤查询、白名单校验、detail 截断与损坏兜底。"""

import sqlalchemy as sa
import pytest

from lubanagent.core import ErrorCode, LubanError
from lubanagent.persistence.models.audit import AuditEventRow
from lubanagent.persistence.repositories.audit import AuditRepository


async def test_append_and_list_roundtrip(db):
    async with db.session() as session:
        repo = AuditRepository(session)
        event_id = await repo.append(
            event_type="assignment.grant",
            actor="platform_user:admin",
            resource_type="knowledge",
            resource_id="kb-1",
            detail={"grantee_id": "portal_user:u1", "perm": "use"},
        )
        assert event_id is not None
        events, total = await repo.list_events(event_type="assignment.grant")
    assert total == 1
    assert events[0]["id"] == event_id
    assert events[0]["actor"] == "platform_user:admin"
    assert events[0]["outcome"] == "success"
    assert events[0]["detail"]["grantee_id"] == "portal_user:u1"


async def test_list_filters(db):
    async with db.session() as session:
        repo = AuditRepository(session)
        await repo.append(event_type="portal.login", actor="portal_user:a")
        await repo.append(event_type="portal.login_failed", actor="portal_user:b", outcome="denied")
        await repo.append(
            event_type="quota.set", actor="platform_user:admin", resource_type="quota",
            resource_id="user:u1",
        )
        by_type, _ = await repo.list_events(event_type="portal.login")
        by_actor, _ = await repo.list_events(actor="portal_user:b")
        by_resource, _ = await repo.list_events(resource_type="quota", resource_id="user:u1")
        by_outcome, _ = await repo.list_events(outcome="denied")
    assert len(by_type) == 1
    assert by_type[0]["event_type"] == "portal.login"
    assert by_actor[0]["event_type"] == "portal.login_failed"
    assert by_resource[0]["event_type"] == "quota.set"
    assert by_outcome[0]["actor"] == "portal_user:b"


async def test_invalid_event_type_and_outcome_rejected(db):
    async with db.session() as session:
        repo = AuditRepository(session)
        with pytest.raises(LubanError) as exc_type:
            await repo.append(event_type="fake.event", actor="x")
        assert exc_type.value.code == ErrorCode.VALIDATION_ERROR
        with pytest.raises(LubanError):
            await repo.append(event_type="portal.login", actor="x", outcome="maybe")
        count = await session.scalar(sa.select(sa.func.count()).select_from(AuditEventRow))
    assert count == 0


async def test_detail_oversize_truncated_and_corrupt_json_falls_back(db):
    async with db.session() as session:
        repo = AuditRepository(session)
        await repo.append(event_type="portal.login", actor="a", detail={"k": "v" * 20000})
        # 直接写坏 JSON 模拟历史脏数据
        session.add(
            AuditEventRow(
                id="bad-json", event_type="portal.login", actor="b",
                outcome="success", detail="not-json{",
            )
        )
        await session.flush()
        events, _ = await repo.list_events()
    big = next(e for e in events if e["actor"] == "a")
    # 超限 detail 重组为 {_truncated, raw}，读侧始终是合法 JSON
    assert big["detail"]["_truncated"] is True
    assert big["detail"]["raw"].startswith('{"k": "')
    bad = next(e for e in events if e["actor"] == "b")
    assert bad["detail"] == {"_raw": "not-json{"}
