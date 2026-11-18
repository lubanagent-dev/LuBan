"""审批路由：ApprovalManager 的 HTTP 面（客服场景人工确认入口）。

门户分域（R7）：portal-only 主体只能看到/决定自己会话（session.subject 归属）的审批，
跨主体审批一律 404 不泄露存在性；平台账号维持 run:read / run:approve 语义。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from lubanagent.api.audit import record_audit
from lubanagent.api.auth import get_principal, has_permission
from lubanagent.api.deps import ApprovalManagerDep, CtxDep
from lubanagent.api.schemas import ApprovalOut, DecideOut, DecideRequest, ErrorOut
from lubanagent.core import ErrorCode
from lubanagent.extension import Principal
from lubanagent.persistence.repositories.chat import SessionRepository
from lubanagent.persistence.repositories.run import RunRepository
from lubanagent.tool import ApprovalRequest

router = APIRouter(tags=["approvals"])

# B008 规避：Depends 调用收敛到 Annotated 别名，不在参数默认值里调用
PrincipalDep = Annotated[Principal, Depends(get_principal)]


def _is_portal_only(principal: Principal) -> bool:
    return has_permission(principal, "portal:access") and not has_permission(
        principal, "run:approve"
    )


def _to_out(request: ApprovalRequest) -> ApprovalOut:
    return ApprovalOut(
        id=request.id,
        run_id=request.run_id,
        tool_key=request.tool_key,
        args=request.args,
        created_at=request.created_at,
        status=request.status,
    )


async def _owned_run_session(
    ctx: CtxDep, run_id: str, subject: str
) -> bool:
    """portal 归属校验：run 必须挂在 subject 自己的会话下。"""
    async with ctx.db.session() as session:
        run = await RunRepository(session).get_run(run_id)
        if run is None or not run.session_id:
            return False
        session_info = await SessionRepository(session).get_session(run.session_id)
        return session_info is not None and session_info.subject_id == subject


@router.get("/approvals", response_model=list[ApprovalOut])
async def list_approvals(
    request: Request,
    manager: ApprovalManagerDep,
    ctx: CtxDep,
    run_id: str | None = None,
    principal: Principal | None = None,
) -> list[ApprovalOut]:
    principal = principal or getattr(request.state, "principal", None)
    pending = await manager.pending(run_id=run_id)
    if principal is not None and _is_portal_only(principal):
        owned = [
            item
            for item in pending
            if await _owned_run_session(ctx, item.run_id, principal.subject)
        ]
        return [_to_out(item) for item in owned]
    return [_to_out(item) for item in pending]


@router.post("/approvals/{approval_id}/decide", response_model=DecideOut)
async def decide(
    approval_id: str,
    body: DecideRequest,
    request: Request,
    manager: ApprovalManagerDep,
    ctx: CtxDep,
    principal: PrincipalDep,
):
    item = await manager.get(approval_id)
    if item is None or item.status != "pending":
        # 契约：审批不存在或已终结 → 404 + ErrorOut(VALIDATION_ERROR)
        error = ErrorOut.of(
            ErrorCode.VALIDATION_ERROR.value, f"审批不可决定: {approval_id}"
        )
        return JSONResponse(status_code=404, content=error.model_dump(mode="json"))
    # 门户分域：portal-only 只能决定自己会话的审批；不存在/无会话一律 404。
    if _is_portal_only(principal) and not await _owned_run_session(
        ctx, item.run_id, principal.subject
    ):
        error = ErrorOut.of(
            ErrorCode.VALIDATION_ERROR.value, f"审批不可决定: {approval_id}"
        )
        return JSONResponse(status_code=404, content=error.model_dump(mode="json"))
    # 开启鉴权时归因只信已验证主体；开发模式保留旧的 body.decided_by 兼容。
    decided_by = (
        principal.subject
        if ctx.settings.auth_enabled
        else (body.decided_by or principal.subject)
    )
    resolved = await manager.decide(approval_id, body.approved, decided_by=decided_by)
    await record_audit(
        ctx,
        event_type="approval.decision",
        actor=decided_by,
        resource_type="approval",
        resource_id=approval_id,
        detail={"approved": body.approved, "tool_key": item.tool_key, "run_id": item.run_id},
    )
    return DecideOut(
        status=resolved.status,
        decided_by=resolved.decided_by,
        decided_at=resolved.decided_at,
    )
