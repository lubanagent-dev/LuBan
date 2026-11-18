---
description: Learn what LubanAgent is, which modules it has, which technologies it uses, and whether it fits your project, through the system and technical architecture diagrams.
---

<script setup>
import architectureImage from '../../manual/images/luban-architecture.png'
import technicalImage from '../../manual/images/luban-dependencies.png'
</script>

# Project Introduction

## What is LubanAgent

**LubanAgent is a Python agent project you can take and adapt directly.** Model access, tool calling, knowledge bases, multi-agent collaboration, an admin UI, monitoring, and deployment already live in one repository. You download the source code, connect your own business, and deploy to your own servers.

An **agent** here means "an AI assistant that understands what the user asks and then calls tools to complete the task." For example, an order assistant doesn't just explain the refund policy — it queries the real order, checks whether a refund is allowed, and submits the refund once approved.

LubanAgent provides the engineering to run that assistant. It does not provide your company's order system, and it does not define your refund rules for you. It fits teams that want to build and maintain such systems in code for the long term.

## Where the project comes from

Agent frameworks are already everywhere — Claude Code SDK, pi Agent, LangChain, LangGraph, Agno, and more all have ideas worth learning. LubanAgent was not built because another orchestration framework was missing.

My starting point was practical: I wanted a one-stop, ready-to-use engineering scaffold to land agents quickly in company projects and side projects. With the source code in hand you can start writing business logic immediately, and keep developing and deploying in the same codebase, instead of re-assembling everything for every project.

Once model calls and tool execution work, a lot of concrete work remains: how to manage and reuse prompts, how to debug agents, where to find records when things fail, how to configure API keys, and whether new definition versions can ship without downtime. Mature implementations exist for these, but after picking a framework you still have to wire them into your own business codebase.

The RuoYi project from the Java ecosystem inspired this: deliver a complete codebase you can keep developing, not just a few interfaces you must assemble yourself. LubanAgent reuses LangChain / LangGraph and puts agent definitions and versioning, the prompt library, model management, single- and multi-agent, a workbench, monitoring, and deployment together. Regular agents, fixed flows, and multi-agent share run records and governance; observability connects to Langfuse or LangSmith rather than building a new observability platform, and the execution engine is not reinvented.

"Shipping without downtime" here means **saving a new agent definition version does not require restarting the service**: run records bind to the definition version in effect at the time, and config changes happen through the workbench or the API. This does not mean business code deployments are naturally zero-downtime. Publishing a new prompt-library version also does not automatically change its consumers; you still save an explicit new agent version.

So what I built is the engineering assembly and long-term maintenance layer, so business development does not start from infrastructure every time. Business code goes in `app/`, framework code in `lubanagent/`; source and deployment stay in developers' hands, and you follow the upgrade guide to track upstream. Customer service is the first complete scenario that validates this engineering — it is not the boundary of the product. If you want this kind of starting point, give the project a [Star on GitHub](https://github.com/lubanagent-dev/LuBan) or join the improvement.

## First, an example: building an order assistant

The user asks: "My shoes haven't shipped yet — can I get a refund?" Just sending the question to an LLM is not enough:

1. **Know the facts**: query the order status and read the refund policy; don't let the model guess.
2. **Perform actions**: compute the refundable amount and call the refund API.
3. **Follow rules**: refuse when conditions aren't met, and never execute operations that require human approval directly.
4. **Stay maintainable**: records must be searchable when things break, rules must be testable when changed, and the service must be deployable and upgradable.

**What it already provides**: the executor that connects models and tools, knowledge retrieval, the approval entry point, run limits, a debugging UI, call records, evals, and deployment configuration.

**What you write**: the business APIs for order lookup and refunds, refund eligibility and amount rules, the assistant's persona, and the test cases proving it behaves. Regular assistant configuration can be edited in the workbench; definitions live in the database, and YAML files are only the initial import format. Business tools and flows that must run in order are written in Python.

The repository ships a [customer-service example](./features/demo.md) to compare against. You can also build internal knowledge assistants, ticket triage, expense approvals, and more; customer service is an example, not the product boundary.

