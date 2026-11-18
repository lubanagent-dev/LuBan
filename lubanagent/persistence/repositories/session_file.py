"""会话文件仓储（R6）：库记录 register/list/get/delete + per-session 落盘路径规则。"""

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from lubanagent.persistence.models.session_file import SessionFileRow

# 会话 id 仅允许字母数字/下划线/连字符，杜绝 "../" 形态进入落盘路径
_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
# 安全扩展名：点 + 1-16 位字母数字（防 ".php%00" / 混合分隔符等注入形态）
_SAFE_SUFFIX_RE = re.compile(r"^\.[A-Za-z0-9]{1,16}$")


class SessionFileStorageError(ValueError):
    """非法 session_id 或原始文件名（含路径穿越特征）。"""


def validate_session_id(session_id: str) -> str:
    """校验会话标识，防止穿越字符进入 per-session 目录名。"""
    if not _SESSION_ID_RE.match(session_id or ""):
        raise SessionFileStorageError(f"非法会话标识: {session_id!r}")
    return session_id


def validate_original_filename(filename: str) -> str:
    """拒绝分隔符/NUL/点目录等穿越串；返回清洗后的原名（仅落库展示用）。"""
    name = (filename or "").strip()
    if not name or "\x00" in name:
        raise SessionFileStorageError(f"非法文件名: {filename!r}")
    if "/" in name or "\\" in name:
        raise SessionFileStorageError(f"文件名含路径分隔符: {filename!r}")
    if name in {".", ".."} or name.startswith(".."):
        raise SessionFileStorageError(f"文件名含路径穿越片段: {filename!r}")
    return name


def session_dir(root: str | Path, session_id: str) -> Path:
    """per-session 落盘目录：{SESSION_FILES_DIR}/{session_id}/。"""
    validate_session_id(session_id)
    return Path(root) / session_id


def build_stored_filename(original_filename: str) -> str:
    """服务端重命名：uuid 保留安全扩展名；无安全扩展则丢弃后缀。"""
    name = validate_original_filename(original_filename)
    suffix = Path(name).suffix
    if not _SAFE_SUFFIX_RE.match(suffix):
        suffix = ""
    return f"{uuid.uuid4().hex}{suffix}"


@dataclass(slots=True)
class SessionFileInfo:
    """会话文件领域对象（不外泄 ORM）。"""

    id: str
    session_id: str
    filename: str
    stored_path: str
    size_bytes: int
    content_type: str
    uploaded_by: str
    created_at: datetime


def _to_file_info(row: SessionFileRow) -> SessionFileInfo:
    return SessionFileInfo(
        id=row.id,
        session_id=row.session_id,
        filename=row.filename,
        stored_path=row.stored_path,
        size_bytes=row.size_bytes,
        content_type=row.content_type,
        uploaded_by=row.uploaded_by,
        created_at=row.created_at,
    )


class SessionFileRepository:
    """session_files 表读写入口；磁盘文件由 API 层按 stored_path 增删。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def register(
        self,
        *,
        session_id: str,
        filename: str,
        stored_path: str,
        size_bytes: int,
        content_type: str,
        uploaded_by: str,
    ) -> SessionFileInfo:
        """登记一次成功落盘的文件。"""
        validate_session_id(session_id)
        validate_original_filename(filename)
        row = SessionFileRow(
            id=uuid.uuid4().hex,
            session_id=session_id,
            filename=filename,
            stored_path=stored_path,
            size_bytes=size_bytes,
            content_type=content_type,
            uploaded_by=uploaded_by,
        )
        self._session.add(row)
        await self._session.flush()
        return _to_file_info(row)

    async def list_files(self, session_id: str) -> list[SessionFileInfo]:
        """某会话的全部文件（按上传时间升序）。"""
        validate_session_id(session_id)
        stmt = (
            select(SessionFileRow)
            .where(SessionFileRow.session_id == session_id)
            .order_by(SessionFileRow.created_at, SessionFileRow.id)
        )
        rows = list((await self._session.execute(stmt)).scalars().all())
        return [_to_file_info(row) for row in rows]

    async def get(self, file_id: str) -> SessionFileInfo | None:
        row = await self._session.get(SessionFileRow, file_id)
        return _to_file_info(row) if row is not None else None

    async def delete(self, file_id: str) -> bool:
        """删除库记录；磁盘清理由调用方在事务提交后执行。"""
        row = await self._session.get(SessionFileRow, file_id)
        if row is None:
            return False
        await self._session.execute(delete(SessionFileRow).where(SessionFileRow.id == file_id))
        await self._session.flush()
        return True
