"""动态资源装配器（R2）：Run 装配时按当前 subject 的权限集过滤可见资源。

语义（设计文档 §4.1 第 2 条 / §4.3 R2）：

- Agent 定义不变；过滤发生在装配层——工具（tool）、知识源（knowledge）、
  Skill（skill）、MCP Server（mcp）四类资源按 subject 权限集裁剪后再进入本次
  Run 的工具集 / 知识库检索范围 / Skill 加载白名单 / MCP 发现列表。
- 权限层级 manage ⊃ use ⊃ view（判断复用 AssignmentRepository.has_permission）。
  tool/mcp/skill 需 use 及以上（检索/执行语义）；knowledge 需 view 及以上
  （检索片段只读语义）。
- DEFAULT_ALLOW_UNASSIGNED（默认 True，向后兼容）语义：某个资源在 assignments
  表中没有任何分配记录时，对所有人可见；一旦该资源存在至少一条分配记录，
  则只有被授权者（个人或其角色，且 perm 达到要求层级）可见。置 False 时
  一律要求显式授权。
- subject 缺失（Run 请求与 log_context 均未提供）时不过滤，保持旧行为；
  受控环境由接入层保证 log_context 携带可信 subject。
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import sqlalchemy as sa

from lubanagent.core import AgentDefinition
from lubanagent.persistence import Database
from lubanagent.persistence.models.assignment import AssignmentRow
from lubanagent.persistence.repositories.assignment import AssignmentRepository


@dataclass(frozen=True)
class _ResourceSpec:
    """一类资源：定义字段路径 + 进入 Run 所需的最低 perm。"""

    resource_type: str  # assignments.resource_type
    perm: str  # 装配进 Run 所需最低权限
    field: str  # AgentDefinition 上的字段路径（"." 表示嵌套）


_RESOURCE_SPECS: tuple[_ResourceSpec, ...] = (
    _ResourceSpec("tool", "use", "tools"),
    _ResourceSpec("knowledge", "view", "knowledge.sources"),
    _ResourceSpec("skill", "use", "skills"),
    _ResourceSpec("mcp", "use", "mcp_servers"),
)


def _field_ids(definition: AgentDefinition, path: str) -> list[str]:
    """按字段路径取定义里的资源 id 列表（只读，不改原定义）。"""
    obj: Any = definition
    for part in path.split("."):
        obj = getattr(obj, part)
    return list(obj)


async def _assigned_resource_ids(session: Any, resource_type: str) -> set[str]:
    """该资源类型下存在至少一条分配记录的资源 id 集合（受管资源全集）。"""
    rows = await session.scalars(
        sa.select(AssignmentRow.resource_id)
        .where(AssignmentRow.resource_type == resource_type)
        .distinct()
    )
    return set(rows)


async def filter_definition_for_subject(
    definition: AgentDefinition,
    *,
    db: Database,
    subject_id: str | None,
    subject_roles: Iterable[str] = (),
    allow_unassigned: bool = True,
) -> AgentDefinition:
    """按 subject 权限集裁剪定义中的资源引用，返回过滤后的定义副本。

    未过滤掉任何资源时原样返回入参（零拷贝零行为变化）；有裁剪时返回
    model_copy 副本，不写回数据库，也不影响其他并行 Run。
    """
    roles = [role for role in subject_roles if role]
    if not subject_id and not roles:
        return definition  # 无可信主体 → 不过滤（见模块 docstring）
    updates: dict[str, Any] = {}
    async with db.session() as session:
        repo = AssignmentRepository(session)
        for spec in _RESOURCE_SPECS:
            ids = _field_ids(definition, spec.field)
            if not ids:
                continue
            restricted = await _assigned_resource_ids(session, spec.resource_type)
            kept: list[str] = []
            for resource_id in ids:
                if allow_unassigned and resource_id not in restricted:
                    kept.append(resource_id)  # 无任何分配记录 → 默认可见
                    continue
                if await repo.has_permission(
                    subject_id or "", roles, spec.resource_type, resource_id, spec.perm
                ):
                    kept.append(resource_id)
            if kept == ids:
                continue
            if spec.field == "knowledge.sources":
                updates["knowledge"] = definition.knowledge.model_copy(
                    update={"sources": kept}
                )
            else:
                updates[spec.field] = kept
    return definition.model_copy(update=updates) if updates else definition


__all__ = ["filter_definition_for_subject"]
