# Configure Knowledge Retrieval

Upload knowledge material, adjust chunking, test retrieval scores, then calibrate the no-hit fallback and answer boundaries. Prerequisites: an agent and knowledge material. The example uses FakeEmbedding to demonstrate the chain; its scores and threshold are not production-grade.


## 1. Approach: the threshold is measured, not guessed

You already reasoned through the RAG chain in [Agent concepts](./00-primer.md) (chunk → embed → retrieve → inject). Here is the easiest link to get wrong: **the similarity threshold**.

Every retrieved passage carries a similarity score (cosine, 0 to 1). How high counts as "relevant"? There is no universal answer — it depends on your embedding model, your corpus, and your chunking parameters. **The only reliable method is measurement**: query a few questions that "should hit" and a few that "shouldn't", look at the score distribution, and place the threshold between the two clusters.

That sounds tedious, but the real experiment below shows what skipping it costs. Chunking's effect on scores matters even more. We'll run a real experiment shortly: the same rules document, chunked into 2 large blocks, gives "书能借多久" ("how long can books be borrowed", a positive) a score of 0.101 and "怎么开发票" ("how to issue an invoice", a negative) 0.128 — **the negative scores higher**, so any threshold fails gating. After re-chunking into 6 smaller blocks, positives rise to 0.195–0.309 and negatives drop below 0.126 — a clean separation. Intuitively obvious once said: the bigger the chunk, the more mixed topics per block, and the vector becomes "a bit like everything, exactly like nothing".

The answer to question 1 from the opening is in those numbers: the threshold didn't get smarter — **the vectors themselves got cleaner**. With 2 chunks, "loan periods" and "campus card replacement" share one block whose vector resembles both the loan-period question and the invoicing question — more like the loan-period question than invoicing does, because the mixture is so diluted. With 6 chunks, each block carries one topic; each vector's "personality" emerges, and positives and negatives cluster separately. **Clean chunks first, then a usable threshold** — do it in reverse and no amount of tuning helps.

The three gates and what each blocks:

- **`score_threshold`** (threshold): passages below it are dropped outright — they never enter the model's context.
- **`no_hit_fallback`** (fallback refusal): when filtering leaves zero passages, **the code answers with this sentence directly — the model never appears** — zero tokens, zero room to improvise. The event stream shows `knowledge.no_hit`, and the Run's end reason is `knowledge_no_hit`.
- **`cite: true`** (citation numbering): on a hit, the model must answer only from the numbered passages and mark `[n]` citations — users can verify sources.

Note where all three defenses live: **before or outside** the model, enforced by code. Compare "write 'say you don't know when unsure' in the prompt" — [Agent concepts](./00-primer.md) showed that doesn't fully hold. This is "deterministic rules enforced by code" landing on RAG.

Draw the three defenses along the chain and the depth is obvious:

```text
User question
   ↓ retrieve (top_k passages, each with a score)
【Gate 1】score_threshold: low-score passages dropped ← less interference
   ↓ filtered passages
【Gate 2】no_hit_fallback: none left? refuse directly with the fallback line — the model never appears ← zero tokens
   ↓ at least one passage remains, injected as numbered material
【Gate 3】cite: true: the model may only answer from numbered passages, answer carries [n] ← verifiable
   ↓
The model composes the answer
```

Each gate guards a segment: the first two don't depend on the model at all; the third is a hard constraint on the model once it appears. That's why "better to say you don't know than to fabricate" can be enforced — it's not an expectation of the model, it's control of the pipeline.

### Why the framework is designed this way

Three design points, each plugging a common RAG incident:

**Why calibrate the threshold instead of shipping a "recommended value"?** Because similarity scores have **no cross-scenario scale**. The same 0.15 is a clean separation on this corpus with FakeEmbedding but could mean entirely different relevance with another embedding model — score distributions differ wildly across models. Any "universal recommended threshold" assumes something false: that score meaning doesn't vary with model, corpus, or chunking. So the framework gives no recommended value; it gives you calibration tools (the retrieval test endpoint) and a calibration method (the two score clusters from positives and negatives), turning the reliable part — your own measurements — into configuration. Step 4's line "your own calibration record beats any recommended value" means exactly this.

