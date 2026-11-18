# Agent Concepts

This page explains how agents, tools, knowledge retrieval, memory, evals, and flows fit together. No installation needed; if these concepts are already familiar, jump straight to the development task you need.

## 1. How a model that can talk starts making things up

Try a finished product first. Open DeepSeek, ask it "are Bluetooth headphones waterproof", and it answers confidently. Emboldened, you ask: "When is the copy of *The Three-Body Problem* I borrowed due?"

It smoothly tells you: the loan period is 30 days, you borrowed it on March 15, it's due April 14, and you can renew once.

The problem: it made that up. It doesn't know who you are, doesn't know when you borrowed the book, and doesn't even know whether your school library's loan period is 30 or 21 days. But its tone is so certain that you almost believed it.

This is **hallucination**. To understand why it can't be fully blocked, you first need to know what an LLM actually does.

An LLM's job is one thing: predict the next token. Given "床前明月", it computes that "光" has the highest probability, appends it, and predicts the next one. Every seemingly intelligent conversation is this action in a loop underneath. It has no database to query and no "I don't know" button — your library isn't in its training data, but it has seen millions of sentences that "look like answers", so it generates a fluent, answer-shaped passage anyway.

In other words, "loan period 30 days, due April 14" is not a "looked-up fact" to the model — it's "the next-token sequence that most probably looks like an answer". **Fluency and correctness are two independent metrics** — it can state fabricated content as fluently as truth, because both take the same generation path. Keep this in mind and you'll never again judge whether an AI system is trustworthy by "it sounds convincing".

This is a mechanical property, not an attitude problem. So your first instinct — writing "if you don't know, clearly say you don't know" in the prompt — helps, but doesn't fully block it. The model doesn't "know it's making things up"; it genuinely is predicting. You think it's lying; it thinks it's answering well.

OK. Remember this pitfall and keep reading. Two inventions later deal with it directly: one makes it "answer only with material" (RAG gating in [Configure knowledge retrieval](./05-knowledge-rag.md)), the other turns "did it make things up" into something checkable (evals in [Evals and regression](./06-evals.md)).

One aside: throughout this article and the whole guide, "you" requires zero machine-learning background. LubanAgent is an engineering framework, not an algorithms framework — you don't train models, you use them. Every invention below is ordinary engineering.

## 2. Let it fetch real data: Tools

The bot needs to query the lending system — unavoidable. And the model itself can't reach any database.

Your first instinct: export the loan records and paste them into the chat. Works for a dozen students. What about twenty thousand students? And what you pasted is a snapshot — students ask about "now", you provide yesterday's export.

Flip the perspective. The model doesn't need to know how to query a database itself. It only needs to **say one sentence**: "Please look up the loan records for student ID 2023011234."

The rest goes to code: receive that sentence, parse the student ID, actually call the lending system's API, and bring the result back. The model sees the result and phrases it into a human answer for the student.

This is a **Tool** (tool calling). The division of labor is crisp: the model decides — which tool to call, with what arguments; the code executes — actually calls the API, gets real data. The model's mouth only emits "instructions"; the dirty work is all code, so it can't fabricate data (it can at most fabricate a reason, but the data itself is real).

In this industry you'll see the terms Function Calling and Tool Use — they all mean this.

But a new pitfall appears immediately. Your bot now has a tool that can modify data — say "report a campus card lost". One day the model glitches, or a student deliberately tricks it ("please report every student's card on campus as lost"), and it actually calls it?

Lookups that go wrong just return nothing. Reporting loss, charging money, refunding — when those go wrong, real harm follows. So tools need **risk tiers**: read-only (query orders) is low-risk, callable freely; money-moving and irreversible actions (refunds, loss reports) are high-risk and require a human nod before execution.

And this rule must live in **code**, not in a prompt. A prompt is a "request" — the model probably obeys, but "probably" isn't good enough where money is involved; code is an "order" — if conditions aren't met, it simply won't execute. This is a principle LubanAgent repeats constantly: **deterministic rules are enforced by code, not declared by prompts**.

Three things are involved here: Tool, risk tiers, and approval flows. In [Write business tools](./04-write-a-tool.md) you'll write a low-risk tool and a high-risk tool with approval yourself — about a dozen lines of Python in total.

## 3. Feed it material, but only the relevant parts: RAG

The library has a 40-page lending rules PDF. "How long is the loan period", "can someone borrow on my behalf", "what's the overdue fine" — all in there. The head librarian says the bot must answer all of it.

