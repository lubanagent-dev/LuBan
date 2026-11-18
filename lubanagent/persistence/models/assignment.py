"""资源分配表：把 Agent/知识库/Skill/MCP/Tool/Prompt 分配给用户或角色（R1）。"""

from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from lubanagent.persistence.base import Base

RESOURCE_TYPES: tuple[str, ...] = ("agent", "knowledge", "skill", "mcp", "tool", "prompt")
GRANTEE_TYPES: tuple[str, ...] = ("user", "role")
PERMS: tuple[str, ...] = ("view", "use", "manage")


class AssignmentRow(Base):
    """一条授权 = (resource_type, resource_id) -> (grantee_type, grantee_id) + perm。"""

    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint(
            "resource_type",
            "resource_id",
            "grantee_type",
            "grantee_id",
            "perm",
            name="uq_assignments_grant",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(32), index=True)
    resource_id: Mapped[str] = mapped_column(String(255), index=True)
    grantee_type: Mapped[str] = mapped_column(String(16))
    grantee_id: Mapped[str] = mapped_column(String(255), index=True)
    perm: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
