"""门户主体可见性过滤：portal_user 只能看到被分配（或未受管）的 Agent。

语义与 runtime/assignment_filter 一致：DEFAULT_ALLOW_UNASSIGNED=True 时，
没有任何分配记录的 Agent 对所有人可见；一旦存在分配记录，仅被授权者
（个人 ∪ 角色，view 及以上）可见。仅作用于 portal_user:* 主体；工作台
与匿名（演示模式）行为不变。
"""

import sqlalchemy as sa

from lubanagent.config import Settings
from lubanagent.core import AgentDefinition, ErrorCode, LubanError
from lubanagent.persistence import Database
from lubanagent.persistence.models.assignment import AssignmentRow
from lubanagent.persistence.repositories.assignment import AssignmentRepository


def _portal_subject(principal: object) -> str | None:
    """取门户主体；非门户主体（工作台/匿名）返回 None = 不过滤。"""
    subject = getattr(principal, "subject", None)
    if subject and str(subject).startswith("portal_user:"):
        return str(subject)
    return None


def _portal_roles(principal: object) -> list[str]:
    user = (getattr(principal, "claims", None) or {}).get("user") or {}
    return [str(role) for role in user.get("roles", []) if role]


async def _portal_allowed_keys(
    ctx: object, principal: object, keys: set[str], settings: Settings, db: Database
) -> set[str]:
    """portal 主体可见的 agent key 集合（keys 的子集）。"""
    subject = _portal_subject(principal)
    if subject is None:
        return keys
    async with db.session() as session:
        visible = await AssignmentRepository(session).visible_resource_ids(
            subject, _portal_roles(principal), "agent"
        )
        managed = set(
            await session.scalars(
                sa.select(AssignmentRow.resource_id).where(
                    AssignmentRow.resource_type == "agent"
                )
            )
        )
    if settings.default_allow_unassigned:
        return {key for key in keys if key not in managed} | (visible & keys)
    return visible & keys


async def filter_visible_agents(
    ctx, principal: object, definitions: list[AgentDefinition], settings: Settings, db: Database
) -> list[AgentDefinition]:
    """按门户主体过滤 agent 定义列表；非门户主体原样返回。"""
    if _portal_subject(principal) is None:
        return definitions
    allowed = await _portal_allowed_keys(
        ctx, principal, {d.key for d in definitions}, settings, db
    )
    return [d for d in definitions if d.key in allowed]


async def ensure_agent_visible(
    ctx, principal: object, key: str, settings: Settings, db: Database
) -> None:
    """门户主体访问未授权 agent → 与不存在同形的 404（防资源枚举）。"""
    if _portal_subject(principal) is None:
        return
    allowed = await _portal_allowed_keys(ctx, principal, {key}, settings, db)
    if key not in allowed:
        raise LubanError(
            ErrorCode.AGENT_NOT_FOUND, f"Agent 不存在: {key}", details={"agent_key": key}
        )
