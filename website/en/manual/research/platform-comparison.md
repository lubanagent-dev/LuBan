---
title: Platform benchmark research
pageClass: platform-research
---

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// Diagrams are shared with the Chinese page and resolved via a relative glob.
const images = import.meta.glob('../../../manual/research/images/*.svg', { eager: true, query: '?url', import: 'default' });
const diagramUrl = (id) => images[`../../../manual/research/images/${id}.svg`];

// Lightbox: enlarge diagrams in place on this page instead of opening a new tab.
const lightbox = ref('');
const openLightbox = (url) => { lightbox.value = url; };
const closeLightbox = () => { lightbox.value = ''; };
const onKeydown = (e) => { if (e.key === 'Escape') closeLightbox(); };
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

const diagrams = [
  { id: 'lubanagent', name: 'LuBanAgent', tagline: 'Governance gates + portal, per-subject assignment, dynamic assembly and quotas' },
  { id: 'open-webui', name: 'Open WebUI', tagline: 'Portal essentials nearly complete; governance, approvals and quotas missing' },
  { id: 'dify', name: 'Dify', tagline: 'Tenants, quotas, sandbox and knowledge bases; approvals and budget governance missing' },
  { id: 'coze-studio', name: 'Coze Studio', tagline: 'Same track as Dify; orchestration, knowledge bases and plugins complete' },
  { id: 'librechat', name: 'LibreChat', tagline: 'Accounts, sessions, files and MCP complete; governance thin' },
  { id: 'fastgpt', name: 'FastGPT', tagline: 'Strong knowledge-base and team permissions; weak execution isolation' },
  { id: 'codex-app-server', name: 'Codex App Server', tagline: 'Strong harness/sandbox/approval modes; platform layer fully self-built' },
  { id: 'dsh', name: 'DSH', tagline: 'Good sandbox/workspace abstractions; risky for production' },
  { id: 'openhands', name: 'OpenHands', tagline: 'Benchmark for per-session container isolation; auth is enterprise-only' },
  { id: 'pi', name: 'pi', tagline: 'Minimal harness, referenced for design ideas' },
  { id: 'openai-agents-sdk', name: 'OpenAI Agents SDK', tagline: 'Complete session/guardrail/tracing primitives' },
  { id: 'agentscope', name: 'AgentScope', tagline: 'Message-passing multi-agent with official sandbox support' },
  { id: 'mastra', name: 'Mastra', tagline: 'TS-ecosystem primitives; no portal' },
  { id: 'deer-flow', name: 'deer-flow', tagline: 'Research-oriented orchestration with plan confirmation; costly to fork' },
  { id: 'agent-teams', name: 'AgentTeams (HiClaw)', tagline: 'One container per agent plus Matrix group chat' },
  { id: 'multiuserclaw', name: 'MultiUserClaw', tagline: 'Multi-tenant portal out of the box; governance weak' },
  { id: 'yc-qm', name: 'YC-QM', tagline: 'Organization permissions are the selling point' },
  { id: 'multica', name: 'Multica', tagline: 'Local and cloud-sandbox runtimes; shared resources as a git repo' },
  { id: 'hermes', name: 'Hermes', tagline: 'Strong skill ecosystem; profiles are not permission isolation' },
  { id: 'workbuddy', name: 'WorkBuddy', tagline: 'Client distribution model (route D example)' },
  { id: 'qwenpaw', name: 'QwenPaw', tagline: 'Strong channel reach; no multi-user support' },
  { id: 'litellm', name: 'LiteLLM', tagline: 'Standard for quotas and virtual keys; no agent layer' },
  { id: 'weknora', name: 'Weknora / WebKnorv', tagline: 'Pure knowledge base' },
  { id: 'ragflow', name: 'RAGFlow', tagline: 'Differentiated document parsing depth' },
  { id: 'e2b-opensandbox', name: 'E2B / OpenSandbox', tagline: 'Sandbox-as-a-service on microVMs' },
  { id: 'k8s-session-sandbox', name: 'K8s session sandbox', tagline: 'Upper bound with Pod-level hard isolation' },
  { id: 'bwrap-cubesandbox', name: 'Bwrap / CubeSandbox', tagline: 'Lightweight process-level sandbox' },
];

