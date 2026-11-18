# SSE Events and Error Codes

> Real-time Run output uses SSE (Server-Sent Events); errors use the unified `ErrorOut` structure. Event names and error codes are framework-facing contracts pinned in code.

## SSE protocol format

`POST /v1/agents/{key}/runs` returns `text/event-stream` (headers `Cache-Control: no-cache`, `X-Accel-Buffering: no`). Each frame:

```
event: <event name>
data: <JSON>

```

The `data` JSON is `{"run_id": ..., "type": <internal event type>, **payload}`:

- `run_id`: this Run's ID, for looking up the [Run detail](./rest.md#runs-runs) and Trace;
- `type`: internal Trace event type (e.g. `run_started`, `tool_call_completed`);
- `payload`: the event payload, redacted before sending out (sensitive field values replaced; args/results/errors all handled).

Client example:

```bash
curl -N -X POST http://localhost:8000/v1/agents/customer-service-bot/runs \
  -H "Content-Type: application/json" -d '{"input": "你好"}'
```

```
event: run.started
data: {"run_id": "r-abc123", "type": "run_started"}

event: token.delta
data: {"run_id": "r-abc123", "type": "model_token_delta", "text": "您好"}

event: run.completed
data: {"run_id": "r-abc123", "type": "run_completed", "end_reason": "final_answer", "output": "您好…"}
```

## Event table

Only the 20 events below are sent externally; payloads follow actual pushes (the table was verified against code emit sites).

| Event | Triggered when | Payload highlights |
|---|---|---|
| `run.started` | Run record created, execution begins | empty (data carries only `run_id`/`type`) |
| `run.resumed` | A non-terminal Run resumes from a checkpoint (`POST /v1/runs/{run_id}/resume`); the trace is continuous; `run.started` is not resent | `resumed: true` |
| `token.delta` | The model streams a text increment | `text` (incremental text) |
| `tool.started` | Tool call begins | `tool` (tool key), `args` (redacted) |
| `tool.finished` | Tool call succeeded | `tool`, `result` (redacted), `duration_ms` |
| `tool.failed` | Tool call failed | `tool`, `error` (error dict, redacted) |
| `run.completed` | Run reached a successful terminal state | `end_reason` (e.g. `final_answer`/`knowledge_no_hit`), `output` (final answer) |
| `run.failed` | Run reached a failed terminal state | `end_reason`, `error` (error dict) |
| `run.cancelled` | Run was cancelled (including client cancel) | `end_reason` (`cancelled`) |
| `tool.approval.requested` | An approval-type tool triggers human confirmation | `approval_id`, `tool`, `args` (redacted) |
| `tool.approval.resolved` | Approval decided | `approval_id`, `tool`, `approved` (bool), `status`, `decided_by`, `decided_at` |
| `model.fallback` | Primary model capability insufficient, degraded to the fallback slot | `from_profile`, `to_profile`, `model_key`, `reason` |
| `budget.warning` | Budget warning (current case: a cost cap is configured but the model has no unit prices, so the cost cap cannot be enforced) | `reason` (e.g. `no_pricing`), `model_key` |
| `budget.exceeded` | Hard budget limit hit; the Run turns failed | `error` (error dict) |
| `knowledge.no_hit` | Retrieval filtered to zero hits with fallback text configured; code forces a short-circuit refusal | `sources`, `score_threshold`, `hits_raw`, `hits_kept` |
| `task.started` | An async tool was accepted and moved to background (only when `TOOL_ASYNC_ENABLED` is on) | `tool`, `task_id` |
| `task.finished` | Async tool background execution succeeded | `tool`, `task_id`, `result` (redacted), `duration_ms` |
| `task.failed` | Async tool background execution failed | `tool`, `task_id`, `error` (error dict, redacted) |
| `task.cancelled` | Async task terminated (via `task_stop` or Run-end cleanup) | `tool`, `task_id`, `reason` |
| `watchdog.alert` | The external Watchdog judged event staleness or long runtime (only when `WATCHDOG_ENABLED` is on) | `reason` (`stale_events`/`long_running`), `age_seconds`, `last_event_at`, `action`, `alert_id` |

Notes:

- **Internal fine-grained events are not sent out by default**: Trace-granularity events like `step_started`/`step_completed`/`model_call_started`/`model_call_completed` are only persisted (queryable via `GET /v1/traces/{run_id}`), never in the SSE stream.
- When `knowledge.no_hit` fires, the Run still completes normally (`end_reason=knowledge_no_hit`), the fallback text is the `output`, no model call, zero token consumption.
- While waiting for approval the Run status is `waiting_approval` and resumes after `POST /v1/approvals/{approval_id}/decide`.
- **Crash recovery (resume)**: regular agent Runs write step-by-step checkpoints by default (`create_app` default wiring, `checkpoints` table); after a crash/interruption, a non-terminal Run with a checkpoint can call `POST /v1/runs/{run_id}/resume` — the budget is rebuilt from actual ledger consumption (no re-crediting), and the model version follows the snapshot of that time. Boundaries: recovery is an explicit call with no automatic restart recovery; the same Run cannot be resumed concurrently (serialized within one process); sub-Runs belong to the parent orchestration and cannot be resumed independently; with multiple workers, mutual exclusion holds only within a single process. To disable checkpoint writes: `create_app(checkpointer=None)`.