## Why use it instead of building from scratch

An assistant that serves users long term must answer five questions: **what it knows, what it can do, which rules it follows, what it has done, and how it is maintained.** These belong to software engineering, not just prompting.

With a model SDK or LangGraph alone, you choose and assemble those pieces yourself. LubanAgent's value is wiring the common parts for you, so you start with business development instead of a round of database, executor, admin pages, and deployment scripts.

You get neither a demo you can only run as-is nor a hosted platform configurable only through web pages — you get complete, modifiable source code. Business code goes in `app/`, framework code in `lubanagent/`; merge upstream updates by the upgrade guide to limit mutual impact, though conflict-free merges are not guaranteed.

If you know the Java ecosystem, think of it as a **RuoYi-style starter project**: not just a library, but a codebase you can keep developing. LubanAgent focuses on agents and is not a general enterprise back office; it does provide login, platform roles, and permission control for its own workbench. That is not tenant, department, or row-level data isolation.

## What features are included

The list below is what the repository already has. Every link points to usage and limitations; you do not need to master every module before building your first assistant.

| Problem you face | What the project provides | What it can actually do |
| --- | --- | --- |
| How to define and adjust assistants | [Agent definitions and versioning](./features/agent-definition.md), [Prompt library](./features/prompt-library.md), [model management](./features/models.md) | Save an assistant's persona and available tools with version history; reuse prompts; change models by editing config instead of hardcoding model names in business code |
| How assistants handle tasks | [Agent execution](./features/runtime.md), [deterministic flows](./features/graphs.md), [multi-agent collaboration](./features/multiagent.md) | Simple tasks run on one agent; fixed steps run in code; complex tasks are split across agents. Streaming responses, cancellation, and explicit resumption of checkpointed runs are supported |
| How to connect data and business | [Business tools and MCP](./features/tools-mcp.md), [Skill packages](./features/skills.md), [knowledge and memory](./features/knowledge-memory.md) | Call your Python functions or external tools, load task guidance and scripts, retrieve business material, and keep session context per configuration |
| How to control risk and verify quality | [Runtime observability](./features/observability.md), [evals](./features/evals.md), [cost governance](./features/cost.md) | Inspect model and tool call records; compare results before and after changes; cap steps, usage, and duration; make high-risk tools wait for human approval per config |
| How to develop, deliver, and maintain | [Developer workbench](./features/workbench.md), [HTTP API](./api/rest.md), [CLI commands](./api/cli.md), [deployment](./deploy.md), [upgrades](./customization/upgrade.md) | Configure, debug, and troubleshoot in the browser; let existing systems call through the API; manage delivery with migrations, Docker, and CI, and follow the guide for source updates |

MCP is the standard protocol for connecting external tools; a Skill is a capability package of instructions, scripts, and material. Neither is a prerequisite for getting started.

### System architecture diagram

<a :href="architectureImage" target="_blank" rel="noopener"><img :src="architectureImage" alt="LubanAgent system architecture diagram: access entries, configuration management, task execution, shared capabilities, data storage, and engineering base, with runtime governance shared across all three execution styles" /></a>

*Figure 1: the system is layered by responsibility, with concrete modules inside each layer; runtime governance on the right is shared by single-agent, flows, and multi-agent. Click the image to zoom, or enable wide-screen mode at the top.*

**Read this diagram for composition**: the top is access and configuration, the middle is three task execution styles plus shared capabilities, and the bottom is data storage and the engineering base. The governance column is not an extra step; it is the recording and constraining of runs. Layers express responsibility, not a mandatory per-request order.

**The three execution styles are not three systems**: regular assistants, code flows, and multi-agent collaboration all live in this project with the same run records and governance. Flows integrate through code or tools; there is no drag-and-drop flow editor.

## Should you use it

If you are building an assistant that must call real business APIs, be deployed, and keep changing — and you're willing to develop in Python — LubanAgent is worth trying. Especially when:

