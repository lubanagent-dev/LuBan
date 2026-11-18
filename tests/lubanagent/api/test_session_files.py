"""会话文件 API（R6）：上传/列表/鉴权下载/删除 + 跨主体 404 + 413 + 防路径穿越。"""

from sqlalchemy import select

from lubanagent.persistence import SessionRepository
from lubanagent.persistence.models.session_file import SessionFileRow
from tests.lubanagent.api.conftest import make_client


def _upload_args(data: bytes, name: str = "hello.txt", mime: str = "text/plain") -> dict:
    return {"files": {"file": (name, data, mime)}}


async def _remaining_rows(db, file_id: str) -> list[SessionFileRow]:
    async with db.session() as session:
        return (
            (await session.execute(select(SessionFileRow).where(SessionFileRow.id == file_id)))
            .scalars()
            .all()
        )


async def test_upload_list_download_delete_roundtrip(db, registry, tmp_path):
    """上传成功（归属校验）→ 列表 → 下载内容与上传一致 → 删除后库和磁盘都清掉。"""
    files_root = tmp_path / "files"
    async with await make_client(
        db, registry, session_files_dir=str(files_root)
    ) as client:
        session_id = (await client.post("/v1/sessions", json={})).json()["id"]

        uploaded = await client.post(
            f"/v1/sessions/{session_id}/files", **_upload_args("你好，文件".encode())
        )
        assert uploaded.status_code == 201, uploaded.text
        body = uploaded.json()
        assert body["filename"] == "hello.txt"
        assert body["size_bytes"] == len("你好，文件".encode())
        assert body["content_type"] == "text/plain"
        assert body["uploaded_by"] == "anonymous"

        listed = await client.get(f"/v1/sessions/{session_id}/files")
        assert listed.status_code == 200
        assert [item["id"] for item in listed.json()] == [body["id"]]

        download = await client.get(f"/v1/sessions/{session_id}/files/{body['id']}/download")
        assert download.status_code == 200
        assert download.content == "你好，文件".encode()
        assert "hello.txt" in download.headers["content-disposition"]

        deleted = await client.delete(f"/v1/sessions/{session_id}/files/{body['id']}")
        assert deleted.status_code == 200
        assert deleted.json() == {"deleted": True}

    assert await _remaining_rows(db, body["id"]) == []
    session_dir = files_root / session_id
    assert session_dir.is_dir()
    assert not any(session_dir.iterdir())


async def test_cross_subject_upload_list_download_delete_all_404(db, registry, tmp_path):
    """跨主体上传/列表/下载/删除一律 404，不泄露存在性。"""
    async with await make_client(
        db, registry, session_files_dir=str(tmp_path / "files")
    ) as client:
        async with db.session() as session:
            other = await SessionRepository(session).create_session("user:999", title="别人的")
            other_id = other.id

        upload = await client.post(
            f"/v1/sessions/{other_id}/files", **_upload_args(b"data", name="steal.txt")
        )
        assert upload.status_code == 404
        assert (await client.get(f"/v1/sessions/{other_id}/files")).status_code == 404
        download = await client.get(f"/v1/sessions/{other_id}/files/whatever/download")
        assert download.status_code == 404
        delete = await client.delete(f"/v1/sessions/{other_id}/files/whatever")
        assert delete.status_code == 404


async def test_oversized_upload_returns_413(db, registry, tmp_path):
    """大小超限（上限 8 字节）→ 413，且不落盘不落库。"""
    files_root = tmp_path / "files"
    async with await make_client(
        db, registry, session_files_dir=str(files_root), session_files_max_bytes=8
    ) as client:
        session_id = (await client.post("/v1/sessions", json={})).json()["id"]
        response = await client.post(
            f"/v1/sessions/{session_id}/files", **_upload_args(b"x" * 16)
        )
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "SESSION_FILE_TOO_LARGE"

    session_dir = files_root / session_id
    if session_dir.is_dir():
        assert not any(session_dir.iterdir())


async def test_path_traversal_payloads_are_rejected(db, registry, tmp_path):
    """路径穿越攻击串（文件名 / 会话 id）一律拒绝，不产生越界文件。"""
    files_root = tmp_path / "files"
    async with await make_client(
        db, registry, session_files_dir=str(files_root)
    ) as client:
        session_id = (await client.post("/v1/sessions", json={})).json()["id"]

        for evil in ("../../etc/passwd", "..\\..\\win.ini", "..", ".", "a/b.txt"):
            response = await client.post(
                f"/v1/sessions/{session_id}/files", **_upload_args(b"evil", name=evil)
            )
            assert response.status_code == 400, (evil, response.text)
            assert response.json()["error"]["code"] == "SESSION_FILE_INVALID"

        evil_session = await client.post(
            "/v1/sessions/..%2F..%2Fescape/files", **_upload_args(b"evil")
        )
        # URL 形态穿越：路由不匹配（405）/参数校验（400）/归属 404 都算拒绝
        assert evil_session.status_code in (400, 404, 405)

    # 不得在会话目录之外产生任何文件
    assert sorted(p.name for p in files_root.rglob("*") if p.is_file()) == []


async def test_stored_filename_is_server_generated(db, registry, tmp_path):
    """落盘文件名由服务端 uuid 生成（保留安全扩展名），原名仅落库展示。"""
    files_root = tmp_path / "files"
    async with await make_client(
        db, registry, session_files_dir=str(files_root)
    ) as client:
        session_id = (await client.post("/v1/sessions", json={})).json()["id"]
        response = await client.post(
            f"/v1/sessions/{session_id}/files", **_upload_args(b"pdf-bytes", name="报告.pdf")
        )
        assert response.status_code == 201, response.text

    stored = [p for p in (files_root / session_id).iterdir() if p.is_file()]
    assert len(stored) == 1
    assert stored[0].name != "报告.pdf"
    assert stored[0].name.endswith(".pdf")
    assert stored[0].read_bytes() == b"pdf-bytes"
