"""资源分配仓储：授权/撤销/可见资源聚合/权限判断（R1 权限谓词查询）。

perm 层级：manage ⊃ use ⊃ view——授予 use 即隐含 view，授予 manage 即隐含全部。
"""

import uuid
from collections.abc import Iterable

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from lubanagent.core import ErrorCode, LubanError
from lubanagent.persistence.models.assignment import (
    GRANTEE_TYPES,
    PERMS,
    RESOURCE_TYPES,
    AssignmentRow,
)

# 请求某权限时，行上哪些 perm 视为满足（含下级隐含）。
_PERM_IMPLIED: dict[str, frozenset[str]] = {
    "view": frozenset(PERMS),
    "use": frozenset(("use", "manage")),
    "manage": frozenset(("manage",)),
}


def _validate(resource_type: str, grantee_type: str, perm: str) -> None:
    if resource_type not in RESOURCE_TYPES:
        raise LubanError(
            ErrorCode.VALIDATION_ERROR,
            f"资源类型不合法: {resource_type}（允许: {'|'.join(RESOURCE_TYPES)}）",
        )
    if grantee_type not in GRANTEE_TYPES:
        raise LubanError(
            ErrorCode.VALIDATION_ERROR,
            f"被授权主体类型不合法: {grantee_type}（允许: {'|'.join(GRANTEE_TYPES)}）",
        )
    if perm not in PERMS:
        raise LubanError(
            ErrorCode.VALIDATION_ERROR,
            f"权限级别不合法: {perm}（允许: {'|'.join(PERMS)}）",
        )


class AssignmentRepository:
    """assignments 表读写；返回 dict 视图，与其他仓储一致。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def grant(
        self,
        resource_type: str,
        resource_id: str,
        grantee_type: str,
        grantee_id: str,
        perm: str,
    ) -> dict:
        """授权；同五元组已存在则幂等返回既有授权。"""
        _validate(resource_type, grantee_type, perm)
        row = await self._session.scalar(
            sa.select(AssignmentRow).where(
                AssignmentRow.resource_type == resource_type,
                AssignmentRow.resource_id == resource_id,
                AssignmentRow.grantee_type == grantee_type,
                AssignmentRow.grantee_id == grantee_id,
                AssignmentRow.perm == perm,
            )
        )
        if row is None:
            row = AssignmentRow(
                id=str(uuid.uuid4()),
                resource_type=resource_type,
                resource_id=resource_id,
                grantee_type=grantee_type,
                grantee_id=grantee_id,
                perm=perm,
            )
            self._session.add(row)
            await self._session.flush()
        return self._to_dict(row)

    async def revoke(
        self,
        resource_type: str,
        resource_id: str,
        grantee_type: str,
        grantee_id: str,
        perm: str,
    ) -> bool:
        """撤销精确五元组；不存在返回 False。"""
        _validate(resource_type, grantee_type, perm)
        row = await self._session.scalar(
            sa.select(AssignmentRow).where(
                AssignmentRow.resource_type == resource_type,
                AssignmentRow.resource_id == resource_id,
                AssignmentRow.grantee_type == grantee_type,
                AssignmentRow.grantee_id == grantee_id,
                AssignmentRow.perm == perm,
            )
        )
        if row is None:
            return False
        await self._session.delete(row)
        await self._session.flush()
        return True

    async def visible_resource_ids(
        self,
        subject_id: str,
        subject_roles: Iterable[str],
        resource_type: str,
    ) -> set[str]:
        """聚合"对个人授权 + 对其角色授权"，返回可见资源 id 集合。

        任何级别的授权（view/use/manage）都构成可见性。
        """
        if resource_type not in RESOURCE_TYPES:
            raise LubanError(
                ErrorCode.VALIDATION_ERROR,
                f"资源类型不合法: {resource_type}（允许: {'|'.join(RESOURCE_TYPES)}）",
            )
        grantee_ids = {subject_id} if subject_id else set()
        grantee_ids |= {role for role in subject_roles if role}
        if not grantee_ids:
            return set()
        rows = (
            await self._session.scalars(
                sa.select(AssignmentRow.resource_id).where(
                    AssignmentRow.resource_type == resource_type,
                    AssignmentRow.grantee_id.in_(grantee_ids),
                    AssignmentRow.grantee_type.in_(GRANTEE_TYPES),
                )
            )
        ).all()
        return set(rows)

    async def has_permission(
        self,
        subject_id: str,
        subject_roles: Iterable[str],
        resource_type: str,
        resource_id: str,
        perm: str,
    ) -> bool:
        """判断主体（个人 ∪ 角色）对资源是否拥有 perm（含下级隐含）。"""
        if perm not in _PERM_IMPLIED:
            raise LubanError(
                ErrorCode.VALIDATION_ERROR,
                f"权限级别不合法: {perm}（允许: {'|'.join(PERMS)}）",
            )
        grantee_ids = {subject_id} if subject_id else set()
        grantee_ids |= {role for role in subject_roles if role}
        if not grantee_ids:
            return False
        assignments = (
            await self._session.scalars(
                sa.select(AssignmentRow).where(
                    AssignmentRow.resource_type == resource_type,
                    AssignmentRow.resource_id == resource_id,
                    AssignmentRow.grantee_id.in_(grantee_ids),
                    AssignmentRow.grantee_type.in_(GRANTEE_TYPES),
                )
            )
        ).all()
        return any(row.perm in _PERM_IMPLIED[perm] for row in assignments)

    async def list_assignments(
        self,
        *,
        resource_type: str | None = None,
        resource_id: str | None = None,
        grantee_type: str | None = None,
        grantee_id: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> tuple[list[dict], int]:
        """管理端过滤查询：按资源/被授权主体筛选（分页 + 总数）。"""
        if resource_type is not None and resource_type not in RESOURCE_TYPES:
            raise LubanError(
                ErrorCode.VALIDATION_ERROR,
                f"资源类型不合法: {resource_type}（允许: {'|'.join(RESOURCE_TYPES)}）",
            )
        if grantee_type is not None and grantee_type not in GRANTEE_TYPES:
            raise LubanError(
                ErrorCode.VALIDATION_ERROR,
                f"被授权主体类型不合法: {grantee_type}（允许: {'|'.join(GRANTEE_TYPES)}）",
            )
        conditions = []
        if resource_type is not None:
            conditions.append(AssignmentRow.resource_type == resource_type)
        if resource_id is not None:
            conditions.append(AssignmentRow.resource_id == resource_id)
        if grantee_type is not None:
            conditions.append(AssignmentRow.grantee_type == grantee_type)
        if grantee_id is not None:
            conditions.append(AssignmentRow.grantee_id == grantee_id)
        where = sa.and_(*conditions) if conditions else sa.true()

        total = await self._session.scalar(
            sa.select(sa.func.count()).select_from(AssignmentRow).where(where)
        )
        rows = (
            (
                await self._session.execute(
                    sa.select(AssignmentRow)
                    .where(where)
                    .order_by(AssignmentRow.created_at.desc(), AssignmentRow.id.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return [self._to_dict(row) for row in rows], int(total or 0)

    @staticmethod
    def _to_dict(row: AssignmentRow) -> dict:
        return {
            "id": row.id,
            "resource_type": row.resource_type,
            "resource_id": row.resource_id,
            "grantee_type": row.grantee_type,
            "grantee_id": row.grantee_id,
            "perm": row.perm,
            "created_at": row.created_at,
        }