- Model conversations already work, and you next need tools, knowledge, monitoring, and deployment.
- You need to keep source-code and data control for team testing, review, and customization.
- The same system needs both flexible Q&A and fixed rules, or several agents dividing the work.

Pick something lighter when:

- It's a throwaway experiment; a few lines of model calls suffice, and a full codebase is overkill.
- You don't want to write code and prefer configuring apps in a visual interface.
- You already have mature execution, monitoring, and deployment platforms and only need an orchestration library.

Non-Python businesses can still deploy it as a standalone service and call it through the API; but new business tools and flows still require Python. Before production you must also enable platform auth, create an admin, configure real models, set up data backups, and run business acceptance. The base ships platform RBAC, but it will not design your business-side organizational permissions for you.

### How it compares with common projects

| Project | Better suited for | Main difference from LubanAgent |
| --- | --- | --- |
| [LangGraph](https://github.com/langchain-ai/langgraph) | Designing execution flows yourself and integrating them into an existing project | It is the execution engine this project adopts. LubanAgent adds config management, tool and knowledge integration, a workbench, monitoring, and deployment engineering on top |
| [Dify](https://github.com/langgenius/dify) / [Coze Studio](https://github.com/coze-dev/coze-studio) | Building AI apps primarily through a visual interface | LubanAgent is source-code-first with Python business development; the choice is about development style, not a claim that visual platforms can't run in production |
| [Agno](https://github.com/agno-agi/agno) | Building agents, teams, and workflows in code with runtime management | Capabilities overlap. Compare whether you want to integrate a framework dependency or keep developing in a complete codebase, and check the current version's deployment and upgrade approach |
| [Google Agent Starter Pack](https://github.com/GoogleCloudPlatform/agent-starter-pack) | Starting from an agent engineering template, especially on Google Cloud | Both are starter-engineering directions. LubanAgent does not require a specific cloud; models and services deploy where you choose |

RuoYi is an analogy for the delivery shape, not a functional substitute in the agent domain. Other projects also have monitoring, evals, or approvals; validate the version you would actually use. LubanAgent's case is that **the whole engineering fits your development style**, not that "others have nothing."

## Technical architecture diagram

<a :href="technicalImage" target="_blank" rel="noopener"><img :src="technicalImage" alt="LubanAgent technical architecture diagram: React workbench, FastAPI interfaces, LangGraph and LangChain execution engine, capability adapters, SQLAlchemy data persistence, and engineering delivery" /></a>

*Figure 2: the stack expanded by frontend, interfaces, execution, adapters, and persistence, with build and delivery tools on the right and external resources at the bottom. Click the image to zoom.*

**Read this diagram for implementation**: the React workbench talks to FastAPI over HTTP / SSE; the Python backend executes tasks with LangGraph and connects models and tools through LangChain, with SQLAlchemy accessing the database. These are modules inside one codebase, not microservices you deploy separately.

- **Minimal local environment**: a Python program plus a SQLite file database. FakeLLM returns fixed content so you can verify installation and call chains without a real model; its demo vectors are not for judging real retrieval quality.
- **Real business environment**: add a real model service and implement your own business tools. The database can be MySQL; retrieval quality must be validated with your real corpus and embedding model — no dedicated vector database is required to get started.
- **Optional observability**: connect self-hosted Langfuse or LangSmith when you want a fuller observability UI, or turn it off; internal run records still go to the project database. Different backends do not show identical granularity.
- **Frontend and docs**: the workbench needs Node.js for development or building; the built pages are served by the Python service. The docs site is published separately and is not a runtime dependency.

The repo's Docker demo starts the app, MySQL, Langfuse, Langfuse's PostgreSQL, and the mock order service together. It is a convenient example bundle, not a claim that production must deploy all five services as-is. Ready-made IM / e-commerce channel connectors are not in the open-source core; external systems integrate through the API or extension points.

Once you decide to try it, head to [getting started](./getting-started.md). When connecting your own business, see the [development guide](/en/tutorial/); for detailed configuration and APIs, use this [manual](./index.md).
