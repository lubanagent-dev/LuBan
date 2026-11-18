# Writing Tools and Skills

> A Tool is "what can be done" (an executable action); a Skill is "when to do it and by what playbook" (a package of knowledge and process). Together: the Skill body guides the model on when to call which Tools.

## Tool: the only place business actions require code

**What it is**: a Tool is a Python function plus a few declarations: a natural-language description (for the model), a JSON Schema of parameters (auto-generated from the signature + type hints, for the model to fill), and governance attributes (risk, approval, timeout/retry/idempotency).

**Why**: deterministic rules (permissions, amounts, approvals) must run in code, not be declared by prompts. Tools support standalone debugging and Mock — you can unit-test a Tool without starting an agent.

**How to write**:

```python
from lubanagent.extension import tool

@tool(description="查询订单状态与物流", risk="low", idempotent=True, timeout_seconds=10)
def query_order(order_id: str) -> dict: ...
```

Files under `app/tools/` are scanned and registered (import is registration; see the [customization overview](./overview.md)).

### Full @tool parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `key` | function name | Registration key — the name referenced in the agent definition's `tools` array |
| `description` | `""` | Natural-language description for the model — say clearly "when to call me" |
| `risk` | `"low"` | Risk tier `low` / `medium` / `high`, criteria below |
| `approval_required` | `False` | Explicitly require human approval — regardless of risk tier, execution must pass human confirmation |
| `idempotent` | `False` | Idempotency declaration; **only idempotent tools are retried** (the precondition for `max_retries`) |
| `timeout_seconds` | `30.0` | Per-execution timeout; a timeout is treated as failure |
| `max_retries` | `0` | Retry cap; non-idempotent tools never retry (silent retry spend and duplicate charges are real incidents) |

### How to judge the risk tier

- **low**: read-only queries (order lookup, policy lookup), no side effects;
- **medium**: writes to external systems, calls to third-party services (MCP remote tools default to medium);
- **high**: money involved, irreversible data changes — **the framework forces human approval, not prompt declarations**.

### Approval chain

Tools with `risk="high"` or `approval_required=True` pause before execution and wait for human confirmation:

```text
Permission and argument checks before calling → high-risk goes to human approval (SSE: tool.approval.requested)
→ Approval decision (workbench or business system calls POST /v1/approvals/{approval_id}/decide)
→ Execute only after approval (timeout/retry/idempotency policies apply) → everything into Trace
```

Approval records land in the `approvals` table: decisions survive process restarts, never duplicate, and are auditable. For wiring approval callbacks, see [business integration](./business-integration.md).

### Signature freezing: changing a Tool signature never silently affects historical versions

Agent version snapshots record a signature hash (`signature_hash`) for every tool used. Runtime enforces two checks:

- A referenced tool is unregistered → the Run refuses to start (`AGENT_VERSION_UNRUNNABLE`);
- Tool signature drift (the function signature changed, inconsistent with the snapshot) → also refuses to start.

This is the **version-freezing mechanism preventing "tool behavior quietly changed while old versions keep running"**. After changing a tool's function signature, save a new agent version to use it; historical Run Traces still faithfully record the scene as it was.

**Boundary**: a Tool handles a single point of action; flows that must run in fixed multi-step order should not be crammed into one Tool — use [graph orchestration](./graphs-teams.md) for code-level enforcement.

## Skill: the industry-standard knowledge and process package

**What it is**: the Agent Skills open standard (SKILL.md) — the core is a folder containing SKILL.md: frontmatter metadata (at least `name` and `description`; `name` ≤ 64 chars lowercase-hyphenated, `description` ≤ 1024 chars required) plus instructions telling the agent how to complete a type of task; scripts, references, templates, and other resources can be bundled too. Existing Anthropic-ecosystem Skill packages **work directly** with zero adaptation code.

**Loading is progressive disclosure in three tiers**:

1. **Discovery**: at startup only each Skill's name + description is loaded (about 100 tokens), enough to judge "when to use it";
2. **Activation**: when a task matches the description, the SKILL.md body is read into context (recommended < 5000 tokens / 500 lines);
3. **Execution**: scripts/, references/, and assets/ files referenced by the body are loaded or executed on demand.

**Directory structure**:

```text
skills/refund-sop/
├── SKILL.md          # frontmatter: name, description; body: refund SOP steps
├── scripts/check_policy.py
└── references/policy.md
```

### Two loading methods

**1. Directory loading**: put a standard-compliant directory under `app/skills/`.

**2. zip upload**: zip the directory and upload via the workbench "Skills → Upload skill package" or HTTP; it unpacks into `skills/{name}/` and scans into the database:

```bash
curl -F "file=@refund-sop.zip" http://localhost:8000/v1/skills
```

The zip must contain exactly one directory + SKILL.md; a same-name Skill is overwritten; zip path escape (zip slip) is rejected.

### Two ways to assign to an agent

- **Workbench**: click "Assign" in the Skills list → check agents → save (each changed agent gains a version; the `skills` array adds/removes this skill).
- **Definition**: register in the agent definition's `skills: [refund-sop]`.

At runtime the `skill_load` tool enforces per-agent assignment — an unassigned Skill calling `skill_load` is rejected with 403.

### scripts/ sandbox boundary

Skills are versioned in the same database as agent definitions and auditable. Code in scripts/ runs in a controlled environment: hard timeout kill; the network whitelist flag is passed into the subprocess — **process-level network isolation needs container/gateway fallback**. Division of labor: a Skill is "guidance"; the model most likely follows but not certainly — **flows that must execute in fixed steps (refunds, approvals) should not be carried by Skills; use [graph orchestration](./graphs-teams.md) for code-level enforcement**.
