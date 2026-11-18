# Architecture

> This page answers four questions with four diagrams: how the system is layered, where your code and the framework live, how data flows through one Run, and what deployment looks like. Module-level details (interfaces / data / behavior / boundaries) live in `docs/specs/` (development docs); this page only covers what you must know to adapt the system.

## Diagram 1: System layers

```mermaid
flowchart TB
    U["Users / business systems"] --> IN["One gate<br/>all requests enter here, with access control (account sessions / API key / pluggable auth)"]
    DEV["Developer"] --> DB[("Filing room (database)<br/>every agent's persona, capabilities, and rules are stored here<br/>editing an agent = editing the record — no code change, no release")]
    IN --> A["Flexible receptionist<br/>day-to-day conversational Q&A, adapts on the fly<br/>(prebuilt + governance wrapper, no graph)"]
    IN --> B["Standard pipeline<br/>refunds, approvals — flows that must never miss a step<br/>(hand-written LangGraph graph, enforced in code)"]
    IN --> T["Multi-agent team<br/>supervisor triages → sub-agents execute<br/>(orchestration Runs governed like single-agent Runs)"]
    DB --> A
    DB --> B
    DB --> T
    A --> BOX["Shared toolbox<br/>brains (multi-vendor models · editable slots) · business tools · MCP · Skills · knowledge"]
    B --> BOX
    T --> BOX
    A --> LOG["Black box<br/>what was done and what it cost<br/>full Trace, replayable anytime"]
    B --> LOG
    T --> LOG
```

The three execution forms share the same capability components and governance — this is "one engine, two usages (plus one multi-agent layer)": regular agents run without graphs, deterministic flows use graphs, and multi-agent is a supervisor topology on top of graphs.

## Diagram 2: Territories and directories (where you live, where the framework lives)

```text
LubanAgent/
├── lubanagent/    Framework territory — tracked upstream; in principle you don't touch it
│   ├── api/         FastAPI access layer (routes / auth / error mapping / OpenAPI contracts)
│   ├── core/        Domain models and extension-point protocols
│   ├── model/       Model factory (vendor adapters converge here only)
│   ├── runtime/     Agent loop / governance wrapper / SSE
│   ├── tool/        Tool execution and approval gate
│   ├── skill/       Skill loading and sandbox
│   ├── knowledge/   Minimal RAG
│   ├── graph/       Graph orchestration executor
│   ├── multiagent/  Supervisor delegation
│   ├── persistence/ ORM / repositories / migrations
│   ├── observability/ Trace / cost / evals / observability backend adapters
│   ├── mcp/         MCP Client / Server
│   ├── cli/         luban command line
│   └── ui/          Developer workbench frontend
├── app/           Your territory — your agents / tools / graphs / teams / configs live here; upstream never touches it proactively
│   ├── agents/      Agent YAML (for initial import)
│   ├── tools/       Your business tools
│   ├── graphs/      Your deterministic flows (convention-scanned entry points)
│   ├── skills/      Your Skill packages
│   └── config/      Environment config (.env)
├── website/       User documentation site (development guide + manual, VitePress, deployed separately)
├── docs/          Development docs (design docs / module specs / contracts) — for contributors and AI collaboration tools
├── demos/         Built-in customer-service example (living documentation)
├── tests/  migrations/  docker/  scripts/   Shared territory
```

The dependency direction is one-way: `app/* → lubanagent/*` is allowed; `lubanagent/* → app/*` is **forbidden** — at runtime the framework finds user extensions through the Registry (importing registers them) and never imports in the reverse direction. Two CI guards:

- **import-linter**: blocks reverse dependencies;
- **`.lubanagent-upstream` guard**: CI blocks upstream changes that hit user-owned paths.

This is the foundation of "clone, adapt, and still follow upstream upgrades"; see the [customization overview](./customization/overview.md) and [upgrading with upstream](./customization/upgrade.md).

## Diagram 3: Data flow of one Run

```mermaid
sequenceDiagram
    participant C as Caller (frontend / business system)
    participant API as Access layer (FastAPI)
    participant R as Runtime (governance wrapper)
    participant M as Model (resolved via slots)
    participant T as Tool (via approval gate)
    participant DB as Database (Trace persisted)

    C->>API: POST /v1/agents/{key}/runs (input, session_id?, user_id?)
    API->>API: Auth → resolve agent definition version → assemble context (memory/knowledge)
    API->>R: Start Run (hard limits: steps / budget / timeout)
    R->>M: Send tool list + context
    M-->>R: Decide tool call + arguments
    R->>T: Permission check → high-risk tools wait for human approval (SSE: tool.approval.requested)
    T-->>R: Execution result (timeout/retry/idempotency policies applied)
    R->>M: Feed results back, continue reasoning
    R-->>C: SSE streamed events (run.started / token.delta / tool.* / run.completed)
    R->>DB: Full Trace (version, model, tool calls, tokens, cost, end reason)
    Note over DB: Observability backend (Langfuse/LangSmith/none) is a side-by-side dual write<br/>the internal DB is always the source of truth
```

For event names and fields at each step, see [SSE events and error codes](./api/sse-and-errors.md).

## Diagram 4: Deployment topology (Docker Compose, five services)

```mermaid
flowchart LR
    subgraph compose["docker compose (single-machine full stack)"]
        APP["app<br/>FastAPI + workbench UI on port :8000<br/>auto-runs migrate && init at startup (idempotent)"]
        MYSQL[("MySQL 8 :3306<br/>definitions/versions/Runs/Traces/checkpoints")]
        LF["Langfuse :3000<br/>observability UI (self-hosted, keeps data sovereignty)"]
        LFDB[("Langfuse DB")]
        MOCK["mock-biz :9100<br/>customer-service sample business service"]
    end
    USER["Users / developers"] --> APP
    APP --> MYSQL
    APP --> LF
    LF --- LFDB
    APP -->|"sample business calls"| MOCK
```

The image is a three-stage build: Node builds the workbench frontend → venv → runtime. Required production changes (auth, real credentials, persistent volumes, changing the Langfuse password) are in the [deployment checklist](./deploy.md).

## Design principles at a glance

| Principle | In one sentence | Shown in |
| --- | --- | --- |
| Definitions in the database, versioned | An agent = a database record; editing config needs no release | [Agent definition](./features/agent-definition.md) |
| Decoupled logical brains | Switching models = editing a database mapping, no code change | [Model factory](./features/models.md) |
| Deterministic rules run in code | Permissions / amounts / approvals are not declared by prompts | [Tools and MCP](./features/tools-mcp.md), [graph orchestration](./features/graphs.md) |
| No black box, no forced SaaS | Full source; observability is switchable and removable; the internal DB is the source of truth | [Runtime observability](./features/observability.md) |
| Territory isolation | The user territory is separate; upgrades don't lose your changes | [Upgrading with upstream](./customization/upgrade.md) |
