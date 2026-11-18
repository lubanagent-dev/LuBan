# Agent Runtime

> This page covers the execution engine's Run loop, the three hard limits, the semantics of `session_id` / `user_id`, and how to subscribe to SSE streamed events.

**What it is**: the execution engine. It runs the "model ↔ tools" loop: the model decides to call a tool → execution → results fed back → reasoning continues, until a final answer or a limit is hit. Each execution is a **Run**, constrained by the three hard limits (steps / budget / timeout), cancellable, and emitting uniform **SSE streamed events** (token deltas, tool call start/end, Run status) that frontends or business systems subscribe to.

**Why it exists**: this is the number-one component "every team rewrites"; safety limits (max steps, budget, timeout) and the [cost governance](./cost.md) cutoffs are enforced in code at the Runtime, not hoped for through prompts.

**How to use it** (illustrative):

```bash
curl -N -X POST http://localhost:8000/v1/agents/customer-service-bot/runs \
  -H "Content-Type: application/json" \
  -d '{"input": "我上周的订单还没发货", "session_id": "sess-123", "user_id": "u-42"}'
# SSE event stream: run.started → token.delta… → tool.started(query_order) → tool.finished → … → run.completed
```

Two commonly used optional request fields:
- `session_id` — **session grouping**. Multiple Runs of one conversation share one id; when session/summary memory is on, the agent reads/writes history by it; without it each Run is independent.
- `user_id` — **user troubleshooting label**. The business system passes its own user id; it is stored verbatim on the Run/Trace and later `GET /v1/runs?user_id=...` filters by user. It is a pass-through observability label, not a platform-account foreign key; platform auth and feature permissions are decided by backend RBAC, and business-side organizational permissions remain your system's job.

Query historical Runs: `GET /v1/runs?agent_key=customer-service-bot&session_id=sess-123&user_id=u-42&limit=50` (`agent_key`/`session_id`/`user_id`/`limit` are all optional).

**Crash recovery (resume)**: regular Runs write a LangGraph checkpoint at every node boundary by default (`checkpoints` table, zero-config). After a crash or interruption, a non-terminal Run with a checkpoint can be resumed explicitly:

```bash
curl -N -X POST http://localhost:8000/v1/runs/<run_id>/resume
# SSE frame format matches Run creation; the first event is run.resumed (continuous trace; run.started is not resent)
```

The resume budget is rebuilt from the consumed ledger (no reset by restart), and the model version follows the snapshot of that time. Boundaries: recovery is an explicit call with no automatic restart recovery; a Run cannot be resumed concurrently (serialized within one process; with multiple workers don't double-resume); sub-Runs belong to the parent orchestration and cannot be resumed independently; disable checkpoint writes with `create_app(checkpointer=None)`.

For the full SSE event protocol and error codes, see [SSE events and error codes](../api/sse-and-errors.md).

**Boundary**: the Runtime handles only the single-agent loop; cross-node, stateful, pausable complex flows use [graph orchestration](./graphs.md).