// Matrix column order: LuBanAgent first, then the research order.
const projects = [
  { id: 'lubanagent', name: 'LuBanAgent' },
  { id: 'open-webui', name: 'Open WebUI' },
  { id: 'dify', name: 'Dify' },
  { id: 'coze-studio', name: 'Coze' },
  { id: 'librechat', name: 'LibreChat' },
  { id: 'fastgpt', name: 'FastGPT' },
  { id: 'codex-app-server', name: 'Codex' },
  { id: 'dsh', name: 'DSH' },
  { id: 'openhands', name: 'OpenHands' },
  { id: 'pi', name: 'pi' },
  { id: 'openai-agents-sdk', name: 'OA SDK' },
  { id: 'agentscope', name: 'AgentScope' },
  { id: 'mastra', name: 'Mastra' },
  { id: 'deer-flow', name: 'deer-flow' },
  { id: 'agent-teams', name: 'AgentTeams' },
  { id: 'multiuserclaw', name: 'MultiUserClaw' },
  { id: 'yc-qm', name: 'YC-QM' },
  { id: 'multica', name: 'Multica' },
  { id: 'hermes', name: 'Hermes' },
  { id: 'workbuddy', name: 'WorkBuddy' },
  { id: 'qwenpaw', name: 'QwenPaw' },
  { id: 'litellm', name: 'LiteLLM' },
  { id: 'weknora', name: 'Weknora' },
  { id: 'ragflow', name: 'RAGFlow' },
  { id: 'e2b-opensandbox', name: 'E2B/OSB' },
  { id: 'k8s-session-sandbox', name: 'K8s' },
  { id: 'bwrap-cubesandbox', name: 'Bwrap' },
];
const sym = { full: '●', part: '◐', none: '○' };

// Each status array is aligned with `projects`; coarse verdicts, see the detail table.
const requirements = [
  { name: 'Web chat portal', s: ['●','●','●','●','●','●','○','○','◐','○','○','◐','○','◐','◐','●','◐','◐','◐','◐','●','○','◐','◐','○','○','○'] },
  { name: 'Registration / accounts', s: ['●','●','●','●','●','●','○','○','◐','○','○','○','○','○','◐','●','◐','◐','◐','◐','●','○','◐','●','○','○','○'] },
  { name: 'Per-user session isolation', s: ['●','●','●','●','●','●','●','●','●','○','◐','●','◐','◐','●','●','◐','●','○','●','◐','○','◐','◐','●','●','●'] },
  { name: 'Session history persistence', s: ['●','●','●','●','●','●','●','●','●','◐','●','●','●','◐','●','●','◐','●','●','●','●','○','○','◐','◐','○','○'] },
  { name: 'Knowledge bases with grants', s: ['●','●','●','●','◐','●','○','○','◐','○','○','◐','◐','○','◐','◐','◐','◐','◐','◐','◐','○','●','●','○','○','○'] },
  { name: 'Skills with visibility scopes', s: ['●','●','◐','●','◐','◐','◐','◐','◐','◐','◐','◐','◐','○','◐','◐','◐','◐','●','◐','●','○','○','○','○','○','○'] },
  { name: 'MCP central config', s: ['●','●','◐','◐','●','◐','●','●','●','◐','◐','●','●','○','◐','◐','◐','●','◐','◐','◐','○','○','○','○','○','○'] },
  { name: 'Tool sandboxing', s: ['●','◐','●','●','◐','◐','●','●','●','◐','◐','●','◐','◐','●','◐','◐','●','○','◐','◐','○','○','○','●','●','●'] },
  { name: 'Per-user/session containers', s: ['●','◐','◐','◐','○','○','●','◐','●','○','○','◐','○','◐','●','●','◐','●','○','○','○','○','○','○','●','●','◐'] },
  { name: 'Quotas and model management', s: ['●','◐','●','●','◐','◐','○','○','◐','○','○','○','○','○','◐','◐','◐','◐','◐','◐','◐','●','○','◐','◐','○','○'] },
  { name: 'Cost attribution and audit', s: ['●','◐','◐','◐','◐','◐','◐','○','◐','◐','●','◐','◐','◐','◐','◐','◐','◐','◐','◐','◐','●','○','○','◐','◐','○'] },
  { name: 'Human approval', s: ['●','○','◐','○','○','○','●','○','◐','○','●','○','○','◐','◐','○','○','○','○','○','○','○','○','○','○','○','○'] },
  { name: 'File upload / download', s: ['●','●','●','●','●','●','◐','◐','●','◐','◐','◐','◐','◐','◐','●','◐','◐','◐','●','●','○','●','●','●','○','○'] },
  { name: 'Multi-agent collaboration', s: ['●','○','●','●','○','◐','◐','◐','◐','◐','●','●','●','●','●','◐','◐','●','◐','◐','◐','○','○','○','○','○','○'] },
  { name: 'Org structure / multi-tenancy', s: ['○','●','●','●','◐','●','○','○','◐','○','○','○','○','○','◐','●','●','◐','○','○','◐','●','◐','◐','◐','◐','○'] },
  { name: 'Desktop / local clients', s: ['○','○','○','○','○','○','◐','○','◐','○','○','○','○','○','○','○','○','○','○','●','●','○','○','○','○','○','○'] },
];
</script>

