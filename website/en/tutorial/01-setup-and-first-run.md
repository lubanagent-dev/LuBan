# Local Run

Install and start the local API and workbench, then verify one conversation, SSE events, and a Trace. Requires Python ≥3.11 and uv; running the workbench additionally requires Node.js ≥20. The default SQLite and FakeLLM setup needs no external keys — the fixed reply exists only to validate the chain.

## 1. Approach: what exactly are you installing

**Why clone the repo instead of `pip install`?** Because your relationship with LubanAgent is not "using a library" — it's "moving into a base". You'll write your own agents and tools inside it for the long haul, and that code lives in the repo's `app/` directory. An analogy: using a library is like renting a hotel room; a base is like getting the keys to an unfinished apartment — the structure belongs to someone else, the interior is yours, and when the property management (framework) upgrades, your interior isn't demolished. The boundary between your territory `app/` and the framework territory `lubanagent/` was covered in [Agent concepts](./00-primer.md); from this page on you'll see it every time you open the repo.

**What the three commands each do.** The `migrate`, `init`, and `start` you're about to run aren't three incantations — each does exactly one thing:

- `luban migrate` — creates tables. Builds the full table structure in the database (SQLite during development — a local file, nothing to install).
- `luban init` — seeds the database. Writes the repo's built-in seeds (a fake model + YAML definitions of 9 agents) into the database.
- `scripts/dev.sh start` — starts services. The backend API runs on port 8000; the workbench frontend on 5173.

By the end of this page, four things will live on your machine — note them now so troubleshooting later doesn't panic you:

| Resident | What it is | Where it lives |
| --- | --- | --- |
| Backend API | FastAPI; entry point for all REST/SSE requests | :8000 |
| Workbench frontend | Vite dev server | :5173 |
| Database | Local SQLite file (nothing to install); table structure + seed data inside | Path per `.env` config |
| Fake brain | FakeLLM, bound to the four initial slots by default on an empty DB | The database's model registry |

One mental model to establish right now — [Create your agent](./02-first-agent.md) will use it immediately: **YAML is the feeding port; the database is the storage**. `luban init` pours the definitions in `app/agents/*.yaml` into the database, and from then on the system reads the DB, not those YAML files. So editing a YAML does not take effect automatically — you must re-run `luban init`. Remember this; you'll verify it hands-on in the next page.

**How far can you get with zero keys?** Two fallbacks let you stand up the full environment with no keys at all: SQLite for the database, FakeLLM for the model. FakeLLM is a "fake brain" — it walks the entire conversation flow (event stream, Trace, memory, all present) but always replies with the same fixed line. Its purpose is to let you verify "the chain works" at zero cost; actually looking up orders, answering FAQs, and running approvals need real intelligence, which arrives in [Connect real models](./03-real-models.md) (you'll need an LLM API key then; costs follow the provider's actual billing).

One last territory refresher, because real development starts with the next page: `lubanagent/` is the framework territory — in principle you don't touch it. The API layer, SSE protocol, and Trace persistence used in this page all live there; `app/` is your territory — the agent YAMLs of [Create your agent](./02-first-agent.md) and all your future tools and flows live here. Two CI guards watch this boundary: import-linter blocks reverse dependencies (the framework may not import your code), and the `.lubanagent-upstream` manifest blocks upstream changes from touching your territory — that's the mechanism behind "upgrade without losing your changes", which you'll rehearse hands-on in [Deploy and upgrade](./08-deploy.md).

### Why the framework is designed this way: four decisions that look redundant

This section answers four "whys" that will occur to you sooner or later while following the steps. Their common feature: the answer is never "what's fastest", it's "what won't bite you three months from now".

**Why are table creation (migrate) and seeding (init) two separate commands instead of one "one-click init"?** Because they are two kinds of change: migrate changes **structure** (fields, indexes), init changes **data** (import/update agent definitions). Kept separate, you can re-run seeds without touching the schema, and re-run migrations alone after an upgrade. Their idempotency semantics are separate too: migrate is idempotent via version numbers (no-op once at `head`), init via content comparison (detailed next section). Merge them into one command and both semantics tangle. By the way: in [Deploy and upgrade](./08-deploy.md) you'll see the Docker image runs both together at startup — that's deployment-layer orchestration; at the engine level they remain two actions.

**Why is init idempotent instead of "error on second run"?** Imagine a real scenario: your deploy script runs initialization on every release. If init weren't idempotent, the second run would explode and you'd patch the script with "check first, then run" workarounds. Idempotency makes "repeat = harmless" a framework guarantee rather than your scripting skill — a classic trade of moving complexity from the user side into the framework side. In [Create your agent](./02-first-agent.md) you'll see its finer side: no content change → no new version; changed content → +1.

