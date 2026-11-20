"""Run 路由：SSE 流式创建、查询与取消。"""

import logging
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from lubanagent.api.agent_visibility import ensure_agent_visible
from lubanagent.api.deps import CtxDep
from lubanagent.api.schemas import ErrorOut, RunCreateRequest
from lubanagent.core import ErrorCode, LubanError, Run, RunStatus, TraceEvent
from lubanagent.core.log_context import update_log_context
from lubanagent.extension import Principal
from lubanagent.persistence import RunRepository, SessionRepository
from lubanagent.persistence.repositories.quota import QuotaRepository
from lubanagent.runtime import RunRequest, sse_stream

logger = logging.getLogger(__name__)

router = APIRouter(tags=["runs"])

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _to_messages(history: list[dict[str, str]] | None) -> list[BaseMessage] | None:
    """OpenAI 风格 history → BaseMessage；未知 role 按 user 处理。"""
    if history is None:
        return None
    messages: list[BaseMessage] = []
    for item in history:
        role = item.get("role", "user")
        content = item.get("content", "")
        if role == "assistant":
            messages.append(AIMessage(content=content))
        elif role == "system":
            messages.append(SystemMessage(content=content))
        else:
            messages.append(HumanMessage(content=content))
    return messages


async def _quota_denial(
    ctx: CtxDep, body: RunCreateRequest, principal: Principal | None
) -> dict | None:
    """R3 配额闸前置检查：超限返回 denial 详情，放行返回 None。

    配额主体 = 鉴权主体优先（不可被请求体伪造），仅匿名（鉴权关闭）时回退请求体
    user_id；角色取自鉴权 claims。
    """
    principal_subject = getattr(principal, "subject", None)
    subject_id = (
        principal_subject
        if principal_subject and principal_subject != "anonymous"
        else (body.user_id or principal_subject)
    )
    if not subject_id:
        return None
    user = (getattr(principal, "claims", None) or {}).get("user") or {}
    roles = [str(role) for role in user.get("roles", []) if role]
    async with ctx.db.session() as session:
        return await QuotaRepository(session).check_quota(subject_id, roles)


async def _persist_turn_messages(
    ctx, subject: str | None, session_id: str, run_id: str, user_input: str
) -> None:
    """R4 挂钩：SSE 正常结束后把本轮 user/assistant 消息落 sessions/messages。

    仅当 session_id 在会话表存在（门户会话）时写入；非门户会话静默跳过，
    真正的落库失败只记日志不阻断 SSE。
    """
    try:
        async with ctx.db.session() as session:
            run = await RunRepository(session).get_run(run_id)
            if run is None or run.status != RunStatus.COMPLETED or not run.output:
                return
            session_repo = SessionRepository(session)
            if await session_repo.get_session(session_id) is None:
                return
            await session_repo.append_message(session_id, "user", user_input)
            await session_repo.append_message(session_id, "assistant", run.output)
    except Exception:
        logger.warning("会话 %s 落库本轮消息失败（run=%s）", session_id, run_id, exc_info=True)


