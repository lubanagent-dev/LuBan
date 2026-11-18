---
layout: home

hero:
  name: "LubanAgent"
  text: "Start your agents with a complete engineering base"
  tagline: An open-source starting point for developers. Built on Python, LangChain and LangGraph, it brings model access, tools, multi-agent teams, monitoring and deployment into one source repository you can customize. Write your business logic without assembling the infrastructure again.
  actions:
    - theme: brand
      text: Meet LubanAgent
      link: /en/manual/introduction
    - theme: alt
      text: Quick start
      link: /en/manual/getting-started
    - theme: alt
      text: View source
      link: https://github.com/lubanagent-dev/LuBan

origin:
  eyebrow: From a working prototype to a maintained business system
  title: "Why build this when so many agent frameworks already exist?"
  paragraphs:
    - Agent frameworks offer plenty to learn from, including Claude Code SDK, pi Agent, LangChain, LangGraph and Agno. What I wanted was a ready-to-use engineering scaffold for company projects and side projects, with less time spent repeating setup work.
    - Once model and tool calls work, a real project still needs prompt management, agent debugging, API-key configuration and versioned definitions. LubanAgent grew out of that repeated work between a prototype and a business system.
    - RuoYi, a full-source Java application scaffold, provided the delivery model. Clone the repository and keep developing in your own business directory. LubanAgent reuses LangChain and LangGraph, connecting definitions, versions, prompts, models, single agents, teams, the workbench, monitoring and deployment instead of building another execution engine or observability platform.
    - Saving a new agent definition does not require a restart. Business and framework code have separate ownership boundaries for maintenance and upstream upgrades. If this is the starting point you need, star the project on GitHub or help improve it.
  link: /en/manual/introduction
  linkText: Read the project story and design choices →

features:
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 22"/></svg>'
    title: Your business logic, in your source code
    details: The cloned repository becomes your project. Business code lives in app/ and framework code in lubanagent/. Follow the upgrade guide to merge upstream with fewer conflicts.
    link: /en/manual/customization/overview
    linkText: Customize the project
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></svg>'
    title: Editable configuration, traceable versions
    details: Agent definitions are stored in the database with version history. Change personas and tools without a release; each run records the definition version it used.
    link: /en/manual/features/agent-definition
    linkText: Definitions and versions
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5m6-5v5M9 18v5m6-5v5M1 9h5m-5 6h5m12-6h5m-5 6h5"/><rect x="10" y="10" width="4" height="4" rx="1"/></svg>'
    title: Switch models without rewriting business logic
    details: Agents use logical fast / smart / cheap / vision slots. Change mappings in the model center to connect OpenAI-compatible cloud services or local models.
    link: /en/manual/features/models
    linkText: Connect models
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/></svg>'
    title: Agents, workflows and teams run together
    details: Ordinary agents do not require hand-written graphs. Fixed workflows use LangGraph, and supervisors delegate complex tasks to child agents. All three share run records and governance.
    link: /en/manual/features/graphs
    linkText: Workflows and teams
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 8 3v6c0 5-5 9-8 11-3-2-8-6-8-11V5l8-3Z"/><path d="M7 12h3l2-4 2 8 2-4h2"/></svg>'
    title: Monitoring and execution boundaries included
    details: Code enforces step limits, budgets, timeouts and cancellation. Traces record model and tool calls. Use Langfuse or LangSmith while keeping the internal database as the source of truth.
    link: /en/manual/features/observability
    linkText: Inspect runs
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4M6 7h5m-5 4h8m3-4h1"/></svg>'
    title: Workbench and deployment included
    details: Edit definitions, manage models, debug runs and inspect traces and evaluations. Start with SQLite, use MySQL in production, and integrate through Docker and REST / SSE.
    link: /en/manual/features/workbench
    linkText: Explore the workbench
---

## What is LubanAgent?

LubanAgent is a complete engineering base for developing business agents. It uses Python ≥3.11, LangChain and LangGraph and is open source under Apache-2.0.

It delivers a source repository, not a hosted platform. Build customer-service assistants, internal knowledge assistants, approval workflows or multi-agent systems in it, or integrate it as an independent service through REST / SSE. The included customer-service scenario demonstrates the full pipeline; it is an example, not the product's scope limit.

For developers familiar with Java: **RuoYi assembles Spring Boot into a starting point for business applications; LubanAgent assembles LangChain / LangGraph into a starting point for agent applications.** This compares delivery models, not feature sets.

## What we maintain and what we reuse

LubanAgent uses LangChain / LangGraph directly rather than reinventing the model-and-tool loop. Observability adapters connect Langfuse or LangSmith instead of creating another observability platform.

We maintain the engineering project around those dependencies: agent definitions and versions, model configuration, run records, a workbench, and boundaries for business code and upstream upgrades. You still write your own business tools, permission rules and acceptance criteria, but you do not have to reconnect the infrastructure before starting.

[Read the introduction: origins, suitable scenarios and design choices →](/en/manual/introduction)

## Start here

| What you want to do | Documentation |
| --- | --- |
| Decide whether this fits your team | [Introduction](/en/manual/introduction) |
| Run your first local request | [Quick start](/en/manual/getting-started) |
| Connect models and write business tools | [Development guide](/en/tutorial/) |
| Look up configuration, APIs or feature boundaries | [User manual](/en/manual/) |
| Understand source layout and extension points | [Architecture](/en/manual/architecture) |
| Deploy, operate and follow upgrades | [Deployment](/en/manual/deploy) · [Upgrade guide](/en/manual/customization/upgrade) |
