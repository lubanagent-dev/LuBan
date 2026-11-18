# Deployment and Production Checklist

> How to run during development is covered in [getting started](./getting-started.md). This page covers deployment shapes and what you must do before production.

## Three deployment shapes

| Shape | Command | When to use |
| --- | --- | --- |
| Local full-stack dev | `scripts/dev.sh start` | Daily development: API :8000 + workbench :5173 with hot reload |
| Single-machine Docker stack | `docker compose up -d --build` | Demos / self-hosting: app+UI, MySQL, Langfuse, mock-biz — five services, one command |
| Production | Same, plus the production checklist | Container orchestration in your infrastructure (move compose services one by one into K8s) |

The image is built in three stages (Node builds the workbench frontend → venv → runtime), and FastAPI serves the UI and API on the same port. On container start the app automatically runs `luban migrate && luban init`; both are idempotent and safe to restart.

## Production checklist (go through each item before launch)

1. **Enable auth**: production requires `AUTH_ENABLED=true`. To use database accounts when no `API_KEY` is set, set `AUTH_DATABASE_ENABLED=true`; the first-run empty-database wizard then asks you to set a 12–256 character `LUBAN_ADMIN_PASSWORD`. `API_KEY` still works as a break-glass identity. The service fails fast at startup only when auth is on, there is no `API_KEY`, no custom AuthProvider, and `AUTH_DATABASE_ENABLED=false`. In database-account mode, if there is no active admin, no API key/provider, and `LUBAN_ADMIN_PASSWORD` is unset, the first start also fails with `CONFIG_ERROR`; restarting with an active admin already present does not require the bootstrap password.
2. **Run migrations and manage accounts**: run `luban migrate` first to create `application_logs` and the security tables for users, roles, permissions, and sessions; after login assign roles by least privilege and keep at least one enabled admin. Tokens default to 8 hours (`AUTH_SESSION_HOURS`) and only hashes are stored; disabling a user, changing passwords, and logging out revoke existing sessions, while role/permission changes do not revoke and take effect in real time via per-request reload.
3. **Change the Langfuse default password**, or switch directly to `OBSERVABILITY_BACKEND=langsmith / none` (the internal DB is always the source of truth; see [runtime observability](./features/observability.md)).
4. **Real MySQL credentials**: change `DATABASE_URL`; do not keep the default account and password from the compose example.
5. **Persistent volumes**: the MySQL data volume and the upload directory (`data/`, containing knowledge-base files and avatars; configurable via the `AVATAR_FILES_ROOT` env) must be mounted on persistent volumes.
6. **Environment layering**: overlay `.env` per dev/staging/prod; keep secrets in your secret manager — never in images or the repository.
7. **Trusted gateway**: the server-side scopes of a custom AuthProvider are the only trusted permission source; do not declare roles through headers or request bodies. `user_id` remains a business-side troubleshooting label, not a platform-account foreign key; platform RBAC does not do tenant, department, or row-level authorization.

For complete step-by-step operations and upgrade notes, see [docs/UPGRADE.md](https://github.com/lubanagent-dev/LuBan/blob/master/docs/UPGRADE.md).

## Upgrade operations

Upstream updates come through `git merge` plus CHANGELOG territory tags (`[framework]` / `[scaffold-seed]` / `[shared]` / `[migration]` / `[breaking]`) so each change lands in the right place; see [upgrading with upstream](./customization/upgrade.md).

## Monitoring and troubleshooting

- **Debugging one conversation**: filter in the workbench Traces page or the `/diagnostics` page by session ID / `user_id` / Run / Trace / `X-Request-ID`. The execution-tree detail includes session input/output, Trace events, and correlated code logs. Logs are kept 30 days by default; a full queue or database write failure may drop batches, and the API exposes `dropped_count` and `write_failures`.
- **Cost**: the [cost governance](./features/cost.md) reports aggregate by agent/session/day; a zero cost in the debug console usually means unit prices were not set when registering the model.
- **Quality regression**: run [evals](./features/evals.md) against a baseline before launch; `--compare` exits 1 on regression, so it can gate CI.
