"""session_files 会话文件表（R6）：per-session 落盘文件的库记录。

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-11-17 00:00:00.000000+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "session_files",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("filename", sa.String(length=512), nullable=False),
        sa.Column("stored_path", sa.String(length=1024), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column(
            "content_type",
            sa.String(length=255),
            nullable=False,
            server_default="application/octet-stream",
        ),
        sa.Column("uploaded_by", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["sessions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_files_session_id", "session_files", ["session_id"])
    op.create_index("ix_session_files_uploaded_by", "session_files", ["uploaded_by"])


def downgrade() -> None:
    op.drop_index("ix_session_files_uploaded_by", table_name="session_files")
    op.drop_index("ix_session_files_session_id", table_name="session_files")
    op.drop_table("session_files")
