"""审计事件表（R9）：登录/授权变更/配额变更/审批/会话文件操作留痕。

与 Run/Trace 执行观测分域：审计事件记录"谁在什么时候对什么做了什么、结果如何"，
面向平台安全排查；执行细节仍走 application_logs / traces。
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from lubanagent.persistence.base import Base

#: 事件类型白名单（写入仓储校验）。
EVENT_TYPES: tuple[str, ...] = (
    "portal.login",
    "portal.register",
    "portal.login_failed",
    "assignment.grant",
    "assignment.revoke",
    "quota.set",
    "quota.delete",
    "approval.decision",
    "session.file_upload",
    "session.file_delete",
    "session.delete",
)

#: 操作结果白名单。
OUTCOMES: tuple[str, ...] = ("success", "denied", "error")


class AuditEventRow(Base):
    """一条审计事件 = 谁（actor）对什么（resource）做了什么（event_type），结果与细节。"""

    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_type_time", "event_type", "created_at"),
        Index("ix_audit_events_actor_time", "actor", "created_at"),
        Index("ix_audit_events_resource", "resource_type", "resource_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64))
    actor: Mapped[str] = mapped_column(String(255))
    outcome: Mapped[str] = mapped_column(String(16), default="success")
    resource_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON 文本
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
