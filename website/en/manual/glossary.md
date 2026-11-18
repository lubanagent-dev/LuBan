# Glossary

Terms you may hit while reading the manual are collected here. One sentence each, then a link to the full page.

| Term | In one sentence | See |
| --- | --- | --- |
| Agent definition | All elements of an agent (persona, instructions, brain, knowledge, memory, capabilities, boundaries, contracts), stored in the database, versioned, and editable at runtime | [Agent definition](./features/agent-definition.md) |
| Agent version | An immutable snapshot of an agent definition; every Run binds one version, and editing the definition does not affect running or historical Runs | [Agent definition](./features/agent-definition.md) |
| Prompt library | Independent, versioned management of system prompts: draft, release, and reuse across agents; an agent references a prompt, whose full text is resolved into the version snapshot; a new prompt version does not take effect automatically | [Prompt library](./features/prompt-library.md) |
| Logical brain | Editable model slots that can be added and renamed; fast / smart / cheap / vision are only the initial presets. Agents reference slots, not model names; slots referenced by historical versions cannot be deleted | [Model factory](./features/models.md) |
| Model factory | The module that centralizes per-model creation and parameter differences; adding a vendor only touches here | [Model factory](./features/models.md) |
| Run | One agent execution, bound to an agent version and the actual model used | [Runtime observability](./features/observability.md) |
| Trace | The complete record of one Run: which version/model was used, how many model calls, which Tools were called, how many tokens/cost | [Runtime observability](./features/observability.md) |
| Governance wrapper | Code wrapped around the agent loop: hard limits for steps/budget/timeout, capability matching, SSE, Trace. It is an internal framework detail; users do not touch it | [Runtime observability](./features/observability.md) |
| Budget cutoff | A Run starts with a token budget and stops immediately when exceeded, preventing runaway spending | [Runtime observability](./features/observability.md) |
| KV-cache | The model vendor's prefix cache. Context assembly keeps a stable prefix to hit the cache as best effort, not a guarantee | [Runtime observability](./features/observability.md) |
| Tool | A business action — a piece of Python code annotated with `@tool` | [Tools and MCP](./features/tools-mcp.md), [writing Tools and Skills](./customization/tools-skills.md) |
| MCP | The industry-standard tool protocol: consume other people's tool ecosystem (Client) or expose yours to others (Server) | [Tools and MCP](./features/tools-mcp.md) |
| Skill | The industry-standard "knowledge and process package" (SKILL.md) that tells the agent when and how to do something, loaded progressively and versioned in the database | [Skill packages](./features/skills.md), [writing Tools and Skills](./customization/tools-skills.md) |
| Graph orchestration | Business flows that must follow fixed steps (refunds, approvals) written as LangGraph pipelines and enforced at the code level, not left to prompt luck | [Graph orchestration](./features/graphs.md), [writing graphs and teams](./customization/graphs-teams.md) |
| Checkpoint | A persisted LangGraph run-state point that supports pause/resume and human-approval nodes; regular agent Runs also write per-step checkpoints to the `checkpoints` table by default and can resume via the resume API after a crash | [Graph orchestration](./features/graphs.md), [Agent Runtime](./features/runtime.md) |
| Multi-agent collaboration | A supervisor decides which sub-agent takes the next step; sub-agents report back, and shared state flows through the run | [Multi-agent](./features/multiagent.md), [writing graphs and teams](./customization/graphs-teams.md) |
| Sub-agent / sub-Run | An agent delegated during orchestration and its run. Sub-Runs inherit the parent budget, and cancellation propagates | [Multi-agent](./features/multiagent.md), [writing graphs and teams](./customization/graphs-teams.md) |
| Supervisor | The dispatcher in a multi-agent orchestration that routes tasks to sub-agents | [Multi-agent](./features/multiagent.md) |
| SSE | Server-Sent Events, streaming run events (tokens, tool calls, completion) to callers | [SSE events and error codes](./api/sse-and-errors.md) |
| Open-source core | The agent itself, F1–F13, Apache-2.0, usable out of the clone | [Architecture](./architecture.md) |
| Channel layer | Commercial modules F14–F16 (message channel integration, session state machine, outbound risk control), not in the open-source edition, wholly replaceable or removable | [Architecture](./architecture.md) |
| ChannelConnector | The extension-point Protocol the framework reserves for the channel layer; the core runs independently without it | [Business integration](./customization/business-integration.md) |
| Session state machine | The three-state flow AI handling ↔ human takeover pending ↔ human handling; part of the channel layer | [Architecture](./architecture.md) |
| Outbound risk control | Review before a reply is sent (sensitive words, commitment risk, platform rules); part of the channel layer | [Architecture](./architecture.md) |
| Territory | Physical repo isolation: the `lubanagent/` framework territory (change rarely) and the `app/` user territory (where you put business code), reducing upstream merge conflicts without promising zero conflicts | [Customization overview](./customization/overview.md) |
| spec-coding | The spec-driven development skill built into this repo: spec → contract → code → strict validation loop; also the methodology for developing your own agents | [Developing with spec-coding](./customization/spec-coding.md) |
