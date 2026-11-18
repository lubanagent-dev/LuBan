# Swapping Models and Backends

> This page collects the four "most common replacements": models, observability backends, database, and embedding model. Common thread: all are **config edits or database record edits**, not code changes. For the full list of what's replaceable vs foundation, see [tech stack and replaceable parts](./tech-stack.md).

## Swap models (three steps; no code change, no release)

An agent never binds directly to a specific model; it binds a logical brain slot (fast / smart / cheap / vision are the initial presets; you can add and rename slots in the model center). Switching models = repointing the database's environment mapping to another model key.

**Step 1: register the model** (connection info goes to the database; unit-price fields are optional but used for cost attribution):

```bash
curl -X PUT http://localhost:8000/v1/models -H "Content-Type: application/json" -d '{
  "key": "deepseek-chat", "provider": "deepseek", "model_name": "deepseek-chat",
  "factory": "openai_compat", "api_key_env": "DEEPSEEK_API_KEY",
  "base_url": "https://api.deepseek.com/v1",
  "capability": {"tool_calling": true},
  "params": {"input_price_per_1k": 0.002, "output_price_per_1k": 0.008}
}'
```

**Step 2: bind to the logical slot**:

```bash
curl -X PUT http://localhost:8000/v1/brain-mappings -H "Content-Type: application/json" \
  -d '{"profile": "smart", "model_key": "deepseek-chat"}'
```

**Step 3: effective immediately** — agent definitions stay untouched; new Runs immediately use the new model, and historical Run Traces still faithfully record the old model. You can also change slot mappings on the developer workbench "Models" page.

Everything uses the OpenAI-compatible protocol: one client covers DeepSeek / Qwen / GLM and other vendors plus self-hosted vLLM / Ollama — for self-hosted endpoints, set `base_url` and `api_key_env` explicitly on the ModelDefinition.

**Boundary**: vendor-native SDKs (non-OpenAI-compatible) require a factory file in `lubanagent/model/` — that's the framework territory; changing it will conflict with upstream (a new vendor's factory code is usually worth contributing upstream rather than maintaining yourself).

## Swap the observability backend

```bash
# Switch to LangSmith (cloud)
OBSERVABILITY_BACKEND=langsmith
LANGSMITH_API_KEY=sk-...
# Comment out the langfuse and langfuse-db services in docker-compose.yml

# No external backend at all (lightest; only the internal DB remains)
OBSERVABILITY_BACKEND=none
```

The default is self-hosted Langfuse (keeps data sovereignty; monitoring UI works out of the clone). Core functionality depends on no external backend — **Traces are always written to the internal DB first (source of truth); sending outward is a side channel and failures never block runs**. Switching backends is not equivalence: core data is intact, but each backend's native fine-grained experience differs.

## Swap the database

| Scenario | Database | How to configure |
|------|--------|----------|
| Development | SQLite (no install, zero config) | Leave `DATABASE_URL` unset in `.env` to default to SQLite; `luban migrate` creates the DB automatically |
| Production | MySQL 8.0+ | Set `DATABASE_URL=mysql+asyncmy://user:pass@host:3306/lubanagent` in `.env`; create the database first, then run `luban migrate` |

The MySQL driver needs the optional dependency: `uv pip install -e ".[mysql]"`. Migration command: `luban migrate` (equivalent to `alembic upgrade head`); rollback with `alembic downgrade -1`. The migration chain cannot skip versions.

## Swap the embedding model

The knowledge base's embedding model is configured via environment variables:

```bash
EMBEDDING_MODEL=...                      # Embedding model name
EMBEDDING_BASE_URL=...                   # Optional, OpenAI-compatible endpoint
EMBEDDING_API_KEY_ENV=...                # Optional, env var name holding the key
```

**Without configuration, a built-in deterministic demo vector is used** — enough to run the examples, not promising production retrieval quality. After switching to a real embedding model, note two things:

1. **Re-ingest** (dimensions and semantics both change; existing vectors are invalid);
2. **Retune the threshold** — the gatekeeping `score_threshold` scale differs per embedding model; use the workbench knowledge page's "Retrieval test" panel to calibrate empirically.

## Boundary

- The foundations (Python / LangChain / LangGraph / FastAPI / territory structure) carry no replaceability promise — see [tech stack and replaceable parts](./tech-stack.md).
- The switching cost of replaceable parts is "edit config / add one extension-point implementation", not "rewrite the module".
- Swapping models and observability backends are runtime data operations needing no release; swapping the database or embedding model involves migration and re-ingestion — follow the steps above.
