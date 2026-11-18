# Multi-Agent Collaboration

> This page covers when multi-agent is needed, how to write the supervisor delegation topology, and the key design that "orchestration Runs are governed like single-agent Runs."

**When it's needed**: one agent isn't enough — complex tasks need division of labor (one plans, one retrieves, one executes), or several specialized agents must be chained into a collaboration. This adds a layer on top of [graph orchestration](./graphs.md): composing "node = agent" into a supervisor / sub-agent delegation topology.

**What it is**: LangGraph-based controlled multi-agent orchestration — the supervisor decides which sub-agent takes the next step, sub-agents report back when done, shared state flows between nodes, with conditional routing and human pausing. **Key point: orchestration Runs enjoy the same governance as single-agent Runs** — every sub-agent call enters Trace (bound to its own definition version and actual model), the whole orchestration is subject to budget cutoffs, high-risk nodes can be human-confirmed, and orchestrations can be regression-tested and replayed through evals. No separate governance stack.

**How to use it** (illustrative):

```python
from lubanagent.multiagent import TeamBuilder

team = (
    TeamBuilder("cs-team", description="客服分流团队")
    .supervisor("cs-triage")              # The supervisor is a registered agent key (with its own brain)
    .agent("cs-faq", description="退货政策咨询")
    .agent("cs-refund", description="退款执行")
    .route(max_delegations=4)             # Only set the delegation cap; routing is decided by the supervisor agent's LLM
    .build()
)
```

**Boundary**: multi-agent is optional — if one agent solves it, don't force multi-agent (you pay coordination cost and tokens for nothing). Code-first; no visual orchestration platform.