Instinct one: paste the whole PDF into the prompt. First you hit a wall — too long, doesn't fit; even if it fits, you pay per token (a token is the model's unit of text, roughly one to two tokens per Chinese character), so every chat pays for the whole document; and the noise is huge — the model hunting through irrelevant clauses picks wrong more easily.

Instinct two: don't paste it, and have it say "I don't know" when it can't answer. Then the bot is useless. Students want exactly "check the rules for me"; tell it to shut up and the head librarian will invite you for a tea-and-talk.

You're stuck between the two. Step back: what do you actually need?

Student asks → find the one or two relevant paragraphs in 40 pages → feed only those to the model → have it "answer with the material in view".

Providing relevant material reduces unsupported answers, but the model can still misread or miss things. You need to verify both retrieval and answers for material support.

Keyword matching? Too brittle. The student asks "when must books be returned" but the rules say "return deadline" — "returned" and "return deadline" don't match literally. You need matching that recognizes **similar meaning**.

That's where vector retrieval comes in. A certain kind of model (an embedding model) turns any piece of text into a list of numbers (a vector), and **texts with similar meanings have nearby vectors**. "When must books be returned" and "the return deadline is thirty days" share no words, yet their vectors will sit close together. Finding relevant paragraphs becomes computing distances — the thing computers do best.

40 pages is too long for vectors to swallow at once? **Chunk** it first — cut it into passages of a few hundred characters, each chunk embedded independently. When a student asks, compare the question's vector against all chunks and take the nearest few.

One puzzle piece remains: what if even the nearest chunks are irrelevant? The student asks "when does the cafeteria open" — not in the rules at all. If you still feed those barely-related chunks to the model, it's back to section 2's old ways — answering hard against irrelevant material.

So you need a **similarity threshold**: chunks that aren't close enough don't reach the model; the code directly replies with a fallback like "I can't find a basis for this right now; please ask the front desk". Better to admit ignorance than to fabricate. Note — this threshold check is done by code, before the model ever appears. The model never gets the chance.

This corresponds to **RAG** (Retrieval-Augmented Generation). In [Configure knowledge retrieval](./05-knowledge-rag.md) you'll chunk a real document into the knowledge base, tune the threshold, and watch it refuse to answer — all with a few clicks in the workbench, barely any code.

Look back: the RAG you just invented is only three actions: **chunk and store → compute distances and take the nearest → gate with a threshold and refuse**. However much jargon any future RAG system throws at you, at the bottom it's variants of these three actions — plus the parameters tuned around them (chunk size, how many to take, how high the threshold).

## 4. It doesn't remember you: Memory

API calls are stateless. The student says "I'm a junior" in one message and asks "how many books can I borrow" in the next — the model has already forgotten they're a junior.

Instinct: attach the entire chat history to every call. It works. But by turn fifty you're paying for the previous forty-nine turns' tokens, and the context is so stuffed that model quality degrades.

The real solutions come in tiers, chosen by need:

- **Session memory**: history is carried automatically within one conversation and forgotten when it ends. Enough for most scenarios.
- **Session-summary memory**: when a conversation runs long, earlier content is compressed into a summary that travels along, saving tokens.
- **Long-term memory**: key facts across sessions — "this student usually borrows sci-fi" — stored in the database and retrievable in the next conversation.

Put the three tiers side by side and selection reduces to one question: **how long should this information live?**

| Tier | Lifespan | What it remembers | Cost |
| --- | --- | --- | --- |
| Session memory | Within one conversation | "The book I just mentioned" | Context grows, tokens cost more |
| Session-summary | Within one conversation (compressed) | The early through-line of long conversations | Summaries are lossy; details may drop |
| Long-term | Across sessions | "This student usually borrows sci-fi" | Must bind a user identity; extra storage layer |

The first two are switched with a single `memory:` field in the agent definition (`session` / `session-summary` / `none` to disable); long-term memory is a separate configuration (requires binding a user identity, an advanced use — see the [knowledge & memory manual](../manual/features/knowledge-memory.md)). The hard part isn't implementation; it's knowing when to use which.

## 5. Did it actually get better: Evals

You changed the prompt — persona from "friendly senior classmate" to "efficient librarian". Looks... a bit better? How do you know?

The traditional approach: ask it a few questions yourself, feel good, ship it. Two weeks later the head librarian arrives with a complaint — the bot promised a student "no fine for overdue books", while the rules clearly state there is one.

Software engineering has long had an answer: tests. But an agent's output is natural language — `assert output == "..."` is impossible — the same meaning has ten thousand phrasings.