<style>
/* Research page only: keep the first column visible while the wide table scrolls. */
.platform-research table {
  display: block;
  overflow-x: auto;
  max-width: 100%;
}
.platform-research th,
.platform-research td {
  min-width: 230px;
}
.platform-research th:first-child,
.platform-research td:first-child {
  position: sticky;
  left: 0;
  z-index: 2;
  min-width: 150px;
  width: 170px;
  background: var(--vp-c-bg);
  border-right: 1px solid var(--vp-c-divider);
  box-shadow: 6px 0 10px -8px rgba(0, 0, 0, 0.35);
}
.platform-research thead th:first-child {
  z-index: 3;
  background: var(--vp-c-bg-soft);
}
.platform-research .diagram-card {
  margin: 1.5rem 0 2.5rem;
}
.platform-research .diagram-card img {
  width: 100%;
  height: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}
/* Big matrix: columns = projects, rows = requirements, last row embeds diagrams */
.platform-research .matrix th,
.platform-research .matrix td {
  min-width: 60px;
  padding: 6px 8px;
  text-align: center;
  font-size: 12px;
}
.platform-research .matrix th:first-child,
.platform-research .matrix td:first-child {
  min-width: 150px;
  width: 160px;
  text-align: left;
}
.platform-research .matrix td.st-full {
  color: #16a34a;
  font-weight: 600;
}
.platform-research .matrix td.st-part {
  color: #d97706;
  font-weight: 600;
}
.platform-research .matrix td.st-none {
  color: var(--vp-c-text-3);
}
.platform-research .matrix td img {
  width: 120px;
  height: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
}
/* In-page enlargement: lightbox overlay, close on any click or Escape */
.platform-research img.zoomable {
  cursor: zoom-in;
}
.platform-research .lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  cursor: zoom-out;
}
.platform-research .lightbox img {
  max-width: 96vw;
  max-height: 92vh;
  width: auto;
  height: auto;
  background: #fff;
  border-radius: 8px;
}
</style>

# Platform benchmark research

This page benchmarks "user-facing platform" requirements gathered from Linux.do topic 2854294 (the original post plus 146 replies) against 25+ open-source projects, including the technical principles behind each capability, together with 27 **isomorphic architecture diagrams** (one shared six-layer structure, one shared status legend — flip through them side by side to see who has which slot).

Legend: **● native support　◐ partial / needs a fork　○ missing　★ recently added**.

The full research process, gap analysis and transformation plan live in the repository: `docs/design-docs/LuBanAgent-platform-research-and-transformation.md`.

## Requirements × 28 projects matrix {#comparison-table}

The big table: **each column is a project** (LuBanAgent first for easy comparison), each row is a requirement, and the **last row embeds every project's isomorphic architecture diagram** (click to enlarge). It is wide and **scrolls horizontally** with the leftmost requirement column frozen. Cells are coarse verdicts: **● native　◐ partial / needs a fork　○ missing**; per-item evidence, descriptions and technical principles are in the [detail table](#detail-table).

