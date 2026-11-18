# REST API Reference

> All business APIs hang under the `/v1` prefix with unified auth and a unified error structure. This page is a quick reference; field-level details are governed by `openapi.snapshot.json` (the frontend TypeScript types are generated from it).

## Conventions

- **Base URL**: `http://localhost:8000/v1` (local default port; the Docker full stack also uses 8000)
- **Auth**: header `Authorization: Bearer <token-or-key>`. Both the bearer token returned by database-account login and the configured `API_KEY` work; the Master API Key always maps to the bootstrap admin. `AUTH_ENABLED=false` is explicit development mode with an anonymous principal holding all permissions; production must keep `true`. `POST /v1/auth/login` is auth-free; every other `/v1/*` route first passes identity and permission checks. With auth enabled but no `API_KEY`, no custom AuthProvider, and `AUTH_DATABASE_ENABLED=false`, the service refuses to start. Details: [login and user permissions](../features/workbench.md).
- **Request tracing**: every HTTP response carries `X-Request-ID`; request errors return it too, usable with `GET /v1/logs?request_id=...`. Do not treat it as a persisted field of the Run.
- **Content-Type**: JSON APIs use `application/json`; file uploads (avatars, knowledge documents, Skill packages) use `multipart/form-data`
- **Rate limiting**: default 600 requests per subject per minute (`RATE_LIMIT_PER_MINUTE`); over-limit returns 429 `RATE_LIMITED`
- **Health check**: `GET /health` (no `/v1` prefix, auth-free), returns `{"status": "ok"}`
- **OpenAPI snapshot**: `openapi.snapshot.json` at the repo root, frozen from `/openapi.json`; the workbench frontend's type file `lubanagent/ui/src/api/schema.d.ts` is generated from it. Field truth is the snapshot.

For the unified error response structure, see [SSE events and error codes](./sse-and-errors.md).

## Agent definitions (agents)

| Method | Path | Description | Key request fields | Key response fields |
|---|---|---|---|---|
| GET | `/v1/agents` | Agent list (current-version definitions) | — | `AgentDefinition[]` (key/name/version/status/instructions/brain/tools/knowledge/memory/boundary…) |
| POST | `/v1/agents` | Create an agent | `AgentDefinition` body (`key` required) | `AgentDefinition` (201); duplicate key → 409 |
| GET | `/v1/agents/{key}` | One agent's current definition | — | `AgentDefinition`; missing → 404 `AGENT_NOT_FOUND` |
| POST | `/v1/agents/{key}/versions` | Append an immutable version snapshot | `AgentDefinition` body (`version` required) | `AgentVersion` (201); version exists → 409 |
| GET | `/v1/agents/{key}/versions/{version}` | Read a specific version snapshot | — | `AgentVersion` (agent_key/version/definition/status/published_at) |
| PUT | `/v1/agents/{key}/avatar` | Upload an avatar (multipart `file`; svg/png/glb/gltf) | — | `AgentDefinition` (a new version is appended automatically) |
| GET | `/v1/agents/{key}/avatar` | Fetch the avatar file | — | File stream (with safe response headers); unset → 404 `AVATAR_NOT_FOUND` |
| DELETE | `/v1/agents/{key}/avatar` | Remove the avatar (also appends a new version) | — | `{removed: true}` |

For agent definition fields and versioning semantics, see [Agent definitions and versioning](../features/agent-definition.md).

```bash
# Create a version snapshot
curl -X POST http://localhost:8000/v1/agents/my-bot/versions \
  -H "Content-Type: application/json" \
  -d '{"key": "my-bot", "name": "我的机器人", "version": 2, "instructions": "你是一个图书管理员"}'
```

## Runs (runs)

| Method | Path | Description | Key request fields | Key response fields |
|---|---|---|---|---|
| POST | `/v1/agents/{key}/runs` | Create a Run, streamed as SSE | `input` required; optional `session_id`/`user_id`/`version`/`variables`/`history`/`instructions_override` | SSE event stream (see [SSE events](./sse-and-errors.md)) |
| GET | `/v1/runs` | Run list | query: `agent_key`/`session_id`/`user_id`/`limit` (default 50, ≤500) | `Run[]` (id/status/end_reason/token_usage/cost…) |
| GET | `/v1/runs/{run_id}` | Run detail | — | `Run`; missing → 404 `RUN_NOT_FOUND` |
| POST | `/v1/runs/{run_id}/cancel` | Cancel a running Run | — | `{cancelled: bool}` |
| POST | `/v1/runs/{run_id}/resume` | Resume a non-terminal Run from the latest checkpoint (SSE streamed; frame format matches Run creation) | — | SSE event stream; missing Run/checkpoint → 404 `RUN_NOT_FOUND`; already terminal / still actively executing in this process / sub-Run → 422 `VALIDATION_ERROR`; checkpoints disabled → 500 `CONFIG_ERROR` (validation failures return before the stream starts, not as SSE events) |

