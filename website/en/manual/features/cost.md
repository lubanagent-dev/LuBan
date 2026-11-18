# Cost Governance

> This page covers KV-cache-friendly invariants, token estimation, Run-level budget cutoffs, and the cost formula and unit-price fields.

**What it is**: context assembly guarantees KV-cache-friendly invariants (stable prefix, append-only; hit rate depends on vendor cache semantics); token estimation up front (approximate — you know the rough cost before calling); Run-level budgets with over-limit cutoffs (stop on hitting the line, recorded in Trace); cost reports aggregated by agent/session/day with optimization suggestions.

**Why it exists**: runaway cost is a real billing incident (retries silently burning money, context growing without bound); cost must be governable before and during a run, not only reconciled afterwards.

**How cost is computed**: one Run's cost = `input tokens / 1000 × input price + output tokens / 1000 × output price`, with prices in the model registration's `params` — `input_price_per_1k` and `output_price_per_1k` (price per 1k tokens). **A zero cost in the debug console usually means the model lacks these two fields** (FakeLLM or a real model without prices both show 0). Real attribution requires the prices. These fields are consumed by the framework's billing layer and are never forwarded to the model SDK.

**Boundary**: budget cutoffs hang on the Runtime enforced by code (see [Agent Runtime](./runtime.md)); cost attribution depends on each Run's Trace (see [runtime observability](./observability.md)). Unit prices are set at model registration (see [model center and model factory](./models.md)).
