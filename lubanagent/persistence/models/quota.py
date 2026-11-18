"""主体配额表（R3）：按用户/角色配置 token、费用与并发限额。"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from lubanagent.persistence.base import Base

SCOPES: tuple[str, ...] = ("user", "role")
WINDOWS: tuple[str, ...] = ("day", "month", "total")


class QuotaRow(Base):
    """一条配额 = (scope, scope_id) 的限额三元组 + 统计窗口；字段可空 = 不限。"""

    __tablename__ = "subject_quotas"
    __table_args__ = (UniqueConstraint("scope", "scope_id", name="uq_subject_quotas_scope"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scope: Mapped[str] = mapped_column(String(16))
    scope_id: Mapped[str] = mapped_column(String(255), index=True)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_cost: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    max_concurrent_runs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    window: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