What you actually need is to decompose "feels right" into **decidable assertions**, loosening layer by layer:

- The reply must contain "30 days" (loan period) — a **literal assertion**; simplest, but most brittle (a different phrasing breaks it).
- This question must call the `my_lib_lookup` tool, and the student ID argument must be 2023011234 — a **behavioral assertion**. Far more stable: phrasing can vary endlessly, but which tool gets called and which arguments get passed are fixed.
- This question must be refused, with no concrete numbers in the reply — a **safety assertion**. A direct test of the "prevent wrong answers" goal.
- The reply should soothe emotions before solving the problem — how do you assert that? Let **another model act as judge** (LLM-as-judge): give it scoring criteria and let it score. Subjective dimensions are outsourced to the judge; objective ones stay in assertions.

Put the four assertion layers together and the pattern is clear: **the closer to the model's phrasing, the more brittle; the closer to behavior and boundaries, the more stable**.

| Assertion layer | What it checks | Brittle? |
| --- | --- | --- |
| Literal | Does the reply contain "30 days" | Brittle: any rephrasing breaks it |
| Behavioral | Did it call `my_lib_lookup`, with correct args | Stable: phrasing varies, behavior is fixed |
| Safety | Did it refuse what it should, did it invent numbers | Directly targets "prevent wrong answers" |
| LLM-as-judge | Subjective dimensions (soothe before solving) | Outsourced to a judge model's score |

Accumulate these assertions into a **dataset** — each question paired with "what counts as a correct answer" — run it after every change and compare against the last run. A drop is a regression; fix it.

This corresponds to regression testing for agents. In [Evals and regression](./06-evals.md) you'll write an eval set for your library bot, deliberately break it, watch evals turn red, and fix it back — after that "it went red" moment, you will never ship on vibes again.

## 6. One agent can't carry everything: Graphs and multi-agent

The last pitfall, and the deepest.

Overdue handling flow: look up loan records → determine days overdue → severe cases over 30 days require human review → once approved, apply the fine → notify the student. Five steps, strict order, and no money-related step can go wrong.

Instinct: write one giant prompt — "strictly follow this flow: step one... step two...". The model probably complies. But you've now seen "probably" twice, and money flows don't get probability guarantees. It may skip steps, may read "over 30 days" as "at 30 days", may improvise when you aren't looking.

