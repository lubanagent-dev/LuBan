# Connect Real Models

Register a real model and bind the fast / smart / cheap / vision slots. Prerequisites: services running, plus usable model credentials and an endpoint. Before relying on the example, check your model provider's API, pricing, and available models.


## 1. Approach: why an agent shouldn't hard-code a model name

Imagine writing `deepseek-chat` directly into 小图's code (小图 "Little Tu" is the library-assistant persona you created in [Create your agent](./02-first-agent.md)). Three months later, one of three things happens:

- DeepSeek raises prices and you want daily conversations on cheaper Qwen — change code, release;
- DeepSeek has an outage and you want to downgrade to a backup model — change code, release;
- A vision task arrives and you need a multimodal model — surgery in the same place again.

Every time it's "change code + release", when model selection is clearly an **operations decision**, not an engineering one.

LubanAgent's solution is a layer of indirection: **logical slots**. An agent definition doesn't name a model; it states which tier of brain it needs — `fast` (quick and cheap; typically routing, classification, short tasks), `smart` (main reasoning), `cheap` (batch low-value tasks, cost-efficient at volume), `vision` (multimodal). The slot-to-model mapping lives in the database and resolves at runtime. Swapping models becomes editing one mapping row: not one character of any agent changes, and new conversations immediately use the new model.

Lay out the full resolution chain and you'll see how thin and clean this indirection is:

```text
Agent definition: brain: smart        ← only expresses "I need the main brain"
      ↓ runtime DB lookup
Slot mapping: smart → deepseek-chat  ← the one line you change to swap models
      ↓ runtime DB lookup
Model record: base_url / api_key_env / capability / unit prices
      ↓
OpenAI-compatible client sends the request
```

The agent only ever knows the slot. Who the slot points to, what that model looks like, what it costs per call — all in the DB, editable anytime.

### Why the OpenAI-compatible protocol is the default

One field in step 2's registration request deserves a preview: `factory: "openai_compat"`. It declares "which factory module connects to this model".

OpenAI's request/response format became the industry's de facto standard long ago — DeepSeek, Qwen (Tongyi), Zhipu, and self-hosted solutions like vLLM and Ollama all provide OpenAI-compatible endpoints. That means one client codebase covers most models: the three connection fields in step 2 (`base_url` + `api_key_env` + `model_name`) are the entire integration cost — no "write a new adapter per vendor" problem.

If you ever need a vendor without a compatible endpoint, the adapter code lands in exactly one module — the model factory — and agent definitions, slot mappings, tools, and the knowledge base are all unaffected. Converging adapter differences into a narrow point is the precondition for this design lasting: **abstractions will break, so the adaptation point must be narrow**.

The mechanism has a hidden bonus: **billing**. Register a model with unit prices (per 1k input/output tokens), and every Run's token consumption converts to money attributed per agent — every cent you spend is traceable to its source.

Break the billing chain into its three steps:

1. **Consumption logging**: each Run records the actual input/output token consumption into its Trace — measured values, not estimates;
2. **Price conversion**: tokens × the two unit-price fields entered at registration = the cost of this Run — which is why the prices must be entered correctly, or conversion is impossible;
3. **Attribution per agent**: cost hangs on the Run, the Run hangs on the agent — per-agent cost statistics balance out.

All three steps happen inside the framework; no vendor billing system is queried — which is also why it's **real-time**: the moment a conversation ends, its cost is in the Trace. No end-of-month reconciliation.

Finally, FakeLLM's exit: it isn't uninstalled; it just stops being referenced by slots. Whenever you want a zero-cost chain test, point the slot back to `fake-chat` — the fake brain is always standing by.

That "standing by" isn't nostalgia; it's an engineering tool. You've been relying on it since the local-run and definition pages: zero-key full-chain runs, deterministic regression in CI, demos that don't burn money — all thanks to a fixed-behavior, always-on, never-crashing fake brain. Once real models take over, it retreats backstage, but every time you need to answer "is this a chain problem or a model problem", the first move is switching back to `fake-chat` as the control. Build that habit today.

### Why the framework is designed this way

Three design points, each mapped to a real trouble you'll eventually hit:

**Why do slots live in agent definitions while models live in the database, instead of letting agents configure model names directly?** Because their change cadences differ completely: an agent's persona, tools, and boundaries are engineering assets — changing them involves tests and review; model selection is an operations decision that can change anytime. Isolating the high-frequency change (the model) from the low-frequency one (the agent) lets each move at its own rhythm. This is the other half of [Create your agent](./02-first-agent.md)'s "definitions in DB, versioned" — version snapshots pin the behavior contract and shouldn't be dragged around by model selection.

