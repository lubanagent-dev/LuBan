"""assignments 资源分配表（R1）：按用户/角色授予资源权限。

Revision ID: c4d5e6f7a8b9
Revises: c3d4e5f6a7b8
Create Date: 2026-11-17 00:00:00.000000+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assignments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("resource_type", sa.String(length=32), nullable=False),
        sa.Column("resource_id", sa.String(length=255), nullable=False),
        sa.Column("grantee_type", sa.String(length=16), nullable=False),
        sa.Column("grantee_id", sa.String(length=255), nullable=False),
        sa.Column("perm", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "resource_type",
            "resource_id",
            "grantee_type",
            "grantee_id",
            "perm",
            name="uq_assignments_grant",
        ),
    )
    op.create_index("ix_assignments_resource_type", "assignments", ["resource_type"])
    op.create_index("ix_assignments_resource_id", "assignments", ["resource_id"])
    op.create_index("ix_assignments_grantee_id", "assignments", ["grantee_id"])


def downgrade() -> None:
    op.drop_index("ix_assignments_grantee_id", table_name="assignments")
    op.drop_index("ix_assignments_resource_id", table_name="assignments")
    op.drop_index("ix_assignments_resource_type", table_name="assignments")
    op.drop_table("assignments")
