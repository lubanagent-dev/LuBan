# Quick start

> Goal: the shortest path from cloning the repository to seeing an Agent actually talk. No external keys required — SQLite + a FakeLLM fallback verify the **pipeline**; real intelligence comes in step 4 when you connect a real model.

## Prerequisites

- Python ≥ 3.11 (3.12 recommended), [uv](https://docs.astral.sh/uv/)
- Node.js ≥ 20 additionally, for the full stack including the workbench frontend
- Windows: run the command blocks labeled "Windows" below in PowerShell. Both PowerShell 5.1 (built-in) and PowerShell 7 work; Windows 10+ ships `curl.exe`

## 1. Install and initialize

**macOS / Linux:**

```bash
git clone https://github.com/lubanagent-dev/LuBan.git LubanAgent && cd LubanAgent
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -e ".[dev]"
cp app/config/.env.example .env   # works with zero config: SQLite + FakeLLM fallback
.venv/bin/luban migrate           # create tables
.venv/bin/luban init              # import seed agents/tools/knowledge sources
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/lubanagent-dev/LuBan.git LubanAgent; cd LubanAgent
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe -e ".[dev]"
Copy-Item app\config\.env.example .env   # works with zero config: SQLite + FakeLLM fallback
.venv\Scripts\luban.exe migrate          # create tables
.venv\Scripts\luban.exe init             # import seed agents/tools/knowledge sources
```

> Whenever a tutorial shows `.venv/bin/<command>`, replace it with `.venv\Scripts\<command>.exe` on Windows (e.g. `luban`, `uvicorn`, `python`, `pytest`).

## 2. First conversation

Verify that the Agent can actually talk (no model key needed, FakeLLM fallback — replies are canned lines):

**macOS / Linux** (start the server in the background, verify with curl):

```bash
.venv/bin/uvicorn app.main:create_app --factory --port 8000 &
curl -N -X POST http://localhost:8000/v1/agents/customer-service-bot/runs \
  -H "Content-Type: application/json" \
  -d '{"input": "hello"}'
# SSE event stream: run.started → token.delta… → run.completed
```

**Windows (PowerShell)**: start the server in the foreground in one terminal, then verify with `curl.exe` from another (bare `curl` in PowerShell is an alias for `Invoke-WebRequest`, so you must type `curl.exe`):

```powershell
# Terminal 1: start the server
.venv\Scripts\uvicorn.exe app.main:create_app --factory --port 8000
```

```powershell
# Terminal 2: verify the conversation
curl.exe -N -X POST http://localhost:8000/v1/agents/customer-service-bot/runs `
  -H "Content-Type: application/json" `
  -d '{\"input\": \"hello\"}'
# SSE event stream: run.started → token.delta… → run.completed
```

## 3. Run the full local stack (backend API + workbench frontend)

**macOS / Linux:**

```bash
scripts/dev.sh start    # workbench http://localhost:5173 , API http://localhost:8000
                        # the first run performs npm install for the frontend (about 1 minute), then startup is instant
```

**Windows (PowerShell):**

```powershell
.\scripts\dev.ps1 start    # equivalent to dev.sh: workbench http://localhost:5173 , API http://localhost:8000
                           # the first run performs npm install for the frontend (about 1 minute), then startup is instant
                           # if blocked by ExecutionPolicy: powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 start
```

For the workbench management pages (log inspection, user permissions, assignments and quotas, audit events) and the end-user chat entry (`/chat`, with `PORTAL_ENABLED=true` the `/portal` signup/login adds session persistence and a file panel), see [Developer workbench](./features/workbench.md).

## 4. Connect a real model (two steps)

Put the provider API key into `.env`, then register the model through the workbench "Models" page or the API and bind it to a logical slot (connection details live in the database — switching models requires no code change or release):

```bash
DEEPSEEK_API_KEY=sk-xxx        # or DASHSCOPE_API_KEY / ZHIPUAI_API_KEY / OPENAI_API_KEY
```

```bash
# 1. Register the model (connection details go to the DB; unit prices feed cost attribution and are optional)
curl -X PUT http://localhost:8000/v1/models -H "Content-Type: application/json" -d '{
  "key": "deepseek-chat", "provider": "deepseek", "model_name": "deepseek-chat",
  "factory": "openai_compat", "api_key_env": "DEEPSEEK_API_KEY",
  "base_url": "https://api.deepseek.com/v1",
  "capability": {"tool_calling": true},
  "params": {"input_price_per_1k": 0.002, "output_price_per_1k": 0.008}
}'
# 2. Bind to a logical slot (agent definition untouched; new Runs immediately use the new model)
curl -X PUT http://localhost:8000/v1/brain-mappings -H "Content-Type: application/json" \
  -d '{"profile": "smart", "model_key": "deepseek-chat"}'
```

Any OpenAI-compatible service (self-hosted vLLM / Ollama endpoints) also works: specify `base_url` and `api_key_env` explicitly in the ModelDefinition.

## 5. One-command full stack (Docker)

Start a complete demo stack with zero configuration: app (including the workbench UI) + MySQL 8 + Langfuse (observability) + mock-biz (the customer-service sample business service).

```bash
docker compose up -d --build       # about 3-5 minutes on first run (includes the frontend build)
# the app container runs luban migrate && luban init automatically at startup (idempotent, safe to restart)
#   workbench + API   http://localhost:8000    (the UI is served by FastAPI on the same port)
#   end-user chat     http://localhost:8000/chat
#   Langfuse        http://localhost:3000
#   mock-biz          http://localhost:9100
```

For production, see the [Deployment checklist](./deploy.md).

## Next steps

- Build your own business: the [Development guide](../tutorial/index.md), organized by task
- Look up fields and boundaries feature by feature: the [User manual](./features/agent-definition.md) in the sidebar
- Adapt the base to your business: [Customization](./customization/overview.md)
