"""subject_quotas 主体配额表（R3）：用户/角色级 token、费用与并发限额。

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-11-17 00:00:00.000000+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subject_quotas",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("scope_id", sa.String(length=255), nullable=False),
        sa.Column("max_tokens", sa.Integer(), nullable=True),
        sa.Column("max_cost", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("max_concurrent_runs", sa.Integer(), nullable=True),
        sa.Column("window", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope", "scope_id", name="uq_subject_quotas_scope"),
    )
    op.create_index("ix_subject_quotas_scope_id", "subject_quotas", ["scope_id"])


def downgrade() -> None:
    op.drop_index("ix_subject_quotas_scope_id", table_name="subject_quotas")
    op.drop_table("subject_quotas")
