"""审计事件仓储（R9）：追加留痕 + 分页过滤查询。

写入语义：append 失败不抛出（审计缺失宁可记日志告警，不阻断业务请求），
由调用方配合 logger 输出落地失败明细；查询语义与 diagnostics 一致（真实持久化数据）。
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from lubanagent.core import ErrorCode, LubanError
from lubanagent.persistence.models.audit import EVENT_TYPES, OUTCOMES, AuditEventRow

logger = logging.getLogger(__name__)

_MAX_DETAIL_CHARS = 8192


class AuditRepository:
    """audit_events 表读写；返回 dict 视图，与其他仓储一致。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def append(
        self,
        *,
        event_type: str,
        actor: str,
        outcome: str = "success",
        resource_type: str | None = None,
        resource_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> str | None:
        """追加一条审计事件；返回事件 id，写入失败返回 None（不阻断业务）。

        event_type/outcome 走白名单校验（非法值属于编程错误，直接抛出，
        让测试与开发期暴露；运行期非法值同样抛出——静默改写事件类型会伪造审计）。
        """
        if event_type not in EVENT_TYPES:
            raise LubanError(
                ErrorCode.VALIDATION_ERROR,
                f"审计事件类型不合法: {event_type}（允许: {'|'.join(EVENT_TYPES)}）",
            )
        if outcome not in OUTCOMES:
            raise LubanError(
                ErrorCode.VALIDATION_ERROR,
                f"审计结果不合法: {outcome}（允许: {'|'.join(OUTCOMES)}）",
            )
        detail_text: str | None = None
        if detail is not None:
            text = json.dumps(detail, ensure_ascii=False)
            if len(text) > _MAX_DETAIL_CHARS:
                # 截断后重组为合法 JSON：保留前缀 + 截断标记，读侧不出现解析失败。
                text = json.dumps(
                    {"_truncated": True, "raw": text[: _MAX_DETAIL_CHARS - 64]},
                    ensure_ascii=False,
                )
            detail_text = text
        event_id = str(uuid.uuid4())
        row = AuditEventRow(
            id=event_id,
            event_type=event_type,
            actor=actor[:255],
            outcome=outcome,
            resource_type=resource_type[:64] if resource_type else None,
            resource_id=resource_id[:255] if resource_id else None,
            detail=detail_text,
        )
        self._session.add(row)
        try:
            await self._session.flush()
        except Exception:
            logger.exception("audit.append failed event_type=%s actor=%s", event_type, actor)
            return None
        return event_id

    async def list_events(
        self,
        *,
        event_type: str | None = None,
        actor: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        outcome: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> tuple[list[dict], int]:
        """按事件类型/主体/资源/结果/时间范围过滤，updated_at 近似按 created_at 倒序。"""
        conditions = []
        if event_type is not None:
            conditions.append(AuditEventRow.event_type == event_type)
        if actor is not None:
            conditions.append(AuditEventRow.actor == actor)
        if resource_type is not None:
            conditions.append(AuditEventRow.resource_type == resource_type)
        if resource_id is not None:
            conditions.append(AuditEventRow.resource_id == resource_id)
        if outcome is not None:
            conditions.append(AuditEventRow.outcome == outcome)
        if since is not None:
            conditions.append(AuditEventRow.created_at >= since)
        if until is not None:
            conditions.append(AuditEventRow.created_at < until)
        where = sa.and_(*conditions) if conditions else sa.true()

        total = await self._session.scalar(
            sa.select(sa.func.count()).select_from(AuditEventRow).where(where)
        )
        rows = (
            (
                await self._session.execute(
                    sa.select(AuditEventRow)
                    .where(where)
                    .order_by(AuditEventRow.created_at.desc(), AuditEventRow.id.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return [self._to_dict(row) for row in rows], int(total or 0)

    @staticmethod
    def _to_dict(row: AuditEventRow) -> dict:
        detail: dict[str, Any] | None = None
        if row.detail:
            try:
                detail = json.loads(row.detail)
            except ValueError:
                detail = {"_raw": row.detail}
        return {
            "id": row.id,
            "event_type": row.event_type,
            "actor": row.actor,
            "outcome": row.outcome,
            "resource_type": row.resource_type,
            "resource_id": row.resource_id,
            "detail": detail,
            "created_at": row.created_at,
        }
