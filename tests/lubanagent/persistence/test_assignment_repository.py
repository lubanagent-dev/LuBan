"""AssignmentRepository：授权/撤销/可见性聚合/权限判断，user 与 role 两条路径。"""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from lubanagent.core import LubanError
from lubanagent.persistence.models import AssignmentRow
from lubanagent.persistence.repositories import AssignmentRepository


async def _count(session: AsyncSession) -> int:
    return (await session.scalar(select(func.count()).select_from(AssignmentRow))) or 0


async def test_grant_and_duplicate_is_idempotent(session: AsyncSession) -> None:
    repo = AssignmentRepository(session)
    grant = await repo.grant("agent", "support", "user", "u-1", "use")
    assert grant["resource_type"] == "agent"
    assert grant["resource_id"] == "support"
    assert grant["grantee_type"] == "user"
    assert grant["grantee_id"] == "u-1"
    assert grant["perm"] == "use"
    assert grant["created_at"] is not None

    again = await repo.grant("agent", "support", "user", "u-1", "use")
    assert again["id"] == grant["id"]
    assert await _count(session) == 1  # 唯一约束 + 幂等，不产生第二行


async def test_grant_rejects_invalid_enum(session: AsyncSession) -> None:
    repo = AssignmentRepository(session)
    with pytest.raises(LubanError):
        await repo.grant("plugin", "x", "user", "u-1", "use")
    with pytest.raises(LubanError):
        await repo.grant("agent", "x", "group", "g-1", "use")
    with pytest.raises(LubanError):
        await repo.grant("agent", "x", "user", "u-1", "own")


async def test_revoke_removes_only_exact_grant(session: AsyncSession) -> None:
    repo = AssignmentRepository(session)
    await repo.grant("skill", "translator", "role", "editor", "manage")
    assert await repo.revoke("skill", "translator", "role", "editor", "view") is False
    assert await repo.revoke("skill", "translator", "role", "editor", "manage") is True
    assert await repo.revoke("skill", "translator", "role", "editor", "manage") is False
    assert await _count(session) == 0


async def test_visible_resource_ids_aggregates_user_and_role(session: AsyncSession) -> None:
    repo = AssignmentRepository(session)
    # 个人授权（agent）+ 角色授权（skill + knowledge）+ 无关主体（排除）
    await repo.grant("agent", "agent-a", "user", "u-1", "view")
    await repo.grant("skill", "skill-1", "role", "editor", "use")
    await repo.grant("skill", "skill-1", "user", "u-2", "use")  # 别人的，不算
    await repo.grant("knowledge", "kb-1", "role", "editor", "view")
    await repo.grant("knowledge", "kb-2", "user", "u-1", "manage")
    await repo.grant("mcp", "mcp-1", "role", "viewer", "view")  # u-1 不在 viewer 组

    assert await repo.visible_resource_ids("u-1", ["editor"], "agent") == {"agent-a"}
    assert await repo.visible_resource_ids("u-1", ["editor"], "skill") == {"skill-1"}
    assert await repo.visible_resource_ids("u-1", ["editor"], "knowledge") == {"kb-1", "kb-2"}
    assert await repo.visible_resource_ids("u-1", ["viewer"], "mcp") == {"mcp-1"}
    assert await repo.visible_resource_ids("u-1", ["editor", "viewer"], "mcp") == {"mcp-1"}
    assert await repo.visible_resource_ids("u-9", [], "agent") == set()
    assert await repo.visible_resource_ids("u-1", ["editor"], "tool") == set()


async def test_has_permission_user_and_role_paths_with_perm_hierarchy(
    session: AsyncSession,
) -> None:
    repo = AssignmentRepository(session)
    await repo.grant("agent", "agent-a", "user", "u-1", "use")
    await repo.grant("agent", "agent-b", "role", "editor", "manage")

    # user 路径：use 隐含 view，但不含 manage
    assert await repo.has_permission("u-1", [], "agent", "agent-a", "view") is True
    assert await repo.has_permission("u-1", [], "agent", "agent-a", "use") is True
    assert await repo.has_permission("u-1", [], "agent", "agent-a", "manage") is False

    # role 路径：manage 隐含全部
    assert await repo.has_permission("u-2", ["editor"], "agent", "agent-b", "view") is True
    assert await repo.has_permission("u-2", ["editor"], "agent", "agent-b", "use") is True
    assert await repo.has_permission("u-2", ["editor"], "agent", "agent-b", "manage") is True

    # 未授权资源 / 未知主体 / 错误权限名
    assert await repo.has_permission("u-1", [], "agent", "agent-b", "view") is False
    assert await repo.has_permission("u-9", [], "agent", "agent-a", "view") is False
    assert await repo.has_permission("", [], "agent", "agent-a", "view") is False

    with pytest.raises(LubanError):
        await repo.has_permission("u-1", [], "agent", "agent-a", "own")
