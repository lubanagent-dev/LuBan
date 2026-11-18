"""审计写入助手（R9）：独立会话、失败不阻断业务的 best-effort 落库。

路由内已有 DB 会话时也用独立会话写入：审计失败绝不能回滚业务事务，
反之业务回滚也不应连带吞掉审计（授权变更类事件要求"无论成败都留痕"）。
"""

import logging
from typing import Any

from lubanagent.api.deps import AppContext
from lubanagent.persistence.repositories.audit import AuditRepository

logger = logging.getLogger(__name__)


async def record_audit(
    ctx: AppContext,
    *,
    event_type: str,
    actor: str,
    outcome: str = "success",
    resource_type: str | None = None,
    resource_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    """写一条审计事件；任何异常只记日志，不向上传播。"""
    try:
        async with ctx.db.session() as session:
            await AuditRepository(session).append(
                event_type=event_type,
                actor=actor,
                outcome=outcome,
                resource_type=resource_type,
                resource_id=resource_id,
                detail=detail,
            )
    except Exception:
        logger.exception(
            "audit.record failed event_type=%s actor=%s resource=%s:%s",
            event_type,
            actor,
            resource_type,
            resource_id,
        )