**Why does the key use `api_key_env` to reference an environment variable instead of storing the key in the database — or worse, letting you pass it per request?** Count the leak surfaces: stored in code, it enters git history; stored in YAML, it travels with definition exports; passed per API request, it lands in service logs and Traces. Referencing the environment variable's name instead of the key itself means the key lives only in the service process's environment — a DB export, a shared definition, or a log review never yields the key.

**Why do the unit-price fields (`input_price_per_1k` / `output_price_per_1k`) live in model registration rather than a global config?** Because "cost = tokens × unit price", tokens are recorded per Run, and a unit price can only belong to a model — the same smart slot pointed to model A last week and model B this week; each period's costs must convert at their own prices. Prices follow the model, so per-agent, per-model, per-day cost attribution balances. Step 9 verifies one such bill hands-on.

## 2. Steps

These steps prepare model connections and slot mappings for the tool-calling, eval, and deployment pages that follow.

### Step 1: Configure the API key

Open `.env` (the file you copied from `.env.example` in [Local run](./01-setup-and-first-run.md)), find the `DEEPSEEK_API_KEY=` line, and put your key after the equals sign:

```
DEEPSEEK_API_KEY=sk-your-key
```

Fill in **the existing line** — don't `echo ... >> .env` to append at the end — the file already contains an empty `DEEPSEEK_API_KEY=` line, and appending leaves two same-named keys: it runs, but it's dirty. (Get the key from platform.deepseek.com. For other providers, fill the corresponding `DASHSCOPE_API_KEY` / `ZHIPUAI_API_KEY` / `OPENAI_API_KEY` line.)

After filling the key, restart the services once for it to take effect (environment variables are read at process start; a running service won't see new values): `bash scripts/dev.sh restart`.

 Checkpoint: `grep DEEPSEEK .env` prints exactly one line, and it's your key (this file is gitignored and won't be committed — **never write keys into code or YAML under any circumstances**).

Note this discipline and `api_key_env`'s design are two sides of the same coin: the framework shields the key on the database side; don't hand-deliver it into git on the `.env` side.

By the way, the empty `DEEPSEEK_API_KEY=` line in `.env.example` has been waiting for you since you copied the file in [Local run](./01-setup-and-first-run.md) — that convention never changed.

### Step 2: Register the model with the model factory

With services running (`bash scripts/dev.sh start`), run:

```bash
curl -X PUT http://localhost:8000/v1/models -H "Content-Type: application/json" -d '{
  "key": "deepseek-chat", "provider": "deepseek", "model_name": "deepseek-chat",
  "factory": "openai_compat", "api_key_env": "DEEPSEEK_API_KEY",
  "base_url": "https://api.deepseek.com/v1",
  "capability": {"tool_calling": true},
  "params": {"input_price_per_1k": 0.002, "output_price_per_1k": 0.008}
}'
```

Reading the request: `api_key_env` says "read the key from this environment variable" (it does not transmit the key); `base_url` is the OpenAI-compatible endpoint (for vLLM/Ollama, your self-hosted address); the two unit-price fields in `params` feed cost attribution — use DeepSeek's current published prices; the numbers below are the prices at the time of this guide's writing and can be updated anytime. The same registration can also be done visually via the workbench **Models page**.

Don't miss another field: `capability: {"tool_calling": true}`. This is the model's **declared** capability at registration — the framework validates before executing: if an agent wants to call tools but the slot resolves to a model that declared no tool-calling support, the request won't be sent as-is; it degrades in a controlled way to a capable model. The pitfall of declared-vs-actual capability mismatch (some open-source models claim tool-calling with unstable formatting) is quarantined at registration as a data problem, rather than a runtime mystery.

In terms of the resolution chain from section 1, this step inserts a row into the layer below the slot mapping — the model record table. Neither the agent nor the slot knows it exists yet.

Expected result: HTTP 200 with model details. `deepseek-chat` appears on the workbench Models page.

### Step 3: Bind it to the smart slot

```bash
curl -X PUT http://localhost:8000/v1/brain-mappings -H "Content-Type: application/json" \
  -d '{"profile": "smart", "model_key": "deepseek-chat"}'
```

Expected result: HTTP 200. Confirm via the query mapping: `curl http://localhost:8000/v1/brain-mappings?env=dev` shows smart pointing to deepseek-chat.

At this point, the entire resolution chain from section 1 is connected: 小图 (brain: smart) → smart (deepseek-chat) → model record (api.deepseek.com). The next conversation goes through the real model.

### Step 4: Payoff time — ask 小图 who it is

