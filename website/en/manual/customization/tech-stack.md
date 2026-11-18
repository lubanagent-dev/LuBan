# Tech Stack and Replaceable Parts

> This page spells out what each layer of LubanAgent uses, why, what can be swapped, and how. After reading, you know which parts are immovable foundations and which are parts you can replace with a switch.

## Current stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | Python ≥ 3.11 | The mainstream agent-ecosystem language; typing and performance since 3.11 are production-grade |
| Agent engine | LangChain + LangGraph | One ecosystem, the same objects. Regular agents use LangGraph prebuilt + the governance wrapper; deterministic flows use hand-written graphs |
| Model access | OpenAI-compatible protocol | One client covers DeepSeek/Qwen/GLM/vLLM/Ollama; vendor-native SDKs added as needed |
| Tool protocol | MCP (official Python SDK) | The industry standard: consume other people's tools or expose yours |
| Capability packages | Agent Skills open standard (SKILL.md) | The industry standard; existing Skill packages work with zero adaptation |
| Access layer | FastAPI + SSE | Async, auto-generates OpenAPI contracts, streams run events |
| Business storage | MySQL 8.0+ (SQLite, no install, in development) | A mature relational DB; definitions/versions/Traces/checkpoints in one store |
| Observability backend | Self-hosted Langfuse (default) | Keeps data sovereignty; monitoring UI out of the clone; switchable to LangSmith or off |
| Frontend | React 18 + Vite + TypeScript + Tailwind + shadcn/ui | Langfuse's React frontend is a reference, AI SDK streaming hooks exist, shadcn source-in-repo keeps control |
| Deployment | Docker Compose | Runs out of the clone; optional deps orchestrated as needed |

## Foundations (not replaced)

These are stack premises; replacing one equals replacing the project — outside "replaceable":

- **Python + LangChain + LangGraph**: the whole execution layer runs on LangGraph and business code targets the LangChain programming model. Changing ecosystems = rewriting.
- **FastAPI**: the access layer and OpenAPI contract chain are bound to it; frontend codegen depends on it.
- **Territory isolation structure**: `lubanagent/` (framework territory) and `app/` (your territory) physically separated + import-linter guard. This is the foundation of "a RuoYi-style base that follows upstream upgrades" — an architectural contract, not a tech choice (see the [customization overview](./overview.md)).

## Replaceable parts

The following are extension points or config switches; replacing them does not touch the core:

| Part | Default | Can become | How | Cost |
| --- | --- | --- | --- | --- |
| Observability backend | Self-hosted Langfuse | LangSmith / off (none) | Change `OBSERVABILITY_BACKEND` env; for LangSmith comment out the langfuse services in compose | Low. The core seven answers are guaranteed by the internal DB; LangGraph node-level fine-grained visualization is natively richer in LangSmith, and in Langfuse depends on adapter mapping |
| Model vendors | OpenAI-compatible (DeepSeek/Qwen/GLM/vLLM/Ollama) | Any OpenAI-compatible service; vendor-native SDKs | OpenAI-compatible: add a Model Definition + edit the DB mapping, no code change; native SDK: add factory code in `lubanagent/model/` | Compatible protocol: zero code; native SDK: one factory file |
| Business database | MySQL 8 | SQLite (development) | Change `DATABASE_URL` env | No install in development; MySQL in production |
| Vector store | Disabled | Your choice | Minimal RAG doesn't enable one by default; configure when needed | Simple agents avoid extra components |
| RAG / memory / graph orchestration / multi-agent | Disabled | Enable as needed | Definition-layer config | All optional first-class capabilities; never drag simple agents |
| Auth | Database-account sessions / API key / pluggable AuthProvider | Custom AuthProvider | Implement the `AuthProvider` Protocol and register | Platform RBAC governs its own workbench; pairs with your business gateway |
| Rate limiting | In-process | Redis etc. | Implement the `RateLimiter` Protocol | Switch to distributed when multiple business systems share |

For concrete replacement operations (full commands for models / observability / database / embedding), see [swapping models and backends](./swap-backends.md).

## The three most common replacements

### 1. Swap the observability backend (most-asked)

```bash
# Switch to LangSmith (cloud)
OBSERVABILITY_BACKEND=langsmith
LANGSMITH_API_KEY=sk-...
# Comment out the langfuse and langfuse-db services in docker-compose.yml

# No external backend at all (lightest; only the internal DB remains)
OBSERVABILITY_BACKEND=none
```

Core functionality depends on no external backend — Traces are always written to the internal DB first (source of truth); sending outward is a side channel and failures never block runs.

### 2. Swap the model

```bash
# OpenAI-compatible: repoint the DB mapping to the new key; Runs use the new model immediately — no code change, no release
# Example: point the smart slot from deepseek-chat to qwen-max
curl -X PUT http://localhost:8000/v1/brain-mappings \
  -H "Content-Type: application/json" \
  -d '{"profile": "smart", "model_key": "qwen-max"}'
# Or change slot mappings in the developer workbench
```

Vendor-native SDKs (non-OpenAI-compatible): add one factory file in `lubanagent/model/`, registered as a Model Definition. Adding a vendor touches only this module; business layers are untouched.

### 3. Turn off unused capabilities

Simple agents don't need RAG, memory, graph orchestration, or multi-agent — all are off by default. Your first agent can be "persona + brain + one Tool"; everything else is optional.

## Boundary

- Stack premises (Python / LangChain / LangGraph / FastAPI / territory structure) are foundations with no replaceability promise.
- The switching cost of replaceable parts is "edit config / add one extension-point implementation", not "rewrite the module" — this is how the "no forced dependencies, code-first" value proposition lands.
- Observability backend switching is not equivalence: core data is intact but native fine-grained experience differs; we say so honestly rather than advertise "seamless switching".
- The frontend choice (React family) is a hard choice, not in the replaceable-parts table — switching to Vue/Next loses Langfuse component reuse, AI SDK streaming, and controlled shadcn source, three ready-made benefits.
