# Create Your Agent

Create the library lending assistant example and verify how agent definitions are imported, stored, and versioned. Prerequisites: local services running. YAML is the import port; at runtime the definition is read from the database. To verify real replies, you'll also need to connect a real model.

## 1. Approach: an agent is configuration, not code

Recall the traditional approach: an AI assistant's persona (system prompt), its available tools, and its rules are all hard-coded. Changing one persona sentence = changing code = a full commit, review, build, and release cycle. Why should something you tune three times a day go through a release process?

Release processes are designed for things that "change once and stay stable for ages" — engines, protocols, data structures. A persona isn't. A persona is an **operations asset**: friendlier tone today, tighter service boundaries tomorrow, a new requirement from the head librarian the day after. Operations assets shouldn't ride the release train. LubanAgent's answer: definitions are **database records** — runtime-editable, versioned in the database. Each edit creates a new immutable version; every Run binds to the exact version it ran, so last Wednesday's complaint can always be traced to the definition version that was live — not "probably that version", but a documented fact. Audits, retrospectives, and eval comparisons all stand on this foundation.

So what is YAML for? **The feeding port.** The repo's built-in `app/agents/*.yaml` files are "source drafts" of definitions; `luban init` pours them into the database. From then on, the system reads the DB, not the YAML — so editing a YAML requires re-running `luban init` to take effect. You've heard this division of labor before; this page you verify it hands-on.

Chart a definition's life — five stations:

```text
YAML draft (app/agents/*.yaml)
   │  luban init (parse → validate → compare → store)
   ▼
Database current version (the single truth; the system reads only this)
   │  on every content change
   ▼
Immutable history (v1, v2, … — exportable, traceable)
   │  on every Run start
   ▼
Run binds to the definition version of that moment (exact traceability later)
   │  luban export
   ▼
YAML file (take away, back up, migrate to another database)
```

Walking the five stations, every one has clear entry conditions: YAML must pass validation before landing, versions are appended only when content changes, and Runs bind to snapshots rather than "whatever is latest". No station relies on luck.

