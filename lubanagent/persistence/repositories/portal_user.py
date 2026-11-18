"""终端用户门户账号仓储：只存密码哈希，返回不含哈希的 dict 视图。

密码哈希复用仓库已有的 stdlib scrypt 机制（security.py 同款：
随机盐 + 参数随哈希存储，无新增第三方依赖），与工作台账号保持一致。
"""

import asyncio
import re
import uuid

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from lubanagent.core import ErrorCode, LubanError
from lubanagent.persistence.models.portal_user import PortalUserRow
from lubanagent.persistence.repositories.security import (
    hash_password as scrypt_hash_password,
)
from lubanagent.persistence.repositories.security import (
    verify_password as scrypt_verify_password,
)

_USERNAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$")
_MIN_PASSWORD = 12
_MAX_PASSWORD = 256
DEFAULT_PORTAL_ROLES: list[str] = ["portal_user"]

_DUMMY_HASH: str | None = None


def _timing_safe_dummy_hash() -> str:
    """未知用户名也执行同代价哈希校验，避免登录耗时泄露账号存在性。"""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = scrypt_hash_password("luban-portal-timing-safe-dummy-password")
    return _DUMMY_HASH


class PortalUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_user(
        self,
        *,
        username: str,
        password: str,
        display_name: str | None = None,
        roles: list[str] | None = None,
        is_active: bool = True,
    ) -> dict:
        self._validate_username(username)
        self._validate_password(password)
        if await self.get_by_username(username) is not None:
            raise LubanError(ErrorCode.VALIDATION_ERROR, "用户名已存在")
        row = PortalUserRow(
            id=uuid.uuid4().hex,
            username=username,
            password_hash=await asyncio.to_thread(scrypt_hash_password, password),
            display_name=display_name or username,
            roles=list(roles) if roles is not None else list(DEFAULT_PORTAL_ROLES),
            is_active=is_active,
        )
        self._session.add(row)
        try:
            await self._session.flush()
        except IntegrityError as exc:
            raise LubanError(ErrorCode.VALIDATION_ERROR, "用户名已存在") from exc
        await self._session.refresh(row)
        return self._to_dict(row)

    async def get_by_username(self, username: str) -> dict | None:
        row = await self._session.scalar(
            sa.select(PortalUserRow).where(PortalUserRow.username == username)
        )
        return self._to_dict(row) if row else None

    async def verify_password(self, password: str, stored_hash: str) -> bool:
        return await asyncio.to_thread(scrypt_verify_password, password, stored_hash)

    async def list_users(self) -> list[dict]:
        rows = (
            await self._session.scalars(
                sa.select(PortalUserRow).order_by(PortalUserRow.created_at)
            )
        ).all()
        return [self._to_dict(row) for row in rows]

    async def authenticate(self, username: str, password: str) -> dict | None:
        """登录校验：不存在的用户名跑同代价 dummy 哈希，命中且 is_active 才返回。"""
        user = await self.get_by_username(username)
        stored_hash = user["password_hash"] if user else _timing_safe_dummy_hash()
        if not await self.verify_password(password, stored_hash):
            return None
        if not user or not user["is_active"]:
            return None
        return user

    @staticmethod
    def _to_dict(row: PortalUserRow) -> dict:
        return {
            "id": row.id,
            "username": row.username,
            "display_name": row.display_name,
            "roles": list(row.roles or []),
            "is_active": row.is_active,
            "password_hash": row.password_hash,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    @staticmethod
    def _validate_username(username: str) -> None:
        if not _USERNAME.fullmatch(username):
            raise LubanError(ErrorCode.VALIDATION_ERROR, "用户名格式不合法")

    @staticmethod
    def _validate_password(password: str) -> None:
        if not _MIN_PASSWORD <= len(password) <= _MAX_PASSWORD:
            raise LubanError(
                ErrorCode.VALIDATION_ERROR,
                f"密码长度必须在 {_MIN_PASSWORD} 到 {_MAX_PASSWORD} 位之间",
            )