**Why SQLite in dev and MySQL in production?** Because the fewer thresholds on day one, the better — SQLite is a file: no service to install, no account to configure, `rm` it to reset. Production wants concurrency and durability, which is MySQL's job. The key point: **both sides share the same code path** — switching databases = changing one connection setting; not one character of your agents, tools, or flows changes. The base absorbs the tension between "easy dev" and "solid production" for you.

**Why is the default model FakeLLM?** Because it decouples two classes of problems: chain problems (installed wrong? service up? event stream flowing?) and intelligence problems (does the model answer well?). With zero keys, chain problems must be able to surface independently — if you connect a real model on the very first run, you can't tell whether an error is a broken environment or an unreachable model. After connecting a real model you'll thank FakeLLM for another benefit: it lets tool calls, Traces, and evals be covered by automated tests — hundreds of tests in this repo without spending a cent on API calls.

## 2. Steps

### Step 1: Clone and install

```bash
git clone https://github.com/lubanagent-dev/LuBan.git luban-tutorial   # name is up to you; below we call it "repo root"
cd luban-tutorial
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -e ".[dev]"
```

Taking the commands apart: `uv venv` creates an isolated Python virtual environment (your dependencies don't pollute system Python; if things go wrong, delete `.venv` and start over); `-e ".[dev]"` installs LubanAgent itself in **editable mode** plus the dev extras — pytest, ruff, and the rest of the dev toolchain. You won't need them for this guide, but you will when writing tests and running lint later. Editable mode means changes to `app/` take effect as soon as services restart — no reinstall.

Expected result: installation output scrolls and ends without red errors. About 2–5 minutes the first time (network dependent).

> Windows users: `.venv/bin/` in the commands is `.venv\Scripts\` on your machine.

### Step 2: Configure

```bash
cp app/config/.env.example .env
```

Expected result: a `.env` file appears in the repo root. Don't change anything yet — open it and glance: database, observability, and auth groups, all with defaults, none of which you need to touch now.

Why touch nothing? Because the defaults are tuned for "zero-key first run": the database points to SQLite, the observability backend is off, auth is in dev mode. This step's purpose is to show you **which knobs exist** — when [Connect real models](./03-real-models.md) asks for an API key and [Deploy and upgrade](./08-deploy.md) asks for an observability backend, what you edit is always here.

### Step 3: Create tables + seed

```bash
.venv/bin/luban migrate
.venv/bin/luban init
```

Order matters: tables first, or the seeds have nowhere to land. init writes data into the database — if the tables don't exist, what would it write?

Expected result: `migrate` prints an Alembic migration log (Alembic is the DB schema migration tool) ending in `Running upgrade ...` and `migrated to head`; `init` prints 9 agents line by line, each like `cs-faq@1` — `@1` means first import, version 1.

Run `luban init` once more: this time the output is `cs-faq@1 (unchanged)` — no content change, no new version. init is idempotent; repeating it is safe — you'll rely on this behavior in [Create your agent](./02-first-agent.md) to verify "a new version appears only when the YAML changed".

Note that `(unchanged)`: init doesn't judge "was this agent imported before" but "is this content identical to the latest version in the DB". Same content, a hundred runs — still one version. Keep this detail in mind; it's the star of the next page.

### Step 4: Start the services

```bash
bash scripts/dev.sh start
```

The first run auto-runs `npm install` for frontend dependencies (about a minute; near-instant afterwards).

Expected result: `bash scripts/dev.sh status` shows —

```
后端 :8000 跑中 (pid ...)
前端 :5173 跑中 (pid ...)
```

Two ports, two processes: the backend is FastAPI (8000), the frontend is the Vite dev server (5173). They run separately during development so frontend hot-reload doesn't touch the backend; in [Deploy and upgrade](./08-deploy.md) you'll find both merged into a single port 8000 — that's the production shape, ignore it for now.

Open http://localhost:5173 in a browser; the left side is the workbench navigation (Agents / Prompt library / Models / Tools / Skills / Knowledge / Graphs / Traces / Evals). At the top of the navigation there are two more entries — "调试台" (debug console) and "用户端聊天" (user chat) — used in steps 6 and 7 respectively.

### Step 5: A lap around the workbench

Don't chat yet — click through the 9 pages first to get acquainted:

A table makes the tour stick better — one row per page; the last column is the development task where that page will later be "home turf":

| Page | What it holds | Covered in detail when |
| --- | --- | --- |
| **Agents** | List of the 9 built-in agents — versions, status, debug entry all here. Your own agents will live here too | [Create your agent](./02-first-agent.md) |
| **Prompt library** | Persona templates | See the [prompt library manual](../manual/features/prompt-library.md) when needed |
| **Models** | Model registry ([Connect real models](./03-real-models.md) returns here) | [Connect real models](./03-real-models.md) |
| **Tools / Skills** | Tools and capability packs agents can call | [Write business tools](./04-write-a-tool.md) |
| **Knowledge** | Document upload and chunking (home turf of [Configure knowledge retrieval](./05-knowledge-rag.md)) | [Configure knowledge retrieval](./05-knowledge-rag.md) |
| **Graphs / Traces / Evals** | Graph topology, run replay, eval reports | Covered one by one in the evals, flows, and deploy guides |

Right now every page holds "someone else's stuff" — that's normal. This step has exactly one purpose: **build a mental index** — when [Configure knowledge retrieval](./05-knowledge-rag.md) says "go to the Knowledge page", you won't have to hunt. Whenever you forget what a page does, come back to this table.

Expected result: the Agents page lists 9 agents, with `customer-service-bot` (the built-in customer service agent "小鲁") at the top.

### Step 6: Debug console — first conversation

**Agents page → `customer-service-bot` → enter the debug console** (or open http://localhost:5173/agents/customer-service-bot/debug directly), and type:

```
你好
```

Expected result: the reply is —

```
你好，我是 LubanAgent。
```

Whatever you ask, it's this line. **This is expected behavior, not a bug**: with zero keys on an empty database, all four initial slots (fast/smart/cheap/vision) are bound to FakeLLM, and its script has exactly one line. Slots can be added, edited, and renamed in the model center — not limited to these four (see the [model center manual](../manual/features/models.md)). What you need to confirm at this step: the conversation chain works — input is received, a Run executes, the reply streams back.

Try a couple more ("帮我查订单", "你是谁") and you'll confirm: it doesn't even read the persona — "我是 LubanAgent" is not the 「小鲁」 persona written in `customer-service-bot`'s definition. FakeLLM ignores definitions; it only keeps water flowing through the pipe. Whether the water is real is [Connect real models](./03-real-models.md)'s business.

### Step 7: User chat page

Open http://localhost:5173/chat — this is the end-user view without the admin sidebar. Pick `customer-service-bot` and say something.

Expected result: a chat interface with a greeting (the greeting comes from the agent definition's `greeting` field — static text from the definition, no model needed), and the reply is still the fixed line.

Note the contrast: the greeting is "alive" (from the definition), the reply is "dead" (from FakeLLM's script). You've now touched one boundary of this framework: **the definition decides what the agent looks like; the model decides what it thinks** — the former works with no key at all, the latter is [Connect real models](./03-real-models.md)'s job.

### Step 8: Watch the raw event stream with curl

The GUI hides the details; now peel it open. Run:

```bash
curl -N -X POST http://localhost:8000/v1/agents/customer-service-bot/runs \
  -H "Content-Type: application/json" \
  -d '{"input": "你好"}'
```

The `-N` disables curl's output buffering — SSE pushes events one by one; with buffering on, you'd get one big lump and never feel the "stream". The `customer-service-bot` in the URL is the agent key: **one URL path identifies one agent** — the mini graph you build in [Create your agent](./02-first-agent.md) will use the same format.

Expected result: a series of `event: ...` / `data: {...}` frames in which you can recognize the event types from [Agent concepts](./00-primer.md) —

```
event: run.started        ← the start, with run_id
event: token.delta        ← a few characters per frame (even the fixed line "streams")
event: run.completed      ← the end, data carries the full output
```

A standard frame is two lines: the `event:` line gives the event name, the `data:` line gives the JSON payload. When you write consuming code later, it does exactly two things: dispatch by event name, extract fields from the payload — no matter how many event types appear later, it's the same parsing logic.

This is an SSE (Server-Sent Events) stream — the stream your business system will consume when integrating LubanAgent. Note what is **missing** in this run: no `tool.started` or similar tool events — FakeLLM makes no tool decisions. After connecting a real model ([Connect real models](./03-real-models.md)), the same command gains a `tool.started` → `tool.finished` pair — you'll come back and re-run it for comparison.

Reconciling "preview" and "observed", FakeLLM's boundary is plain:

| Event previewed in [Agent concepts](./00-primer.md) | Appeared here? | Why |
| --- | --- | --- |
| run.started | Yes | Sent on every Run |
| token.delta | Yes | Even the fixed line streams out |
| tool.started / tool.finished | No | FakeLLM makes no tool decisions |
| run.completed | Yes | Always sent at the end |

Why force you through curl? Because the workbench is just one consumer of this API. When you later integrate an agent into your own business system, what you integrate against is this raw stream — understanding it today means that tomorrow, while debugging an integration, you can distinguish "my client parsed wrong" from "the server really didn't send this event". One more engineering habit to note: **when a UI behavior confuses you, go behind it and watch the raw API** — this habit will save you in [Configure knowledge retrieval](./05-knowledge-rag.md) when tuning retrieval and in [Evals and regression](./06-evals.md) when reading eval details.

### Step 9: Replay the scene you just made

In the workbench **Traces page**, find the most recent Run (the one from curl just now) and click in.

Expected result: the full scene of this Run — which model was used (`fake-chat`), when it started and ended. The tool-call area is empty (no tools were called), but the structure is all there.

This is exactly what [Agent concepts](./00-primer.md) meant by "every event leaves a trace". From now on, when your agent says something unreliable, come here for the scene — after [Connect real models](./03-real-models.md), this page will also fill in with tool inputs/outputs and token consumption.

One architecture fact that [Deploy and upgrade](./08-deploy.md) will use: Traces land in the **internal database** first — it is the source of truth and doesn't defer to any third party; observability platforms like Langfuse and LangSmith are bypass dual-writes: connect, swap, or turn them off as you wish. What you see on this page today never depends on any external SaaS.

### Step 10: Wrap up (optional)

```bash
bash scripts/dev.sh stop
```

Expected result: `status` shows both processes gone. To run again, just `start` (database and seeds persist — no need to migrate/init again).

Worth chewing on: between stop/start cycles, **state is persistent** — it lives in the SQLite file, not in process memory. That's the confidence behind step 2's "no config changes needed": the environment is set up once and reused, not rebuilt from zero at every launch.

### Command cheat sheet

Five commands collected here — you'll use them again before deploying in [Deploy and upgrade](./08-deploy.md):

| Command | What it does | Repeat-safe? |
| --- | --- | --- |
| `.venv/bin/luban migrate` | Create tables (Alembic migrate to head) | Safe; no-op at head |
| `.venv/bin/luban init` | Seed the DB (fake model + 9 agents) | Safe; `(unchanged)` when content is the same |
| `bash scripts/dev.sh start` / `stop` | Start / stop front and back ends | — |
| `bash scripts/dev.sh status` | Check front/back-end process status | — |
| `curl -N -X POST http://localhost:8000/v1/agents/customer-service-bot/runs ...` | Watch a Run's raw SSE event stream | — |

Distinguish two command classes: `migrate` and `init` are one-time infrastructure (run occasionally); `start` / `stop` / `status` are daily switches (used every day). Knowing which is which tells you what to memorize and what to look up when forgotten.

## 3. Validation

- [ ] `luban init` printed 9 agents; running it again shows all `(unchanged)`
- [ ] The workbench at http://localhost:5173 opens and you've clicked through all 9 pages
- [ ] One conversation in the debug console and one in /chat, both with the fixed reply (expected behavior)
- [ ] You can visually identify run.started / token.delta / run.completed in curl output
- [ ] The Traces page replays the most recent Run and shows model fake-chat

Once all boxes are checked, these validations are done. Missing one? Return to its step.

## 4. FAQ

**It doesn't look up orders or answer FAQs — still the fixed line.** Expected behavior, not a pitfall — with zero keys FakeLLM does no tool calls and no retrieval; it only proves the chain works. Order lookup, approval, and FAQ citations begin in [Connect real models](./03-real-models.md).

**`scripts/dev.sh` says permission denied.** Run it explicitly with bash: `bash scripts/dev.sh start` (all commands in this guide are written that way), or `chmod +x scripts/dev.sh` once.

**Port already taken.** If either `8000` (API) or `5173` (frontend) is occupied, that service won't start. Use `lsof -i :8000` to find and stop the offending process.

**`npm install` hangs or fails.** Network issue, usually the npm registry. Switch to a China mirror (`npm config set registry https://registry.npmmirror.com`), delete `lubanagent/ui/node_modules`, and retry.

**`luban init` reports a database error.** Nine times out of ten you skipped `luban migrate` (tables don't exist yet). Follow step 3's order.

A general troubleshooting habit worth more than any single pitfall: **when stuck, run `bash scripts/dev.sh status` first**. Three symptoms, three diseases — service isn't running (go start it), service runs but a checkpoint doesn't match (redo the last green checkpoint), service runs and all checkpoints are green but it's still wrong (file an issue). Never chain three commands without verifying the previous one — otherwise you'll never know which step broke.


## Related docs

Next task: [Create your agent](./02-first-agent.md). Full fields and interfaces are in [the manual](../manual/index.md).