**Why is gating in code rather than prompting the model to self-police?** The answer to question 3 from the opening is here: prompt constraints are probabilistic, and the model most wants to fabricate precisely when facing a "plausible" question — exactly when prompt constraints fail most. You'd be installing the safety catch on the least reliable component. Code gating is different: passages under threshold never enter context, and if everything filters out the model doesn't appear at all — it never gets one chance to fabricate. **Put the guardrail before the accident, not after.**

**Why are chunking parameters (size/overlap) configured per knowledge source rather than globally?** Because different documents have different natural granularity: a rules FAQ is one clause per paragraph, so 120 is perfect; contract clauses run thousands of characters, and the same parameters may cut a clause in half. A global parameter forces every document to accommodate one value, fitting none. Per-source configuration lets each document chunk to its own best fit for its corpus — when tuning in step 4 you only touch this one document, without collateral damage to other sources.

**Why short-circuit `no_hit` instead of letting the model appear?** Two ledgers. Safety: empty retrieval means the corpus has no basis; letting the model appear then leaves it only training memory or imagination — precisely the behavior to eliminate. Cost: refusals shouldn't cost money — a fraction of a cent per conversation sounds trivial, but multiply by tens of thousands of conversations a day in a high-frequency support scenario and it's a real bill. After short-circuiting, the fallback line costs zero tokens with zero room to improvise, and the event stream leaves a complete `knowledge.no_hit` scene for later audit. Safety and cost close at the same point.

### About this page's FakeEmbedding: demo vectors vs. real vectors

