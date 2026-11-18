# Customization Overview

> LubanAgent is not a "build once and throw away" prototype: after cloning you **move in** for the long term, iterating and shipping to production. This page answers three questions — where to change, how to change, and why your changes survive upstream upgrades.

## Customization mindset: you don't "use" it, you "live in" it

LubanAgent is a "RuoYi-style starter base" (like the RuoYi / Spring Boot scaffolds of the Java ecosystem are to business systems): the framework pre-builds the engineering pieces every team would otherwise re-assemble — versioned definitions in the database, the model factory, the governance layer, the workbench, deployment. Your business agents / tools / flows live as tenants in the `app/` territory. **You change your own territory; the framework territory stays untouched in principle** — this is the fundamental premise of "heavily customized yet still upgradeable from upstream."

## Three territories: where you live, where the framework lives

```text
lubanagent/   Framework territory — tracked upstream; in principle you don't touch it
app/          Your territory — your agents / tools / flows / extensions go here; upstream never touches it proactively
demos/ tests/ docs/ migrations/   Shared territory
```

For the detailed directory-to-module mapping (what each framework subdirectory holds, the `app/` convention-scanned entry points), see [architecture](../architecture.md).

## "What to change / where to go" routing table

| What you want to do | Which page |
| --- | --- |
| Write business tools (Tools) or knowledge/process packages (Skills) | [Writing Tools and Skills](./tools-skills.md) |
| Make must-follow-step flows deterministic (graph orchestration), or multi-agent collaboration | [Writing graphs and teams](./graphs-teams.md) |
| Swap models / observability backends / database / embedding model | [Swapping models and backends](./swap-backends.md) |
| Let your business system call agents, wire approval callbacks, expose MCP | [Business integration](./business-integration.md) |
| Know which parts of the stack are fixed foundations vs switchable parts | [Tech stack and replaceable parts](./tech-stack.md) |
| Follow upstream upgrades without losing your changes | [Upgrading with upstream](./upgrade.md) |
| Develop your own agent spec-driven | [Developing your agent with spec-coding](./spec-coding.md) |

## Dependency direction rule: one iron law + two CI guards

**Iron law**: dependencies are one-directional — `app/* → lubanagent/*` is **allowed**; `lubanagent/* → app/*` is **forbidden**. The framework never imports your business code in reverse.

Two CI guards keep this law and territory boundaries intact:

1. **import-linter** (`importlinter.toml`): static dependency-direction check; CI blocks any forbidden `lubanagent → app` direction.
2. **`.lubanagent-upstream` guard** (`scripts/check_upstream_guard.py`): the `.lubanagent-upstream` manifest at the repo root lists framework / shared / seed / user-owned path classes with globs; when an upstream PR's diff hits user-owned paths, CI blocks it — upstream never changes your territory proactively.

The guards **significantly reduce merge conflicts but do not promise zero conflicts for any git merge** (unregistered new paths, extreme name collisions, etc. can still conflict; self-check after merging). The full upgrade flow: [upgrading with upstream](./upgrade.md).

## Import-is-registration: how the framework finds your extensions

At runtime the framework **finds user extensions through the Registry, without reverse imports** — just let the framework scan your module; decorating is registering:

```python
from lubanagent.extension import tool, graph

@tool(description="查询订单状态与物流", risk="low", idempotent=True, timeout_seconds=10)
def query_order(order_id: str) -> dict: ...

@graph(name="refund_flow", description="退款流水线")
def refund_flow_builder():
    ...
```

- `EXTENSION_PACKAGES` scans the `app.tools` and `app.graphs` packages by default (extensible via env);
- when a module is imported, the `@tool` / `@graph` decorators register tools and graphs into `default_registry`; agent definitions reference them by `key` / `name`;
- this is "import is registration": **put your file in the right directory with the right decorator and the framework finds it** — no framework code changes, no config-file registration.

## Boundary

- The framework territory (`lubanagent/`) stays untouched in principle; if a requirement seems to require changing the framework, you are probably missing an extension point — raise an upstream issue instead of editing in place.
- Seed scaffold files under `app/` (`app/main.py`, the customer-service example YAML, etc.) are only touched upstream for breaking changes — **copy them into new files before modifying** to stay conflict-free (manifest in `.lubanagent-upstream`).
- The customer-service example is a living document showing "how to assemble a complete business scenario from framework capabilities", not the product itself.
