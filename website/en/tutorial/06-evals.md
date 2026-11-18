# Evals and regression

Build a repeatable eval set for your agent and compare results before and after changes. Prerequisites: clear business expectations and a runnable agent. The example uses FakeLLM's fixed output to validate the eval pipeline; real quality needs verification with a real model and real business data.

## 1. Approach: break impressions into decidable assertions

Start with a question: why doesn't traditional software testing methodology carry over? Because unit tests assert function return values — fixed input, fixed output. An agent's "return value" is a piece of natural language that differs on every sample; even the object of assertion is unstable. So the first step in evaluating an agent is not writing a test harness — it's **finding the stable parts**: extracting the deterministic, decidable components from the variable output. This section explains how to do that splitting.

First, get one thing straight: agent output is natural language, so `assert output == "..."` is unwritable. But take "feels good" apart and what you actually want to confirm falls into four very concrete things:

**① Output assertion (`expect_output.contains`)** — certain keywords must appear in the reply. Simplest, and most brittle: the model rephrases and it breaks ("借期三十天" vs "借期为 30 天" — "loan period thirty days" vs "the loan period is 30 days"). Good for pinning **hard facts that must never change** (numbers, policy wording), not for pinning tone or structure.

**② Tool assertions (`expect_tools` + `expect_tool_args`)** — this input must trigger which tool, with which arguments. **Far more stable than output assertions**: the model's wording can vary endlessly, but "a lookup must go through my_lib_lookup with the student ID passed correctly" is behavior, and behavior is steadier than phrasing. Test behavior whenever you can instead of literals.

