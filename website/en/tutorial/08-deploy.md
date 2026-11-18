# Deploy and Upgrade

Build the Docker deployment, wire up the observability backend, and rehearse an upstream upgrade. Prerequisite: business features are already verified. Before going to production you must check auth, credentials, networking, data backup, and rollback — never ship the example configuration as-is.

## 1. Approach: the image, observability layers, and the territory contract

The three concepts in this section each govern one thing: the image governs "what gets delivered", the observability layers govern "how you see it", and the territory contract governs "how you grow with it". Together they answer one question: why can this base keep residents long-term. Take them one at a time.

**One image, one port.** The `app` image ships three things: the Python runtime, the backend, and **the built workbench frontend** (bundled with node at build time, served by FastAPI on port 8000 at runtime). So in production there is no such thing as a "frontend server" — one image, one port, and you can even skip the reverse proxy argument.

Break this design into its three ledgers: **at build time**, node bundles the workbench into static files and bakes them into the image — from then on the frontend has a "version" that advances and rolls back with the image, so the classic incident of "new code, old page" cannot happen; **at runtime**, FastAPI serves those static files — one fewer service means one fewer deployment, monitoring, and networking bill; **at release time**, the artifact you hand over goes from "an assembly manual for two things" to "one image" — copy it and it runs, and it behaves identically on another machine. What small teams lack most is not features but ops bandwidth.

While we're here, put the project's three deployment shapes in one table (this page uses the second one):

