"""会话路由：门户会话 CRUD 与历史消息查询（R4）。"""

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from lubanagent.api.audit import record_audit
from lubanagent.api.deps import CtxDep
from lubanagent.api.schemas import (
    SessionCreateRequest,
    SessionFileOut,
    SessionMessageCreateRequest,
    SessionMessageOut,
    SessionOut,
)
from lubanagent.persistence import DEFAULT_SUBJECT, SessionRepository
from lubanagent.persistence.repositories.session_file import (
    SessionFileRepository,
    SessionFileStorageError,
    build_stored_filename,
    session_dir,
    validate_original_filename,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sessions"])


def _subject(request: Request) -> str:
    """当前请求主体；AUTH_ENABLED=false 时 principal 为 anonymous 固定默认主体。"""
    principal = getattr(request.state, "principal", None)
    return getattr(principal, "subject", None) or DEFAULT_SUBJECT


def _session_out(info) -> SessionOut:
    """仓储领域对象 → 响应模型（避免 dataclass 直接充当 response_model）。"""
    return SessionOut(
        id=info.id,
        subject_id=info.subject_id,
        agent_id=info.agent_id,
        title=info.title,
        created_at=info.created_at,
        updated_at=info.updated_at,
    )


def _message_out(info) -> SessionMessageOut:
    return SessionMessageOut(
        id=info.id,
        session_id=info.session_id,
        role=info.role,
        content=info.content,
        seq=info.seq,
        created_at=info.created_at,
    )


def _not_found(detail: str) -> JSONResponse:
    """404 会话缺失：跨主体访问与会话不存在同响应，不泄露存在性。"""
    return JSONResponse(
        status_code=404,
        content={"error": {"code": "SESSION_NOT_FOUND", "message": detail}},
    )


async def _owned_session(repo: SessionRepository, session_id: str, subject: str):
    """取属于当前主体的会话；不属于/不存在一律 None（404）。"""
    info = await repo.get_session(session_id)
    if info is None or info.subject_id != subject:
        return None
    return info


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    request: Request,
    ctx: CtxDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
):
    async with ctx.db.session() as session:
        sessions, _total = await SessionRepository(session).list_sessions(
            _subject(request), offset=offset, limit=limit
        )
    return [_session_out(info) for info in sessions]


@router.post("/sessions", response_model=SessionOut, status_code=201)
async def create_session(body: SessionCreateRequest, request: Request, ctx: CtxDep):
    async with ctx.db.session() as session:
        info = await SessionRepository(session).create_session(
            _subject(request), agent_id=body.agent_id, title=body.title
        )
    return _session_out(info)


@router.get("/sessions/{session_id}/messages", response_model=list[SessionMessageOut])
async def list_messages(
    session_id: str,
    request: Request,
    ctx: CtxDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
):
    async with ctx.db.session() as session:
        repo = SessionRepository(session)
        if await _owned_session(repo, session_id, _subject(request)) is None:
            return _not_found(f"会话不存在: {session_id}")
        messages = await repo.list_messages(session_id, offset=offset, limit=limit)
    return [_message_out(info) for info in messages]


@router.post("/sessions/{session_id}/messages", response_model=SessionMessageOut, status_code=201)
async def append_message(
    session_id: str, body: SessionMessageCreateRequest, request: Request, ctx: CtxDep
):
    """显式写入单条消息：兜底/补录入口；正常对话走 runs SSE 完成后自动落库。"""
    async with ctx.db.session() as session:
        repo = SessionRepository(session)
        if await _owned_session(repo, session_id, _subject(request)) is None:
            return _not_found(f"会话不存在: {session_id}")
        info = await repo.append_message(session_id, body.role, body.content)
    return _message_out(info)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, request: Request, ctx: CtxDep) -> dict[str, bool]:
    async with ctx.db.session() as session:
        repo = SessionRepository(session)
        if await _owned_session(repo, session_id, _subject(request)) is None:
            return _not_found(f"会话不存在: {session_id}")
        await repo.delete_session(session_id)
    await record_audit(
        ctx,
        event_type="session.delete",
        actor=_subject(request),
        resource_type="session",
        resource_id=session_id,
    )
    return {"deleted": True}


def _file_out(info) -> SessionFileOut:
    """会话文件领域对象 → 响应模型。"""
    return SessionFileOut(
        id=info.id,
        session_id=info.session_id,
        filename=info.filename,
        size_bytes=info.size_bytes,
        content_type=info.content_type,
        uploaded_by=info.uploaded_by,
        created_at=info.created_at,
    )


