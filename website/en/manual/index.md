# User Manual

This manual explains how to configure, call, and limit each LubanAgent feature. Look up the page you need when you need it.

If this is your first look at the project, start with the [project introduction](./introduction.md) to decide whether it fits your business. When you are ready to try it, read [getting started](./getting-started.md). When you want to add your own tools, models, and knowledge, see the [development guide](/en/tutorial/). Unfamiliar terms are collected in the [glossary](./glossary.md).

## Manual structure

| Section | What it answers |
| --- | --- |
| [Project introduction](./introduction.md) | What the project is, why use it, when it fits, and how it compares with similar projects |
| [Getting started](./getting-started.md) | The shortest path from cloning the repo to the first conversation |
| [Architecture](./architecture.md) | System layers, territory isolation, the data flow of one Run, and the deployment topology — four diagrams |
| [Feature manual](./features/agent-definition.md) | 14 features in depth: definitions / Prompt library / model factory / Runtime / Tools·MCP / Skills / knowledge and memory / observability / evals / cost / graph orchestration / multi-agent / workbench / built-in customer service |
| [API reference](./api/rest.md) | Full REST endpoint table, SSE event protocol and error codes, full CLI command table |
| [Customization guide](./customization/overview.md) | Turning the base into your business: writing Tools/Skills, graphs and teams, swapping models and backends, business integration, upstream upgrades |
| [Deployment](./deploy.md) | Docker full stack, production security checklist, observability backends |
| [Benchmark research](./research/platform-comparison.md) | Requirements × 27 open-source projects comparison matrix and technical principles, plus 27 isomorphic diagrams |

## How to use this manual

1. **You know the feature name** → click it under "Feature manual" in the sidebar.
2. **You know the call style** (HTTP / SSE / CLI) → "API reference".
3. **You want to change framework defaults** (models, database, custom auth) → "Customization guide".
4. **You hit an unfamiliar term** → [glossary](./glossary.md).

## Coverage

This manual covers the Apache-2.0 open-source core. Ready-made IM / e-commerce channel connectors are not part of this repository; external business systems can integrate themselves through REST / SSE or the `ChannelConnector` extension point, see [business integration](./customization/business-integration.md).

## Online documentation usage policy {#docs-use-policy}

These web pages are provided for online reading. The site operator asks AI tools not to automatically crawl, index, or train on them, and not to export, mirror, or persist the manual, feature descriptions, or tutorials to local storage. For offline development or reading, get the open-source code and repository documentation from [GitHub](https://github.com/lubanagent-dev/LuBan). Manually copying code examples remains fine.

This is a usage request for hosted pages, not a technical anti-download measure; normal browser caching is out of scope. Source code and repository-shipped documentation remain under Apache-2.0, and this statement neither revokes nor narrows that license.

Every page carries `robots` metadata, and `robots.txt` is generated at build time. These declarations rely on voluntary compliance; `noai` / `noimageai` are not universal standards. Standard crawlers only read `/robots.txt` at the domain root — the `/LuBan/robots.txt` of a GitHub Pages project page cannot substitute for it. When deploying on your own domain, place the generated file at the domain root.