| Shape | Command | Fits |
|---|---|---|
| Local full-stack dev | `scripts/dev.sh start` | Daily development: API :8000 + workbench :5173 hot reload (what you've been using) |
| Docker single-host full stack | `docker compose up -d --build` | Demo / self-hosting: five services with one command |
| Production deploy | Same, plus production checklist hardening | Containers move into your infrastructure (K8s lifts the compose services one by one) |

Note how the third shape is phrased: **K8s is not another thing to learn — it is moving the five compose services into your orchestrator one by one** — you have already seen every image, environment variable, and health check; it's just moving house. The compose file is itself the most accurate deployment document.

One more sentence on why this page uses the second shape: images, environment variables, health checks, dependency order — every genuinely hard part is already laid out verbatim in compose. Every pit you step in here is the same pit on any orchestration platform, just renamed (compose's healthcheck becomes K8s's readinessProbe; the concept translates intact). Conversely, people who start directly from an orchestration platform often can't say which services theirs depend on or which should start first — compose is the best orchestration primer.

**The three levels of observability.** This framework's observability design is worth reading carefully before configuring:

1. **The internal DB is always the source of truth** — every Run/Trace is persisted first; this level needs no configuration;
2. **Langfuse is a sidecar** — Traces are pushed out synchronously to your self-hosted Langfuse (data stays on your own servers — that's "data sovereignty"), used for its nice UI, filtering, and comparison; export failures never block the business (failures are logged and retried);
3. **Switchable and disableable** — `OBSERVABILITY_BACKEND=none/langfuse/langsmith`, without advertising "fully equivalent switching".

Why is "replay the same Trace from both ends" this page's checkpoint? Because it verifies the first two levels at once: the internal DB has it (the workbench replays it), and the export path is alive (Langfuse replays it).

**The territory contract (this page's protagonist).** Recall "where you live, where the framework lives" from [Local run](./01-setup-and-first-run.md): `app/` is your territory, `lubanagent/` is the framework's. Three supporting mechanisms keep that boundary from being a slogan:

* `.lubanagent-upstream` — a manifest classifying every file in the repo (framework / shared / scaffold-seed / user-owned); merge conflicts are handled by class;
* **CHANGELOG tagged by territory** — merge `[framework]` changes directly; `[scaffold-seed]` changes (seed files such as the customer-service example) keep your version by default; `[migration]` ships database upgrade commands;
* **UPGRADE.md** — per-version merge instructions.

The operational shape of an upstream upgrade: `git fetch upstream && git merge upstream/master`, resolving conflicts by the rules above. You will rehearse it on this page (using a local branch to simulate upstream).

Before upgrading, check shared configuration, database migrations, and business regressions. Territory isolation lowers the chance of conflicts; it does not guarantee every merge is conflict-free.

### Why the framework is designed this way: internal DB as source of truth, Langfuse as sidecar

Langfuse is a sidecar observability backend. Draw the dependency direction: business → internal DB (guaranteed), business → Langfuse (best effort). **The write path of observability data never sits on the business critical path.**

The other side of that trade: if Langfuse is down, upgrading, or switched to `none`, your agents keep chatting and workbench Traces stay queryable — the observability experience degrades, the business and its data lose nothing. If observability were the main path instead: one hiccup in the observability system and production conversations hiccup too — you'd have turned "seeing the system clearly" into a single point of failure of the system. **Every external dependency that can fail must be designed so its failure does not drag down the main line** — a universal law of production systems, and the framework executes it thoroughly.

While we're here, on why self-hosting (data on your servers) is emphasized: Traces contain real user questions, call parameters, cost attribution — sensitive data. The sidecar is swappable (langsmith works too); data sovereignty is not. "Switchable, but without advertising full equivalence" is honest engineering: backends differ in capability, switching is a downgrade/upgrade trade-off, not magic.

### Why the framework is designed this way: definitions and data take two roads

The phrase from Step 1 — "the image carries definitions, not data" — deserves elevation to a design principle. It answers the question every deployment system must answer: **what exactly goes into the image?** The answer: everything that evolves with code (code, agent definitions, eval sets — they are versioned in git and roll back); exclude everything that accumulates at runtime (knowledge chunks, model slot mappings, Trace history — their lifecycle follows the database and its backup policy).

Think of the counterexample: bake knowledge files into the image and uploading one document triggers an image rebuild — "upload a file" becomes a release incident; put Traces into an image layer and rolling back the image deletes evidence. **Definitions follow code (git), data follows the database (backups), environment follows config (environment variables)** — three roads that stay in their own lanes, so none of them drags the others off a cliff.

### Why the framework is designed this way: containers auto-run idempotent migrate + init on startup

Anyone who has deployed a system knows this sequence: start the service, forget to create tables, forget to load data, the first request 500s, roll back and patch scripts. The framework compresses that flow into the container start command: `luban migrate && luban init`, both idempotent — reruns produce no side effects. That means two things: **starting the container is always safe** (the orchestrator can restart it at any time) and **deploy scripts stay simple** (no "run this first, then that" sequencing). Idempotency is not fussiness; it is the room automation needs to survive.

### Why the framework is designed this way: the territory contract runs on a manifest and tags, not on goodwill

Upgrade rules need verifiable mechanisms: **promises must be machine-executable, otherwise they are slogans.** Each of the three artifacts covers a stretch: the `.lubanagent-upstream` manifest makes "which files are yours and which are the framework's" a machine-checkable fact (upstream CI scans first and blocks outright if user-owned files are touched); CHANGELOG territory tags make every upstream change **carry its own merge instruction** — you don't read a diff and guess intent; the tag tells you to merge, keep yours, or run a migration; UPGRADE.md writes version-specific steps as a checklist. Together, "keeping up with upstream" turns from mysticism into process.

## 2. Steps

### Step 1: Start the full stack

One command, five services. Before typing it, look at its two words: `-d` runs in the background (your terminal back), `--build` builds the image first (required the first time; skippable later while the image is unchanged). The compose file declares all five services' images, ports, dependencies, and health checks — **that YAML is this project's deployment topology; it is worth reading top to bottom, and it beats any architecture doc.**

```bash
docker compose up -d --build
```

The first build takes about 3-5 minutes (including the frontend build). Once up, five services:

| Service | Port | Role |
|---|---|---|
| app | 8000 | Backend API + workbench (same port); on container start it automatically runs `luban migrate && luban init` — idempotent, safe to restart |
| mysql | 3306 (internal) | Production database |
| langfuse | 3000 | Observability UI |
| langfuse-db | — (internal) | Langfuse's own Postgres |
| mock-biz | 9100 | The customer-service example's fake business system |

The easiest of the five to underestimate is mock-biz. Its reason to exist: the customer-service example's order-lookup/refund tools need somewhere real to call — a real order system. When deploying this stack, keep one thought in mind: **when this lands for real, that slot belongs to your business system** — an agent system does not swallow business systems; it stands beside them and calls them over interfaces. Every service slot in this stack corresponds to a slot in a real production architecture.

One more detail: mock-biz maps no host port in compose — app calls it through the compose-internal service name (`BIZ_BASE_URL=http://mock-biz:9100`); 9100 is a port on the container network, unreachable from your host. That "point of view" problem again: some ports belong to the container network, not to you.

Expected result: `docker compose ps` shows all five containers `running`; app/mysql/langfuse-db have healthchecks and show `running (healthy)` after a while, while langfuse and mock-biz show only `running` (no healthcheck configured — **not a failure**). Open http://localhost:8000 in a browser — the workbench appears, and this time it is not the Vite dev server but the frontend built into the image.

Notice those two "no healthcheck isn't a failure" lines — **whether a system is healthy is judged by the health standard it declares, not by your casual intuition.** A healthcheck is a service's public promise of a checkup; no promise means no promise. Those five seconds of "is it down?" suspicion are this page's warm-up in production thinking.

When you open `docker-compose.yml` and read it line by line, watch five things — they are the common vocabulary of every orchestration file:

* **ports** — bound to `127.0.0.1` (the demo does not expose ports to the external NIC; in production a reverse proxy stands in front);
* **environment** — the container's entire config injection point; this is where model keys and Langfuse keys go;
* **depends_on** — start order: app waits for mysql to pass its health check (`service_healthy`) before starting; dependencies are not decoration, they are the first crime scene when debugging;
* **healthcheck** — each service's public checkup promise; the `(healthy)` in `docker compose ps` comes from here;
* **volumes** — four data volumes (MySQL data, Langfuse data, knowledge files, avatar files), marking "which data lives outside the image and survives on volumes".

Even more worth checking is the agent list: your my-lib-assistant, my-lib-triage, and my-lib-rules **are all there** (the built-in customer-service agent too). Because the image build COPYs the whole `app/` territory in (`.dockerignore` does not exclude it), `luban init` at container start scans `app/agents/*.yaml` and imports everything — the agent definitions you created on earlier pages rode into the production stack with the code. YAML seeds ship with the image and are imported into the database by init at startup; at runtime the definitions are still read from the database, not directly from the YAML in the image.

But keep straight what is **not** there: behind port 8000 is a brand-new MySQL container, and none of your dev database's **runtime data** came along — knowledge chunks (documents uploaded in [Configure knowledge retrieval](./05-knowledge-rag.md)), model registrations and slot mappings (the two PUTs from [Connect real models](./03-real-models.md)), Trace history. The image carries definitions, not data; data must either be redone against the production DB or migrated separately. Definitions and data take two roads — a line worth thinking through before deploying any system.

### Step 2: Run one conversation on the production stack

Why the built-in customer-service agent instead of your my-lib-assistant? Because the customer-service example ships a complete toolchain and the mock-biz fake business system — on the production stack it can show "the whole chain is here": model, tools, business system, observability. Your my-lib-assistant is in the stack too (verified next step), but the model registrations and knowledge data it depends on haven't been migrated yet — verify the system first, then backfill data.

```bash
curl -N -X POST http://localhost:8000/v1/agents/customer-service-bot/runs \
  -H "Content-Type: application/json" \
  -d '{"input": "帮我查一下订单 ORD-1001"}'
```

(Honesty note: with zero keys the production stack runs FakeLLM just like the dev stack — one fixed line, no tool decisions, so this order won't actually be "looked up". The mock-biz container is indeed waiting in the stack, but to truly walk lookup/approval end to end, first add your API key environment variable (e.g. `DEEPSEEK_API_KEY`) to the app service's `environment` in compose, rebuild with `docker compose up -d app`, then redo the two steps of [Connect real models](./03-real-models.md) against the production DB — `PUT /v1/models` to register the model, `PUT /v1/brain-mappings` to bind the slot.)

Expected result: a complete SSE event stream with the same structure as the [Local run](./01-setup-and-first-run.md) curl (the reply content is FakeLLM's fixed line too) — the production stack and dev stack run the same code.

**Compare right now**: line up this SSE event sequence against the one recorded in Local run. Event names, order, structure are identical — every debugging skill you built on the dev stack (how to read the event stream, how to locate a tool call) transfers to the production stack unchanged. **Dev/prod isomorphism is the entire premise of your debugging skills holding their value.**

### Step 3: Connect Langfuse and replay from both ends

Compose already sets `OBSERVABILITY_BACKEND=langfuse` and `LANGFUSE_HOST=http://langfuse:3000`; only two keys are missing. Add two lines to the app service's `environment` in compose:

```yaml
      LANGFUSE_PUBLIC_KEY: pk-lf-...   # open http://localhost:3000 in a browser, register, then create keys under Settings
      LANGFUSE_SECRET_KEY: sk-lf-...
```

Two traps: first, don't try editing the root `.env` — `.dockerignore` excludes `/.env`, so it never enters the image; second, leave `LANGFUSE_HOST` at the compose-provided `http://langfuse:3000` — that is the address the app container uses to find Langfuse on the compose network; change it to `localhost:3000` and it becomes "the app container itself", and Langfuse goes unreachable. It is `localhost:3000` only when you personally visit Langfuse from a browser — don't mix the two points of view.

Let's make this "point of view" problem explicit: `localhost` always means "the speaking process itself". When your host terminal says localhost, it means the host; when a process inside the app container says localhost, it means that container. Services on the compose network find each other by service name (`http://langfuse:3000`) — compose's DNS translating between service names and container IPs. **For every address written into a config file, first ask "whose point of view is this" — it saves a whole class of mysterious failures.**

The first trap deserves a second look because it encodes a production iron law: **secrets never ride in images.** `.env` is excluded by `.dockerignore` so that "image = clean code + dependencies"; keys belong to environment config and are injected as environment variables — the same image with different keys is a different environment. Baking secrets into an image is welding your house key to the door.

`docker compose up -d app` rebuilds app so the keys take effect; then run the Step 2 conversation once more.

Expected result: this Run appears in the Traces list of **Langfuse** (http://localhost:3000; register an admin account on first visit), and clicking it shows the full call tree; the **workbench Traces page** replays the same Trace — same source at both ends; neither copy can go missing while the other remains. Runs made before the configuration exist only in the workbench (the internal DB has been writing all along) — exactly the visible form of "internal DB as source of truth, Langfuse as sidecar".

That detail — "pre-configuration Runs exist only in the workbench" — shows run history is stored independently of the observability backend: **history from before Langfuse joined lost not a hair** — because it was never stored in Langfuse. The sidecar can join late and be swapped; the mainline's data never left your own database for a single day.

### Step 4: Rehearse "upstream upgrades without losing changes"

This is the step that must pass before going live. Use a local branch to simulate an upstream release (in your dev repo, not in Docker).

First, why simulate with a local branch instead of operating on the real upstream: the value of a rehearsal is that it is **repeatable and crashable**. Local branches can be created and deleted at will; a botched merge is one reset away from gone. A mistake against the real upstream could wound your territory on the spot. **Dangerous operations are first rehearsed on the sand table — that is production discipline, and learning discipline.**

Before starting, run `git status` and confirm the working tree is clean — if you have uncommitted changes in `app/`, commit them to master first, or the later `git commit -am` will sweep them into the rehearsal branch.

```bash
# 1. Fabricate an "upstream release": branch from the current point, touch one framework file (simulating an upstream bugfix)
git checkout -b simulated-upstream
echo "# upstream patch" >> lubanagent/runtime/context_builder.py
git commit -am "simulated upstream change"
git checkout master

# 2. Back on master — your own changes are committed on master (hence the clean-tree requirement above)

# 3. Merge the "upstream"
git merge simulated-upstream
```

Expected result: the merge completes cleanly (no conflicts, or conflicts only in framework files) — everything you produced under `app/` (agents/tools/datasets/graphs/multiagents) is untouched, and the framework files are updated.

The reason this merge goes so smoothly is that **the two development lines do not intersect spatially**: the simulated upstream touched only `lubanagent/`, your commits touched only `app/` — git's three-way merge never gives trouble to non-overlapping changes. The real test of the rules comes when both sides change the same file; that is when the CHANGELOG territory tags and the `.lubanagent-upstream` manifest clock in (see FAQ item 3).

Verify with these four commands, then clean up:

```bash
ls app/agents/          # my_lib_assistant.yaml is still there
git diff simulated-upstream -- app/   # your territory and upstream never intersect
git reset --hard HEAD~1               # truly revert the simulated change: this merge was a fast-forward, master already points at the rehearsal commit; deleting the branch ref alone won't move the code back — reset to before the merge
git branch -D simulated-upstream      # clean up the rehearsal branch (after the reset it no longer merges into master, so -d refuses; use -D to force-delete this one-off rehearsal branch)
```

Closing check: `git log --oneline -2` shows no "simulated upstream change" commit, and the tail of `lubanagent/runtime/context_builder.py` has no `# upstream patch` — the framework territory is clean again.

Match this rehearsal against the trio from the concepts section: the manifest (`.lubanagent-upstream`) says `app/` is all user-owned and upstream will never touch it; this simulated upstream indeed did not touch `app/` (the empty git diff is the proof); had there been conflicts, you would decide who wins by the CHANGELOG tags. **One rehearsal turns the trio from "memorized concepts" into "used tools".**

In the real scenario, replace `simulated-upstream` with `upstream/master`, run `luban migrate` for `[migration]` tags in the CHANGELOG, and handle seed files with the `[scaffold-seed]` keep instructions — the flow is fully isomorphic. This "can follow upstream long-term" capability is the root reason you choose a "base" rather than a "one-shot template".

### Step 5: Post-upgrade final check — eval regression

After the simulated upgrade, run the eval set from [Evals and regression](./06-evals.md) as the final check (in the dev environment. The simulated change was already reverted; this step is mainly about turning the habit into muscle memory — after a real upgrade merge, it is a hard, non-negotiable check):

```bash
.venv/bin/luban eval run my-lib-assistant --dataset app/datasets/my_lib_eval.yaml --compare my-baseline.json
```

Note this command's three preconditions: run in the dev environment (the production stack doesn't have your eval baseline yet), against the old baseline saved in [Evals and regression](./06-evals.md), after the simulated change was reverted. All three serve the same purpose — this step trains the **process**, not this run's result.

Expected result: `regressions: []`. **After an upgrade (or any big move), run one eval regression** — it is the working habit this guide wants you to take away: it turns "probably didn't break anything" into "nothing broke, and here is the evidence".

Feel the weight of this command at this moment: the git merge verified **code** wasn't lost; the eval regression verified **behavior** didn't change. Two checks — one guards territory, one guards quality — together they make "the upgrade was safe" complete. Checking code without behavior leaves you blind to incidents like "a dependency upgrade drifted model behavior" that never show up in code review.

One note on a baseline's lifecycle: a baseline is not a one-time archive. For everyday changes confirmed regression-free, keep the old baseline; if the behavior change was **intentional** (a persona edit, a model swap), run `--compare`, confirm all differences are expected, then re-run `--save` to pin the new baseline and record the reason in the commit message — a baseline, like code, is an asset that needs version control and change rationale.

### Step 6: Wrap up (optional)

```bash
docker compose down        # stop the stack (data volumes kept)
docker compose down -v     # remove data volumes too (full reset)
```

The difference between the two commands is the phrase "data volumes": the first stops services and keeps data (next `up` restores everything); the second wipes MySQL's data along with the rest. In production terms, this is the difference between "restart" and "reset" — **before typing the second one, decide whether you are willing to lose every Trace and knowledge file in that database.**

A combo trick while we're here: reset the data without touching images — after `down -v`, `up` again; the local image cache is still there and the stack comes back quickly. In production terms this combo corresponds to "rebuilding a clean environment": the image is still that image (behavior reproducible), data accumulates from zero.

## 3. Verification

All five must pass before this page's work is "live". Watch the third one especially: **both ends replay the same Trace** — it is not a nice-to-have extra screen; it is the only way to verify the observability layering: the internal DB is alive (the workbench replays) + the sidecar is alive (Langfuse replays). No commands needed — two open pages are the evidence.

- [ ] Five services running (the three with healthchecks show healthy after a while), workbench on the single port 8000
- [ ] One conversation completed on the production stack (event stream isomorphic to the dev stack)
- [ ] Langfuse and the workbench both replay the same Trace
- [ ] Simulated upgrade merged with zero changes to the `app/` territory
- [ ] Post-upgrade final check returns `regressions: []`

## 4. FAQ

This page's pit density is the deployment stage's, because Docker and git are both archetypal "right command, wrong point of view, still crashes" tools. Match each pit as you hit it; each is worth rereading the second time you meet it.

**`docker compose up` builds slowly or fails.** The frontend build depends on the network (npm registry); see pit 5 in [Local run](./01-setup-and-first-run.md) for registry mirrors. For build failures check `docker compose logs app`.

**Langfuse is configured but Traces don't appear.** Check three things: the keys were created in Langfuse Settings (not invented), the app container was rebuilt after the keys were added (environment variables are injected at container creation), and `LANGFUSE_HOST` is reachable from the app container's point of view (`http://langfuse:3000` on the compose network; `localhost:3000` only from the host — compose already has it right, don't break the point of view when editing).

The sneakiest of the three is the second: **environment variables are injected when the container is created; editing the compose file is not the same as taking effect** — you must `docker compose up -d app` to recreate the container. Use `docker compose exec app env | grep LANGFUSE` to see the actual value inside the container instead of guessing.

**More merge conflicts than expected.** Check each conflicted file's territory: framework defers to upstream (you shouldn't have touched it anyway), scaffold-seed defers to you (`git merge -X ours`), and your user-owned files are never touched by upstream at all. When unsure, consult the `.lubanagent-upstream` manifest.

**My knowledge base / model config vanished in the production stack.** Normal — the image carries definitions, not data: the `app/` territory is COPYed whole into the image and init imports your agents, but runtime data in the DB (knowledge chunks, model registrations and slot mappings, Trace history) does not travel with the image. Backfill = re-upload knowledge against the production DB (the [Configure knowledge retrieval](./05-knowledge-rag.md) steps) + redo the two PUTs from [Connect real models](./03-real-models.md); Traces accumulate from scratch.

The common thread across all four pits: **they are all point-of-view problems** — the build failure is the network's point of view, missing Traces the container's, conflict handling the territory's, vanished config the definitions-vs-data one. The first reflex in production debugging is always "whose point of view am I looking from right now".

## Related pages

Before integrating a real system, check [Business integration and acceptance](./09-graduation.md). For production configuration, see the [deployment checklist](../manual/deploy.md).
