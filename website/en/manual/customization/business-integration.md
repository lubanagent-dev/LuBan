# Business Integration

> LubanAgent is the engine and the base; **the end-user frontend (app / web / IM bot) is built by your business system** — the framework fully opens its capabilities over REST / SSE, leaving auth, user systems, and channels on your side.

## Call pattern: POST to start a Run + subscribe to SSE events

One run = one HTTP request + one SSE event stream:

```bash
curl -N -X POST http://localhost:8000/v1/agents/customer-service-bot/runs \
  -H "Content-Type: application/json" \
  -d '{"input": "我上周的订单还没发货", "session_id": "sess-123", "user_id": "u-42"}'
# SSE event stream: run.started → token.delta… → tool.started(query_order) → tool.finished → … → run.completed
```

For the full list of event names and fields, see [SSE events and error codes](../api/sse-and-errors.md). Query historical Runs:

```bash
GET /v1/runs?agent_key=customer-service-bot&session_id=sess-123&user_id=u-42&limit=50
# agent_key / session_id / user_id / limit are all optional
```

## Semantics and boundaries of session_id / user_id

- `session_id` — **session grouping**. Multiple Runs of one conversation share one id; when session/summary memory is on, history is read/written by it; without it each Run is independent.
- `user_id` — **user troubleshooting label**. The business system passes its own user id; it is stored verbatim on Run/Trace and can later filter by user.

**Boundary (important)**: `user_id` is only a pass-through observability label, not a platform-account foreign key; platform RBAC covers only LubanAgent's own workbench and `/v1` API feature permissions — no business organization, tenant, or row-level authorization. Business-side identity can keep going through your gateway, or use database accounts, API keys, or a custom `AuthProvider`.

## How to wire approval callbacks

High-risk tools (`risk="high"` or `approval_required=True`) pause before execution awaiting human confirmation; your business system wires it like this:

1. Subscribe to the SSE stream and receive the `tool.approval.requested` event (with the approval id);
2. Push it to your approvers (IM / approval backend — you implement this);
3. Call the decision endpoint to write back the result:

```bash
POST /v1/approvals/{approval_id}/decide
```

After approval the flow continues; rejection is handled as rejected. Approval records persist in the `approvals` table: decisions survive restarts, never duplicate (atomic conditional updates), and are auditable; `decided_by` attribution uses the server-verified principal and never trusts client-provided values.

## Pluggable extension points

The framework leaves Protocol extension points at key positions; implement and register via the Registry to replace defaults (without touching framework code):

| Extension point | Default implementation | When to replace |
| --- | --- | --- |
| `AuthProvider` | API-key auth (can be off) | Integrate your own user system / gateway-injected identity |
| `RateLimiter` | In-process rate limiting | Switch to Redis etc. for multi-instance deployments |
| `ObservabilityBackend` | Self-hosted Langfuse | Switch to LangSmith or off (`OBSERVABILITY_BACKEND` env); see [swapping models and backends](./swap-backends.md) |
| `ChannelConnector` | No built-in implementation | **The extension point for IM / e-commerce message channels** — the core runs without it; business systems just call REST/SSE; with companion Protocols `SessionStateStore` (session state) and `OutputGuard` (outbound review) |

## MCP reverse exposure: give your tools to others

One switch exposes LubanAgent's own Tools (even a whole agent) as a standard MCP Server; Claude Code, Cursor, and other agent systems can call them directly — existing enterprise capabilities become reusable by any MCP-ecosystem client instead of being locked inside this system.

Upgrade boundary to note (details in the [UPGRADE guide](./upgrade.md)): `create_mcp_server()` requires an explicit `export_tools` (listing only the tool keys to expose); without it, exports are empty; MCP tool calls pass `ToolExecutor`'s permission, risk, and approval checks — a high-risk tool without an approver is rejected; the HTTP MCP entry needs its own `http_api_key` (not reusing the REST API key); stdio is only for trusted local calls.

## Boundary

- The framework does no user registration/login/multi-tenancy — the chat entry in the workbench (/chat) is sample-level; production end-user frontends are built by the business system over REST/SSE.
- IM (WeCom/Feishu/DingTalk) and e-commerce customer-service channel integrations belong to the commercial channel layer, not in the open-source edition; open-source users can integrate themselves via the `ChannelConnector` extension point.
- Session/user data (`session_id`/`user_id`) are grouping and observability labels on the framework side, not an identity system.