## Error code table

Error code string values live in the `ErrorCode` enum in `lubanagent/core/errors.py`; HTTP status mapping is in `ERROR_HTTP_STATUS` in `lubanagent/api/errors.py`.

| Error code | HTTP status | Meaning |
|---|---|---|
| `AGENT_NOT_FOUND` | 404 | Agent does not exist |
| `AGENT_VERSION_NOT_FOUND` | 404 | Agent version snapshot does not exist |
| `RUN_NOT_FOUND` | 404 | Run / Trace does not exist |
| `MODEL_NOT_FOUND` | 404 | Model not registered |
| `TOOL_NOT_FOUND` | 404 | Tool not registered |
| `PROMPT_NOT_FOUND` | 404 | Prompt does not exist |
| `PROMPT_VERSION_NOT_FOUND` | 404 | Prompt version does not exist |
| `KNOWLEDGE_SOURCE_NOT_FOUND` | 404 | Knowledge source does not exist |
| `GRAPH_NOT_FOUND` | 404 | Graph not registered |
| `AVATAR_NOT_FOUND` | 404 | Agent avatar unset or file missing |
| `EVAL_RESULT_NOT_FOUND` | 404 | Eval report does not exist |
| `AUTH_FAILED` | 401 | API key missing or mismatched |
| `RATE_LIMITED` | 429 | Request exceeds the rate limit (`retryable=true`) |
| `TOOL_PERMISSION_DENIED` | 403 | Tool permission denied |
| `AGENT_VERSION_UNRUNNABLE` | 422 | Agent version not runnable |
| `VALIDATION_ERROR` | 422 | Request/business validation failed |
| `CAPABILITY_MISMATCH` | 422 | Model capability does not meet the agent's requirement |
| `NO_FALLBACK_AVAILABLE` | 422 | No fallback model available |
| `BRAIN_NOT_MAPPED` | 422 | Brain slot not bound to a model |
| `BRAIN_PROFILE_NOT_FOUND` | 404 | Slot unregistered or deleted |
| `BRAIN_PROFILE_CONFLICT` | 409 | New/renamed key conflicts with the current key or a historical alias |
| `BRAIN_PROFILE_IN_USE` | 409 | An agent historical version still uses the slot; details return agent/version/field; catalog/mappings unchanged |
| `GRAPH_STRUCTURE_UNAVAILABLE` | 422 | Graph builder is not a DSL builder; no structure view |
| `CONFIG_ERROR` | 500 | Configuration error (e.g. auth enabled without a key, a manager not wired) |
| `INTERNAL_ERROR` | 500 | Server internal error (stack traces go to logs only, never responses) |

The error codes below are **runtime errors** outside the HTTP mapping table — they appear in the `Run.error` field, the `error` payload of `run.failed` SSE events, and Trace events, not as HTTP responses:

| Error code | Meaning |
|---|---|
| `TOOL_APPROVAL_REQUIRED` | Approval-type tool waiting for human confirmation |
| `TOOL_EXECUTION_FAILED` | Tool execution failed |
| `BUDGET_EXCEEDED` | Hard budget limit hit |
| `STEP_LIMIT_EXCEEDED` | Step limit hit |
| `RUN_TIMEOUT` | Run timed out |
| `RUN_CANCELLED` | Run was cancelled |

Error codes not listed in the mapping table default to 500.

## Error response body structure

Unified structure `ErrorOut`: `{"error": {code, message, details, retryable}}`.

```json
{
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent 不存在: no-such-bot",
    "details": {"agent_key": "no-such-bot"},
    "retryable": false
  }
}
```

Three route-level special cases (actual responses govern):

- **409 conflicts**: resource conflicts like duplicate keys/versions return HTTP 409, but the `code` field stays `VALIDATION_ERROR` (the route-level status of `conflict_response` overrides). Cases: duplicate agent key, existing agent/prompt version, duplicate knowledge source name.
- **422 validation errors**: FastAPI request validation failures return 422 with `details.errors` as a per-item array:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数校验失败",
    "details": {
      "errors": [
        {"loc": ["body", "input"], "type": "missing", "msg": "Field required"}
      ]
    }
  }
}
```

- **404 + VALIDATION_ERROR**: the approval decision endpoint returns 404 for "approval missing or finalized", with code `VALIDATION_ERROR` as well.

Related pages: [REST API reference](./rest.md), [runtime and governance](../features/runtime.md), [getting started](../getting-started.md).
