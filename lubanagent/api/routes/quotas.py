"""主体配额管理路由（R3）：set/get/delete 配额，管理员权限裁决同 security。"""

from fastapi import APIRouter, Depends, Request

from lubanagent.api.audit import record_audit
from lubanagent.api.auth import require_permission
from lubanagent.api.deps import CtxDep
from lubanagent.api.schemas import QuotaOut, QuotaUpsertRequest
from lubanagent.persistence.repositories.quota import QuotaRepository

# 与 /v1/security/* 同级的管理权限：复用 get_principal 的统一权限裁决风格。
router = APIRouter(
    prefix="/quotas",
    dependencies=[Depends(require_permission("security:manage"))],
    tags=["quotas"],
)


def _actor(request: Request) -> str:
    principal = getattr(request.state, "principal", None)
    return getattr(principal, "subject", None) or "platform"


@router.put("/{scope}/{scope_id}", response_model=QuotaOut)
async def set_quota(
    scope: str, scope_id: str, body: QuotaUpsertRequest, request: Request, ctx: CtxDep
) -> QuotaOut:
    async with ctx.db.session() as session:
        quota = await QuotaRepository(session).set_quota(
            scope,
            scope_id,
            max_tokens=body.max_tokens,
            max_cost=body.max_cost,
            max_concurrent_runs=body.max_concurrent_runs,
            window=body.window,
        )
    await record_audit(
        ctx,
        event_type="quota.set",
        actor=_actor(request),
        resource_type="quota",
        resource_id=f"{scope}:{scope_id}",
        detail={
            "max_tokens": body.max_tokens,
            "max_cost": str(body.max_cost) if body.max_cost is not None else None,
            "max_concurrent_runs": body.max_concurrent_runs,
            "window": body.window,
        },
    )
    return QuotaOut(**quota)


@router.get("/{scope}/{scope_id}", response_model=QuotaOut | None)
async def get_quota(scope: str, scope_id: str, ctx: CtxDep) -> QuotaOut | None:
    async with ctx.db.session() as session:
        quota = await QuotaRepository(session).get_quota(scope, scope_id)
    return QuotaOut(**quota) if quota else None


@router.delete("/{scope}/{scope_id}")
async def delete_quota(
    scope: str, scope_id: str, request: Request, ctx: CtxDep
) -> dict[str, bool]:
    async with ctx.db.session() as session:
        deleted = await QuotaRepository(session).delete_quota(scope, scope_id)
    await record_audit(
        ctx,
        event_type="quota.delete",
        actor=_actor(request),
        outcome="success" if deleted else "error",
        resource_type="quota",
        resource_id=f"{scope}:{scope_id}",
        detail={"deleted": deleted},
    )
    return {"deleted": deleted}
