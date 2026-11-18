# Agent Definitions and Versioning

> This page covers what an agent definition contains, its database and versioning semantics, and the proper use of YAML. For the two ways to write system prompts (inline / referencing the prompt library), see the [Prompt library](./prompt-library.md).

**What it is**: an agent's identity (name, description, greeting, avatar), instructions (system prompt), brain (logical model slot), knowledge (which knowledge bases are attached), memory (which strategy), capabilities (available Tools / MCP / Skills), behavioral boundaries (max steps, budget, timeout), and input/output contracts — all written in one **definition**. **The definition's canonical form is a database record** — not YAML, not a config file; every change creates a new version in the database.

**Why it exists**: changing agent behavior means editing the definition in the database, not changing code or releasing; every Run binds an explicit definition version, so you can trace back precisely "which version was running" when something goes wrong; audits and evals are built on versions.

**How to use it**:

1. Definitions are stored and versioned in the database. The first creation can go through the console / API, or via a **one-time YAML import** (only for initialization and migration; illustrative):

```yaml
name: customer-service-bot
brain: smart                 # Logical brain slot
instruction: |
  你是售后客服，先安抚情绪，再查订单……
tools: [query_order, refund_apply]
mcp_servers: [github-mcp]    # Optional
skills: [refund-sop]         # Optional
knowledge: [product-faq]     # Optional
memory: session-summary      # Optional
limits: { max_steps: 20, budget_tokens: 200000, timeout_sec: 120 }
io_contract: { input: text, output: text }
```

   Here `brain` is a logical brain slot — see [Model center and model factory](./models.md); `mcp_servers` is covered in [Tools and MCP](./tools-mcp.md); `skills` in [Skill packages](./skills.md); `knowledge` and `memory` in [Knowledge and memory](./knowledge-memory.md).

2. Saving generates `v1`; all later edits happen in the database (console or API), each save producing `v2`, `v3`, … Version diff and rollback are supported.
3. YAML has exactly two uses: **initial import** and **export backup / cross-environment migration**. It is not storage — editing a YAML file changes no running agent; it takes effect only after re-import.
4. Sessions/Runs reference a definition version; if unspecified, the currently published version is used.

**Boundary**: there is no drag-and-drop visual designer; online editing of definitions lives in the [developer workbench](./workbench.md).
