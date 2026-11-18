"""主体配额仓储：set/get/delete 配额 + 用量聚合 + 网关前置检查（R3）。

用量取舍：直接从既有 runs 表聚合（token_usage JSON 的 input+output、cost 列、
活跃状态计数），不另建用量台账。runs 是唯一事实来源，聚合实现简单且与
Run 历史天然一致，避免双写不一致；代价是每次检查多一次聚合查询，
可后续按需加缓存/台账。
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from lubanagent.core import ErrorCode, LubanError, RunStatus
from lubanagent.persistence.models.quota import SCOPES, WINDOWS, QuotaRow
from lubanagent.persistence.models.run import RunRow

# 计入并发的非终态 Run 状态。
_ACTIVE_STATUSES = (
    RunStatus.PENDING.value,
    RunStatus.RUNNING.value,
    RunStatus.WAITING_APPROVAL.value,
)

# 配额维度 → 用量键（usage() 返回 dict 的 key）。
_USAGE_KEY = {"tokens": "tokens", "cost": "cost", "concurrent_runs": "concurrent"}


def _validate(scope: str, window: str) -> None:
    if scope not in SCOPES:
        raise LubanError(
            ErrorCode.VALIDATION_ERROR,
            f"配额主体类型不合法: {scope}（允许: {'|'.join(SCOPES)}）",
        )
    if window not in WINDOWS:
        raise LubanError(
            ErrorCode.VALIDATION_ERROR,
            f"配额统计窗口不合法: {window}（允许: {'|'.join(WINDOWS)}）",
        )


def _window_start(window: str) -> datetime | None:
    """窗口起点（UTC）；total → None 表示不限时间。"""
    now = datetime.now(UTC)
    if window == "day":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if window == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return None


def _in_window(created_at: datetime | None, start: datetime | None) -> bool:
    """时间比较：统一按 UTC 归一化，容忍库端返回 naive 值。"""
    if start is None or created_at is None:
        return True
    value = created_at if created_at.tzinfo else created_at.replace(tzinfo=UTC)
    return value >= start


class QuotaRepository:
    """subject_quotas 表读写 + 基于 runs 表的用量聚合与前置检查。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def set_quota(
        self,
        scope: str,
        scope_id: str,
        *,
        max_tokens: int | None,
        max_cost: Decimal | None,
        max_concurrent_runs: int | None,
        window: str,
    ) -> dict:
        """设置配额；同 (scope, scope_id) 已存在则整体覆盖（upsert）。"""
        _validate(scope, window)
        row = await self._session.scalar(
            sa.select(QuotaRow).where(QuotaRow.scope == scope, QuotaRow.scope_id == scope_id)
        )
        if row is None:
            row = QuotaRow(id=str(uuid.uuid4()), scope=scope, scope_id=scope_id)
            self._session.add(row)
        row.max_tokens = max_tokens
        row.max_cost = max_cost
        row.max_concurrent_runs = max_concurrent_runs
        row.window = window
        await self._session.flush()
        await self._session.refresh(row)
        return self._to_dict(row)

    async def get_quota(self, scope: str, scope_id: str) -> dict | None:
        _validate(scope, "total")
        row = await self._session.scalar(
            sa.select(QuotaRow).where(QuotaRow.scope == scope, QuotaRow.scope_id == scope_id)
        )
        return self._to_dict(row) if row else None

    async def delete_quota(self, scope: str, scope_id: str) -> bool:
        _validate(scope, "total")
        row = await self._session.scalar(
            sa.select(QuotaRow).where(QuotaRow.scope == scope, QuotaRow.scope_id == scope_id)
        )
        if row is None:
            return False
        await self._session.delete(row)
        await self._session.flush()
        return True

    async def quotas_for_subject(self, subject_id: str | None, roles: list[str]) -> list[dict]:
        """主体的生效配额 = user 级本人 + 其全部 role 级，行间相互独立校验。"""
        user_ids = [subject_id] if subject_id else []
        role_ids = [role for role in roles if role]
        if not user_ids and not role_ids:
            return []
        conditions = []
        if user_ids:
            conditions.append((QuotaRow.scope == "user") & QuotaRow.scope_id.in_(user_ids))
        if role_ids:
            conditions.append((QuotaRow.scope == "role") & QuotaRow.scope_id.in_(role_ids))
        rows = (await self._session.scalars(sa.select(QuotaRow).where(sa.or_(*conditions)))).all()
        return [self._to_dict(row) for row in rows]

    async def usage(self, subject_id: str, window: str = "total") -> dict:
        """主体用量（按 runs.user_id 归因）：tokens/cost 累计 + 当前并发数。"""
        _validate("user", window)
        start = _window_start(window)
        rows = (
            await self._session.execute(
                sa.select(RunRow.created_at, RunRow.token_usage, RunRow.cost).where(
                    RunRow.user_id == subject_id
                )
            )
        ).all()
        tokens = 0
        cost = 0.0
        for created_at, token_usage, row_cost in rows:
            if not _in_window(created_at, start):
                continue
            usage = token_usage if isinstance(token_usage, dict) else {}
            tokens += int(usage.get("input_tokens") or 0) + int(usage.get("output_tokens") or 0)
            cost += float(row_cost or 0.0)
        concurrent = await self._session.scalar(
            sa.select(sa.func.count()).where(
                sa.and_(RunRow.user_id == subject_id, RunRow.status.in_(_ACTIVE_STATUSES))
            )
        )
        return {"tokens": tokens, "cost": round(cost, 6), "concurrent": int(concurrent or 0)}

    async def check_quota(self, subject_id: str | None, roles: list[str]) -> dict | None:
        """网关前置检查：超任一维度返回 denial 详情，全部放行返回 None。"""
        quotas = await self.quotas_for_subject(subject_id, roles)
        usage_cache: dict[str, dict] = {}
        for quota in quotas:
            window = quota["window"]
            if window not in usage_cache:
                usage_cache[window] = (
                    await self.usage(subject_id, window)
                    if subject_id
                    else {"tokens": 0, "cost": 0.0, "concurrent": 0}
                )
            used = usage_cache[window]
            limits = {
                "tokens": quota["max_tokens"],
                "cost": quota["max_cost"],
                "concurrent_runs": quota["max_concurrent_runs"],
            }
            for dimension, limit in limits.items():
                if limit is None:
                    continue
                used_value = used[_USAGE_KEY[dimension]]
                # 前置检查语义：额度已用尽（==）也拒绝——新 Run 只会继续消耗。
                if used_value >= float(limit):
                    return {
                        "scope": quota["scope"],
                        "scope_id": quota["scope_id"],
                        "window": window,
                        "dimension": dimension,
                        "limit": float(limit),
                        "used": used_value,
                    }
        return None

    @staticmethod
    def _to_dict(row: QuotaRow) -> dict:
        return {
            "id": row.id,
            "scope": row.scope,
            "scope_id": row.scope_id,
            "max_tokens": row.max_tokens,
            "max_cost": row.max_cost,
            "max_concurrent_runs": row.max_concurrent_runs,
            "window": row.window,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
