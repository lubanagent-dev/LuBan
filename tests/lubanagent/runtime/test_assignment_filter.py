"""R2 动态资源装配器测试：默认全可见 / 分配后过滤 / role 授权 / perm 层级。

零网络零密钥：tmp SQLite（conftest db 夹具）+ AssignmentRepository 授权，直接
调 filter_definition_for_subject 与 runtime 装配包装验证行为。
"""

from lubanagent.core import AgentDefinition
from lubanagent.core.log_context import log_context
from lubanagent.persistence.repositories.assignment import AssignmentRepository
from lubanagent.runtime.assignment_filter import filter_definition_for_subject


def make_definition() -> AgentDefinition:
    return AgentDefinition(
        key="svc",
        name="svc",
        tools=["tool_a", "tool_b"],
        knowledge={"sources": ["kb_a", "kb_b", "kb_c"]},
        skills=["skill_a"],
        mcp_servers=["mcp_a"],
    )


async def grant(db, resource_type, resource_id, grantee_type, grantee_id, perm):
    async with db.session() as session:
        await AssignmentRepository(session).grant(
            resource_type, resource_id, grantee_type, grantee_id, perm
        )


async def filter_as(db, subject_id, roles=()):
    return await filter_definition_for_subject(
        make_definition(), db=db, subject_id=subject_id, subject_roles=roles
    )


async def test_no_assignments_all_visible_by_default(db):
    filtered = await filter_as(db, "alice")
    assert (
        filtered.tools == ["tool_a", "tool_b"]
        and filtered.knowledge.sources == ["kb_a", "kb_b", "kb_c"]
        and filtered.skills == ["skill_a"]
        and filtered.mcp_servers == ["mcp_a"]
    )


async def test_assigned_resource_hidden_from_unauthorized_user(db):
    await grant(db, "tool", "tool_b", "user", "bob", "use")
    filtered = await filter_as(db, "alice")
    assert filtered.tools == ["tool_a"]  # tool_b 已受管且未授权 alice → 裁剪
    allowed = await filter_as(db, "bob")
    assert allowed.tools == ["tool_a", "tool_b"]


async def test_role_grant_path_visible(db):
    await grant(db, "knowledge", "kb_a", "role", "support", "view")
    await grant(db, "knowledge", "kb_b", "user", "bob", "view")  # kb_b 受管但未授权 alice
    member = await filter_as(db, "alice", roles=("support",))
    assert member.knowledge.sources == ["kb_a", "kb_c"]
    outsider = await filter_as(db, "alice", roles=("billing",))
    assert outsider.knowledge.sources == ["kb_c"]  # 未受管的 kb_c 仍默认可见


async def test_perm_hierarchy_use_and_manage_imply_view_but_not_reverse(db):
    await grant(db, "tool", "tool_a", "user", "carol", "view")  # view 不隐含 use
    await grant(db, "tool", "tool_b", "user", "carol", "manage")  # manage 隐含 use
    filtered = await filter_as(db, "carol")
    assert filtered.tools == ["tool_b"]


async def test_use_perm_grants_tool_and_skill(db):
    await grant(db, "tool", "tool_a", "user", "dave", "use")
    await grant(db, "skill", "skill_a", "user", "dave", "use")
    filtered = await filter_as(db, "dave")
    assert filtered.tools == ["tool_a", "tool_b"]
    assert filtered.skills == ["skill_a"]


async def test_mcp_server_requires_use_perm(db):
    await grant(db, "mcp", "mcp_a", "user", "erin", "view")
    filtered = await filter_as(db, "erin")
    assert filtered.mcp_servers == []  # 仅 view 不够，需 use 及以上


async def test_missing_subject_returns_unchanged(db):
    await grant(db, "tool", "tool_a", "user", "bob", "use")
    definition = make_definition()
    filtered = await filter_definition_for_subject(
        definition, db=db, subject_id=None, subject_roles=()
    )
    assert filtered is definition  # 无 subject → 零过滤零拷贝


async def test_allow_unassigned_false_requires_explicit_grant(db):
    await grant(db, "knowledge", "kb_a", "user", "alice", "view")
    filtered = await filter_definition_for_subject(
        make_definition(), db=db, subject_id="alice", allow_unassigned=False
    )
    assert filtered.knowledge.sources == ["kb_a"]
    assert filtered.tools == [] and filtered.skills == [] and filtered.mcp_servers == []


async def test_runtime_assembly_reads_subject_from_log_context(make_runtime, db):
    await grant(db, "tool", "tool_b", "user", "bob", "use")
    runtime = make_runtime()
    definition = make_definition()
    with log_context(subject="bob"):
        filtered = await runtime._filtered_definition(definition)
    assert filtered.tools == ["tool_a", "tool_b"]
    with log_context(subject="alice"):
        filtered = await runtime._filtered_definition(definition)
    assert filtered.tools == ["tool_a"]
    # 无 subject 上下文 → 原样返回
    assert await runtime._filtered_definition(definition) is definition