In the debug console, pick `my-lib-assistant`, and type: `你是谁？能帮我做什么？` ("Who are you? What can you do for me?")

Expected result: a reply **spoken in your persona** — it calls itself 小图, lists lending lookup / card loss / rules consultation as its scope, and suggests the front desk for out-of-scope asks. Compare with [Local run](./01-setup-and-first-run.md)'s fixed line — that's the difference a real brain makes.

This moment deserves a pause: the YAML you wrote in [Create your agent](./02-first-agent.md) was never modified, yet its expressiveness went from "repeater" to "living person". **The definition didn't change; capability did — only the endpoint of the resolution chain beneath the definition changed.**

### Step 5: Watch a real tool call

Switch to `customer-service-bot` (it has tools). In the debug console type: `帮我查一下订单 ORD-1001` ("Look up order ORD-1001 for me")

Expected result: the reply contains real order data like "无线蓝牙耳机" (wireless Bluetooth headphones) and "299 元" (¥299) — served by the Mock business service on local port 9100 (the customer service example's fake order system). If it reports a connection failure, start it first:

```bash
.venv/bin/python -m demos.customer_service.mock_services   # occupies a terminal; use a new window or append &
```

Then re-run [Local run](./01-setup-and-first-run.md)'s curl (`curl -N -X POST .../customer-service-bot/runs -d '{"input": "帮我查一下订单 ORD-1001"}'`) — this time the event stream gains two frames:

```
event: tool.started      ← the model decided to call query_order
event: tool.finished     ← the code actually fetched the order data from 9100
```

[Agent concepts](./00-primer.md)' "the model speaks, the code acts" is now on your terminal.

Also calibrate your reading of event streams: the `tool.started` / `tool.finished` pair is the ECG of future troubleshooting. The model claims "I looked it up" but no started appeared — it's fabricating; started appeared but finished is missing — the tool is stuck or timed out; finished returned but the answer is wrong — the answer-composition stage failed. Three-stage localization beats "something's off, dunno what" by miles. [Write business tools](./04-write-a-tool.md) upgrades this into a full troubleshooting flow.

Memorize the pair's meaning: `tool.started` means the model has decided and the framework began executing; `tool.finished` means code execution completed and the result was fed back to the model. In later pages you'll produce such a pair yourself.

### Step 6: Walk a human approval

On the /chat page pick `customer-service-bot` and type (**include the refund reason** — per its SOP the model verifies first; the message reads "I want a refund for order ORD-1006, 899 yuan, quality problem, the keyboard keys are faulty"):

```
我要退订单 ORD-1006 的款，899 元，质量有问题，键盘按键失灵
```

Expected result: **Approve / Reject buttons** appear in the chat bubble — ¥899 exceeds the ¥500 approval line, `refund_apply` is a high-risk tool, and the code halts execution pending a human nod. Click **Approve**; the refund executes for real (the Mock service returns a refund number) and the conversation continues. In the event stream: `tool.approval.requested` → your click → `tool.approval.resolved`.

Notice who is doing the blocking: not the model "choosing" not to refund — it's the code gate. Asking the model to "promise" in its prompt not to spend recklessly was already shown not to work in [Agent concepts](./00-primer.md). The 899 元 refund was blocked by one field in the `refund_apply` tool's declaration, enforced by the framework before execution. In [Write business tools](./04-write-a-tool.md) you'll write such a high-risk tool yourself — `approval_required=True`, a one-parameter affair.

Also remember the full chain of this experience — it's the standard narrative for explaining "the AI won't run wild" to stakeholders in production: the model initiates → the code judges high-risk → halts for a human → human approves → real execution → full trace. Every link is auditable; none relies on model self-discipline.

### Step 7: Brain-swap demo — change the mapping, not the code

Point the smart slot back at fake (to demo the swap mechanism itself):

```bash
curl -X PUT http://localhost:8000/v1/brain-mappings -H "Content-Type: application/json" \
  -d '{"profile": "smart", "model_key": "fake-chat"}'
```

Ask 小图 "你是谁" ("Who are you?") in the debug console — back to the fixed line. Swap it back:

```bash
curl -X PUT http://localhost:8000/v1/brain-mappings -H "Content-Type: application/json" \
  -d '{"profile": "smart", "model_key": "deepseek-chat"}'
```

Expected result: between the two rebinds, 小图's YAML, its definition in the DB, and the code — **not one character changed**, yet the behavior switched entirely. That's the felt meaning of "changing models = changing a DB mapping". You can also bind a second real model to the cheap slot and compare output and cost.

Note also: **brain swaps are immediate and per-conversation**. Conversations already in flight are unaffected; new conversations use the new model immediately. Production canary switches and outage downgrades use exactly this same action.

### Step 8: Verify a restart doesn't undo it (important)

This pitfall deserves its own verification: many people configure a real model, restart the service one day, and find "why is it the fake line again" — that was old-version init behavior (unconditionally overwriting slots). Not anymore:

```bash
bash scripts/dev.sh restart
```

Expected result: after restart, 小图 still answers with the real model (the smart slot is still deepseek-chat; check the workbench Models page). `luban init`'s seeding **only fills empty slots**: a slot with a mapping is untouched; empty slots get the fake fallback. Restart freely.

"Only fills empty slots" is the key to seeding semantics: `luban init`'s job is to make the system **usable out of the box** (empty slots get fake as fallback), not **to make decisions for you** (overwriting the real models you bound). After deploying to production in [Deploy and upgrade](./08-deploy.md), this semantics is the precondition for confidently restarting on your server.

This is also a general design taste: **seeding and configuration must be two kinds of operations**. Seeding handles "from nothing to something", idempotently filling blanks; configuration handles "from something to better", decided explicitly by humans. Mixing them — init overwriting existing mappings, for instance — is the root of classic incidents like "config lost after restart".

### Step 9: Compute one conversation's cost

In the workbench **Traces page**, open 小图's "你是谁" ("Who are you?") Run.

Expected result: token consumption (input/output) and cost. Verify with a calculator: cost ≈ input tokens ÷ 1000 × 0.002 + output tokens ÷ 1000 × 0.008 (0.002/0.008 are the prices at writing time — substitute the unit prices you entered at registration). One persona conversation costs a fraction of a cent; actual consumption depends on the model, input, and call count. If it shows 0, check whether you filled the unit-price fields in `params` when registering the model.

Does it balance? If yes, question 3 from the intro is answered: the framework never asked DeepSeek — **each Run's token consumption was recorded into its Trace at the end of the Run, multiplied by the unit prices you entered at registration; the cost is computed locally**. That's also why an unentered price shows 0: not a query failure — there's simply nothing to compute.

Turn this verification into a habit: after every model swap, parameter tweak, or persona change, glance at the cost change in Traces — **cost is not a month-end reconciliation chore; it's a per-change concern**. Once you deploy in [Deploy and upgrade](./08-deploy.md), this habit is your cost guardrail.

## 3. Validation

- [ ] The model is registered in the factory and the smart slot is bound to deepseek-chat
- [ ] 小图 speaks per its persona through the real model (step 4)
- [ ] You saw tool.started / tool.finished with your own eyes (step 5)
- [ ] The large refund went through approval button → Approve → execution in /chat (step 6)
- [ ] Two slot rebinds with zero agent-definition changes (step 7)
- [ ] The real-model binding survives a restart (step 8)
- [ ] The Trace shows tokens and cost (step 9)

Cross-check the intro's three questions: they land on goal 1 (slots), steps 1–2 (where the key lives), and step 9 (where cost comes from) — good moment to grade your own guesses.

How to use the checklist: don't skim — verify each item hands-on; every one corresponds to a step's concrete output. If any of the seven doesn't match, redo its step; entering later pages with "probably fine" means the debt gets collected with interest.

## 4. FAQ

Start with a triage rule: this page's problems cluster in three places — `.env` (the key), model registration parameters (unit prices, variable names), and slot mappings (what got bound where). Match the error to its home first; nine times out of ten you won't need logs.

**CONFIG_ERROR: key not found after configuration.** Check that the variable name in `.env` exactly matches the `api_key_env` used at registration (case-sensitive); restart services after editing `.env` (environment variables are read at process start).

**"连接失败" (connection failed) on order lookup.** The Mock business service (9100) isn't running. See step 5 — `dev.sh` doesn't start it automatically; run it separately.

**The model talks about the refund but no approval buttons appear.** Check whether the input included the refund reason — per the SOP (verify → compute → submit), with incomplete information the model asks follow-up questions instead of submitting the refund tool directly. By design, not a fault.

**Trace cost shows 0.** You didn't fill `input_price_per_1k` / `output_price_per_1k` at registration. Add them (a PUT re-registration works) and the next Run will carry cost.

**Back to fake lines after restart.** First make sure the "fake line" isn't residue from your own step-7 rebind to fake — check the current mapping via `curl http://localhost:8000/v1/brain-mappings?env=dev`. If init really overwrote it, that's a bug — file an issue.


## Related docs

Next task: [Write business tools](./04-write-a-tool.md). Full fields and interfaces are in [the manual](../manual/index.md).