```bash
# Start a conversation (SSE streaming; -N disables buffering)
curl -N -X POST http://localhost:8000/v1/agents/customer-service-bot/runs \
  -H "Content-Type: application/json" \
  -d '{"input": "你好", "session_id": "s-1", "user_id": "debug"}'
```

```bash
# Query the latest Runs of one session
curl "http://localhost:8000/v1/runs?session_id=s-1&limit=10"
```

```bash
# Resume a non-terminal Run after crash/interruption (also usable after a service restart, provided checkpoints were persisted step-by-step under default wiring)
curl -N -X POST http://localhost:8000/v1/runs/<run_id>/resume
```

## Model center (models / brain-profiles / brain-mappings)

| Method | Path | Description | Key request fields | Key response fields |
|---|---|---|---|---|
| GET | `/v1/models` | Registered model list (redacted output) | — | `ModelDefinitionOut[]` (key/provider/model_name/factory/capability/params/api_key_env/enabled; no `base_url` or other connection info) |
| PUT | `/v1/models` | Register/update a model (upsert) | `key`/`provider`/`model_name`/`factory`/`api_key_env`; optional `base_url`/`capability`/`params` (including unit-price fields) | Redacted `ModelDefinitionOut` |
| GET | `/v1/brain-mappings` | Actual environment mappings of active slots; does not enumerate the four presets | query: `env` (defaults to service config) | `BrainMappingOut[]` (env/profile/model_key); unmapped slots are not returned |
| PUT | `/v1/brain-mappings` | Bind a dynamic slot to a model; old aliases resolve to the current key | `profile`/`model_key`; optional `env` | `BrainMappingOut`; missing model → 404 `MODEL_NOT_FOUND`; unknown/deleted slot → 404 `BRAIN_PROFILE_NOT_FOUND` |
| GET | `/v1/brain-profiles` | Active slot catalog and the server's current environment | — | `{env,items}`; slots with `key/name/description/aliases/reference_count/agent_count` |
| POST | `/v1/brain-profiles` | Add a slot, optionally binding a model | `key`/`name`; optional `description/model_key/env` | 201 slot; key or historical alias collision → 409 `BRAIN_PROFILE_CONFLICT` |
| PATCH | `/v1/brain-profiles/{key}` | Edit key/name/purpose and optional mapping; renaming keeps an alias and moves all environment mappings | optional `key/name/description/model_key/env` | Slot; missing → 404; conflict → 409 `BRAIN_PROFILE_CONFLICT` |
| GET | `/v1/brain-profiles/{key}/references` | Usage list across all agent historical versions | — | `{key,agent_count,references}`; agent key/name, version, current, field |
| DELETE | `/v1/brain-profiles/{key}` | Delete only when no agent references it; removes all environment mappings | — | `{removed:true}`; in use → 409 `BRAIN_PROFILE_IN_USE` with details profile/references/agent_count; mappings unchanged |

Catalog keys match `^[a-z][a-z0-9_-]{0,63}$`, names are 1–128 chars, purpose ≤512; invalid requests return 422. Reading catalog/references/mappings requires `config:read`; writing requires `config:write`. Delete protection covers the primary slot, fallback slot, and implicit `cheap` from summary memory — not just the current version; the four initial presets follow the same rule. Add/edit and the optional mapping run in one transaction and roll back together on failure.

```bash
# Register an OpenAI-compatible model
curl -X PUT http://localhost:8000/v1/models -H "Content-Type: application/json" -d '{
  "key": "deepseek-chat", "provider": "deepseek", "model_name": "deepseek-chat",
  "factory": "openai_compat", "api_key_env": "DEEPSEEK_API_KEY",
  "base_url": "https://api.deepseek.com/v1",
  "capability": {"tool_calling": true},
  "params": {"input_price_per_1k": 0.002, "output_price_per_1k": 0.008}
}'
# Bind to the smart slot (switching models = editing a mapping; no code change, no release)
curl -X PUT http://localhost:8000/v1/brain-mappings -H "Content-Type: application/json" \
  -d '{"profile": "smart", "model_key": "deepseek-chat"}'
```

## Prompt library (prompts)

| Method | Path | Description | Key request fields | Key response fields |
|---|---|---|---|---|
| GET | `/v1/prompts` | Prompt list | — | `PromptDefinition[]` (key/name/content/variables/version) |
| POST | `/v1/prompts` | Create a prompt | `PromptDefinition` body | `PromptDefinition` (201); duplicate key → 409 |
| GET | `/v1/prompts/{key}` | One prompt's current version | — | `PromptDefinition` |
| GET | `/v1/prompts/{key}/versions` | Version list | — | `PromptVersion[]` |
| POST | `/v1/prompts/{key}/versions` | Append a version snapshot | `PromptDefinition` body (`version` required) | `PromptVersion` (201); version exists → 409 |
| GET | `/v1/prompts/{key}/versions/{version}` | A specific version snapshot | — | `PromptVersion` (prompt_key/version/content/variables) |

