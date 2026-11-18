"""SessionRepository：建会话/追加消息/seq 递增/分页/subject 隔离/级联删除。"""

import sqlalchemy as sa

from lubanagent.core import LubanError
from lubanagent.persistence.models.agent import AgentRow
from lubanagent.persistence.models.chat import MessageRow
from lubanagent.persistence.repositories.chat import DEFAULT_SUBJECT, SessionRepository


async def test_create_session_defaults(session):
    repo = SessionRepository(session)
    info = await repo.create_session(DEFAULT_SUBJECT, title="咨询")
    assert info.id
    assert info.subject_id == DEFAULT_SUBJECT
    assert info.agent_id is None
    assert info.title == "咨询"


async def test_create_session_with_agent(session):
    agent = AgentRow(key="a1", name="A1")
    session.add(agent)
    await session.flush()
    info = await SessionRepository(session).create_session(DEFAULT_SUBJECT, agent_id=agent.id)
    assert info.agent_id == agent.id


async def test_append_message_seq_increments_and_updates_session(session):
    repo = SessionRepository(session)
    info = await repo.create_session(DEFAULT_SUBJECT)
    first = await repo.append_message(info.id, "user", "你好")
    second = await repo.append_message(info.id, "assistant", "你好，需要什么帮助？")
    assert (first.seq, second.seq) == (1, 2)
    refreshed = await repo.get_session(info.id)
    assert refreshed is not None and refreshed.updated_at >= refreshed.created_at


async def test_append_message_rejects_unknown_role_and_missing_session(session):
    repo = SessionRepository(session)
    info = await repo.create_session(DEFAULT_SUBJECT)
    try:
        await repo.append_message(info.id, "robot", "hi")
        raise AssertionError("非法 role 应抛 LubanError")
    except LubanError as error:
        assert error.code.value == "VALIDATION_ERROR"
    try:
        await repo.append_message("missing", "user", "hi")
        raise AssertionError("会话不存在应抛 LubanError")
    except LubanError as error:
        assert error.code.value == "VALIDATION_ERROR"


async def test_list_messages_orders_by_seq(session):
    repo = SessionRepository(session)
    info = await repo.create_session(DEFAULT_SUBJECT)
    for role, content in [
        ("user", "一"),
        ("assistant", "二"),
        ("tool", "三"),
        ("system", "四"),
    ]:
        await repo.append_message(info.id, role, content)
    messages = await repo.list_messages(info.id)
    assert [message.seq for message in messages] == [1, 2, 3, 4]
    assert [message.role for message in messages] == ["user", "assistant", "tool", "system"]


async def test_list_sessions_pagination_and_subject_isolation(session):
    repo = SessionRepository(session)
    for index in range(3):
        await repo.create_session("alice", title=f"alice-{index}")
    await repo.create_session("bob", title="bob-0")

    sessions, total = await repo.list_sessions("alice", offset=0, limit=2)
    assert total == 3
    assert len(sessions) == 2
    assert all(item.subject_id == "alice" for item in sessions)

    page_two, total = await repo.list_sessions("alice", offset=2, limit=2)
    assert total == 3 and len(page_two) == 1

    bob_sessions, bob_total = await repo.list_sessions("bob")
    assert bob_total == 1 and bob_sessions[0].title == "bob-0"


async def test_delete_session_cascades_messages(session):
    repo = SessionRepository(session)
    kept = await repo.create_session(DEFAULT_SUBJECT)
    await repo.append_message(kept.id, "user", "保留")
    doomed = await repo.create_session(DEFAULT_SUBJECT)
    await repo.append_message(doomed.id, "user", "删除")
    await repo.append_message(doomed.id, "assistant", "回复")

    assert await repo.delete_session(doomed.id) is True
    assert await repo.get_session(doomed.id) is None
    assert await repo.list_messages(doomed.id) == []
    remaining = (
        (await session.execute(sa.select(MessageRow).where(MessageRow.session_id == doomed.id)))
        .scalars()
        .all()
    )
    assert remaining == []
    assert await repo.get_session(kept.id) is not None
    assert await repo.delete_session("missing") is False
