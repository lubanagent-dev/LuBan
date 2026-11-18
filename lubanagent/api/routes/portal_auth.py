"""终端用户门户账号（R5）：开放注册（可关）与登录签发门户令牌。

PORTAL_ENABLED=false 时 /v1/portal/* 在 get_principal 层统一 404（可关闭、退回纯基座）。
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from lubanagent.api.auth import create_portal_token
from lubanagent.api.audit import record_audit
from lubanagent.api.deps import CtxDep
from lubanagent.core import ErrorCode, LubanError
from lubanagent.core.log_context import update_log_context
from lubanagent.persistence.repositories.portal_user import PortalUserRepository

audit_logger = logging.getLogger("lubanagent.api.portal")

# api_router 已带 /v1 前缀，这里只接 /portal，最终路径为 /v1/portal/*。
router = APIRouter(prefix="/portal", tags=["portal"])


class PortalRegisterRequest(BaseModel):
    username: str = Field(
        min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$"
    )
    password: str = Field(min_length=12, max_length=256)
    display_name: str | None = Field(default=None, min_length=1, max_length=128)


class PortalLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=12, max_length=256)


class PortalUserOut(BaseModel):
    subject: str
    username: str
    display_name: str
    roles: list[str]


class PortalTokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_at: datetime
    user: PortalUserOut


def _token_response(user: dict[str, Any], ctx: CtxDep) -> dict[str, Any]:
    expires_at = datetime.now(UTC) + timedelta(hours=ctx.settings.auth_session_hours)
    token = create_portal_token(
        username=user["username"],
        roles=list(user["roles"]),
        expires_at=expires_at,
        secret=ctx.settings.portal_secret,
    )
    return PortalTokenResponse(
        access_token=token,
        token_type="bearer",
        expires_at=expires_at,
        user=PortalUserOut(
            subject=f"portal_user:{user['username']}",
            username=user["username"],
            display_name=user["display_name"],
            roles=list(user["roles"]),
        ),
    ).model_dump(mode="json")


async def _portal_rate_limit(request: Request, username: str, ctx: CtxDep) -> None:
    """与 /v1/auth/login 同款双桶限流：host 桶 + username 桶。"""
    client_host = request.client.host if request.client else "unknown"
    if not await ctx.rate_limiter.allow(f"portal:host:{client_host}"):
        raise LubanError(ErrorCode.RATE_LIMITED, "请求过于频繁", retryable=True)
    if not await ctx.rate_limiter.allow(f"portal:user:{username}"):
        raise LubanError(ErrorCode.RATE_LIMITED, "请求过于频繁", retryable=True)


@router.post("/register", status_code=201, response_model=PortalTokenResponse)
async def register(
    body: PortalRegisterRequest, request: Request, ctx: CtxDep
) -> dict[str, Any]:
    if not ctx.settings.portal_enabled:
        raise LubanError(ErrorCode.INTERNAL_ERROR, "门户未启用")  # 兜底；正常被 404 层拦截
    if not ctx.settings.portal_registration_enabled:
        raise LubanError(ErrorCode.PERMISSION_DENIED, "门户注册未开放")
    await _portal_rate_limit(request, body.username, ctx)
    async with ctx.db.session() as session:
        try:
            user = await PortalUserRepository(session).create_user(
                username=body.username,
                password=body.password,
                display_name=body.display_name,
            )
        except LubanError:
            update_log_context(subject=f"portal_user:{body.username}")
            audit_logger.warning("portal.register failed username=%s", body.username)
            raise
    audit_logger.info("portal.register success username=%s", body.username)
    await record_audit(
        ctx,
        event_type="portal.register",
        actor=f"portal_user:{body.username}",
        resource_type="portal_user",
        resource_id=body.username,
    )
    return _token_response(user, ctx)


@router.post("/login", response_model=PortalTokenResponse)
async def login(
    body: PortalLoginRequest, request: Request, ctx: CtxDep
) -> dict[str, Any]:
    await _portal_rate_limit(request, body.username, ctx)
    async with ctx.db.session() as session:
        user = await PortalUserRepository(session).authenticate(
            body.username, body.password
        )
    if user is None:
        update_log_context(subject=f"portal_user:{body.username}")
        audit_logger.warning("portal.login failed username=%s", body.username)
        await record_audit(
            ctx,
            event_type="portal.login_failed",
            actor=f"portal_user:{body.username}",
            outcome="denied",
        )
        raise LubanError(ErrorCode.AUTH_FAILED, "用户名或密码错误")
    audit_logger.info("portal.login success username=%s", body.username)
    await record_audit(
        ctx,
        event_type="portal.login",
        actor=f"portal_user:{user['username']}",
    )
    return _token_response(user, ctx)