## Knowledge base (knowledge)

| Method | Path | Description | Key request fields | Key response fields |
|---|---|---|---|---|
| GET | `/v1/knowledge/sources` | Knowledge source list | — | `KnowledgeSourceOut[]` (name/chunk_size/overlap/files/chunk_count/managed) |
| POST | `/v1/knowledge/sources` | Create a source and ingest (multipart: `files` multi-file + `name`/`description`/`chunk_size`/`overlap`) | `name` must match `^[a-z0-9][a-z0-9_-]{1,63}$` | `KnowledgeSourceOut` (201); duplicate name → 409; per-file ≤10MB, total ≤50MB, ≤50 files |
| DELETE | `/v1/knowledge/sources/{name}` | Delete a source | — | 204 |
| POST | `/v1/knowledge/sources/{name}/rechunk` | Re-chunk | `chunk_size` (>0)/`overlap` (≥0) | `KnowledgeSourceOut` |
| GET | `/v1/knowledge/sources/{name}/chunks` | Inspect chunks | query: `limit` (default 200, ≤1000) | `KnowledgeChunkOut[]` (chunk_index/content/metadata/created_at) |
| POST | `/v1/knowledge/query` | Retrieval test | `query` required; optional `source` (all by default), `top_k` (default 5, ≤50) | `KnowledgeHitOut[]` (source/chunk_index/content/score/metadata) |

```bash
# Upload knowledge documents (multipart)
curl -X POST http://localhost:8000/v1/knowledge/sources \
  -F "files=@faq.md" -F "files=@policy.pdf" \
  -F "name=lib-faq" -F "description=图书馆常见问题" \
  -F "chunk_size=500" -F "overlap=50"
```

## Tools and Skills (tools / skills)

| Method | Path | Description | Key request fields | Key response fields |
|---|---|---|---|---|
| GET | `/v1/tools` | Registered tool list | — | `ToolDescriptor[]` (key/name/description/args_schema/risk/contract) |
| POST | `/v1/tools/{key}/test` | Test a tool online (executes directly, bypassing the Runtime) | Body is the tool's input JSON (may be null) | `ToolResult` (success/value/duration_ms/error); unregistered → 404 `TOOL_NOT_FOUND` |
| GET | `/v1/skills` | Skill list (in-memory view) | — | `SkillOut[]` (key/name/version/manifest) |
| POST | `/v1/skills` | Upload a Skill zip (multipart `file`, containing SKILL.md, ≤10MB) | — | `SkillOut` (201) |
| DELETE | `/v1/skills/{key}` | Delete a Skill | — | 204; missing → 422 `VALIDATION_ERROR` |

```bash
# Test a tool online
curl -X POST http://localhost:8000/v1/tools/query_order/test \
  -H "Content-Type: application/json" \
  -d '{"order_id": "A1001"}'
```

## Traces and approvals (traces / approvals)

| Method | Path | Description | Key request fields | Key response fields |
|---|---|---|---|---|
| GET | `/v1/traces/{run_id}` | Trace header + full event stream for a Run | — | `TraceOut` (trace + events[]); missing → 404 `RUN_NOT_FOUND` |
| GET | `/v1/approvals` | Pending approval list | query: `run_id` (optional filter) | `ApprovalOut[]` (id/run_id/tool_key/args/status/created_at) |
| POST | `/v1/approvals/{approval_id}/decide` | Approval decision | `approved` (bool); `decided_by` exists only for legacy request bodies — attribution comes from the authenticated principal | `DecideOut` (status/decided_by/decided_at); missing or finalized approval → 404 |

```bash
# Approve a human approval
curl -X POST http://localhost:8000/v1/approvals/ap-123/decide \
  -H "Content-Type: application/json" -d '{"approved": true}'
```

## Evals and graphs (evals / graphs)

| Method | Path | Description | Key request fields | Key response fields |
|---|---|---|---|---|
| GET | `/v1/evals` | Eval report summary list (persisted by `luban eval run`; API is read-only) | query: `dataset_key`/`agent_key`/`limit` | `EvalReportSummary[]` |
| GET | `/v1/evals/{result_id}` | Report detail (per-case pass/fail, assertion details, judge verdicts, run_id) | — | `EvalReportDetail`; missing → 404 `EVAL_RESULT_NOT_FOUND` |
| GET | `/v1/graphs` | Registered graph list (read-only) | — | `GraphSummaryOut[]` (name/description/structure_available) |
| GET | `/v1/graphs/{name}` | Graph topology detail (entry/nodes/edges/cond_edges) | — | `GraphDetailOut`; unregistered → 404 `GRAPH_NOT_FOUND`; non-DSL builder → 422 `GRAPH_STRUCTURE_UNAVAILABLE` |

