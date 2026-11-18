# CLI Command Reference

> The `luban` command line is the entry point for initialization / migration / import-export / evals; it carries no runtime duties. Commands: `luban init`, `luban export`, `luban migrate`, `luban eval run`. For first installation, see [getting started](../getting-started.md).

For every command the `--database-url` option can be replaced by the `DATABASE_URL` environment variable; when both are absent, `Settings.load()` configuration is read (the `DATABASE_URL` in `.env`, defaulting to SQLite).

## luban init

**Purpose**: seed the database (built-in defaults, idempotent) + scan `agents_dir` for `*.yaml` files (sorted by filename) to import agent definitions. Safe to call repeatedly.

**Import idempotency semantics**:

- Agent missing → create (version=1);
- Exists and content changed (compared after stripping the runtime fields `version`/`status`) → append a new version (version+1);
- Exists and content matches the current version → skip, appending an `(unchanged)` marker to output;
- `--fill-missing`: always skip existing agents and never append versions (used by dev.sh auto-start so stale disk YAML cannot clobber workbench edits).

| Option | Meaning | Default |
|---|---|---|
| `--agents-dir` | Directory of agent YAML files | `app/agents` |
| `--database-url` | Database URL (or env `DATABASE_URL`) | Settings config |
| `--fill-missing` | Import only missing agents; existing ones always skipped | Off |

```bash
.venv/bin/luban init
# Output: one key@version line per agent, with (unchanged) appended when unchanged
# customer-service-bot@3 (unchanged)
# lib-assistant@2
```

## luban export

**Purpose**: export an agent definition as YAML — the return path of the import/export migration pair. Round-trip lossless: exported YAML can be re-imported directly with `luban init`.

| Option | Meaning | Default |
|---|---|---|
| `key` (positional) | Agent key | Required |
| `--output` | Output file path | Prints to stdout by default |
| `--version` | Version number | Defaults to current version |
| `--database-url` | Database URL (or env `DATABASE_URL`) | Settings config |

Exits with error codes `AGENT_NOT_FOUND` / `AGENT_VERSION_NOT_FOUND` (exit 1) when the agent or version does not exist.

```bash
# Export the current version to a file
.venv/bin/luban export customer-service-bot --output backup/cs-bot.yaml
# Export a specific version and print to the terminal
.venv/bin/luban export customer-service-bot --version 2
```

## luban migrate

**Purpose**: run Alembic database migrations (`upgrade head`) to create/upgrade tables. Reads `alembic.ini` at the repo root; migration scripts live in `migrations/`.

| Option | Meaning | Default |
|---|---|---|
| `--database-url` | Database URL (or env `DATABASE_URL`) | Settings config |

```bash
.venv/bin/luban migrate
# Output: migrated to head
```

The Docker full-stack container automatically runs `luban migrate && luban init` at startup (both idempotent; safe to restart).

## luban eval run

**Purpose**: run an eval dataset, printing PASS/FAIL per case plus `pass_rate`; reports are persisted (readable via `GET /v1/evals`). Regression-gate semantics: [evals](../features/evals.md).

| Option | Meaning | Default |
|---|---|---|
| `agent` (positional) | Agent spec: `key` (current version) or `key@version`; a non-integer after `@` reports `VALIDATION_ERROR` | Required |
| `--dataset` | Path to the eval dataset YAML | Required |
| `--compare` | Comparison target: baseline version number (plain digits) or a baseline report JSON file path | None |
| `--save` | Output path for this report's JSON (usable as the next `--compare` baseline) | None |
| `--auto-approve` | Auto-approve approval-type tools: high-risk tools execute for real; by default they do not execute (tool-call intent is still captured by `expect_tools` assertions) | Off |
| `--database-url` | Database URL (or env `DATABASE_URL`) | Settings config |

**Exit code semantics**:

- `0`: normal end (including a completed eval with no regression);
- `1`: `--compare` hit a regression (a case flipped PASS→FAIL or pass_rate dropped);
- `2`: run error (missing agent/version, dataset load failure, execution exception, etc.; stderr prints `error: <code>: <message>`).

**Output format**: one line per case, `[PASS]`/`[FAIL] <case name>` (FAIL includes the reason), ending with `pass_rate: 0.83 (5/6)`; with `--compare`, three extra lines: `regressions` / `improvements` / `pass_rate_delta`.

```bash
# Run a dataset and save the report
.venv/bin/luban eval run customer-service-bot --dataset datasets/cs_eval.yaml --save reports/baseline.json

# Compare against version 2; CI fails on regression (exit 1)
.venv/bin/luban eval run customer-service-bot@3 --dataset datasets/cs_eval.yaml --compare 2

# Compare against a baseline report JSON
.venv/bin/luban eval run customer-service-bot@3 --dataset datasets/cs_eval.yaml --compare reports/baseline.json
```

Dataset format, assertions, and judge usage: [evals](../features/evals.md); agent YAML fields: [Agent definitions and versioning](../features/agent-definition.md).
