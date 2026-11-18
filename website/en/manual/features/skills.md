# Skill Packages

> This page covers the Agent Skills open standard (SKILL.md), the three-tier progressive disclosure loading, the division of labor among Skill / Tool / MCP, the two loading methods and how to assign skills to agents, and governance boundaries.

## What a Skill is (official definition)

Agent Skills is a format released by Anthropic in October 2025 and later opened as an **open standard** ([agentskills.io](https://agentskills.io), [Anthropic announcement](https://www.anthropic.com/news/skills)). The official definition: "a lightweight, open format to extend agent capabilities with specialized knowledge and workflows. The core is a folder containing a SKILL.md — metadata (at least name and description) plus instructions telling the agent how to complete a type of task; it can also bundle scripts, reference material, templates, and other resources."

Loading uses **progressive disclosure** in three tiers:

1. **Discovery**: at startup only each Skill's name + description is loaded (about 100 tokens), enough to judge "when to use it";
2. **Activation**: when a task matches the description, the SKILL.md body is read into context (recommended < 5000 tokens / 500 lines);
3. **Execution**: scripts/, references/, and assets/ files referenced by the body are loaded or executed on demand.

Ecosystem facts (checked 2026-07): the official examples repo [anthropics/skills](https://github.com/anthropics/skills) has 162k★, the spec repo [agentskills/agentskills](https://github.com/agentskills/agentskills) has 23k★, and it has been adopted by the Claude family and an increasing number of agent products.

## Division of labor: Skill, Tool, MCP

| | Tool | Skill | MCP |
| --- | --- | --- | --- |
| Essence | An executable action (code) | A package of knowledge and process (instructions + resources) | A connection protocol (standard interface for tools/data) |
| Answers | "What can be done" | "When to do it and by what playbook" | "How to talk to external systems" |
| Example | `refund_apply(order_id, amount)` | "Refund-handling SOP": when a refund is allowed, what to check first, how to escalate beyond authority | Connect to GitHub or your company's CRM |

The three compose: the Skill body guides the model on when to call which Tools; Tools can be local or come from MCP.

> **Note**: a Skill is "guidance" — the model will most likely follow it but not certainly. **Flows that must execute in fixed steps (refunds, approvals) should not be carried by Skills; use [graph orchestration](./graphs.md) for code-level enforcement.**

## How to use it

Two loading methods:

**1. Directory loading**: put a standard-compliant directory under `skills/` (illustrative):

```
skills/refund-sop/
├── SKILL.md          # frontmatter: name, description; body: refund SOP steps
├── scripts/check_policy.py
└── references/policy.md
```

**2. zip upload**: zip the directory above and upload it via the workbench "Skills → Upload skill package" or over HTTP; it is unpacked into `skills/{name}/` and scanned into the database:

```bash
curl -F "file=@refund-sop.zip" http://localhost:8000/v1/skills
```

The zip must contain exactly one directory + SKILL.md; a same-name Skill is overwritten; zip path escape (zip slip) is rejected.

**Assigning to an agent**, two ways:

- Workbench: click "Assign" in the Skills list → check agents → save (each changed agent gains a version; the `skills` array adds/removes this skill).
- Definition: register in the agent definition's `skills: [refund-sop]` (YAML import see [Agent definition](./agent-definition.md)).

Existing Anthropic-ecosystem Skill packages **work directly**, with zero adaptation code. At runtime the `skill_load` tool enforces per-agent assignment — an unassigned Skill calling `skill_load` is rejected with 403.

## Governance and boundaries

Skills are versioned in the same database as definitions and auditable; code in scripts/ runs in a controlled environment (hard timeout kill, network whitelist flags passed into the subprocess; process-level network isolation needs container/gateway fallback). **Both local directory loading and zip upload are supported** (workbench/HTTP); **no** public Skill marketplace or online distribution.