For the eval flow and reading reports, see [evals](../features/evals.md); for how graphs are defined, see [runtime and governance](../features/runtime.md).

## Login and user permissions (auth / security)

| Method | Path | Description | Key request fields | Key response fields |
|---|---|---|---|---|
| POST | `/v1/auth/login` | Username/password login; rate-limited by source host | `username` (1–64), `password` (12–256) | `access_token`, `token_type:"bearer"`, `expires_at`, `user`; failures always return 401 semantics, without distinguishing "user missing" and "wrong password" |
| GET | `/v1/auth/me` | Current account, roles, permissions, and auth mode | — | `subject/username/display_name/roles/permissions/auth_enabled/is_bootstrap` |
| POST | `/v1/auth/logout` | Revoke the current database session | — | `{logged_out:true}` |
| GET/POST | `/v1/security/users` | User list/create; requires `security:manage` | create: `username/display_name/password/role_keys/enabled`; password 12–256 chars | `UserPublic[]` or `UserPublic` (200); never returns `password_hash` |
| PATCH | `/v1/security/users/{id}` | Change display name, enabled state, roles, or password; requires `security:manage` | optional `display_name/enabled/role_keys/password` | `UserPublic`; disabling or changing the password revokes that user's existing sessions |
| GET/POST | `/v1/security/roles` | Role list/create; requires `security:manage` | `key/name/permissions` | `RolePublic[]` or `RolePublic` (200) |
| PATCH/DELETE | `/v1/security/roles/{key}` | Change permissions or delete a role; requires `security:manage` | `name/permissions` | `RolePublic` or `{deleted:true}`; admin is protected and must keep all permissions, and admin alone cannot be deleted (operator/auditor/viewer can be edited/deleted); the last enabled admin cannot be removed |
| GET | `/v1/security/permissions` | Permission list; requires `security:manage` | — | `[{key,name}]`, currently 10 items |

```bash
curl -X POST http://localhost:8000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-admin-password"}'
```

**Permission mapping**: `/v1/auth/*` requires only authentication; `/v1/security/*` requires `security:manage`; `/v1/logs` and `/v1/diagnostics/*` require `diagnostics:read`. GET runs/traces/approvals requires `run:read`; creating/resuming/tool tests/retrieval tests require `run:execute`; cancel requires `run:cancel`; approval decisions require `run:approve`; eval reading and execution require `eval:read` / `eval:execute` respectively; other reads require `config:read`, and unknown write paths default to `config:write`. Insufficient permission returns 403 `PERMISSION_DENIED`.

**Boundary**: roles and permissions serve the LubanAgent platform itself, not a general enterprise back office; there are no department, tenant, or row-level data scopes. Enabled users and current role grants are reloaded from the database on every request; disabling, password changes, role changes, or logout take effect immediately for subsequent requests.

## Platform logs and diagnostics (logs / diagnostics)

| Method | Path | Description | Key query/request fields | Key response fields |
|---|---|---|---|---|
| GET | `/v1/logs` | Query persisted program logs | `session_id/run_id/trace_id/request_id/root_run_id/level/logger/q/from_time/to_time/limit/offset`; `limit` defaults to 50, ≤200 | `{items,total,limit,offset,dropped_count,write_failures}`; log fields include correlation IDs, `subject`, `exception`, `pathname`, `lineno`, `extra` |
| GET | `/v1/diagnostics/runs` | Paginated diagnostic Runs | `session_id/run_id/trace_id/user_id/status/limit/offset`; `limit` defaults to 50, ≤200 | `{items:Run[],total,limit,offset}`; input/output redacted before display |
| GET | `/v1/diagnostics/runs/{run_or_trace_id}` | Execution tree by Run ID or Trace ID | — | `{run,runs,traces,log_count}`; `runs` is the root Run plus all descendants, Trace events returned with each Run |

```bash
# Query logs for one request using the login token; returns at most 50 by default
curl "http://localhost:8000/v1/logs?request_id=<x-request-id>&limit=50" \
  -H "Authorization: Bearer <access_token>"
```

**Boundary**: writes are bounded asynchronous batches; the queue is flushed as best effort before queries, but a full queue, database write failure, or process crash can still lose logs. Credential-like text is redacted before persistence on a best-effort basis — this is not arbitrary PII detection; the `logging` integration does not auto-capture all `print` output or third-party logs. `request_id` is only a log correlation key and is not written to the `runs` table.
