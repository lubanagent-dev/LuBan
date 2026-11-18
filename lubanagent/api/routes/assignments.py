"""资源分配管理路由（R8 后端）：授权/撤销/列表，权限裁决同 /v1/security/*。"""

from fastapi import APIRouter, Depends, Query, Request

from lubanagent.api.audit import record_audit
from lubanagent.api.auth import require_permission
from lubanagent.api.deps import CtxDep
from lubanagent.api.schemas import AssignmentGrantRequest, AssignmentOut
from lubanagent.persistence.repositories.assignment import AssignmentRepository

router = APIRouter(
    prefix="/assignments",
    dependencies=[Depends(require_permission("security:manage"))],
    tags=["assignments"],
)

_UNSET = object()


def _actor(request: Request) -> str:
    principal = getattr(request.state, "principal", None)
    return getattr(principal, "subject", None) or "platform"


def _out(info: dict) -> AssignmentOut:
    return AssignmentOut(**info)


@router.get("", response_model=list[AssignmentOut])
async def list_assignments(
    ctx: CtxDep,
    resource_type: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    grantee_type: str | None = Query(default=None),
    grantee_id: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[AssignmentOut]:
    async with ctx.db.session() as session:
        rows, _total = await AssignmentRepository(session).list_assignments(
            resource_type=resource_type,
            resource_id=resource_id,
            grantee_type=grantee_type,
            grantee_id=grantee_id,
            offset=offset,
            limit=limit,
        )
    return [_out(info) for info in rows]


@router.post("", response_model=AssignmentOut, status_code=201)
async def grant_assignment(
    body: AssignmentGrantRequest, request: Request, ctx: CtxDep
) -> AssignmentOut:
    async with ctx.db.session() as session:
        info = await AssignmentRepository(session).grant(
            body.resource_type,
            body.resource_id,
            body.grantee_type,
            body.grantee_id,
            body.perm,
        )
    # 无论幂等命中还是新插入都留痕：授权变更要求全量可审计。
    await record_audit(
        ctx,
        event_type="assignment.grant",
        actor=_actor(request),
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        detail={
            "grantee_type": body.grantee_type,
            "grantee_id": body.grantee_id,
            "perm": body.perm,
        },
    )
    return _out(info)


@router.delete("")
async def revoke_assignment(
    request: Request,
    ctx: CtxDep,
    resource_type: str = Query(...),
    resource_id: str = Query(...),
    grantee_type: str = Query(...),
    grantee_id: str = Query(...),
    perm: str = Query(...),
) -> dict[str, bool]:
    async with ctx.db.session() as session:
        deleted = await AssignmentRepository(session).revoke(
            resource_type, resource_id, grantee_type, grantee_id, perm
        )
    await record_audit(
        ctx,
        event_type="assignment.revoke",
        actor=_actor(request),
        outcome="success" if deleted else "error",
        resource_type=resource_type,
        resource_id=resource_id,
        detail={
            "grantee_type": grantee_type,
            "grantee_id": grantee_id,
            "perm": perm,
            "deleted": deleted,
        },
    )
    return {"deleted": deleted}
