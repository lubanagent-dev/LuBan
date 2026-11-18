# Flows and multi-agent

Use LangGraph for fixed steps, or delegate tasks to sub-agents through a supervisor. Prerequisites: tools, business rules, and eval cases already defined. Plain agents, deterministic graphs, and multi-agent teams share the same run records and governance — you don't maintain three sets of services.

## 1. Approach: move "flow" out of prompts and into code

**The parts list for graph orchestration** (read it against `app/graphs/refund_flow.py` before continuing):

| DSL | What it does | Something you already know |
|---|---|---|
| `builder.entry(name)` | designate the entry node | — |
| `builder.step(name, fn)` | deterministic step: `fn(state: dict) -> dict`, return value merged into state | the same shape as tool functions in [Write business tools](./04-write-a-tool.md) |
| `builder.agent(name, agent_key)` | node = run an agent | an agent you already created |
| `builder.human(name, prompt=...)` | human node: the flow **pauses** until a person supplies a value, which is written into `state[name]` | graph nodes use interrupt / checkpoint; tool approval uses a separate approval store |
| `builder.when(src, cond, then=..., otherwise=...)` | conditional branch: `cond(state)` true/false takes one of two edges | the risk-tiering logic from [Write business tools](./04-write-a-tool.md) |
| `builder.edge(a, b)` | plain edge | — |
| `@graph(name=...)` | registered into the Registry, visible on the workbench flows page | the same pattern as `@tool` |

In one sentence: **step is code, agent is a model, human is a person, when is a branch** — one graph choreographs three kinds of executors along the business flow, and exactly who appears at which step is written down hard.

This parts list carries a deeper meaning: **it forces you to assign executors before writing the graph.** For every step in the flow you must first answer "is this step something code can decide, something a model must understand, or something a person must sign off on?" — how much the fine costs is arithmetic, so code computes it; how to phrase the response to the user's overdue situation is language, so the model answers it; whether to freeze borrowing privileges is responsibility, so a person carries it. Many "the agent is unreliable" problems have their root in skipping this assignment and pushing decisions that belong to code onto the model.

Two structural rules that are easy to trip on: ① the same node **cannot have both a plain edge and a conditional edge** (out-edges are either deterministic or a two-way choice — no sitting on the fence); ② sink nodes connect to END automatically; no need to write `edge(x, END)`.

**Running a graph**: graphs have no standalone HTTP run entry (`/v1/graphs` is a read-only structure view); you run them with `GraphRunner` — from tests, scripts, or wrapped as an agent's tool (`flow_as_tool`, mentioned in further reading). This page runs one directly with a small script, which incidentally lets you see interrupt/resume in its raw form up close.

**Multi-agent teams** are a different direction of problem. When Little Tu must both handle transactions (lookups, loss reports) and answer rule questions, one agent carrying it all ends up with a persona that grows ever longer and interferes with itself. The team approach: a **supervisor** (dispatcher) reads the user request and outputs a JSON decision — `{"action": "delegate", "agent": "my-lib-rules", "input": "..."}` or `{"action": "answer", ...}` — the framework forwards the request to the corresponding member accordingly, and the member's result returns to the supervisor to compose the final reply.

Note that the supervisor's output is a **structured decision, not natural language** — routing is data, not an essay. The "output only a JSON object" format block in its instruction is **not a precondition for it to run**: the framework's routing prompt already bakes in that instruction and action examples, and the team routes fine with that block omitted from the YAML — it's just that when the model occasionally slips in extra text, the parse-failure fallback fires more often. We still recommend including it, as double reinforcement (the supervisor YAML in this page's reference output is written that way — copy it). Runaway control has three lines of defense: `max_delegations` (a delegation cap, preventing two agents from punting to each other forever), members must be in the roster, and routing failures degrade to a direct answer.

**When to use which**:

