"""API 请求/响应模型（Pydantic v2）：路由只做编排，模型集中在此。"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from lubanagent.core import (
    AgentDefinition,
    BrainProfile,
    ModelCapability,
    ModelDefinition,
    Run,
    Trace,
    TraceEvent,
)

# ---- 镜像别名：与 core 领域模型同形，路由 response_model 直接用 ----
AgentDefinitionOut = AgentDefinition
RunOut = Run


class RunCreateRequest(BaseModel):
    """POST /v1/agents/{key}/runs 请求体；history 为 OpenAI 风格，v1 不查库（D3-2）。"""

    input: str
    session_id: str | None = Field(default=None, max_length=128)
    # 透传观测标签（排查定位用），引擎不做用户管理
    user_id: str | None = Field(default=None, max_length=128)
    version: int | None = None
    variables: dict[str, str] | None = None
    history: list[dict[str, str]] | None = None  # [{"role": ..., "content": ...}]
    instructions_override: str | None = None  # 试跑临时替换 instructions（不入库，Prompt 调试用）


class SessionCreateRequest(BaseModel):
    """POST /v1/sessions 请求体；agent_id 可空（未绑定 Agent 的裸会话）。"""

    agent_id: int | None = None
    title: str = Field(default="", max_length=256)


class SessionOut(BaseModel):
    """会话响应；subject_id 属当前 principal。"""

    id: str
    subject_id: str
    agent_id: int | None
    title: str
    created_at: datetime
    updated_at: datetime


class SessionMessageCreateRequest(BaseModel):
    """POST /v1/sessions/{id}/messages 请求体（显式写入；SSE 完成后自动落库为主路径）。"""

    role: str = Field(pattern="^(user|assistant|tool|system)$")
    content: str


class SessionFileOut(BaseModel):
    """会话文件响应（R6）。"""

    id: str
    session_id: str
    filename: str
    size_bytes: int
    content_type: str
    uploaded_by: str
    created_at: datetime


class SessionMessageOut(BaseModel):
    """会话消息响应；seq 会话内从 1 递增。"""

    id: int
    session_id: str
    role: str
    content: str
    seq: int
    created_at: datetime


class ModelDefinitionOut(BaseModel):
    """模型定义对外视图：只输出 api_key_env 与 has_api_key，不输出 api_key 明文或 base_url。"""

    key: str
    provider: str
    model_name: str
    factory: str
    capability: ModelCapability = Field(default_factory=ModelCapability)
    params: dict[str, Any] = Field(default_factory=dict)
    api_key_env: str | None = None
    has_api_key: bool = False
    enabled: bool = True


class ModelUpsertRequest(ModelDefinition):
    """PUT /v1/models 请求体：支持直接传入 api_key（落库持久化），或 clear_api_key 显式清空。"""

    clear_api_key: bool = False


class ModelEnabledPatch(BaseModel):
    """PATCH /v1/models/{key}/enabled 请求体：快捷启用/停用模型。"""

    model_config = ConfigDict(extra="forbid")

    enabled: bool


class BrainMappingSetRequest(BaseModel):
    """PUT /v1/brain-mappings 请求体；env 缺省取 settings.env。"""

    profile: BrainProfile
    model_key: str
    env: str | None = Field(default=None, min_length=1, max_length=32)


class BrainMappingOut(BaseModel):
    env: str
    profile: BrainProfile
    model_key: str


class BrainProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: BrainProfile
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=512)
    model_key: str | None = Field(default=None, min_length=1, max_length=128)
    env: str | None = Field(default=None, min_length=1, max_length=32)

    @field_validator("name", "description", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class BrainProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: BrainProfile | None = None
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    model_key: str | None = Field(default=None, min_length=1, max_length=128)
    env: str | None = Field(default=None, min_length=1, max_length=32)

    @field_validator("name", "description", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class BrainProfileOut(BaseModel):
    key: BrainProfile
    name: str
    description: str
    aliases: list[BrainProfile]
    reference_count: int
    agent_count: int


class BrainProfilesOut(BaseModel):
    env: str
    items: list[BrainProfileOut]


class BrainProfileReference(BaseModel):
    agent_key: str
    agent_name: str
    version: int
    current: bool
    field: str


class BrainProfileReferencesOut(BaseModel):
    key: BrainProfile
    agent_count: int
    references: list[BrainProfileReference]


class TraceOut(BaseModel):
    trace: Trace
    events: list[TraceEvent]


class ApprovalOut(BaseModel):
    """ApprovalRequest（dataclass）镜像。"""

    id: str
    run_id: str
    tool_key: str
    args: dict[str, Any]
    created_at: datetime
    status: str
    decided_by: str | None = None
    decided_at: datetime | None = None


class DecideRequest(BaseModel):
    approved: bool
    decided_by: str = ""


class DecideOut(BaseModel):
    status: str  # "approved" | "rejected"
    decided_by: str | None = None
    decided_at: datetime | None = None


class SkillOut(BaseModel):
    key: str
    name: str
    version: str
    manifest: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class GraphSummaryOut(BaseModel):
    """图列表元素；structure_available=False 表示 builder 非 DSL GraphBuilder，无可视化结构。"""

    name: str
    description: str = ""
    structure_available: bool


class GraphNodeOut(BaseModel):
    name: str
    kind: str  # "step" | "agent" | "human"
    agent_key: str | None = None
    input_from: str | None = None
    output_to: str | None = None
    prompt: str | None = None
    summary: str | None = None  # step: fn docstring 首行（节点中文含义）


class GraphEdgeOut(BaseModel):
    from_node: str
    to_node: str


class GraphCondEdgeOut(BaseModel):
    from_node: str
    then_node: str
    otherwise_node: str


class GraphDetailOut(BaseModel):
    name: str
    description: str = ""
    entry: str | None = None
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]
    cond_edges: list[GraphCondEdgeOut]


# ---- knowledge：工作台知识库管理 ----


class KnowledgeFileOut(BaseModel):
    filename: str
    size: int


class KnowledgeSourceOut(BaseModel):
    """知识源（managed=工作台创建；False 为代码种子源，参数不可改不可删）。"""

    name: str
    description: str = ""
    chunk_size: int | None = None
    overlap: int | None = None
    files: list[KnowledgeFileOut] = Field(default_factory=list)
    chunk_count: int = 0
    managed: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class KnowledgeRechunkRequest(BaseModel):
    """POST /v1/knowledge/sources/{name}/rechunk 请求体；overlap < chunk_size 由知识层校验。"""

    chunk_size: int = Field(gt=0)
    overlap: int = Field(ge=0)


class KnowledgeChunkOut(BaseModel):
    chunk_index: int
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class KnowledgeQueryRequest(BaseModel):
    """POST /v1/knowledge/query 请求体（检索测试）；source=None 检索全部知识源。"""

    query: str = Field(min_length=1)
    source: str | None = None
    top_k: int = Field(default=5, ge=1, le=50)


class KnowledgeHitOut(BaseModel):
    source: str
    chunk_index: int
    content: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    retryable: bool = False


class ErrorOut(BaseModel):
    """统一错误响应：{"error": {code, message, details, retryable}}。"""

    error: ErrorBody

    @classmethod
    def of(
        cls,
        code: str,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        retryable: bool = False,
    ) -> "ErrorOut":
        return cls(
            error=ErrorBody(code=code, message=message, details=details or {}, retryable=retryable)
        )


class QuotaUpsertRequest(BaseModel):
    """PUT /v1/quotas/{scope}/{scope_id} 请求体；字段可空 = 该维度不限。"""

    max_tokens: int | None = Field(default=None, ge=0)
    max_cost: Decimal | None = Field(default=None, ge=0)
    max_concurrent_runs: int | None = Field(default=None, ge=0)
    window: Literal["day", "month", "total"]


class QuotaOut(BaseModel):
    """主体配额视图。"""

    id: str
    scope: str
    scope_id: str
    max_tokens: int | None = None
    max_cost: Decimal | None = None
    max_concurrent_runs: int | None = None
    window: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssignmentGrantRequest(BaseModel):
    """POST /v1/assignments 请求体：五元组授权（同五元组幂等）。"""

    resource_type: Literal["agent", "knowledge", "skill", "mcp", "tool", "prompt"]
    resource_id: str = Field(min_length=1, max_length=255)
    grantee_type: Literal["user", "role"]
    grantee_id: str = Field(min_length=1, max_length=255)
    perm: Literal["view", "use", "manage"]


class AssignmentOut(BaseModel):
    """资源分配视图。"""

    id: str
    resource_type: str
    resource_id: str
    grantee_type: str
    grantee_id: str
    perm: str
    created_at: datetime | None = None


class AuditEventOut(BaseModel):
    """审计事件视图（R9）：detail 为 JSON 对象或原始文本兜底。"""

    id: str
    event_type: str
    actor: str
    outcome: str
    resource_type: str | None = None
    resource_id: str | None = None
    detail: dict | None = None
    created_at: datetime
