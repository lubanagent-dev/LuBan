# Development Guide

This guide shows how to add your own business to LubanAgent: creating agents, connecting models, writing tools, configuring knowledge bases, validating results, and deploying the service.

If you are still deciding whether to adopt this project, start with [the project introduction](../manual/introduction.md). If you just want to verify that the service runs, go straight to [getting started](../manual/getting-started.md). This guide is organized by development task; you do not need to read everything before you start.

## Pick by current task

| Current task | Document | Prerequisites |
| --- | --- | --- |
| Understand how agents, tools, knowledge retrieval, and flows relate | [Agent concepts](./00-primer.md) | No installation needed |
| Set up a local environment and verify the API and workbench | [Local run](./01-setup-and-first-run.md) | Python ≥3.11, uv; Node.js ≥20 for the workbench |
| Create a definition and check import and version behavior | [Create your agent](./02-first-agent.md) | Local services running |
| Register a real model and adjust logical slot mappings | [Connect real models](./03-real-models.md) | Credentials and endpoint for a model service |
| Call your own business APIs and handle high-risk approvals | [Write business tools](./04-write-a-tool.md) | Python skills; a callable real model |
| Upload documents and calibrate retrieval and refusal behavior | [Configure knowledge retrieval](./05-knowledge-rag.md) | An agent and knowledge material created |
| Build an eval set and validate results before and after changes | [Evals and regression](./06-evals.md) | A testable agent and expected outcomes |
| Execute fixed steps or split work across multiple agents | [Flows and multi-agent](./07-graphs-and-teams.md) | Tools, rules, and evals already defined |
| Deploy, connect an observability backend, and check upgrade paths | [Deploy and upgrade](./08-deploy.md) | Business features validated |
| Integrate existing systems and prepare go-live acceptance | [Business integration and acceptance](./09-graduation.md) | Clear interfaces, permissions, and launch scope |

## Examples vs. real business

The walkthroughs use a library lending assistant `my-lib-assistant` to demonstrate lookup tools, high-risk approval, knowledge retrieval, and multi-agent delegation; the repository also ships a customer-service example. They exist to show extension patterns and do not limit what kind of business you build.

If you follow the library example, complete the local run, agent creation, and real-model steps in order, then add tools and the knowledge base. Other pages can be read by task. Reference configuration and code live in `reference/`; the interfaces, permissions, rules, and eval data of your actual business are yours to implement.

## Running and validating

- The dev environment can exercise the full chain with SQLite and FakeLLM — no external model keys required. FakeLLM returns fixed content and is not a measure of model quality.
- Real-model tool calling, cost, and response quality depend on the provider and model version; no guarantee that a fixed budget completes every operation.
- After each change, check the validation items on the corresponding page. If they do not match, check your environment, configuration, and API responses first, then consult the FAQ or file an issue.
- Before deploying, work through [the production checklist](../manual/deploy.md); do not use example configuration as production configuration.

## Where to find configuration and API details

This guide only shows fields relevant to the current task. Full configuration, APIs, and feature boundaries are in [the manual](../manual/index.md); source layout and extension points are in [architecture](../manual/architecture.md).

The docs are maintained in sync with the repository main line. When using a released version, also check the configuration of that version and [the changelog](https://github.com/lubanagent-dev/LuBan/blob/master/CHANGELOG.md). When reporting issues, include the version, the commands you ran, sanitized error output, and expected vs. actual results.