- **Single agent**: the default. One scenario, one set of tools, a persona you can write clearly — most needs end here.
- **Graph orchestration**: the flow has order/branches/human steps that must not fail (money, permissions, compliance).
- **Team**: multiple **heterogeneous** scenarios crammed into one agent, interfering with each other (transactions vs knowledge vs …), and the scale justifies paying extra latency and tokens.

### Two kinds of human involvement: tool approval and graph-node pause

Both wait for a human decision, but their resume mechanisms differ — don't read "the approval record was saved" as "the entire Run can resume from a checkpoint".

| Mechanism | How it waits | Persistence and resume boundary |
| --- | --- | --- |
| High-risk tool approval | `ApprovalHandler` waits for approve or reject; same-process resumes wake a future, cross-process decisions are picked up by polling the approval store | Approval records can be persisted and audited, and the Run enters `WAITING_APPROVAL`; this does not provide graph checkpoints for ordinary Runs — a process restart cannot auto-resume the whole Run from the approval record alone |
| The graph's `human` node | LangGraph `interrupt()` pauses the graph; the value from `resume()` is written into `state[node name]` | Graph state resumes with `thread_id` plus database checkpoints; whether subsequent operations execute is still decided by the flow code using the confirmed value |

Tool approval answers "is this tool call allowed"; graph nodes answer "the flow waits at this state for input". Which to use depends on the business entry point and resume requirements. Either way, rejection, expiration, and process crashes all deserve explicit verification — don't demo only the happy approve path.

### Why the framework is designed this way: orchestrated runs and single-agent runs share one governance

The `agent` nodes in a graph run ordinary agents; team members are ordinary agents too — since what gets orchestrated is the same batch of agents, **why would governance get a second set?** The framework's choice: it doesn't. Concretely, three things:

- **Every sub-run lands in the same Trace book** — what you'll check on the Traces page in step 7 of the flow is precisely graph Runs and agent Runs lying in the same list, each bound to its definition version and actual model;
- **Budgets and cancellation propagate down the call chain** — when the outer Run trips its breaker, the inner sub-runs stop with it; there is no orphan island of "the parent Run was cancelled but the sub-agent keeps burning tokens";
- **Eval regression still covers it** — the `--compare` gate from [Evals and regression](./06-evals.md) holds for team Runs too.

The alternative would be "multi-agent gets its own governance": separate monitoring metrics, separate budget logic, separate cancellation — and soon you'd own two sets of truths that don't reconcile, spending half an hour per incident just confirming "which set do I trust right now". **One governance isn't convenience — it's correctness: what gets orchestrated and what runs alone are the same things, so their rules must be the same document.**

### Why the framework is designed this way: routing is JSON data, not natural language

First look at who consumes the supervisor's output. Natural-language routing would mean: the supervisor writes "I think this should go to the rules expert, because…", and then the framework needs another model call to read that passage and extract the destination — two model calls, two interpretation errors, double the routing latency. JSON compresses the decision into parseable data: `action` is an enum, `agent` is a key in the roster, `input` is the relayed text — the framework receives it and dispatches deterministically, with no "understanding" needed.

