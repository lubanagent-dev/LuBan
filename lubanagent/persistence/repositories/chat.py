"""会话持久化仓储：sessions/messages 的 CRUD，返回模块内领域对象。"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from lubanagent.core import ErrorCode, LubanError
from lubanagent.persistence.models.chat import MessageRow, SessionRow

# AUTH_ENABLED=false 时的固定默认主体（与 api.auth._anonymous_principal 对齐）
DEFAULT_SUBJECT = "anonymous"

_VALID_ROLES = ("user", "assistant", "tool", "system")


@dataclass(slots=True)
class SessionInfo:
    """会话领域对象（不外泄 ORM）。"""

    id: str
    subject_id: str
    agent_id: int | None
    title: str
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class MessageInfo:
    """会话消息领域对象；seq 会话内从 1 递增。"""

    id: int
    session_id: str
    role: str
    content: str
    seq: int
    created_at: datetime


def _to_session_info(row: SessionRow) -> SessionInfo:
    return SessionInfo(
        id=row.id,
        subject_id=row.subject_id,
        agent_id=row.agent_id,
        title=row.title,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_message_info(row: MessageRow) -> MessageInfo:
    return MessageInfo(
        id=row.id,
        session_id=row.session_id,
        role=row.role,
        content=row.content,
        seq=row.seq,
        created_at=row.created_at,
    )


class SessionRepository:
    """会话与消息读写入口；删除会话时显式清空消息（SQLite 关 FK 时仍保证级联语义）。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_session(
        self,
        subject_id: str,
        *,
        agent_id: int | None = None,
        title: str = "",
        session_id: str | None = None,
    ) -> SessionInfo:
        row = SessionRow(
            id=session_id or uuid.uuid4().hex,
            subject_id=subject_id,
            agent_id=agent_id,
            title=title,
        )
        self._session.add(row)
        await self._session.flush()
        return _to_session_info(row)

    async def get_session(self, session_id: str) -> SessionInfo | None:
        row = await self._session.get(SessionRow, session_id)
        return _to_session_info(row) if row is not None else None

    async def list_sessions(
        self, subject_id: str, *, offset: int = 0, limit: int = 50
    ) -> tuple[list[SessionInfo], int]:
        """某主体的会话列表（按更新时间倒序）+ 总数（分页用）。"""
        total = await self._session.scalar(
            select(func.count()).select_from(SessionRow).where(SessionRow.subject_id == subject_id)
        )
        stmt = (
            select(SessionRow)
            .where(SessionRow.subject_id == subject_id)
            .order_by(SessionRow.updated_at.desc(), SessionRow.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = list((await self._session.execute(stmt)).scalars().all())
        return [_to_session_info(row) for row in rows], int(total or 0)

    async def append_message(self, session_id: str, role: str, content: str) -> MessageInfo:
        """追加一条消息：seq 取会话内当前最大值 +1，并推进会话 updated_at。"""
        if role not in _VALID_ROLES:
            raise LubanError(
                ErrorCode.VALIDATION_ERROR,
                f"非法消息角色: {role}",
                details={"session_id": session_id, "role": role},
            )
        session_row = await self._session.get(SessionRow, session_id)
        if session_row is None:
            raise LubanError(
                ErrorCode.VALIDATION_ERROR,
                f"会话不存在: {session_id}",
                details={"session_id": session_id},
            )
        seq = await self._session.scalar(
            select(func.max(MessageRow.seq)).where(MessageRow.session_id == session_id)
        )
        row = MessageRow(session_id=session_id, role=role, content=content, seq=(seq or 0) + 1)
        self._session.add(row)
        session_row.updated_at = func.now()
        await self._session.flush()
        return _to_message_info(row)

    async def list_messages(
        self, session_id: str, *, offset: int = 0, limit: int = 200
    ) -> list[MessageInfo]:
        """按 seq 升序返回会话消息。"""
        stmt = (
            select(MessageRow)
            .where(MessageRow.session_id == session_id)
            .order_by(MessageRow.seq)
            .offset(offset)
            .limit(limit)
        )
        rows = list((await self._session.execute(stmt)).scalars().all())
        return [_to_message_info(row) for row in rows]

    async def delete_session(self, session_id: str) -> bool:
        """删除会话及其全部消息（先删消息再删会话，跨后端保证级联语义）。"""
        session_row = await self._session.get(SessionRow, session_id)
        if session_row is None:
            return False
        await self._session.execute(delete(MessageRow).where(MessageRow.session_id == session_id))
        await self._session.delete(session_row)
        await self._session.flush()
        return True