def _bad_request(detail: str) -> JSONResponse:
    """400 非法 session_id / 文件名（含路径穿越串）。"""
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "SESSION_FILE_INVALID", "message": detail}},
    )


def _payload_too_large(max_bytes: int) -> JSONResponse:
    return JSONResponse(
        status_code=413,
        content={
            "error": {
                "code": "SESSION_FILE_TOO_LARGE",
                "message": f"文件超过大小上限: {max_bytes} 字节",
            }
        },
    )


@router.post("/sessions/{session_id}/files", response_model=SessionFileOut, status_code=201)
async def upload_session_file(
    session_id: str, request: Request, ctx: CtxDep, file: UploadFile
) -> SessionFileOut:
    """multipart 上传：归属校验 + 大小上限 + 服务端重命名落盘 + 库记录。"""
    subject = _subject(request)
    try:
        original_name = validate_original_filename(file.filename or "")
    except SessionFileStorageError as exc:
        return _bad_request(str(exc))
    max_bytes = ctx.settings.session_files_max_bytes

    async with ctx.db.session() as session:
        if await _owned_session(SessionRepository(session), session_id, subject) is None:
            return _not_found(f"会话不存在: {session_id}")

    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        return _payload_too_large(max_bytes)

    directory = session_dir(ctx.settings.session_files_dir, session_id)
    await asyncio.to_thread(directory.mkdir, parents=True, exist_ok=True)
    stored_name = build_stored_filename(original_name)
    stored_path = directory / stored_name
    await asyncio.to_thread(stored_path.write_bytes, content)

    async with ctx.db.session() as session:
        info = await SessionFileRepository(session).register(
            session_id=session_id,
            filename=original_name,
            stored_path=str(stored_path.resolve()),
            size_bytes=len(content),
            content_type=file.content_type or "application/octet-stream",
            uploaded_by=subject,
        )
    await record_audit(
        ctx,
        event_type="session.file_upload",
        actor=subject,
        resource_type="session_file",
        resource_id=info.id,
        detail={"session_id": session_id, "filename": original_name, "size_bytes": len(content)},
    )
    return _file_out(info)


@router.get("/sessions/{session_id}/files", response_model=list[SessionFileOut])
async def list_session_files(
    session_id: str, request: Request, ctx: CtxDep
) -> list[SessionFileOut]:
    """列出会话文件（归属校验后返回本会话全部记录）。"""
    async with ctx.db.session() as session:
        repo = SessionRepository(session)
        if await _owned_session(repo, session_id, _subject(request)) is None:
            return _not_found(f"会话不存在: {session_id}")
        file_repo = SessionFileRepository(session)
        files = await file_repo.list_files(session_id)
    return [_file_out(info) for info in files]


@router.get("/sessions/{session_id}/files/{file_id}/download")
async def download_session_file(session_id: str, file_id: str, request: Request, ctx: CtxDep):
    """鉴权下载：归属校验后 FileResponse 流式返回原文件名。"""
    async with ctx.db.session() as session:
        repo = SessionRepository(session)
        if await _owned_session(repo, session_id, _subject(request)) is None:
            return _not_found(f"会话不存在: {session_id}")
        info = await SessionFileRepository(session).get(file_id)
        if info is None or info.session_id != session_id:
            return _not_found(f"文件不存在: {file_id}")

    path = Path(info.stored_path)
    if not await asyncio.to_thread(path.is_file):
        return _not_found(f"文件不存在: {file_id}")
    return FileResponse(
        path=path,
        media_type=info.content_type,
        filename=info.filename,
    )


@router.delete("/sessions/{session_id}/files/{file_id}")
async def delete_session_file(session_id: str, file_id: str, request: Request, ctx: CtxDep):
    """删除文件：先删库记录（提交），再清磁盘文件。"""
    async with ctx.db.session() as session:
        repo = SessionRepository(session)
        if await _owned_session(repo, session_id, _subject(request)) is None:
            return _not_found(f"会话不存在: {session_id}")
        file_repo = SessionFileRepository(session)
        info = await file_repo.get(file_id)
        if info is None or info.session_id != session_id:
            return _not_found(f"文件不存在: {file_id}")
        await file_repo.delete(file_id)

    await record_audit(
        ctx,
        event_type="session.file_delete",
        actor=_subject(request),
        resource_type="session_file",
        resource_id=file_id,
        detail={"session_id": session_id, "filename": info.filename},
    )
    stored = Path(info.stored_path)
    if await asyncio.to_thread(stored.is_file):
        await asyncio.to_thread(stored.unlink)
    return {"deleted": True}
