# Runtime Observability

> This page covers what each Run's complete Trace records, why it is the data foundation of the governance mainline, and how to query and read it.

**What it is**: every Run writes one complete Trace: agent definition version, actual model, final prompt, every tool call (inputs/outputs/duration), token usage, cost, and end reason (completed / step limit / budget exceeded / cancelled / error).

**Why it exists**: troubleshooting relies on it, eval material relies on it ([evals](./evals.md) must be based on real runtime observation), and cost attribution relies on it (see [cost governance](./cost.md)). One Trace, three uses — the data foundation of the governance mainline.

**How to use it**: query Traces via API by session / user label / time (`user_id` is a pass-through observability label set at Run creation; see [Agent Runtime](./runtime.md)); visualize in the [developer workbench](./workbench.md), where the Trace list and detail show each Run's session ID and user label directly; data stays in your own database with no SaaS dependency.

## Platform logs and unified diagnostics

**What it is**: `core/log_context` propagates `request_id`, `session_id`, `run_id`, `trace_id`, `parent_run_id`, `root_run_id`, and `subject` across requests, Runs, sub-Runs, graph/team nodes, and tool chains. Eligible program logs are written to `application_logs` and, together with Run inputs/outputs and Trace events, feed the `/diagnostics` page.

**Why it exists**: a production issue usually shows up simultaneously as "what the user saw", "what the engine executed", and "what the code logged". Unified correlation keys stitch all three scenes into one execution tree — no manually guessing relationships across log files and the database.

**How to use it**: `GET /v1/logs` filters by correlation ID, level, logger, keyword, time, and pagination; `GET /v1/diagnostics/runs` filters by session, Run, Trace, user label, and status; `GET /v1/diagnostics/runs/{run_or_trace_id}` returns the root Run, descendant Runs, Trace events, and log counts. The frontend `/diagnostics` page reuses the same APIs. HTTP responses carry `X-Request-ID`, which can also be used to look up code logs from error responses; `request_id` participates only in log filtering and is not a persisted column of the Run table.

**Boundary**: the default queue is 10000 with a background flush every 0.25 seconds; each flush takes a queue snapshot and writes multiple consecutive batches of up to 200 entries; a single body/exception is capped at 32 KiB UTF-8 and extras serialization at 16 KiB (over-limits record a truncated marker and a 4 KiB preview); on shutdown the service stops accepting, waits for in-flight batches to commit, then flushes the rest. Retention defaults to 30 days; a full queue or write failure does not block business but may lose whole batches, exposed via the query APIs: `dropped_count` is the cumulative number of dropped log entries (all causes summed: queue full, batch write failure/cancellation, etc.), and `write_failures` is the number of write/cleanup failure events (not entries). Inbound credentials are redacted on a best-effort basis — this is not a guarantee of detecting arbitrary personal sensitive information (PII); there is also no automatic capture of all `print` output or third-party library logs.

**Boundary**: the observability backend (self-hosted Langfuse by default / LangSmith / off) is a switchable side channel; the internal DB is always the source of truth. How to switch: [deployment](../deploy.md) and the [customization guide](../customization/overview.md).

## External Watchdog — independent patrol for stuck Runs

**What it is**: a timed patrol loop independent of the execution engine (enabled with env `WATCHDOG_ENABLED=true`, default off) that periodically scans RUNNING Runs and raises alerts when the event stream goes stale beyond a threshold (`stale_events`) or runtime exceeds the cap (`long_running`) — alert events land in the target Run's Trace (visible in the workbench Trace detail), queryable via `GET /v1/watchdog/alerts`.

**Why it exists**: the execution engine cannot report that it itself is stuck. The Watchdog runs outside the main system and stays alive when the engine hangs — that is the meaning of "external", and the direct basis for distinguishing "slow" from "dead" during troubleshooting.

**How to use it** (env vars, all with defaults):

```bash
WATCHDOG_ENABLED=true
WATCHDOG_INTERVAL_SECONDS=60      # Patrol interval (default 60s)
WATCHDOG_STALE_AFTER_SECONDS=300  # Stale-event threshold (default 300s)
WATCHDOG_MAX_RUN_SECONDS=3600     # Max runtime (default 3600s)
```

**Boundary**: by default it **only alerts, never acts** — whether to intervene after an alert is your call; implement a `WatchdogActionHandler` for automatic handling (the built-in `CancelHandler` cancels alerted Runs and can be injected directly or used as a reference). The same Run and cause alert only once — no spamming; newly created Runs have a grace period so they are not flagged before having a chance to emit events.