This also explains the three anti-runaway designs: `max_delegations` is a **data-level guardrail** (delegation count is a structured event — countable and blockable; with natural-language routing you couldn't even count "how many times did it delegate"); "members must be in the roster" is **referential integrity** (an agent key in the JSON that matches nobody is rejected — equivalent to a database foreign-key constraint); degrading to a direct answer on parse failure is **availability first** (better a mediocre answer than no answer). The output-format block in your YAML is double reinforcement — the framework prompt already bakes in the JSON requirement, and when the model occasionally drifts, the parse-failure fallback catches it; but the fewer times the fallback fires, the better.

## 2. Steps

### Step 1: Write the overdue-handling graph

Create `app/graphs/my_library_flow.py` (the reference output is the final version; the key is understanding the structure — four nodes, one conditional edge):

```python
"""逾期处理流水线：查逾期 → 分级 → 严重逾期人工确认 → 处罚 → 通知。"""

from typing import Any
from datetime import date

from lubanagent.extension import default_registry, graph
from lubanagent.graph import GraphBuilder

SEVERE_OVERDUE_DAYS = 30  # 严重逾期线：超过则冻结借阅权（需人工确认）


def _load_overdue(state: dict[str, Any]) -> dict[str, Any]:
    """按学号查借阅记录，算出逾期最重的一册（复用业务工具，不绕过治理）。"""
    tool = default_registry.get_tool("my_lib_lookup")
    records = tool.handler(student_id=state["student_id"])["records"]
    today = date(2026, 9, 9)  # 示例固定日期；真实系统按业务时区获取当天日期
    worst = max(records, key=lambda r: (today - date.fromisoformat(r["due"])).days)
    overdue_days = (today - date.fromisoformat(worst["due"])).days
    return {"worst_title": worst["title"], "overdue_days": overdue_days}


def _needs_confirm(state: dict[str, Any]) -> bool:
    return state["overdue_days"] > SEVERE_OVERDUE_DAYS


def _apply_penalty(state: dict[str, Any]) -> dict[str, Any]:
    days = state["overdue_days"]
    # 严重逾期也必须明确批准才能冻结；拒绝或缺少确认值不能放行。
    approved = state.get("confirm_freeze") is True
    return {"penalty": round(days * 0.1, 1),
            "frozen": days > SEVERE_OVERDUE_DAYS and approved}


def _notify(state: dict[str, Any]) -> dict[str, Any]:
    if state.get("frozen"):
        return {"message": f"《{state['worst_title']}》逾期 {state['overdue_days']} 天，"
                            f"滞纳金 {state['penalty']} 元，借阅权限已冻结（缴清后恢复）。"}
    return {"message": f"《{state['worst_title']}》逾期 {state['overdue_days']} 天，"
                        f"滞纳金 {state['penalty']} 元，请尽快归还。"}


def _build() -> "GraphBuilder":
    builder = GraphBuilder("my_library_flow", description="逾期处理：查逾期→分级→严重确认→处罚→通知")
    builder.entry("load_overdue")
    builder.step("load_overdue", _load_overdue)
    builder.human("confirm_freeze", prompt=f"逾期超过 {SEVERE_OVERDUE_DAYS} 天将冻结借阅权限，需人工确认")
    builder.step("apply_penalty", _apply_penalty)
    builder.step("notify", _notify)
    # entry 节点只出条件边：严重逾期走人工确认，轻度直走处罚（同一节点不能混两种边）
    builder.when("load_overdue", _needs_confirm, then="confirm_freeze", otherwise="apply_penalty")
    builder.edge("confirm_freeze", "apply_penalty")
    builder.edge("apply_penalty", "notify")
    return builder


@graph(name="my_library_flow", description="逾期处理：查逾期→分级→严重确认→处罚→通知")
def my_library_flow_builder() -> Any:
    return _build()
```

(The module docstring and comments are in Chinese to keep the fixture byte-identical with the rest of the guide: "overdue-handling pipeline: look up overdue → triage → severe overdue needs human confirmation → penalty → notify"; the severe line is 30 days, past which borrowing is frozen pending human confirmation.)

Read the structure against the parts table: look up overdue records (step, reusing the tool from [Write business tools](./04-write-a-tool.md)) → `when` branches by overdue days → the severe case enters `human` (someone must confirm before freezing) → penalty (step — the rule is computed by code, not spoken by a model) → notify (step).

Then look at each function's **signature shape**: takes `state: dict`, returns `dict`, return value merged into state — exactly the "same shape as tool functions" from the parts table. The whole file contains not a single model call, not a single prompt: **the deterministic parts of this flow contain not one word of probability.** The only "intelligence" is reserved for places outside the branching condition — and this particular graph doesn't need a model at all, which is precisely its virtue: don't use a model where you don't need one, and the flow stays hard.

Checkpoint: after `bash scripts/dev.sh restart`, the workbench **flows page** shows `my_library_flow`; open it and you'll see four nodes (step blue / human orange) and one conditional branch rendered as a dashed double-out edge. Also viewable via API: `curl http://localhost:8000/v1/graphs/my_library_flow`.

### Step 2: Run a mild overdue — straight through the whole flow

Graphs run with `GraphRunner`. Create a script `run_flow.py` (put it at the repo root; delete it after — it's the shortest path to watching a graph run in raw form):

```python
"""跑逾期处理图：轻度直走 / 重度人工确认。"""
import asyncio
import sys

sys.path.insert(0, ".")
from lubanagent.config import Settings
from lubanagent.extension import default_registry, discover
from lubanagent.graph import GraphRunner
from lubanagent.persistence import Database

from app.graphs.my_library_flow import _build

discover(Settings.load().extension_packages)


async def main():
    db = Database(Settings.load().database_url)
    runner = GraphRunner(db=db, registry=default_registry)
    flow = _build().build()

    r1 = await runner.run(flow, {"student_id": "2023055678"})
    print("轻度逾期:", r1.status, r1.output.get("message"))

    await db.close()


asyncio.run(main())
```

(The script's labels are "mild overdue" and "severe overdue needs human confirmation" in Chinese, keeping the fixture identical to the rest of the guide.)

This script is itself a standalone-invocation example: `discover()` loads your extension territory (tools, graphs) into the Registry — the same thing the framework service does at startup; `GraphRunner(db=...)` receives the database — a graph Run's Trace and interrupt checkpoints both need persisting, and this is the entry point of "same database, same governance". Every part you see here is the same one the service process uses in production.

(Student `2023055678` is the mild-overdue reader we're about to add to the tool data — swap in the data below before running.)

First replace the `_BORROWS` in `app/tools/my_library/lookup.py` with the two-reader version (the final data is exactly this block — copy it verbatim):

```python
_BORROWS: dict[str, list[dict]] = {
    "2023011234": [
        {"title": "三体", "due": "2026-08-30", "renewals_left": 1},
        {"title": "机器学习系统设计", "due": "2026-08-01", "renewals_left": 0},
    ],
    "2023055678": [
        {"title": "计算机网络", "due": "2026-09-05", "renewals_left": 1},
    ],
}
```

Then run (tool data changed, **no service restart needed** — `run_flow.py` is an independent process that `discover()`s the tools itself; once the source changes, it runs fresh; restarting the service only affects the views shown in workbench pages):

```bash
.venv/bin/python run_flow.py
```

Expected result: `轻度逾期: completed 《计算机网络》逾期 4 天，滞纳金 0.4 元，请尽快归还。` ("Mild overdue: completed — 'Computer Networks' is 4 days overdue, fine ¥0.4, please return it soon.") — four steps straight through, never touching the human node (4 days < 30 days, `when` took the otherwise edge). The 0.4 fine was computed by code (4 × 0.1), not "felt" by a model.

**"Not felt by a model" — those words deserve to be bolded on this page's cover.** The same question "how much is the fine", handed to a model: 40 days × 0.1 might come back as 3.9 or as "4 yuan" — every sample is a small gamble. Handed to `round(days * 0.1, 1)`, the answer won't change before the heat death of the universe. Graph orchestration's value is not "the flowchart looks nice"; it is **nailing the provenance of every cent to a line of code**.

### Step 3: Run a severe overdue — interrupt pause

Add a second block to the script:

```python
    r2 = await runner.run(flow, {"student_id": "2023011234"})
    print("重度逾期:", r2.status, r2.interrupt)

    r3 = await runner.resume(flow, r2.thread_id, True)
    print("人工确认后:", r3.status, r3.output.get("message"))
```

Run it again.

Expected result, three lines —

```
轻度逾期: completed 《计算机网络》逾期 4 天，滞纳金 0.4 元，请尽快归还。
重度逾期: interrupted {'node': 'confirm_freeze', 'prompt': '逾期超过 30 天将冻结借阅权限，需人工确认', 'state': {..., 'overdue_days': 39}}
人工确认后: completed 《机器学习系统设计》逾期 39 天，滞纳金 3.9 元，借阅权限已冻结（缴清后恢复）。
```

(Labels read "mild overdue", "severe overdue", and "after human confirmation".)

Read line by line: the severe-overdue Run's status is **interrupted** — the flow stopped at the `confirm_freeze` node, and `interrupt` carries the node name, the prompt, and a snapshot of the state at that moment; `resume(flow, thread_id, True)` continues the flow with the human decision (True = confirm freeze), and the flow completes. **Before "confirmation" happens, freezing is impossible at the code level** — that is the entire meaning of moving flow out of prompts and into code.

Check the three interrupt principles from the concepts section against these three output lines: state is persisted (holding `thread_id` lets you resume at any moment), downstream is unreachable (39 days overdue, and in the `interrupted` state the notify node's frozen wording was never generated), and the human value is explicit (`True` was passed in by your own hand, not "defaulted for you" by the framework). All three principles touched in physical form this time.

Change `resume`'s third argument to `False` and confirm the output's `frozen` is `False`, with no "borrowing privileges frozen" in the notice. After rejection the overdue fine can still be computed, but the freeze must not execute; if the business requires the whole flow to stop after rejection, you need to add an explicit termination branch.

Also glance at the workbench **Traces page**: both graph Runs left a complete scene (every node's execution is recorded) — graph Runs and agent Runs share the same database and the same governance, and [Agent concepts](./00-primer.md)' promise is honored here. Your graph Run didn't fall out of governance's view just because "it ran a different way" — it lies in the same list as the agent Runs you created, speaking the same tracing language.

### Step 4: Write the supervisor and the rules expert

The team needs new roles. Create `app/agents/my_lib_triage.yaml` (supervisor — **outputting a JSON decision** is the core; full version in the reference output):

```yaml
name: my-lib-triage
description: 图书馆咨询台 supervisor——判断请求类型并委派成员或直接答复
instruction: |
  # 角色
  你是图书馆咨询台调度「小台」，负责判断读者请求类型，
  决定自己答复还是委派给团队成员。你不解决具体问题，只做准确分流。

  # 判断规则（按优先级）
  1. 借阅记录查询、校园卡挂失、逾期处理 → 委派 my-lib-assistant（借阅事务专员）。
  2. 规章制度咨询（借期/续借/滞纳金/开放时间）→ 委派 my-lib-rules（规章专家）。
  3. 问候、闲聊、感谢 → 自己简短答复，并提示你能转接图书馆业务。
  4. 请求不明确 → 追问一句确认意图，再分流。

  # 委派要点
  - 转述请求时带上全部关键信息（学号、书名、诉求原话），让成员不用再问一遍。

  # 输出格式（必须严格遵守）
  只输出一个 JSON 对象，不要输出其他内容，不要用 markdown 代码块包裹：
  - 自己回答：{"action": "answer", "answer": "<最终答复>"}
  - 委派成员：{"action": "delegate", "agent": "<成员 key>", "input": "<转述请求>"}

  # 边界
  - 一次只做一个动作（answer 或 delegate 二选一），不连环委派。
```

(The supervisor persona stays in Chinese for fixture parity: it is "Little Tai", the library help-desk dispatcher; rule 1 delegates borrowing lookups / card loss reports / overdue handling to my-lib-assistant, rule 2 delegates regulations questions (loan periods / renewals / fines / opening hours) to my-lib-rules, rules 3–4 answer greetings and clarify vague requests itself; delegation must relay all key details (student ID, book title, the request's original wording); the strict output format is a single JSON object — answer or delegate, never chained delegations.)

Note the "delegation essentials" line — **relay with all key information**. Half the supervisor's value is in triage; the other half is in **context portage**: if the reader's first sentence is "I'm student 2023011234" and the student ID is lost when delegating to my-lib-assistant, the member has to ask all over again, and the user experience regresses straight back to the telephone-operator-transfer era. Writing "relay with full context" into the instruction nails this engineering requirement into the dispatcher's behavior.

Create `app/agents/my_lib_rules.yaml` (the rules expert: pure RAG + gating; copy the knowledge section from [Configure knowledge retrieval](./05-knowledge-rag.md) — full version in the reference output).

Import:

```bash
.venv/bin/luban init
```

Expected result: two new import lines, `my-lib-rules@1` and `my-lib-triage@1`.

### Step 5: Assemble the team

Create `app/multiagents/my_library_team.py`:

```python
"""图书馆咨询台团队：triage 调度 + 借阅事务/规章专家两成员。"""

from lubanagent.multiagent import Team, TeamBuilder


def build_my_library_team() -> Team:
    builder = TeamBuilder(
        "my-library-team", description="图书馆咨询台：triage 调度 + 事务/规章成员"
    )
    builder.supervisor("my-lib-triage")
    builder.agent("my-lib-assistant", description="借阅记录查询、校园卡挂失、逾期处理")
    builder.agent("my-lib-rules", description="借阅规章、续借规则、滞纳金、开放时间咨询")
    builder.route(max_delegations=4)
    return builder.build()
```

(The descriptions read, in order: "library help desk: triage dispatch + transactions/regulations members"; "borrowing record lookups, campus card loss reports, overdue handling"; and "lending rules, renewal rules, overdue fines, opening-hours inquiries".)

That's the whole structure: who dispatches (supervisor), who the members are and what each handles (the descriptions are routing hints written for the dispatcher), and the runaway cap (max_delegations).

Chew on the last few lines once more: **a member's description is not documentation written for humans — it is the routing manual written for the supervisor.** The two members' descriptions keep "borrowing records / loss reports" and "rules / renewals / fines" strictly apart — this is exactly the antidote, planted early, to the FAQ's "routing always picks the same member": the ceiling of routing quality was decided the day you assembled the team, by these few lines of description.

### Step 6: Give the team an HTTP entry

The team's run entry is a **user-territory custom route** (the framework ships no team endpoint — the built-in customer service's `/v1/teams/cs-team/runs` in `app/api/teams.py` is the demonstration of this pattern). At the end of `app/api/teams.py`, **copy the pattern and add**:

```python
# 用户领地自定义路由模式（照抄上面 cs-team 的写法加自己的团队端点）：
@router.post("/my-library-team/runs", response_model=TeamRunResponse)
async def run_my_library_team(body: TeamRunRequest, ctx: CtxDep) -> TeamRunResponse:
    """触发图书馆咨询台团队（用户领地自定义团队路由示例）。"""
    from app.multiagents.my_library_team import build_my_library_team

    team = build_my_library_team()
    runner = TeamRunner(db=ctx.db, runtime=ctx.runtime, registry=ctx.registry)
    thread_id = body.thread_id or uuid.uuid4().hex
    result = await runner.run(team, body.input, thread_id=thread_id)
    return TeamRunResponse(
        status=result.status,
        output=result.output,
        run_id=result.run_id,
        thread_id=result.thread_id,
    )
```

(The comment and docstring mean "user-territory custom route pattern — copy the cs-team route above to add your own team endpoint" and "trigger the library help-desk team (user-territory custom team route example)".)

Why doesn't the framework ship a team endpoint? Because **the exposure method is a business decision, not a framework decision**: whether your team sits behind an internal gateway or behind your own business system's auth is known only to you. The framework hands you `TeamRunner` and `ctx` (database, runtime, Registry); whether to connect, how to connect, and what path to expose are user-territory matters — the same territorial logic as [Local run](./01-setup-and-first-run.md): the framework owns the engine, you own the facade.

Restart the service, then test routing:

```bash
curl -X POST http://localhost:8000/v1/teams/my-library-team/runs \
  -H "Content-Type: application/json" \
  -d '{"input": "我是学号 2023011234，帮我查下借的书"}'
```

(The input means "I'm student 2023011234 — look up my borrowed books for me".)

Expected result: the response returns `status: completed`, and the output's messages show the complete routing process — the supervisor decides to delegate to my-lib-assistant (the relay carries the student ID), the member calls my_lib_lookup, gets the real borrowing record, and answers, and the supervisor composes the final reply. Ask a regulations question next (`书可以续借几次？` — "how many times can a book be renewed?") and confirm it routes to **my-lib-rules** this time.

> A piece of backstage worth knowing: this team mechanism didn't actually run on 0.1.0 — the JSON example in the supervisor instruction collided with the framework's variable-rendering templates and errored out directly (fixed, recorded as risk R13). Your smooth run today is the smoothed path.

Watch the second question's routing: `书可以续借几次？` carries no student ID and no transactional action — pure knowledge inquiry — and the supervisor sends it to my-lib-rules. **One team entry, two request types, two paths, zero human intervention** — that's "divide and conquer" landing. Look back at the single-agent alternative's cost: these two questions would originally be crammed into the same persona, transaction instructions and regulations wording fighting over the same context.

## 3. Validation

- [ ] The flows page shows my_library_flow's node topology (step/human coloring, conditional branch as dashed lines)
- [ ] Mild overdue runs straight through to completed, the fine computed by code
- [ ] Severe overdue interrupts at confirm_freeze; after resume(True) it completes with the freeze applied
- [ ] After resume(False), frozen is confirmed False and privileges are not frozen
- [ ] The team routes the two question types to the correct members, with the supervisor's relay carrying full context

## 4. FAQ

This page's pitfalls cluster into two kinds: graph structure errors (the framework intercepts them on the spot) and team routing misfires (trace back to the supervisor's definition). Match as you go:

**Graph structure errors (e.g., "the same node cannot have both a plain edge and a conditional edge").** `build()` runs topology validation (entry exists / edge endpoints exist / no orphan nodes), and the error message names the problem. The most common is giving the entry node both a plain edge and a `when` — the conditional edge already carries both ways out; nothing more to connect.

**Using `run_until_complete` inside a step function.** A step can be an async function directly (`async def` + `await`); don't nest `run_until_complete` inside a sync function — the graph runs inside an event loop, and nesting another loop inside it always explodes.

**Team Run reports「子 Run 未成功: xxx → failed」("sub-run unsuccessful").** First check whether the supervisor's instruction truly enforces the JSON output format — the framework prompt already bakes in the JSON requirement, and writing the block again in the YAML is double reinforcement that lowers the model's drift odds (omitting it still runs; the parse-failure fallback just fires more often); a parse failure degrades to a direct answer, but a failed sub-run usually has a different cause — go to the Traces page and read that sub-run's scene.

**Routing always picks the same member.** The supervisor's judgment-rules section is written vaguely, or the member descriptions lack contrast. Fix the judgment rules; don't fix the framework.

**Changed the team/graph and nothing happened.** Graphs and teams are Python modules — restart the service (discovery); agent YAMLs go through `init` as always.

The two "when does it take effect" cases are easy to mix up; memorize one line: **YAML goes through init (definitions enter the database, versioned), Python goes through restart (modules reload)** — with that memorized, half of this page's "why didn't it take effect" diagnoses itself.


## Related docs

Next task: [Deploy and upgrade](./08-deploy.md). Full fields and interfaces are in [the manual](../manual/index.md).
