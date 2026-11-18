# Business Integration and Acceptance

Once an agent runs on your machine, you still need to check business interfaces, permissions, failure paths, and the deployment environment. This page collects the work required to turn the examples into a real business system.

## 1. Integrate your own business

1. Implement lookup, write, and other business capabilities as tools in `app/`, with clear input validation, permissions, timeouts, and idempotency policies.
2. Adjust the persona, tools, model slots, and knowledge configuration in the agent definition, import it, and confirm the version in the workbench.
3. Put fixed steps and money calculations into business code or LangGraph flows; design team delegation only when multiple responsibilities are involved.
4. Connect existing clients via REST / SSE; for high-risk operations also wire up human approval — do not consume only the final reply and ignore approval events.

See [business integration](../manual/customization/business-integration.md), [writing tools](./04-write-a-tool.md), and [flows and teams](./07-graphs-and-teams.md) for specifics.

## 2. Go-live acceptance checklist

| Check | Evidence to keep |
| --- | --- |
| Normal calls complete; definitions and versions are traceable | API / SSE responses plus the corresponding Run / Trace |
| Invalid or unauthorized tool input is not executed | Negative-test output, business interface logs |
| High-risk tools cannot run without approval; rejection and timeout have clear outcomes | Approval events, execution records, failure cases |
| Deterministic flows order correctly; team delegation behaves as expected | Success, failure, and cancel cases for flows and teams |
| Knowledge hits, misses, and gray-area questions match business expectations | Retrieval results calibrated with real corpus, plus eval reports |
| Persona, model, or tool changes did not break key behavior | Before/after comparison on the same eval set |
| Budget, timeout, cancellation, and recovery meet business requirements | Run records for limits and failure paths |
| Credentials, network access, logging, and backups configured correctly | Sanitized configuration, health checks, backup/restore drills |
| After upgrades, business code and data still work | Merge records, migration results, regression reports, rollback plan |

Select items based on the capabilities your project actually uses. Do not treat example thresholds, fixed replies, or eval pass rates as production quality standards.

## 3. Ongoing maintenance

- Full fields and limits: [the manual](../manual/index.md).
- Configure real models, observability, and databases: [swap models and backends](../manual/customization/swap-backends.md).
- Prepare production: [the deploy checklist](../manual/deploy.md) and [SECURITY.md](https://github.com/lubanagent-dev/LuBan/blob/master/SECURITY.md).
- Merge future framework updates: [the upgrade guide](../manual/customization/upgrade.md).

When reporting problems, include the version, reproduction steps, expected and actual results, and a sanitized Trace if needed. Do not upload API keys, user privacy, or internal business data.
