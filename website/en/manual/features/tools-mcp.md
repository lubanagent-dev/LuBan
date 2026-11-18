# Tools and MCP

> This page covers business tools (Python Tools), the official MCP definition, the MCP Client for consuming external tool ecosystems, the MCP Server for exposing your own tools, and the tool governance chain.

## Python Tool — the only place business actions require code

**What it is**: a Tool is a Python function plus three declarations: a natural-language description (for the model), a JSON Schema for parameters (for the model to fill), and governance attributes (permission, high-risk flag, timeout/retry/idempotency).

**Why it exists**: deterministic rules (permissions, amounts, approvals) must run in code, not be declared by prompts. Tools support standalone debugging and Mock — you can unit-test a Tool without starting an agent.

```python
@tool(description="查询订单状态与物流", risk="low", idempotent=True, timeout_seconds=10)
def query_order(order_id: str) -> dict: ...
```

For the full steps of writing Tools, see the [customization guide](../customization/overview.md).

## Async tool calls — long tasks don't block conversations

**What it is**: a tool can be declared asynchronous (`execution_mode="async"`). With the switch on (env `TOOL_ASYNC_ENABLED=true`), calling an async tool immediately returns `{"status": "started", "task_id": "task-1"}`, the task runs in the background, and on completion a `task.finished` event is pushed into the Run's event stream. The framework injects two companion tools: `task_result(task_id)` fetches the result (calling again while the task runs keeps waiting) and `task_stop(task_id)` terminates it.

**Why it exists**: long tasks such as eval batches or data processing would block one Run for a long time if synchronous. Asynchronizing them lets the model offload long tasks to the background and keep conversing and reasoning, decoupling foreground responses from background execution.

**How to use it**:

```python
@tool(description="批量重导历史数据", execution_mode="async")
def batch_reimport(dataset: str) -> dict: ...
```

```bash
# Turn the switch on via env (default off; when off, async-declared tools run like ordinary synchronous tools)
TOOL_ASYNC_ENABLED=true
```

**Boundary**: the approval gate still completes synchronously before the background task starts — high-risk tools cannot bypass human confirmation via async; at Run end, tasks the model hasn't collected with `task_result` are cleaned up automatically and recorded in the `abandoned_tasks` field of the terminal event payload; tasks are not persisted — background tasks are lost on process restart and `task_result` honestly returns `not_found` (no pretending it's still running).

## What MCP is (official definition)

MCP (Model Context Protocol) is an **open standard** initiated and open-sourced by Anthropic, officially defined as "an open standard that connects AI applications to external systems … think of it like a USB-C port for AI applications" ([modelcontextprotocol.io](https://modelcontextprotocol.io/docs/getting-started/intro)). One MCP Server can expose three kinds of things: **Tools** (executable actions), **Resources** (data), and **Prompts** (prompt templates); transports support stdio and Streamable HTTP.

Ecosystem facts (checked 2026-07): under the official org [github.com/modelcontextprotocol](https://github.com/modelcontextprotocol), the `servers` repo has 88.6k★ and `python-sdk` 23.6k★; AWS has also released [awslabs/mcp](https://github.com/awslabs/mcp) (9.5k★, "Open source MCP Servers for AWS"). MCP is the de facto standard.

## MCP Client — consume other people's tool ecosystem

Register an external MCP Server in configuration; its exposed tools are wrapped and automatically enter the agent's available Tool list, governed exactly like local Python Tools (permission checks, human confirmation, timeout/retry):

```yaml
mcp_servers:
  github-mcp: { transport: "http", url: "https://...", env: { GITHUB_TOKEN: "<token>" } }
  fs-mcp:     { transport: "stdio", command: "npx -y @modelcontextprotocol/server-filesystem /data" }
```

## MCP Server exposure — give your tools to others

One switch exposes LubanAgent's own Tools (even a whole agent) as a standard MCP Server; Claude Code, Cursor, and other agent systems can call them directly. Existing enterprise capabilities therefore become reusable by any MCP-ecosystem client instead of being locked inside this system.

## Governance

Permission and argument checks before calling → mandatory human confirmation for high-risk Tools → execution (timeout/retry/idempotency policies) → everything into the Trace (see [runtime observability](./observability.md)).