Every score on this page was measured under FakeEmbedding (the framework's built-in deterministic demo vector). Its positioning must be clear: **enough to run the full chain, gating, and calibration method; no promise of production retrieval quality**.

Switch to a real embedding model via the `EMBEDDING_MODEL` environment variable (optionally with `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY_ENV`). But note: once the vector model changes, the stored vectors, retrieval scores, and your calibrated threshold — all void. You must re-ingest, re-run step 3's experiment, and re-set the threshold. The calibration loop this page teaches is preparation for exactly that day.

## 2. Steps

### Step 1: Prepare the rules document

Create `library-rules.md` (anywhere; once uploaded the local file is no longer needed) containing a small lending rulebook:

```markdown
# 图书馆借阅规章

## 借阅期限与数量
- 本科生可同时借阅 10 册，借期 30 天
- 研究生可同时借阅 20 册，借期 45 天
- 教职工可同时借阅 30 册，借期 60 天

## 续借规则
- 每册图书可续借 1 次，续借期与原借期相同
- 有他人预约的图书不可续借
- 逾期图书不可续借

## 逾期处理
- 逾期图书按每天每册 0.1 元收取滞纳金
- 逾期超过 30 天的，冻结借阅权限直至归还并缴清滞纳金

## 预约与委托借阅
- 已借出的图书可在线预约，归还后为你保留 3 天
- 本馆未收藏的图书可通过馆际互借申请，处理周期约 5 个工作日

## 校园卡
- 校园卡丢失请立即挂失，挂失期间产生的借阅记录由持卡人负责
- 补办新卡收取工本费 20 元，三个工作日后凭学生证到前台领取

## 馆内服务
- 自习区开放时间：周一至周日 7:00-22:30
- 电子阅览室需刷校园卡进入，每人每日限用 4 小时
```

(The document is a Chinese lending rulebook — undergraduates may borrow 10 books for 30 days, graduates 20 for 45, staff 30 for 60; each book renews once; overdue fines are ¥0.1 per book per day; over 30 days overdue freezes borrowing privileges until return and payment; replacement cards cost ¥20; study areas open 7:00–22:30 daily. Keeping it in Chinese makes the retrieval fixture identical to the rest of the guide.)

The document's structure is deliberate: one section per topic, with the heading naming the topic. Remember this shape — in step 4 you'll see that the first determinant of RAG retrieval quality isn't parameters; it's whether the document itself looks like "one topic per section".

### Step 2: Upload to the knowledge base

Workbench **Knowledge page → Upload**: pick the file, name it `library-rules`, chunk size 300 / overlap 30 (start here; we'll change it soon), description whatever you like.

If you'd rather not click through the page, the equivalent API:

```bash
curl -X POST http://localhost:8000/v1/knowledge/sources \
  -F "files=@library-rules.md" -F "name=library-rules" \
  -F "description=图书馆借阅规章" -F "chunk_size=300" -F "overlap=30"
```

Expected result: the response contains `"chunk_count": 2` — this 993-byte document was cut into 2 chunks. Remember that number; it's about to become the problem.

What does 2 chunks mean? Look back at step 1's document: six sections forcibly compressed into two large blocks, "loan periods" living next to "card replacement". The problem isn't the threshold — it's the chunks.

### Step 3: Retrieval experiment — find the problem

Using the Knowledge page's **retrieval test** panel (or the API `POST /v1/knowledge/query`), query these questions one by one and note each top1 score:

```bash
for q in "书能借多久" "怎么续借" "食堂几点吃饭" "怎么开发票"; do
  echo "Q: $q"
  curl -s -X POST http://localhost:8000/v1/knowledge/query \
    -H "Content-Type: application/json" \
    -d "{\"source\": \"library-rules\", \"query\": \"$q\", \"top_k\": 3}" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('  ', round(r[0]['score'],3), r[0]['content'][:30])"
done
```

(The queries are, in order: "how long can books be borrowed" and "how to renew" — positives with answers in the corpus; "when does the cafeteria serve food" and "how to issue an invoice" — negatives with nothing in the corpus. **Calibration is precisely measuring out two score clusters with these two classes of questions.**)

Don't stare too long at the `python3 -c ...` part — it merely extracts the top1 score from the returned JSON and prints three decimals for easy comparison. What matters is each question's score and the pattern behind the scores.

Expected result (measured under FakeEmbedding; your numbers will differ slightly but the pattern holds): positive "书能借多久" ≈ 0.10, negative "怎么开发票" ≈ 0.13 — **the negative scores higher; the two clusters blur together**. At this moment any threshold either lets negatives through or kills positives. The 2-chunk split squeezed unrelated content into the same chunks, and the vectors lost their discrimination.

This is the rehearsal of "guessing a threshold": if you skip this experiment and ship a copied 0.5, you'll never know gating was broken from day one — negatives pass high, and the model keeps fabricating from irrelevant passages.

Also glance at the fourth question "食堂几点吃饭"'s score — remember its magnitude; it becomes more persuasive after step 4.

### Step 4: Adjust chunking, redo the experiment

Make chunks smaller — the Knowledge page's "re-chunk" (parameters change without re-uploading; the file is already on the server):

```bash
curl -X POST http://localhost:8000/v1/knowledge/sources/library-rules/rechunk \
  -H "Content-Type: application/json" -d '{"chunk_size": 120, "overlap": 12}'
```

Re-run step 3's experiment.

Expected result: `chunk_count` becomes 6; positives rise into the 0.20–0.31 range, negatives drop below 0.13 ("食堂几点吃饭" goes straight to 0.0). **The two score clusters separate; the threshold has somewhere to sit.** Write down your measured numbers — that's your own calibration record, more reliable than any guide's "recommended value".

How to keep a calibration record? A three-column table suffices: question, top1 score, positive/negative. For example:

| Question | top1 score | Class |
|---|---|---|
| 书能借多久 (how long can books be borrowed) | (your measured value) | Positive |
| 怎么开发票 (how to issue an invoice) | (your measured value) | Negative |

When anyone asks "where did your threshold come from", hand them this table — that is the answer.

Thresholds aren't copied; they're measured — that is the one sentence retrieval configuration keeps repeating.

Note the meaning of the operation order: experiment first and find the problem (2 chunks), then adjust parameters and verify the fix (6 chunks). Later, whenever you swap the embedding model or change documents, you repeat this loop — **experiment finds the problem, parameters fix it, experiment confirms the fix** — never "tune first and hope".

### Step 5: Configure gating and mount

In `app/agents/my_lib_assistant.yaml`: add a usage rule to the persona and add the `knowledge` section (use your own calibrated threshold; below is the measured value for this guide's corpus, 0.15):

```yaml
instruction: |
  ...（前几行不动）
  规章问题依据知识库检索到的片段作答，引用带 [n] 编号；检索不到就说不知道，不编。
  ...
knowledge:
  sources: [library-rules]
  top_k: 3
  # 0.15 是 FakeEmbedding 对本语料 6 块切分的实测分界（正例 0.195-0.309 / 反例 <=0.126）
  # 换 embedding 模型或扩文档后必须用 /v1/knowledge/query 重新校准
  score_threshold: 0.15
  no_hit_fallback: 抱歉，这个问题我在馆藏规章里查不到依据，建议到图书馆前台咨询确认。
  cite: true  # 默认开，引用标注（答案带 [n] 编号）；显式写出便于对照三个守门字段
```

(The two comment lines aren't decoration — the moment a colleague sees 0.15, their first question will be "where did this number come from". The comments answer **the value's applicability boundary**: which corpus, which chunking, which embedding model. Change any condition and it must be re-measured; the comment pins that sentence to the config itself. The persona line added says: answer rules questions from retrieved passages with `[n]` citations; if nothing is found, say so — don't invent.)

Import:

```bash
.venv/bin/luban init
```

Expected result: `my-lib-assistant` version +1; the workbench editor's "memory & knowledge" area shows the three gating fields.

Pause here and inventory what you now hold: a 6-chunk knowledge base, a set of scores you measured yourself, a threshold sitting between two score clusters, and three gates each doing its own job. RAG "configuration work" ends here — the remaining steps are acceptance.

### Step 6: A hit — answering with material in view

Ask 小图 in the debug console: `书最多能借多久？我是本科生` ("What's the maximum loan period? I'm an undergraduate")

Expected result: a reply like "本科生可同时借阅 10 册，借期 30 天**[1]**" ("Undergraduates may borrow 10 books at once for 30 days [1]") — the numbers come from your rules document, `[1]` is a citation marker. The model can't "invent" this answer: it has only seen the retrieved fragment.

That little `[1]` is an underrated design: it does two jobs at once — gives users an entry point to **verify the source** (click through to the original text), and constrains the model to **answer only from material** (requiring citations is requiring it to speak only from the numbered material). In [Evals and regression](./06-evals.md), whether citations appear also becomes a machine-checkable assertion.

Look at the numbers themselves: 10 books, 30 days — check them against step 1's original text, word for word. For hit scenarios your acceptance criterion is one line: **every factual claim in the answer must have its original text in the retrieved passages**. Anything without one, however plausible, is treated as hallucination.

### Step 7: A miss — code gating, model never appears

Ask something entirely absent from the corpus: `食堂几点开门吃饭` ("When does the cafeteria open for meals?")

Expected result: the reply is **verbatim** your configured `no_hit_fallback` sentence ("Sorry, I can't find a basis for this in the library rules — please check with the library front desk."). Watch the event stream (curl or the debug console): the `knowledge.no_hit` event carries the full scene — `{"sources": ["library-rules"], "score_threshold": 0.15, "hits_raw": 3, "hits_kept": 0}` (3 chunks retrieved, 0 kept after threshold); **no token.delta** — the model was never invoked; this refusal cost nothing and had no room to improvise. Run end reason: `knowledge_no_hit`.

The answer to question 2 from the opening lands here: the refusal is **the code's decision** — the model never appeared. After `hits_kept: 0`, the framework takes the fallback line and closes; the absence of any token.delta in the event stream is the hard proof. The fallback sentence you wrote in step 5 was, at that moment, the only "source of answers" in this conversation.

### Step 8: Deliberately break the gate, then look again

Change the threshold in the YAML to 0.05, init, and re-ask "食堂几点开门吃饭".

Expected result: no refusal this time — low-score passages pass, and the model starts "assembling an answer" from irrelevant rules passages (it may drift into study-area opening hours). Afterwards, change the threshold back to 0.15. The trip isn't wasted: you now have a feel for what one notch of threshold slack does — the next time an agent starts giving plausible-sounding non-answers, your first move should be checking the threshold.

This step deliberately manufactures the most common production RAG incident: nobody touched the documents, nobody touched the persona — just an unguarded threshold — and the agent degrades from "a well-behaved consultant" into "an amateur who answers everything". **Between 0.15 and 0.05 sits an incident.**

Format the sabotage experiment's conclusion: among the three gates, the threshold is the only one requiring you to supply a number — and therefore the only one you can enter wrongly. The fallback line and citations take effect as configured, with no calibration problem. The only gate that can fail silently is the threshold — which is exactly why it deserves its own calibration.

## 3. Validation

- [ ] The knowledge base shows library-rules with 6 chunks (chunk_size 120)
- [ ] The retrieval experiment is on record: positive/negative score clusters, threshold between them
- [ ] Hit questions carry [n] citations with numbers matching the document
- [ ] Miss questions trigger no_hit: the fallback returned verbatim, the event stream has knowledge.no_hit, no token.delta
- [ ] The deliberate sabotage experiment was done and reverted

Use this checklist as on [Local run](./01-setup-and-first-run.md): verify each item hands-on — especially the last: only after breaking it and restoring it do you truly understand what the threshold guards. Going to production with "it never broke, so I don't know what broken looks like" is the most common starting point of RAG incidents.

## 4. FAQ

This page's pitfalls share one trait: **mistaking "config is correct" for "gating is effective"**. Correct configuration is necessary but not sufficient; only your calibration data can prove gating works. One by one:

**Copying the threshold from the guide or someone else.** This page's 0.15 is valid only for this guide's corpus and chunking. Your documents, your chunking, a future real embedding model — any change requires re-running step 3's calibration. Copying thresholds is the number-one cause of gate failure.

**Positives and negatives won't separate.** Go back to chunking: chunks too large → make them smaller; if still failing, check whether the document itself is a "everything stew" (ten topics in one section) — RAG likes clearly structured, one-topic-per-section documents.

**A question that "should be refused" gets answered.** Check the question's actual score via the retrieval test endpoint first; two cases. Like this page's "怎么开发票": under 6-chunk splitting it measured 0.126, all top3 below the 0.15 threshold — the **code defense of threshold + fallback short-circuits it** (`knowledge.no_hit`; the model never appears; you see the fallback verbatim) — the persona deserves no credit here. The other case is a genuine gray area past the threshold (wording grazes some clause and similarity is genuinely high — words like "滞纳金" (overdue fine) or "工本费" (replacement fee) can lift an unrelated question over the line) — only then does the persona get its turn, as the second layer of defense in depth, catching what the threshold leaked rather than closing out for the gates. Handling gray areas is a business decision: write the persona's fallback carefully enough to catch them, or accept the answer.

**Edited the YAML's knowledge section but nothing changed.** Old friend: `luban init`.

**Scores all changed after changing documents.** Normal — recalibrate. Re-chunking from the Knowledge page is fast; don't put it off. Update the calibration record (step 4's table) at the same time — never let config and record disagree.


## Related docs

Next task: [Evals and regression](./06-evals.md). Full fields and interfaces are in [the manual](../manual/index.md).