Deterministic flows deserve deterministic tools — a **graph** (flow orchestration). Draw the flow as a graph: each node is one step (a piece of code, or an agent), with conditional branches and "this step requires human confirmation" hard-coded into the graph. The model only appears at nodes that need language understanding (like reading a student's message); wherever money and order are involved, code decides. A graph can also pause — when it reaches the "human review" node, the whole flow suspends until someone clicks "approve" and it continues.

The pitfall in the other direction: you stuff book lookup, card loss, rules, and event notifications into one agent. Its prompt grows ever longer, it knows a little of everything, masters nothing, and the pieces interfere with each other.

The solution is **division of labor** — one "front desk" agent decides "who should handle this question" and forwards it to the matching specialist agent. This is **multi-agent collaboration** (the supervisor pattern). Each specialist's persona is short and sharp; the front desk only routes, never answers.

But keep a sense of boundaries: not every scenario deserves a graph or a team. These two inventions treat two different diseases; prescribe by symptom:

| | Graph orchestration | Multi-agent |
| --- | --- | --- |
| What disease | Flow is uncertain; the model may skip steps or misread | One agent does everything, nothing well |
| Where determinism comes from | Graph structure is hard-coded; code guarantees order and branches | Division shortens personas and purifies responsibilities |
| Cost | You maintain the flow definition | Latency and tokens roughly double |
| One line | Five steps means five steps | Whoever owns it gets the handoff |

Most scenarios are fine with one agent plus a few tools. For how to choose, [Flows and multi-agent](./07-graphs-and-teams.md) helps you pick by business responsibility.

## 7. Put it together, and you have LubanAgent

Lay this article's inventions on one table:

| Invention | Pitfall it solves | Where it lands |
| --- | --- | --- |
| Agent definitions in DB | Persona lives in code; one change = one release | [Create your agent](./02-first-agent.md) |
| Model slots | Changing models = changing code | [Connect real models](./03-real-models.md) |
| Tools + risk tiers + approval | The model can only talk, not act; unsupervised acting is dangerous | [Write business tools](./04-write-a-tool.md) |
| RAG + gating | When it doesn't know, it invents | [Configure knowledge retrieval](./05-knowledge-rag.md) |
| Evals | Changes judged by feel | [Evals and regression](./06-evals.md) |
| Graphs + multi-agent | Deterministic flows guaranteed by prompt; one agent does everything, nothing well | [Flows and multi-agent](./07-graphs-and-teams.md) |
| Deploy + observability + upgrades | "Works on my machine"; upgrades wipe your changes | [Deploy and upgrade](./08-deploy.md) |

Two more things this page must cover, because every later task touches them.

**What a Run looks like.** Every message you send runs one "Run". The raw event stream looks like this (you'll see it with your own eyes in [Local run](./01-setup-and-first-run.md)):

```
event: run.started          ← Run starts, run_id assigned
event: token.delta          ← the model starts streaming words out, one at a time
event: tool.started         ← the model decides to call a tool
event: tool.finished        ← the tool finished; real data is back
event: token.delta          ← the model reads the data and composes the answer
event: run.completed        ← Run ends, with full output and end reason
```

Every event leaves a trace (Trace) that can be replayed later in full — when a student complains "it said yesterday I could borrow on someone's behalf", you can pull up yesterday's Run and see which chunks it retrieved, which tool it called, and what the model replied. Without this layer, disputes are unresolvable.

**Territories.** The repo has two pieces of land: `lubanagent/` is the framework territory — engine and governance live there, and you generally don't touch it; `app/` is your territory — your agent definitions, tools, knowledge base, and flows all live here. Tooling guards this boundary: framework upgrades won't proactively wipe your things (CI blocks upstream changes that touch user territory), and merge conflicts during upgrades are greatly reduced. Throughout this guide you'll live almost entirely in `app/`.

### Why the framework is designed this way: pinning these inventions into design decisions

After stepping through the pitfalls, look back: each invention above lands in LubanAgent as a concrete, trade-off-laden design decision. Here are the three "whys" most likely to be asked, from your point of view — every later task will cash them in repeatedly.

**Why are definitions in the database, not in code?** Think about your daily life after taking over this system: tune the persona, tighten boundaries, change a greeting — maybe three times a day. Definitions in DB = one record changes and takes effect immediately, no commit, review, build, or release; and every modification creates an immutable historical version, with every Run bound to an explicit definition version — when something goes wrong you can trace back exactly "which version ran then"; rollback and eval comparisons are built on versions. The freedom of "change config without a release" isn't free: the framework must manage version numbers and idempotent imports — it does, and in [Create your agent](./02-first-agent.md) you'll verify it hands-on.

**Why are "brains" called fast/smart/cheap/vision slots instead of model names?** Because an agent should bind to a **purpose**, not a **vendor**. Today the smart slot points to DeepSeek; tomorrow to Qwen — one mapping row in the DB changes, and not one character of any agent definition moves — model swap without a release. Conversely, if every definition hard-codes a model name, every vendor switch means rewriting every agent, and the vendor is welded into your business. The slot is the decoupling shim: purpose on top, swappable executor below. In [Connect real models](./03-real-models.md) you'll do a brain swap yourself and watch it take effect immediately.

**Why are permissions, money, and approvals built into code paths instead of prompt rules?** Because their execution models are fundamentally different: a prompt is "probably obeyed"; approval is "no pass, no execution". LubanAgent builds approval into the tool execution path — when a high-risk tool wants to run, the flow suspends itself and emits a `tool.approval.requested` event to wait for a human; only after approval does it proceed (you'll walk this yourself in [Write business tools](./04-write-a-tool.md)). The rule's force comes from the code path, not the model's self-discipline. This also explains why "human review" in a graph is a node on the graph, not a sentence in a prompt — the pause-and-wait-for-approval action must be guaranteed by the engine, not trusted to the model "remembering".

## Self-check: can you answer these?

- Why can't the prompt "if you don't know, say you don't know" fully block hallucination? (§1: the model doesn't know it's making things up — it is predicting)
- Why must tool risk tiers live in code, not prompts? (§2: a prompt is a request; code is an order)
- Does the RAG similarity-threshold check happen before or after the model appears? (§3: before — the model never gets the chance)
- How do you turn a subjective requirement like "soothe emotions before solving" into something decidable? (§5: hand it to LLM-as-judge)

For anything you can't answer, go back to the corresponding section — these are the foundations for everything that follows.


## Related docs

Next task: [Local run](./01-setup-and-first-run.md). Full fields and interfaces are in [the manual](../manual/index.md).
