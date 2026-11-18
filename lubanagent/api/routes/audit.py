"""审计事件查询路由（R9）：审计员/管理员只读。"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query

from lubanagent.api.auth import require_permission
from lubanagent.api.deps import CtxDep
from lubanagent.api.schemas import AuditEventOut
from lubanagent.persistence.repositories.audit import AuditRepository

router = APIRouter(
    prefix="/audit-events",
    dependencies=[Depends(require_permission("audit:read"))],
    tags=["audit"],
)


@router.get("", response_model=list[AuditEventOut])
async def list_audit_events(
    ctx: CtxDep,
    event_type: str | None = Query(default=None),
    actor: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    outcome: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[AuditEventOut]:
    async with ctx.db.session() as session:
        events, _total = await AuditRepository(session).list_events(
            event_type=event_type,
            actor=actor,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            since=since,
            until=until,
            offset=offset,
            limit=limit,
        )
    return [AuditEventOut(**info) for info in events]