@router.post("/agents/{key}/runs")
async def create_run(key: str, body: RunCreateRequest, ctx: CtxDep, http_request: Request):
    run_id = uuid.uuid4().hex
    principal = getattr(http_request.state, "principal", None)
    # 门户主体可见性：未授权 agent 与不存在同形 404，在流开始前拒绝
    await ensure_agent_visible(
        ctx, principal, key, ctx.settings, ctx.db
    )
    # R3 配额闸：token/费用/并发任一超限 → 429 QUOTA_EXCEEDED，流开始前拒绝
    denial = await _quota_denial(ctx, body, principal)
    if denial is not None:
        return JSONResponse(
            status_code=429,
            content=ErrorOut.of(
                "QUOTA_EXCEEDED",
                f"配额超限: {denial['dimension']}",
                details=denial,
                retryable=True,
            ).model_dump(mode="json"),
        )
    update_log_context(
        run_id=run_id,
        trace_id=f"trace-{run_id}",
        root_run_id=run_id,
        session_id=body.session_id,
    )
    request = RunRequest(
        agent_key=key,
        user_input=body.input,
        session_id=body.session_id,
        user_id=body.user_id,
        version=body.version,
        variables=body.variables,
        history=_to_messages(body.history),
        instructions_override=body.instructions_override,
        run_id=run_id,
        request_id=getattr(http_request.state, "request_id", None),
        subject=getattr(principal, "subject", None),
    )
    stream = ctx.runtime.stream(request)
    # 预热首事件：定义加载/可运行性失败（404/422）在流开始前抛出，走统一错误映射
    first: TraceEvent | None = None
    try:
        first = await anext(stream)
    except StopAsyncIteration:
        pass

    async def events() -> AsyncIterator[TraceEvent]:
        if first is not None:
            yield first
        async for event in stream:
            yield event
        # R4 挂钩：流正常结束后落库本轮对话（非门户会话或异常中断不落）
        if body.session_id:
            principal = getattr(http_request.state, "principal", None)
            await _persist_turn_messages(
                ctx,
                getattr(principal, "subject", None),
                body.session_id,
                run_id,
                body.input,
            )

    headers = {**_SSE_HEADERS, "X-Run-ID": run_id, "X-Trace-ID": f"trace-{run_id}"}
    if body.session_id:
        # HTTP headers require Latin-1. Arbitrary Unicode session labels remain in JSON.
        if all(32 <= ord(character) <= 126 for character in body.session_id):
            headers["X-Session-ID"] = body.session_id
    return StreamingResponse(sse_stream(events()), media_type="text/event-stream", headers=headers)


@router.get("/runs", response_model=list[Run])
async def list_runs(
    ctx: CtxDep,
    agent_key: str | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
) -> list[Run]:
    async with ctx.db.session() as session:
        return await RunRepository(session).list_runs(
            agent_key, session_id=session_id, user_id=user_id, limit=limit
        )


@router.get("/runs/{run_id}", response_model=Run)
async def get_run(run_id: str, ctx: CtxDep) -> Run:
    async with ctx.db.session() as session:
        run = await RunRepository(session).get_run(run_id)
    if run is None:
        raise LubanError(
            ErrorCode.RUN_NOT_FOUND, f"Run 不存在: {run_id}", details={"run_id": run_id}
        )
    return run


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str, ctx: CtxDep) -> dict[str, bool]:
    async with ctx.db.session() as session:
        run = await RunRepository(session).get_run(run_id)
    if run is None:
        raise LubanError(
            ErrorCode.RUN_NOT_FOUND, f"Run 不存在: {run_id}", details={"run_id": run_id}
        )
    cancelled = await ctx.runtime.cancel(run_id)
    return {"cancelled": cancelled}


@router.post("/runs/{run_id}/resume")
async def resume_run(run_id: str, ctx: CtxDep):
    """从最近 checkpoint 续跑非终态 Run（SSE，帧格式同创建 Run）。

    错误在流开始前抛出（Run/checkpoint 缺失 → 404 RUN_NOT_FOUND；
    终态/活跃冲突/子 Run → 422 VALIDATION_ERROR；未启用 checkpoint →
    500 CONFIG_ERROR），走统一错误映射。
    """
    async with ctx.db.session() as session:
        run = await RunRepository(session).get_run(run_id)
    update_log_context(
        run_id=run_id,
        trace_id=f"trace-{run_id}",
        root_run_id=run_id,
        session_id=run.session_id if run else None,
    )
    stream = ctx.runtime.stream_resume(run_id)
    # 预热首事件：校验失败（404/422/500）在流开始前抛出，走统一错误映射
    first: TraceEvent | None = None
    try:
        first = await anext(stream)
    except StopAsyncIteration:
        pass

    async def events() -> AsyncIterator[TraceEvent]:
        if first is not None:
            yield first
        async for event in stream:
            yield event

    headers = dict(_SSE_HEADERS)
    if all(32 <= ord(character) <= 126 for character in run_id):
        headers.update({"X-Run-ID": run_id, "X-Trace-ID": f"trace-{run_id}"})
    return StreamingResponse(sse_stream(events()), media_type="text/event-stream", headers=headers)
