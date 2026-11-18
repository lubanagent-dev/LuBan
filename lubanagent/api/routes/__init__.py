"""/v1 路由聚合：统一前缀与鉴权依赖。"""

from fastapi import APIRouter, Depends

from lubanagent.api.auth import get_principal
from lubanagent.api.routes import (
    agents,
    approvals,
    assignments,
    audit,
    approvals,
    avatars,
    diagnostics,
    evals,
    graphs,
    knowledge,
    models,
    portal_auth,
    prompts,
    quotas,
    runs,
    sessions,
    skills,
    tools,
    traces,
    watchdog,
)

api_router = APIRouter(prefix="/v1", dependencies=[Depends(get_principal)])
api_router.include_router(agents.router)
api_router.include_router(runs.router)
api_router.include_router(sessions.router)
api_router.include_router(models.router)
api_router.include_router(tools.router)
api_router.include_router(traces.router)
api_router.include_router(approvals.router)
api_router.include_router(evals.router)
api_router.include_router(skills.router)
api_router.include_router(prompts.router)
api_router.include_router(watchdog.router)
api_router.include_router(knowledge.router)
api_router.include_router(graphs.router)
api_router.include_router(avatars.router)
api_router.include_router(diagnostics.router)
api_router.include_router(portal_auth.router)
api_router.include_router(quotas.router)
api_router.include_router(assignments.router)
api_router.include_router(audit.router)

__all__ = ["api_router"]
