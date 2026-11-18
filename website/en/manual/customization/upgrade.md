# Upgrading with Upstream

> LubanAgent is a "RuoYi-style starter base" — after cloning you move in for the long term, iterating and shipping to production. This page tells you how to periodically pull upstream changes back without losing your own.

## Why upgrading works: the territory contract

The underlying guarantee is **triple territory isolation** (see the [customization overview](./overview.md)):

- `lubanagent/` — framework territory, tracked upstream; in principle you don't touch it;
- `app/` — your territory; upstream **never touches it proactively** (files you add are naturally protected);
- `demos/` `tests/` `docs/` `migrations/` etc. — shared territory, merged by hand as needed.

Two CI guards keep the boundary: **import-linter** blocks reverse dependencies (`app → lubanagent` allowed, the reverse forbidden); the **`.lubanagent-upstream` guard** blocks upstream changes to user-owned paths. As long as your business changes live in your territory, upstream bug fixes, new capabilities, and performance work can be pulled back periodically with architectural non-interference.

## Upgrade steps

Configure the upstream remote once; every upgrade then takes five steps:

```bash
# One-time: register the upstream repository
git remote add upstream https://github.com/lubanagent-dev/LuBan.git

# ① Fetch and merge
git fetch upstream
git checkout master
git merge upstream/master        # Keep the merge node; rebase rewrites your commit hashes — be careful with collaborators

# ② Match CHANGELOG territory tags (table below) and apply the corresponding merge actions

# ③ Follow UPGRADE.md's "current-version upgrade notes" (migrations, dependencies, seed handling)

# ④ Run tests
python -m pytest

# ⑤ Run eval regression (confirm model/prompt/flow behavior wasn't skewed by the upgrade)
# Compare against your pre-upgrade eval baseline with --compare:
luban eval run customer-service-bot@<current version> --dataset <your dataset> --compare <previous baseline>
```

Where merge conflicts mainly happen:

- **`lubanagent/`**: conflicts if you modified framework code — prefer upstream, and convert your customization into an extension-point implementation in `app/tools/` or `app/graphs/` (scanned via `EXTENSION_PACKAGES`), or register manually in `app/main.py`;
- **Seed files inside `app/`** (`app/main.py`, customer-service example YAML, etc.): upstream touches them only for breaking changes; on conflict keep your version and take only the breaking fix;
- **Your files inside `app/`**: upstream never touches them;
- **Shared territory**: merge file by file by hand.

## CHANGELOG territory tags: match each change to its action

Every CHANGELOG entry is tagged by territory; find the corresponding merge action by tag:

| Tag | Territory | What you do |
| --- | --- | --- |
| `[framework]` | `lubanagent/` | Merge directly; usually conflict-free (the core benefit of following upstream) |
| `[scaffold-seed]` | Initial seed files in `app/` | Keep your changes; take only the upstream breaking fix |
| `[shared]` | `docs/` `tests/` `docker/` `pyproject.toml` etc. | Merge by hand, file by file; run `lint-imports` after merging |
| `[migration]` | Database schema | Run `luban migrate` immediately after merging (migrations are additive; never skip versions) |
| `[breaking]` | Extension-point Protocols / core contracts | Adapt your extension implementations by UPGRADE.md's migration examples; bump the major version |

## Semantics of the .lubanagent-upstream guard

The `.lubanagent-upstream` manifest at the repo root lists four path classes with globs: `[framework]` (tracked upstream), `[shared]`, `[scaffold-seed]` (seed), `[user-owned]` (upstream never touches proactively). The CI script checks whether an upstream PR diff hits user-owned globs and fails if so — **your business code is never passively rewritten by an upstream merge**.

An honest boundary: **the guard significantly reduces merge conflicts but does not promise zero conflicts for any git merge** (unregistered new paths, extreme name collisions, etc. can still conflict; self-check after merging). Usage notes:

- New business files under `app/` are auto-covered by wildcard rules (e.g. everything under `app/agents/` except seed YAML is user-owned); no manifest edit needed;
- Only when adding user files outside `app/` (e.g. the repo root) do you need to add globs under `[user-owned]`;
- When `user-owned` overlaps `scaffold-seed`, `scaffold-seed` wins (seed files may be changed upstream);
- The guard only prevents "upstream changing the user territory", not "user changing the framework territory" — the latter is constrained by import-linter;
- Self-check locally (is the upstream diff over-reaching?):

```bash
python scripts/check_upstream_guard.py --base upstream/master
```

## YAML export/import in upgrades

The canonical form of an agent definition is a **database record**; YAML exists only for initial import and export/migration — which makes it exactly the backup and migration vehicle during upgrades:

- **Before upgrading**: export production agent definitions to YAML as a snapshot;
- **Cross-environment migration** (e.g. staging → production): import the exported YAML into the new environment once.

Note: editing a YAML file changes no running agent — it takes effect only after re-import. In production, definition editing happens through the workbench/API; YAML is a migration channel, not storage.

## Post-merge verification checklist

```bash
# 1. Code style
.venv/bin/ruff check lubanagent tests migrations app demos scripts
# 2. Database migration (if this merge includes [migration])
.venv/bin/luban migrate
# 3. Re-initialize (if seed files changed)
.venv/bin/luban init
# 4. Dependency-direction guard (was territory isolation broken?)
.venv/bin/lint-imports --config importlinter.toml
# 5. Upstream-guard self-check
python scripts/check_upstream_guard.py --base upstream/master
# 6. Full tests + coverage gate
.venv/bin/python -m pytest --cov=lubanagent --cov-fail-under=70
# 7. Docker full-stack smoke test (run locally)
docker compose up -d
```

**Boundary**: `[breaking]` changes carry no backward compatibility; before upgrading, read the CHANGELOG entries and UPGRADE.md's migration examples; validate in staging before production upgrades. `alembic downgrade base` drops tables — always back up production first.
