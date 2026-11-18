# Knowledge and Memory

> This page covers the minimal-RAG knowledge base, the three no-hallucination gatekeeping fields, workbench knowledge management, and the three memory strategies. Both are optional capabilities.

**Knowledge base (minimal RAG)**: starts with a single knowledge base — document parsing (md/txt/pdf/docx/csv/json/html/xml, eight formats), chunking (size and overlap configurable per knowledge source), vectorization, retrieval, and answering with citations. Its scope is "enough for the customer-service example to run product Q&A"; no multi-base federation or complex reranking.

**No-hallucination gatekeeping (it's okay to not answer; never fabricate)**: the biggest RAG failure is not failed retrieval but the model fabricating an answer from weakly related chunks. Knowledge config provides three optional gatekeeping fields, all enforced by code (not prompt declarations):

```yaml
knowledge:
  sources: [product-faq]
  score_threshold: 0.2      # Relevance threshold: retrieved chunks below this cosine score are dropped outright (0 = no filtering)
  no_hit_fallback: 抱歉，我暂时无法确认这个问题的答案，建议联系人工客服。
  max_age_days: 30          # Knowledge freshness: chunks ingested more than 30 days ago are dropped (unset = unlimited)
```

- **score_threshold**: weakly related chunks are dropped before reaching the model — quality over quantity.
- **max_age_days**: stale knowledge never enters context (judged by the `ingested_at` timestamp written automatically at ingestion; existing data without timestamps is unaffected).
- **no_hit_fallback**: when nothing survives filtering, the agent **answers with this sentence directly without calling the model** — zero token consumption, and the Run completes normally (end reason `knowledge_no_hit`, with one `knowledge.no_hit` event in the event stream). Without this sentence the old behavior stays: the model answers as usual even with no chunks.
- With none of the three fields set, behavior is exactly as before; `cite: false` turns off the default citation constraint ("[n] numbering + answer only from chunks").

Thresholds must be calibrated with your actual embedding model (score scales differ across embeddings); after switching to a real embedding model, re-ingest and retune the threshold. The embedding model is configured via env `EMBEDDING_MODEL` (optionally `EMBEDDING_BASE_URL`/`EMBEDDING_API_KEY_ENV`) — without it, a built-in deterministic demo vector is used, enough to run the examples but not promising production retrieval quality. The workbench agent editor's "Memory & knowledge" section can set these three fields directly (threshold, fallback text, freshness days; empty = disabled); the knowledge page's "Retrieval test" panel tries queries live with matched chunks and similarity scores — the direct tool for calibrating thresholds.

**Knowledge management (workbench "Knowledge" page)**: knowledge sources are fully managed in the UI, no code — upload multi-format documents to create a source (fill name, description, chunking params; multiple files in one shot), inspect each chunk's text and source file, re-chunk everything with one click after changing parameters (uploaded files are kept on disk; no re-upload needed), and delete sources (chunks and files removed together). Sources created in the UI appear in the same list as code-seeded sources (like `product-faq`); seeded sources carry an "Built-in" badge and cannot be deleted; reference created sources in agent YAML's `knowledge.sources` by name. Each uploaded file is capped at 10 MB and each upload batch at 50 MB. Entry point: the [developer workbench](./workbench.md).

**Context injection budget (Inline & Spill)**: knowledge chunks and long-term memory are injected in full by default; many hits crowd the context window. An agent definition can set a character budget for each; entries over budget are demoted **whole** into a reference line 〔ref: kn:12〕 left in the window (never truncated mid-entry, preventing hallucination over broken sentences), and the framework injects companion tools `knowledge_read(ref_id)` / `memory_read(ref_id)` for fetching full text by reference when needed.

```yaml
knowledge:
  sources: [product-faq]
  inline_budget_chars: 2000           # Total character budget for injected knowledge chunks
memory:
  long_term: true
  long_term_inline_budget_chars: 800  # Total character budget for injected long-term memory
```

- The agent definition is the gate; there is no global switch; with neither budget set, behavior is exactly as before (full injection).
- Companion tools are injected only when demoted entries actually exist; they never appear in the tool list of a full-injection scenario.
- Access control: `knowledge_read` can only read chunks from the knowledge sources configured for this agent, and `memory_read` only this agent + current user — any attempt beyond that returns `not_found` without leaking existence.

**Memory**: three strategies selectable per agent — session memory (this conversation), summary memory (long-range compression), and long-term memory (cross-session key facts, written explicitly). Context assembly follows the KV-cache invariants in [cost governance](./cost.md).

**Principle**: RAG and memory are both **optional**; simple agents are not dragged down by complex components.