A minimal definition has only two required fields: `name` (the agent's key) and `instruction` (the system prompt). Everything else is progressive enhancement — this page uses only `greeting` (the welcome message), `brain` (the logical slot, detailed in later pages), `memory` (memory strategy), and `limits` (governance limits: steps / token budget / timeout). Two more fields work without any deep understanding: `description` is a one-line intro shown in the workbench list; `io_contract` declares input/output shape — text/text throughout this guide, just copy it. Tools, knowledge, and skills come later. Don't memorize the full field table — the [agent definition manual](../manual/features/agent-definition.md) is your dictionary; look things up when needed.

"Progressive enhancement" means: two required fields are enough to run, and each new field answers a new class of question. Each field actually has its own reader:

| Field | Who "reads" it | When it takes effect |
| --- | --- | --- |
| `instruction` | The model | Every Run, as the system prompt |
| `greeting` | The user | First glance into a session (static text, bypasses the model) |
| `description` | Developers | One-line intro in the workbench list |
| `limits` | The framework (governance layer) | Hard step/budget/timeout boundaries on every Run |
| `io_contract` | Callers | Declares input/output shape |

One more note: this page's `instruction` uses the "inline" style. When your prompts multiply, there's also a Prompt-library reference style — persona templates managed separately and reused across agents; see the [prompt library manual](../manual/features/prompt-library.md). This page stays inline: fewest fields, least mental overhead.

Meet `limits` too, even though this page never triggers it: `max_steps: 12` means one Run walks at most 12 steps (each model "thinking round" or tool call counts as one), `budget_tokens: 50000` is the token budget for the Run, `timeout_sec: 120` is the timeout. These are basic runtime constraints: **an agent doesn't get to run as many steps as it likes** — runaway loops must be cut off at the framework layer, not trusted to model self-discipline. This page's conversations end in one turn so they never hit these boundaries; they start to matter in [Write business tools](./04-write-a-tool.md) once tools are attached.

### Why the framework is designed this way: four "why nots"

**Why not keep the persona in code?** Code's strengths are precision, testability, and controlled change — but every change pays the full delivery pipeline. Personas are precisely **high-frequency, low-risk, fast-iteration** changes — when they're wrong, the worst outcome is an odd tone, not an outage. Separate the frequently-tried from the rarely-changed: personas go into the database (fast edits, instant effect, versioned rollback), execution logic stays in code (tested, reviewed). This cutting line is the same principle as [Agent concepts](./00-primer.md)' "deterministic rules in code", seen from the other side: **the changing, human-judged goes to config; the fixed, guaranteed goes to code**. The difference is most visible in daily operations:

| | Persona in code | Definition in DB (LubanAgent) |
| --- | --- | --- |
| Change one persona sentence | Commit → review → build → release | Edit one DB record, effective immediately |
| Something goes wrong | "Which code version ran then?" — unclear | The Run binds a version; exact traceability |
| Rollback | git revert + release again | Switch back to a historical version |
| Multi-environment migration | Align code branches across environments | export / init round trip |

**Why isn't YAML simply the storage, taking effect as you save?** Because a system cannot have two truths. If both the YAML file and the database could modify an agent, "which version is actually live right now" would be permanently ambiguous: one copy on the filesystem, one in the database, possibly diverging. LubanAgent's answer: the database is the single truth, and YAML has exactly two roles — **initial import** (first delivery of a definition into the DB) and **export migration** (carrying DB definitions elsewhere). `luban export` always exports from the database, never from files — you'll verify this in step 5. Files are messengers, not the archive.

**Why does version comparison use "the parsed definition object" instead of the YAML file text?** Because file text is pure noise: key order, blank lines, quote style, one-line vs. block style — all zero effect on behavior, yet text comparison would cry "changed!" daily. Comparing parsed objects, any formatting churn yields `(unchanged)`; only a value that actually affects behavior bumps the version. This protects version-number credibility: **version +1 must mean behavior may have changed**, otherwise version numbers quickly devalue into a counter nobody trusts. The FAQ entry "more versions than my edits" has its root here — even a trailing space in a string is part of the value.

**Why does import validate a field whitelist instead of silently ignoring unknown fields?** Because leniency is an invisible pitfall: typo one letter in a field name, and with silent ignoring you get a definition "missing a piece" — it still runs, behaves wrongly, and you can't find out why. Whitelist validation makes init fail on the spot and name the offending key — surfacing the problem at its cheapest moment (import) rather than its most expensive (runtime). The "unknown key" error in the FAQ is something to be grateful for.

All four "why nots" point at one underlying principle: **put the changing and high-frequency into data; keep the fixed and guaranteed in code; separate them with a single truth (the database) and explicit boundaries (validation, versioning, binding)**. Tool risk tiers in [Write business tools](./04-write-a-tool.md) and graph nodes in [Flows and multi-agent](./07-graphs-and-teams.md) are the same principle projected onto other layers.

Finally, pin down the "body vs. brain" boundary — every remaining step on this page verifies the left column:

| | Body (this page) | Brain ([Connect real models](./03-real-models.md)) |
| --- | --- | --- |
| What it is | Definition, version, import chain | The model bound behind the slot |
| Where it lives | The definition tables in the DB | The model registry in the DB |
| Symptom when broken | init errors; workbench shows nothing | Replies are wrong |
| Status on this page | Delivered | Placeholder (FakeLLM) |

## 2. Steps

The six steps form one verification chain — each step's output is the next step's input. When a checkpoint doesn't match, nine times out of ten you skipped a step or didn't land the previous one.

### Step 1: Copy a starting point from the built-in customer-service agent

```bash
cp app/agents/customer_service.yaml app/agents/my_lib_assistant.yaml
```

Why copy from the customer-service agent instead of writing an empty file? Because the built-in customer service agent is this repo's reference implementation — its structure and field usage are patterns the repo authors endorse. Starting from it and deleting down to your minimal set is faster and safer than guessing fields from scratch. Whenever you get lost later, open `app/agents/customer_service.yaml` and compare.

After copying, `app/agents/` contains 10 YAML files: 9 built-in + your 1. From this single command on, your assets in the `app/` territory start accumulating.

Open `app/agents/my_lib_assistant.yaml` and **replace the entire file** with the following (not a few edits — delete all of the customer service agent's tools, knowledge, and skills sections; you'll re-add them per the tools and knowledge guides. What remains is the minimal set you can already read). The Chinese strings inside are kept so your imported fixture matches the rest of the guide; localizing them is fine.

```yaml
name: my-lib-assistant
description: 图书馆借阅助手：查借阅记录、校园卡挂失、馆藏规章咨询
greeting: 你好，我是图书馆助手「小图」～借阅查询、挂失补办、规章咨询都可以找我。
instruction: |
  你是「小图」，学校图书馆的借阅服务助手。
  服务范围：借阅记录查询、校园卡挂失、馆藏规章咨询。
  边界：不处理图书采购建议、不提供文献代查，超出范围如实说明并建议到馆咨询前台。
brain: smart
memory: session
limits: { max_steps: 12, budget_tokens: 50000, timeout_sec: 120 }
io_contract: { input: text, output: text }
```

Go through the definition section by section — you know every field now: `instruction` states the service scope and boundary — note that **the boundary lives in the persona** (the model's language layer), while "what happens beyond scope" will later also get a code-level interception (tool permissions in [Write business tools](./04-write-a-tool.md)); `brain: smart` binds a slot, not a model name (the decoupling shim from [Agent concepts](./00-primer.md), cashed in by later pages); `limits` hands it a set of reins.

Look at the `instruction` itself: it has only three components — identity, service scope, boundary. That's not this page's invention; it's the universal skeleton for system prompts: the model needs to know "who I am, what I handle, what I don't". When you configure evals in [Evals and regression](./06-evals.md), you'll find **that boundary sentence "state clearly beyond scope" is the source of your first safety assertion** — every word you write now becomes a checkable assertion later.

 Checkpoint: after saving the file, `grep name app/agents/my_lib_assistant.yaml` outputs `name: my-lib-assistant` — note `name` is the agent's key, hyphenated.

### Step 2: Import into the database

```bash
.venv/bin/luban init
```

Expected result: the output list gains a line `my-lib-assistant@1` (first import, version 1); the other 9 built-in agents are all `(unchanged)`.

Memorize the key `my-lib-assistant`: it becomes the agent name in URLs, the identifier in the workbench, the argument on the command line — the key is the agent's ID card across the whole system; whatever `name` says is used everywhere. The `customer-service-bot` in [Local run](./01-setup-and-first-run.md)'s curl was the built-in agent's key.

That one line of output carries more than you'd think: init scans **all** YAML files under `app/agents/`, comparing each against the DB's latest version — your new file isn't in the DB, so it's a first import; the other 9 are unchanged, so `(unchanged)`. One command handles both "new" and "unchanged" — that's idempotent import in full.

Dissecting, init does four things per file: read the file → parse into a definition object → validate fields (whitelist; unknown keys error out) → compare against the DB's latest version to decide "create / +1 / do nothing". Most init problems you'll ever hit can be located within these four steps.

### Step 3: Confirm in the workbench

Refresh the workbench **Agents page** (if services aren't running, first `bash scripts/dev.sh start` — [Local run](./01-setup-and-first-run.md)'s stop was optional; don't get stuck here).

Expected result: `my-lib-assistant` appears in the list at version 1. Click in and you see your full persona — **note what you're seeing comes from the database**, not the YAML file. Do an experiment: change one character of `description` in the YAML, refresh the workbench — nothing changes. The DB still holds the old version. That's "feeding port vs. storage".

Do this experiment hands-on. Reading "YAML is not the storage" ten times is worth less than editing it once and watching it "not take effect". Then change `description` back.

Also notice: the workbench's version history can diff two versions — after step 4 produces v2, go click it and see exactly which line changed v1 → v2. That's "snapshots are traceable" in its everyday form.

### Step 4: Verify versioning — change once, re-import once

Change the first sentence of `instruction` in the YAML to (in English: "You are 小图, the school library's lending service assistant, with a warm, patient senior-classmate tone."):

```
你是「小图」，学校图书馆的借阅服务助手，语气亲切像个耐心的学姐。
```

Then:

```bash
.venv/bin/luban init
.venv/bin/luban init   # run it again immediately
```

Expected result: the first run prints `my-lib-assistant@2` (content changed → append a new version); the second prints `my-lib-assistant@2 (unchanged)` (content unchanged → no append). After a workbench refresh, 小图's version is 2 (小图 "Little Tu" is the persona name inside your definition), and the version history shows both v1 and v2 snapshots.

Read the triple clearly: changed → +1; unchanged → no bump; **the same content, no matter how many runs, stays at the same version**. v1 was not deleted — it rests in history as an immutable snapshot, ready to be exported (next step) or rolled back to.

Immutable snapshots aren't "clutter backups" — they have three concrete uses: **rollback** (a new version broke something, switch back); **audit** (which version corresponds to last week's complaint — one query); **pinning evals to versions** (in [Evals and regression](./06-evals.md) you'll run the eval set against both versions and let data decide which stays). Snapshots are what make these three operations possible.

This behavior matters more than you'd guess: **deploy scripts re-running init repeatedly are safe** — version numbers won't inflate endlessly, and it won't reset what you tuned live back to the YAML's state (that deeper pitfall gets its own verification in [Connect real models](./03-real-models.md)).

### Step 5: Export — definitions can leave anytime

```bash
.venv/bin/luban export my-lib-assistant
```

Expected result: stdout prints a YAML matching the last version you saved (export outputs **the database's current version**, not the YAML in your editor — if the two differ, this output is the truth and means you forgot to init). Add `--output x.yaml --version 1` to export a historical snapshot.

Experiencing both directions is the most instructive: init is file → DB, export is DB → file, and `--version 1` can retrieve a "past tense" version. Definitions stored in the DB, exportable to files anytime, and files re-importable into a DB — this round trip is your future migration channel (dev DB → production DB). When you deploy in [Deploy and upgrade](./08-deploy.md), the production database receives your definitions through this same channel.

Same channel, three typical uses: **backup** (export the current version to an archive file), **migration** (init this file in a new environment — all definitions in one step), **audit** (export a historical version and compare field-by-field against the current one to see what changed over the months). One command, three scenarios, all resting on "the DB is the single truth".

### Step 6: Say something to 小图 (the honest part)

In the debug console, pick `my-lib-assistant`, and ask "你是谁" ("Who are you?").

Expected result: the reply is **still** `你好，我是 LubanAgent。` ("Hello, I am LubanAgent.") — FakeLLM doesn't read personas; its script has one line. 小图's body (definition, versioning, import chain) is in place; the brain hasn't been swapped. This is not failure — it is the boundary between this page and the pages that follow.

A preview of the same question's two fates in [Connect real models](./03-real-models.md): FakeLLM answers the fixed "你好，我是 LubanAgent。", a real model answers in 小图's voice listing lending lookups, card replacement, and rules consultation. Same body, same definition — the only change is the model bound behind the slot. By then, "the definition decides what it looks like; the model decides what it thinks" will be muscle memory.

### The six-step checkpoint map

| Step | Checkpoint | What it proves |
| --- | --- | --- |
| 1 | `grep` shows `name: my-lib-assistant` | File written correctly; key is valid |
| 2 | Output shows `my-lib-assistant@1` | Definition passed validation; first DB import |
| 3 | Visible in workbench; YAML edits don't take effect | The DB is the single truth |
| 4 | `@2` → `(unchanged)` | Full versioning semantics |
| 5 | export output = DB current version | Lossless round trip |
| 6 | Fixed line | Brain not yet swapped (later pages' work) |

All six cells green means this page's "body" is delivered.

### Three frequently asked questions, answered in passing

**"Can I edit the built-in customer-service agent's definition?"** Yes — it's in the DB too; edits in the workbench take effect immediately. But the guide suggests keeping it as a reference: do your experiments on `my-`-prefixed agents; the built-in agent is the reference implementation.

**"What if I break something?"** Roll back via version history, or revert the YAML and re-run init. Worst case: delete the local DB and start over — [Local run](./01-setup-and-first-run.md)'s migrate + init restores everything in three minutes. Everything in the dev environment is cheap and disposable — one of SQLite's gifts.

**"Can multiple agents share one prompt?"** Yes — use the Prompt-library reference style (mentioned earlier). That's the dividend of "definitions are data": data can reference data, one change, effective everywhere.

## 3. Validation

- [ ] After `luban init`, output shows `my-lib-assistant@1` and it's visible in the workbench
- [ ] Editing the YAML without init → no change in the workbench (feeding-port experiment)
- [ ] Editing the YAML + init → version +1; running init again → `(unchanged)`
- [ ] `luban export my-lib-assistant` matches the DB's current version
- [ ] You understand why 小图 still gives the fixed line in the debug console (body vs. brain)

Once all boxes are checked, these validations are done. Missing one? Return to its step.

## 4. FAQ

**Edited the YAML but the workbench didn't change.** The most frequent issue. YAML is the feeding port, not the storage — re-run `luban init`. To check whether what you're seeing is DB content: `luban export <key>` always exports from the DB.

**init reports `未知键` (unknown key) or similar validation errors.** The YAML contains an unrecognized field (usually an unclean leftover from copying the customer service YAML, or a typo'd field name). The error names the key — delete it or fix it. The field whitelist lives in `lubanagent/cli/yaml_io.py`; the dictionary is the [agent definition manual](../manual/features/agent-definition.md).

Note the positive value of this pitfall: **the error happens at import, not runtime**. A misnamed field gets caught on the spot, with the key named — broken definitions never reach the DB. An order of magnitude friendlier than "imported fine, exploded at runtime" — and another layer of "YAML is the feeding port": the port has security screening.

**Underscores or capitals in `name`.** The idiomatic key style is lowercase-hyphenated (`my-lib-assistant`). Underscores pass validation but clash with the repo's built-in agents' style and look off in the workbench. Also, this key appears in URLs, command lines, and API paths — lowercase-hyphenated never needs escaping anywhere.

**More versions than my edits.** First clarify what init actually compares: not file text but the parsed definition object — reordering keys, adding blank lines, swapping one-line/block styles are all pure formatting and yield `(unchanged)`, no +1. Only changed string values bump the version — including the sneaky kind: a trailing space at a line's end inside the `instruction` block, or an extra blank line — they're part of the string. When suspicious, run `luban export my-lib-assistant` and compare field-by-field against your YAML; the differing value will be obvious.

Read that pitfall in reverse and you get the design intent: version numbers are sensitive only to "possible behavior change". That sensitivity is exactly what you want — an insensitive version number is the scary one.

This page's three-tool troubleshooting kit, more universal than any single pitfall: **unsure what content you're seeing → `luban export` to inspect the DB**; **init errors → read the key it names**; **version numbers look wrong → diff the two snapshots in version history**. If none of the three finds it, file an issue.

The understandings built on this page are reused directly by every later task — one extra minute of understanding now saves repeated debugging later:

| Understanding built here | Applied later |
| --- | --- |
| init idempotence + versioning | [Connect real models](./03-real-models.md) (slot mapping swaps), [Deploy and upgrade](./08-deploy.md) (auto init at deploy) |
| export / init round trip | [Deploy and upgrade](./08-deploy.md) (dev DB → production DB migration) |
| `limits` governance | [Write business tools](./04-write-a-tool.md) (tool loops), [Flows and multi-agent](./07-graphs-and-teams.md) (flows and teams) |
| instruction identity/scope/boundary skeleton | [Configure knowledge retrieval](./05-knowledge-rag.md) (RAG persona), [Evals and regression](./06-evals.md) (source of safety assertions) |


## Related docs

Next task: [Connect real models](./03-real-models.md). Full fields and interfaces are in [the manual](../manual/index.md).