<div class="matrix-wrap">
<table class="matrix">
<thead>
<tr><th>Requirement</th><th v-for="p in projects" :key="p.id">{{ p.name }}</th></tr>
</thead>
<tbody>
<tr v-for="r in requirements" :key="r.name">
<th>{{ r.name }}</th>
<td v-for="(p, i) in projects" :key="p.id" :class="'st-' + r.s[i]">{{ sym[r.s[i]] }}</td>
</tr>
<tr class="matrix-diagrams">
<th>Architecture diagram</th>
<td v-for="p in projects" :key="p.id"><img class="zoomable" :src="diagramUrl(p.id)" :alt="p.name + ' architecture diagram'" loading="lazy" @click="openLightbox(diagramUrl(p.id))" /></td>
</tr>
</tbody>
</table>
</div>

### Support details and technical principles {#detail-table}

| Requirement | Description | Open-source support | Technical principle |
| --- | --- | --- | --- |
| Web chat portal | Non-technical users work in the browser, full-screen sidebar-free chat | Open WebUI ●; Dify ● (app publishing); LibreChat ●; LuBanAgent ◐ (/chat is demo-grade) | SPA (Svelte/React) + FastAPI/Express backend; SSE token streaming; session state in DB, frontend only renders |
| Registration / login / accounts | Self-service signup or admin-issued accounts, SSO | LibreChat ● (built-in signup + OAuth); Open WebUI ●; Dify ● (tenant + invites); MultiUserClaw ● (multi-tenant signup); LuBanAgent ◐ (workbench RBAC only) | Local account table + bcrypt/argon2 hashing; OAuth2/OIDC redirect exchanging id_token; signed JWT or server-side session cookies |
| Per-user session isolation | A's context must never leak into B's | OpenHands ● (container per session); MultiUserClaw ●; LuBanAgent ◐ (single-user demo) | Each session binds a subject_id carried through the request chain via ContextVar; DB queries always include tenant/subject predicates (row-level filtering); in-memory state isolated via per-request dependency injection |
| Session history persistence | History survives refreshes and devices | Open WebUI ●; LibreChat ● (Mongo session trees); Dify ●; LuBanAgent ◐ (Runs are recorded but /chat has no session list) | Message table (session_id, role, content, seq); paginated list API; message writes decoupled from SSE completion events, persisted asynchronously |
| Knowledge bases with per-user grants | Platform-managed bases, visibility per user/role | Dify ● (KB + team permissions); FastGPT ● (team collaboration); RAGFlow ●; commercial products per #39 ●; LuBanAgent ◐ (KB management exists, no per-user grants) | KB table + ACL join table (kb_id, subject/role, perm); permission predicates run before vector search; chunking → embedding → vector store (Qdrant/Milvus), hybrid BM25 + vector retrieval |
| Skills with visibility scopes | Platform-installed skills, hidden from unauthorized users | Commercial products per #39 ●; WorkBuddy ◐; skill marketplace + CLI per #36 ●; LuBanAgent ◐ (workbench-level assignment exists, no end-user dimension) | Skill catalog in DB (versioned); assignment table (skill_id, subject/role); runtime filters by subject before registering tools into the agent |
| MCP with dynamic registration | Platform-hosted MCP servers, distributed per user | Dify ◐ (plugin model); Multica ● (shared MCP via git repo config); AgentScope ●; LuBanAgent ◐ (MCP client exists, no per-user distribution) | Gateway holds MCP server connection pools (stdio/SSE); per-user "resource views" bind visible MCP tools into the LangGraph prebuilt agent's tools parameter at run assembly |
| Tool execution isolation (sandbox) | Tool code must not break the host | OpenHands ● (Docker runtime); Dify ● (dify-sandbox: seccomp + isolated processes); deer-flow ◐ (Bwrap); E2B/OpenSandbox ● (microVM/gVisor); LuBanAgent ◐ (governance gates only, no process sandbox) | Four isolation tiers: process (seccomp/bubblewrap namespace+cgroup) → container (full namespaces + read-only rootfs + limits) → microVM (Firecracker hardware virtualization) → none (code review + governance gates). LuBan tools are reviewed Python; gates are primary, sandbox optional |
| Per-user / per-session containers | Strong-isolation backstop | #36 ● (one container per user); AgentTeams ● (one per agent); #82 ● (one per session); K8s per #70 ● | Docker/K8s API creates pods/containers dynamically with per-user volumes; idle reclamation or run-end teardown; reverse proxy routes by subdomain |
| Quotas and model management | Token and cost limits per user/department | LiteLLM ● (proxy-level quotas + budgets + virtual keys); Dify ●; Open WebUI ◐; LuBanAgent ◐ (global three-gate budgets, no per-subject quotas) | Gateway intercepts: check quota table (used < limit) before, accumulate usage asynchronously after; tiktoken estimates with real usage backfilled; 429 + circuit break on breach |
| Cost attribution and audit | Who spent what on which call, doing what | LuBanAgent ● (Run/Trace with cost attribution — rare among peers); LiteLLM ● (per-call logs); Open WebUI ◐ | Each Run records model/tool/tokens/cost into a trace tree; dual-writes to the observability backend; audit events (login/approval/permission changes) in a separate append-only table |
| Human approval for risky actions | Large refunds and similar actions need confirmation | LuBanAgent ● (persisted, concurrency-safe, resumable approvals); Dify ◐; OpenAI Agents SDK ● (guardrail + interrupt); #58 disables system operations ◐ | Pre-execution risk-label check → suspend Run and persist the approval request → approve/reject via UI/API → resume the Run; approval state machine tied to the Run lifecycle |
| File upload / download / artifacts | Users upload documents and download outputs | Open WebUI ● (many pitfalls); Dify ● (file variables); esbuild-wasm compile per #84 ●; LuBanAgent ◐ (KB upload exists, no session files) | Pre-signed direct upload or backend proxy to object storage/local disk; per-session file directories; downloads via authorized signed URLs, avoiding Open WebUI-style sandbox file routing pitfalls |
| Multi-agent collaboration | Decompose complex tasks across agents | AgentTeams ● (Matrix multi-agent chat); AgentScope ● (message passing); LuBanAgent ● (LangGraph supervisor delegation; orchestration Runs are children of session Runs) | Supervisor nodes route via the task graph to sub-agents; shared blackboard/message bus carries state; budget inheritance and cancellation propagation |
| Org structure / multi-tenancy | Departments, tenants, row-level isolation | Dify ● (tenant model); FastGPT ● (teams); YC-QM ●; MultiUserClaw ●; LuBanAgent ○ (explicitly out of scope; see §4 of the research report) | tenant_id threaded through all tables; RBAC user→role→permission adjudicated per request; row-level isolation via mandatory tenant predicates (PostgreSQL RLS or application layer) |
| Desktop / local clients | Agents run on employee machines, isolation for free | WorkBuddy ●; QwenPaw ● (web + desktop); Cherry Studio model ● (#20); LuBanAgent ○ (no client) | Electron/Tauri shell + local runtime process; config/resources pulled from the management center; direct local file access, no server sandbox needed |

## Isomorphic architecture gallery (27 diagrams) {#architecture-gallery}

All diagrams share one six-layer structure and one status legend. Place any diagram next to [LuBanAgent](#lubanagent): gray dashed boxes (○) are what that project lacks, solid colored boxes (●) are what both have, and ★ marks capabilities recently added to LuBanAgent. Click any image to enlarge it in place. Generator: `scripts/gen-platform-comparison-diagrams.py` (data-driven and reproducible).

<section v-for="d in diagrams" :key="d.id" class="diagram-card">
<h3 :id="d.id">{{ d.name }}</h3>
<p>{{ d.tagline }}</p>
<img class="zoomable" :src="diagramUrl(d.id)" :alt="`${d.name} architecture diagram`" loading="lazy" @click="openLightbox(diagramUrl(d.id))" />
</section>

<div v-if="lightbox" class="lightbox" @click="closeLightbox">
<img :src="lightbox" alt="Enlarged architecture diagram" />
</div>
