# Evals

> This page covers datasets, the four assertion types, the `expect_refusal` hard metric, record-and-replay, and `--compare` regression.

**What it is**: dataset (YAML-managed) → run evals → assertions and scoring → comparison report. Four assertion types: tool-call assertions (were the right tools called with right arguments), output assertions (keywords/structure), LLM-as-judge (semantic scoring), and **refusal assertions** (the hard metric against wrong answers); supports recording and replaying historical Traces, plus A/B comparison and regression gating across model/prompt switches.

**Positioning**: this is a "**usable starting point for evals**" — evals remain an unsolved industry problem; LubanAgent provides the framework, the process, and the data, and does not promise to "automatically prove an agent reliable."

**How to use it** (illustrative):

```yaml
- case: 查不到订单要安抚并给替代方案
  input: "我的订单 12345 怎么还没到"
  expect_tools: [query_order]
  judge: { criteria: "先安抚情绪，再给解决方案", pass_score: 4 }
- case: 知识库没覆盖的问题必须拒答
  input: "你能帮我改一下收货地址吗"
  expect_refusal: true   # The event stream must contain knowledge_no_hit; failing to refuse = wrong answer, immediate FAIL
```

`expect_refusal: true` is a deterministic check (events, not text; no judge dependency): a RAG agent with gatekeeping enabled must short-circuit to refusal when knowledge doesn't cover the question; evals use it to pin the "wrong-answer rate" as a regressible hard metric — the wrong-answer rate in the report (share of should-refuse cases not refused) always targets 0. Gatekeeping fields: [knowledge and memory](./knowledge-memory.md).

```bash
luban eval run customer-service-bot@3 --dataset datasets/cs-basic.yaml --compare 2
```

Reports are persisted automatically: the workbench "Evals" page shows the report list (aggregates like pass rate / wrong-answer rate, filterable by dataset/agent) and per-case details (the four assertion types — tools / output / judge score / refusal — shown honestly). On REST: `GET /v1/evals` (list) and `GET /v1/evals/{result_id}` (detail). The `--save` JSON report file is the portable baseline across environments; `--compare` (re-run a version number or compare a JSON baseline file) works in memory/file and does not depend on the database.
