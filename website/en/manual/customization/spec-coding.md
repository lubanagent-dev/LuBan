# Developing Your Agent with spec-coding

> LubanAgent gives you more than a runtime skeleton — it also gives you the engineering discipline to develop your own agents: the repo ships the spec-coding skill (`.claude/skills/spec-coding/`, ready out of the clone) — a spec-driven development loop.

## What it is

spec-coding is a spec-driven development method: turn development intent into **verifiable contracts**, code against the contract, then have an independent reviewer strictly validate "code vs contract" and "docs vs code facts" until PASS. The skill has no internal dependencies and is language-agnostic — you can use it for your own agent development too.

## Why

Agent development easily becomes "written but unknown whether correct": change one prompt sentence or add one tool argument, and behavior drifts unnoticed. spec-coding turns "is it correct" into a verifiable loop — define the contract first (interfaces / data / behavior / boundaries / acceptance), code against it, validate independently — not "feels about right."

## How to use it

Two directions:

**Forward (spec → code, default)**:

1. Write your agent requirements as a spec (requirements / design doc);
2. The skill extracts unit contracts: interfaces, data, behavior, boundaries, acceptance criteria;
3. Code against the contract;
4. strict-validation independently checks "code vs contract" until PASS.

**Reverse (code → docs, sync)**: after your agent evolves in production, the skill scans real code and updates docs, eliminating drift.

```text
spec (requirements/design)
   ↓ extract contracts
Contract (interfaces/data/behavior/boundaries/acceptance)
   ↓ code against the contract
Code
   ↓ strict-validation independent check
PASS (code faithfully implements the contract + docs match code facts)
```

The skill is auto-discovered in Claude Code; other AI tools load `.claude/skills/spec-coding/` via their own skill mechanism. For the detailed flow, see the skill's `SKILL.md`.

## Boundary

- spec-coding is a **development-time methodology** skill, not a runtime agent capability;
- It ships with the open-source core and is optional — the system runs fine without it;
- Contract gaps found while coding allow autonomous decisions on technical details with after-the-fact notes; directional choices still ask the decision-maker.