One frequently misread semantic of ② needs pinning down first: `expect_tools` fires on the event "the model initiated a tool call" — it asserts **call intent**, not successful execution. Evals ship without an approval manager by default — the report-loss tool is HIGH risk + `approval_required` (you configured that in [Write business tools](./04-write-a-tool.md)), so in evals its execution is stopped by the approval gate and never actually reports anything lost — yet the call intent is still captured by the assertion. So a PASS on the report-loss case means "the model decided to call report-loss", **not "the eval approved the loss report for you"**. To assert one layer deeper (say, the tool's return value reaching the reply), add `--auto-approve` (approve-on-request) to the eval command — the cost is that side-effect tools really execute; think twice before enabling it when the set contains write operations.

**③ Refusal assertion (`expect_refusal: true`)** — this input **must** trigger the `knowledge.no_hit` short-circuit (the zero-token refusal from [Configure knowledge retrieval](./05-knowledge-rag.md)). It is the hard metric against wrong answers: a question that should be refused and isn't, is a wrong answer. The check is event-level (does `no_hit` appear in the event stream?) and depends on no model judgment — the most deterministic of the four. Adversarial questions from your business belong in the eval set too.

**④ Judge assertion (`judge.criteria + pass_score`)** — subjective dimensions (attitude, logic, boundary sense) go to **another model** acting as judge: give it scoring criteria, it scores 1–5, ≥ pass_score passes. Flexible, at a cost: the judge is also a model, so scores have variance — the same reply scoring 3 this time and 2 next time is normal. So judge cases need a stable persona (you'll experience the calibration firsthand later), and **core behavior should be pinned with ①②③ wherever possible; the judge only covers the remaining soft dimensions**.

One more easily missed point: **the four assertion types are not mutually exclusive; one case can stack several.** A case like "look up the borrowing record and reassure the student" can carry a tool assertion (must call lookup, student ID passed correctly) and a judge (does the reply also mention the loan period) at once — hard assertions pin hard behavior, the judge covers the soft dimension, one case two layers. Whether to split or merge cases depends on whether you want to defend those two assertion layers as one inseparable scenario.

Accumulate the four assertion types into a YAML dataset, run it on every change, and compare against a baseline — that is regression testing for agents. The analogy to traditional unit tests: contains is an exact assertion, expect_tools is an interaction assertion, judge is fuzzy testing, refusal is a safety assertion.

Put the four types on one brittleness-spectrum table (this is your selection table whenever you write eval sets from now on):

| Assertion | Judged from | Variance | Best for pinning | Typical false alarm |
|---|---|---|---|---|
| ① contains | reply text | zero (but brittle to wording) | numbers, policy wording, proper nouns | the model rephrases |
| ② tool assertions | event stream (call intent) | zero | which tool to call, whether arguments are right | the model asks a clarifying question before acting |
| ③ refusal | event stream (no_hit) | zero | a refused question answered is a wrong answer | almost none — the hardest of the four |
| ④ judge | model scoring | yes (2↔3 swings are normal) | soft dimensions: attitude, logic, boundary sense | judge score fluctuation |

How to read this table: start with the "Variance" column — three rows at zero variance means their red lights are always trustworthy; then the "Typical false alarm" column — each row's false alarm corresponds to one assertion-selection mistake, so when false alarms pile up, don't blame the model: come back and match against this table first. We won't expand on the table again, but come back for a glance when writing eval sets for new scenarios.

**Brittle assertions aren't forbidden — they belong where you can afford them.** A healthy eval set always spreads ①②③ wide and sprinkles ④ on top; flip that ratio and red lights become the boy who cried wolf, and nobody believes them anymore.

One more perspective worth establishing: **an eval set is an asset that grows alongside your agent.** In [Configure knowledge retrieval](./05-knowledge-rag.md) you found the gate refusing "who are you"; in this page you write that behavior into the eval set — discover behavior → pin behavior. Each turn of this loop adds one more "protected promise" to your system. Three months from now, this eval set is your agent's entire public contract: a new teammate doesn't need to ask you "does report-loss actually report?" — run the eval set and they'll know.

This also explains a counterintuitive judgment criterion: **an eval set's value lies not in how long it is now, but in what it has caught.** An eval set whose red light has never sounded either runs a genuinely stable system or was written too loose — the next time it sounds, you'll be glad it isn't decoration.

### Why the judge is "another model", not the agent grading itself

You may have thought: let the agent under test score its own answers and save another model's tokens — why not? Because **athletes can't referee their own games**. Self-grading has two fatal flaws: models naturally score their own answers high (self-preference bias); and the score shares a source with the tested behavior — when the behavior wobbles, the score wobbles with it, doubling the variance outright.

An independent judge at least separates the "ruler" from the "object measured" — the ruler still has its own variance, but it no longer resonates with the measured object. That's why judge calibration must grip both ends: "give the judge stable scoring criteria (write criteria concretely)" and "give the agent a stable persona".

A word on writing criteria: **only decidable standards deserve to be rulers.** A criterion like "is the reply polite?" hands your fuzzy impression, unchanged, to another fuzzy model; a criterion like "does the reply first acknowledge the user's frustration, then explain the fine rule" gives the judge a clear anchor, with far less variance. Writing criteria and writing contains share one discipline: **if it can be split into observable behavior, don't write it as an abstract evaluation.**

### Why the framework is designed this way: assertions watch events, not text

Notice — the three most stable of the four assertion types (tools, refusal, and the hard facts inside contains) all watch not "what the model says" but "what the system did". Not a coincidence — three layers of design trade-offs:

**First layer: text is wording, events are behavior.** Wording can change on every sample (temperature, tiny context differences can all make it rephrase); but "initiated a tool call" and "triggered the no_hit short-circuit" are discrete runtime events — they happened or they didn't. **By weighting assertions onto events, the eval system hedges the model's randomness with determinism.**

**Second layer: there is only one event stream.** The event stream (tool_call, knowledge_no_hit) you watched with your own eyes in SSE in [Local run](./01-setup-and-first-run.md) is the exact same stream evals judge — what you see in conversation is what the eval audits; there is no "evals see a different world" problem. **One run record, two consumers: humans read it, machines judge it.** This eliminates an entire class of nightmare: "the eval environment and the live environment behave differently".

**Third layer: variance is fenced into a calibratable category.** Assertions that don't depend on the model (①②③) have zero variance and can gate CI — a red light is a red light, no "unlucky run this time"; the only model-dependent assertion, the judge, is listed by the framework as its own class, with the `pass_score` knob for controlling looseness. **Variance doesn't vanish, but it is confined to a cell you know and control** — which is why the previous principle keeps repeating "pin core behavior with ①②③".

One aside on the refusal assertion: it is the only "bottom-line" assertion of the four. ①② test "did what should happen happen?"; ③ tests "did what shouldn't happen truly not happen?" — the latter guards the floor of trust. To users, "I don't know" merely disappoints; **"doesn't know but pretends to" destroys trust**. That's why the framework makes refusal an event-level check and evals track wrong-answer rate as an independent metric — the hardest tools guarding the most expensive asset.

One more issue you may not have noticed: **why is the baseline a JSON file, not a record in the database?** Because a baseline's destiny is to travel with the code: committed to git, comparable across machines, runnable in CI. `--save` / `--compare` work through the memory-and-file path, **with no database dependency** — you can even diff on a machine that never started the service. The historical reports in the database (step 6's workbench evals page) handle "viewing history"; the file baseline handles "comparing versions" — two chains, each with its own job.

Finally, place evals back into the development workflow. A typical change lifecycle looks like this:

1. **Before the change**: an all-green baseline exists (saved via `--save`, already in git). Changing without a baseline is driving blindfolded;
2. **After the change**: run `--compare` — continue only if `regressions` is empty; otherwise roll back or fix;
3. **Daily iteration**: run the core tier (tool + refusal cases: fast, zero variance) for second-level feedback;
4. **Before release**: run the full tier (including judge), accept the variance test, then refresh the baseline once;
5. **In CI**: `--compare` exits 1 on any regression, and the merge request can't pass the gate — people may slack; gates don't;
6. **After big moves** (upgrades, model swaps, environment migrations): run `--compare` once more against the old baseline as a final check — in the upgrade rehearsal of [Deploy and upgrade](./08-deploy.md), this step is the last gate.

You'll notice this rhythm is strikingly isomorphic to the traditional software testing pyramid — only the object under test changed from "a function's return value" to "an agent's behavior". **The tools changed; the discipline didn't.**

One more design choice worth pointing out: the main entry for evals is the **CLI command** (`luban eval run`); the workbench evals page is only the place to view history. Why not run evals by clicking a button in the UI? Because gating requires "a machine can initiate it, judge the exit code, and wire it into a pipeline" — a UI can do none of the three. **Every quality gate must live in the command line; only what humans read goes into the UI.** This division of labor continues straight into the CI guard described in [Deploy and upgrade](./08-deploy.md).

## 2. Steps

### Step 1: Write the eval set

The eval set is just a YAML file living in `app/datasets/` — note the location: like your agent definition, it lives in your territory and goes into version control with the code. **An eval set is not temporary scaffolding; it is an asset shipped with the code** — its version always matches the agent definition's version, which is the precondition for all "comparability" later.

Create `app/datasets/my_lib_eval.yaml` (the reference output is the calibrated final version; write it as shown first — you'll experience the calibration in later steps):

```yaml
- case: 身份问题也走守门
  input: 你是谁？能帮我做什么？
  expect_refusal: true
- case: 借阅查询走工具
  input: 我是学号 2023011234 的学生，我借了哪些书？
  expect_tools: [my_lib_lookup]
  expect_tool_args: { my_lib_lookup: { student_id: "2023011234" } }
- case: 规章命中引用
  input: 书最多能借多久？我是本科生
  expect_output: { contains: ["30"] }
- case: 续借规章
  input: 书可以续借几次？
  expect_output: { contains: ["1 次"] }
- case: 挂失走审批工具  # 断言的是"模型决定调挂失"这个意图，不是挂失真被执行——评测默认不配审批（见 §2 ②）
  input: 我的校园卡丢了，学号 2023011234，帮我挂失
  expect_tools: [my_lib_report_loss]
- case: 超范围拒答（知识库守门）
  input: 食堂几点开门吃饭
  expect_refusal: true
- case: 规章综合理解（judge）
  input: 我书逾期 40 天了，还能继续借新书吗？
  judge: { criteria: 是否正确说明逾期超 30 天会冻结借阅权限，且缴清滞纳金后恢复, pass_score: 3 }
- case: 服务态度
  input: 你们图书馆的滞纳金也太黑了吧，我就晚了两天！
  judge: { criteria: 回复是否先承认用户情绪再解释滞纳金规则, pass_score: 3 }
```

(The cases stay in Chinese so the fixture is byte-identical with the rest of the guide: "identity questions also go through the gate", "borrowing lookup goes through the tool", "rule hit with citation", "renewal rule", "report-loss goes through the approval tool", "out-of-scope refusal (knowledge gate)", "comprehensive rule understanding (judge)", "service attitude".)

Don't rush to run it; spend a minute on this eval set's **structure**: eight cases, two seats for each of the four assertion types — two refusals (questions that should be refused), two contains (hard facts), two tool assertions (the tool to call + arguments), two judges (soft dimensions). The distribution isn't random: **the more brittle the assertion, the fewer and choosier; the more stable, the wider it spreads**. Two judge cases may feel like too few now; after step 2's calibration you'll be glad you didn't write more.

Note the first case's commentary value: **identity questions also go through the gate** — the gate from [Configure knowledge retrieval](./05-knowledge-rag.md) is unconditional; "who are you" retrieves no rule passages and also goes through the fallback. That's not a bug — it's the business decision you made in that page (exactly what a pure-knowledge agent wants); written into the eval set, that behavior is henceforth a **protected design decision**, and anyone who breaks it trips a red light.

Here is the eval set's second identity: **it is not just a quality guardrail, it is an executable specification.** Whoever takes over your agent reads these 8 cases and knows "what behavior this system promises and what it refuses" — more precise than ten pages of requirements.

Look once more, pair by pair, at what each "pair of two" guards:

- **The two refusals** guard the gate's two faces — "in-library business questions about identity are also refused" (pure-knowledge boundary) and "out-of-library questions are always refused" (out-of-scope protection). The gate in [Configure knowledge retrieval](./05-knowledge-rag.md) is the mechanism; here the mechanism becomes a promised behavior;
- **The two contains** guard hard facts — a 30-day loan period and 1 renewal: both "one wrong character is a complaint" policy wordings. Note that every contains target is a number: not a coincidence — a discipline;
- **The two tool assertions** guard the division of behavior — lookups go through lookup with the student ID passed correctly (argument-level assertion), loss reports go through report_loss (intent-level assertion). Same assertion type, coarse and fine grades both demonstrated;
- **The two judges** guard soft dimensions — one tests combined rule understanding (composite reasoning about 40 days overdue), one tests emotion handling (empathize first, then explain). These two are the most expensive and least stable in the whole set, so only the two most worthwhile get seats.

### Step 2: First run

First, what happens behind this command: `luban eval run` sends the dataset's cases to your agent one by one — real model, real tools, real knowledge pipeline (identical to a conversation) — then judges each case item by item against its attached assertions. Before running, confirm two things: the service has started at least once (knowledge chunks are already ingested) and the model key is valid — reasons in the FAQ at the end of this page.

```bash
.venv/bin/luban eval run my-lib-assistant --dataset app/datasets/my_lib_eval.yaml
```

Expected result: per-case `[PASS]`/`[FAIL]` with failure reasons, and a `pass_rate` on the last line. Odds are it isn't all green — **congratulations, that is exactly this page's point**. Two typical FAILs, two calibration moves:

**FAIL "judge scored 2/3"** — judge variance or a persona that isn't hard enough. Example: in the "service attitude" case the reply opens with reassurance but the empathy isn't explicit enough, and the judge wavers between 2 and 3. Calibration: harden the persona (Little Tu's fix was adding "when the user shows dissatisfaction, the first sentence empathizes, then explains the rule" to the persona), stabilizing behavior at the source — rather than lowering pass_score to accommodate the wobble. **Lowering the bar is the easiest cheat; don't trade it for a green light.**

Why is lowering the bar cheating? Think one step: pass_score drops from 3 to 2, the green light returns, but your system did not improve — only the ruler changed. Next time it genuinely degrades, the new ruler can't measure it either. The eval set's entire value is "ruler and measured object are separate"; **lowering the score re-graduates the ruler using the measured object**, and red lights lose their meaning from then on.

**FAIL "expected tool not called"** — the model occasionally asks a clarifying question before acting ("I can report that lost for you — shall I?"). The calibration points the same direction: fix the persona ("submit directly when the student ID is complete; don't ask back for confirmation"), making the behavior deterministic.

Note that both FAIL fixes point one way: **fix the persona, turning probabilistic behavior into deterministic behavior** — don't bend the eval set to the model. The eval set is the line you defend; the persona is the means of implementation. If the means falls short, make the means work overtime — don't move the line.

One more easily overlooked calibration discipline: **change one thing per round.** Change the persona and a threshold together, rerun, get green — and you can't say which change worked; next regression you've lost one attributable baseline. One change → init → rerun → record the result. The pace is slower, but every step leaves evidence. The eval system hands you an instrument; use it with an instrument's precision.

**One hidden calibration point: a judge case's question must pass the knowledge gate.** If you write a below-threshold judge case (say, "can you look up my CET-4 score?"), it goes through the fallback — the model never appears, the judge scores the canned fallback line, and it will never pass while proving nothing. Judge questions must **hit the knowledge base** (like the 40-days-overdue question above, which hits the overdue clause and forces the model to compose an answer).

### Step 3: Calibrate to all green, save the baseline

Fix the persona → `luban init` → rerun, looping to 8/8. Then save the baseline:

```bash
.venv/bin/luban eval run my-lib-assistant --dataset app/datasets/my_lib_eval.yaml --save my-baseline.json
```

Expected result: the last line gains `已保存: my-baseline.json` ("saved"). This JSON is a portable baseline snapshot (commit it to git; it stays comparable across machines).

**This `git commit` deserves to be done as a small ceremony**: from this moment the repo holds hard evidence that "Little Tu is 8/8 green". Anyone (including you, three months from now) makes any change, and one `--compare` tells whether they broke it. **A baseline file in the repo is the same discipline as tests in the repo.**

Savor once more the difference between "all green" and [Agent concepts](./00-primer.md)' "feels OK": both describe "no problem now", but all-green has evidence, is reproducible, and can be audited — three months later when someone questions your system's quality, what you produce is not a shrug but a timestamped 8/8.

### Step 4: Break it on purpose; watch the regression light up

The next move sounds counterintuitive: **you will break the system with your own hands.** Why not just teach "verify after fixing"? Because nobody knows whether an alarm that never sounded can sound. You need one controlled failure to confirm three things with your own eyes: the alarm sounds (pass_rate drops), the alarm names where it broke (regressions has names), and after the fix the alarm stops (all green again). Only after seeing all three in person will you dare to hand your quality to it.

Change the threshold in `my_lib_assistant.yaml` to 0.02 (letting junk passages into context), init, then run the comparison:

```bash
.venv/bin/luban init
.venv/bin/luban eval run my-lib-assistant --dataset app/datasets/my_lib_eval.yaml --compare my-baseline.json
```

Expected result: `pass_rate` drops (7/8), and the last three lines —

```
regressions: ['超范围拒答（知识库守门）']
improvements: []
pass_rate_delta: -0.12
```

(The single regression name is the "out-of-scope refusal (knowledge gate)" case.)

**See clearly what just happened**: you changed one number (the threshold), and the regression report precisely names "the gate refusal broke". No manual sampling, no reading replies, no guessing — this is [Agent concepts](./00-primer.md)' "turn feelings into assertions" at full power. In CI this command pairs with exit-1 semantics (any regression = non-zero exit), which is the regression gate.

Take the causal chain apart: the threshold dropping from 0.15 to 0.02 means retrieval passes anything that grazes the line — junk passages enter context, and the gate that previously retrieved nothing for "cafeteria"-type questions now retrieves something vaguely adjacent, so `no_hit` no longer fires and refusal becomes a wrong answer. **One threshold number moves the entire "refuse what should be refused" behavior chain** — exactly why manual spot checks can't catch it: the two replies you sampled happened not to step on it. The eval set can't miss, because it drove a nail into every behavior chain.

Also savor the report's restraint: it doesn't rerun a complete ledger for you, just three lines — **what got worse (regressions), what got better (improvements), and the net change (pass_rate_delta)**. What you care about was never "what's the score this time" but "where is it worse than last time". Evaluation with a baseline is essentially a diff, not a score.

### Step 5: Restore; verify green

Set the threshold back to 0.15, init, rerun `--compare`.

Expected result: `pass_rate: 1.00 (8/8)`, `regressions: []`, `pass_rate_delta: +0.00`. The world is restored — and this time the "restored" has evidence.

If a regression **still** shows after restoring, your calibration touched more than one thing — return to step 2's "one change per round" discipline and bisect. This is the regression report's second use: it verifies not only "did I break it" but also "did I fix it".

One detail: after restoring you do **not** need to re-`--save` — behavior matches the baseline exactly, and the old baseline stays valid. A baseline file represents "the state of the approved version", not "the result of the latest run"; only when you deliberately accept a new behavior (say, merging a legitimate rule change) do you re-save the baseline. **A baseline is deliberate, not incidental.**

"Has evidence" deserves a chew. During development you make dozens of "fixed it, feels good" judgments daily, and each one is a bet. With a baseline and a compare command, **every bet becomes a verification** — the cost is a few dozen seconds of command, the benefit is not being woken at midnight by a complaint call.

### Step 6: Review history in the workbench

The workbench **Evals page**: a list of historical reports filterable by dataset/agent (every eval run is persisted automatically); open one for per-case detail.

Expected result: my-lib-assistant's run history — including the 7/8 "accident scene" from a moment ago, failure reasons preserved verbatim.

The file baseline manages "compare to the previous version"; the persisted reports manage "view any version" — remember section 1's "two chains, each with its own job"? Here is its physical form. Don't delete that 7/8 record: **keep it — it is the on-site evidence of this system catching its own bug with data for the first time.**

The page has a hidden value too: **it makes quality visible and discussable.** Before, "is the agent stable?" was discussed by impressions; now you send over a link — pass rate, wrong-answer rate, per-case detail all inside. **Quality turned from an adjective into a noun.**

## 3. Validation

All four must pass before this page counts as done. Emphasis on the fourth: **the calibration experience cannot be skipped** — all green isn't the goal; "knowing why it's green" is. Skip calibration and copy the final version, and you only obtained a file; walk through the calibration and you obtain the feel of "how an eval set and model behavior domesticate each other" — the only thing you can lean on when writing evals for your own scenarios.

- [ ] Eval set with 8 cases, at least one of each of the four assertion types
- [ ] All-green baseline saved with `--save` (commit the baseline file to git)
- [ ] Break → regressions name it precisely → restore → all green, walked end to end
- [ ] Experienced at least one calibration (judge variance or tool-decision wobble), resolved by fixing the persona rather than lowering the bar

## 4. FAQ

Of the five pitfalls in this section, you may genuinely hit the first four in this page or the earlier ones; the last is environmental. Each gives the symptom first, then the remedy — come back and match when you hit one.

**Judge cases flicker green/red.** Normal, but treat it once the green rate drops below 80%: the remedy is a persona fix for more deterministic behavior (see step 2), not adjusting pass_score. The judge is the only assertion of the four with variance; design it as a soft metric and give core behavior to the first three types.

That "80%" isn't arbitrary: the judge is a model, its scoring naturally wobbles, and you can never cure it to 100% green; but a green rate below 80% means it isn't a variance problem — the behavior itself is unstable, and that is when fixing the persona means something. **First tell whether "the ruler is wobbling" or "the measured object is wobbling", then decide what to fix.**

**Judge cases are always red.** First confirm the question can pass the knowledge gate (check the score via `/v1/knowledge/query`) — a fallback-bound question means the model never appears and the judge has nothing to judge.

**`expect_output.contains` false-alarms frequently.** The assertion is pinned too fine (to wording, not facts). Restrict contains targets to hard facts: numbers, proper nouns, policy wordings.

Why do false alarms always land on contains? Look back at the brittleness table: contains is the only assertion of the four that is "certain in judgment but judging an uncertain object" — the score won't wobble, but the reply will. Many false alarms doesn't mean the assertion mechanism broke; it means you used a brittle assertion in a brittle place. **False alarms are your eval set reminding you that the assertion selection was wrong — not that the model glitched again.**

**Everything goes red after changing a tool signature.** Signature-drift protection (from [Write business tools](./04-write-a-tool.md)). A `luban init` producing a new version suffices — but note that if `expect_tool_args` references old argument names, the eval set must change with them.

**CONFIG_ERROR partway through the run.** Check that the service has started at least once (knowledge chunks must be ingested first) and that the model key in `.env` is valid — evals run a real model, with the same environment requirements as chat.

One last inoculation: **eval sets also expire with the business.** The policy wording changes (the loan period goes from 30 days to 45) — the first step is not changing the agent but the contains assertion in the eval set: update the spec first, then the implementation, then compare to confirm "only this one thing changed". If the eval set lags the business, it will faithfully block the correct implementation with a red light — that isn't an eval bug; it is the eval doing its duty faithfully.


## Related docs

Next task: [Flows and multi-agent](./07-graphs-and-teams.md). Full fields and interfaces are in [the manual](../manual/index.md).
