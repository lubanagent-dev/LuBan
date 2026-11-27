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
  { id: 'agentscope', name: 'AgentScope' },
  { id: 'deer-flow', name: 'deer-flow' },
  { id: 'agent-teams', name: 'AgentTeams' },
  { id: 'hermes', name: 'Hermes' },
  { id: 'litellm', name: 'LiteLLM' },
];
const st = { '●': 'full', '◐': 'part', '○': 'none' };
const descs = {
  'Web chat portal': 'Non-technical users work in the browser, sidebar-free chat',
  'Registration / accounts': 'Self-service signup or admin-issued accounts, SSO',
  'Per-user session isolation': "A's context must never leak into B's",
  'Session history persistence': 'History survives refreshes and devices',
  'Knowledge bases with grants': 'Platform-managed bases, visibility per user/role',
  'Skills with visibility scopes': 'Platform-installed skills, hidden from unauthorized users',
  'MCP central config': 'Platform-hosted MCP servers, distributed per user',
  'Tool sandboxing': 'Tool code must not break the host',
  'Per-user/session containers': 'Strong-isolation backstop',
  'Quotas and model management': 'Token and cost limits per user/department',
  'Cost attribution and audit': 'Who spent what on which call, doing what',
  'Human approval': 'Large refunds and similar actions need confirmation',
  'File upload / download': 'Users upload documents and download outputs',
  'Multi-agent collaboration': 'Decompose complex tasks across agents',
  'Org structure / multi-tenancy': 'Departments, tenants, row-level isolation',
  'Desktop / local clients': 'Agents run on employee machines, isolation for free',
};

// Each status array is aligned with `projects`; coarse verdicts, see the detail table.
const requirements = [
  { name: 'Web chat portal', s: ['●','●','●','●','●','●','○','○','◐','○','◐','◐','◐','◐','○'] },
  { name: 'Registration / accounts', s: ['●','●','●','●','●','●','○','○','◐','○','○','○','◐','◐','○'] },
  { name: 'Per-user session isolation', s: ['●','●','●','●','●','●','●','●','●','○','●','◐','●','○','○'] },
  { name: 'Session history persistence', s: ['●','●','●','●','●','●','●','●','●','◐','●','◐','●','●','○'] },
  { name: 'Knowledge bases with grants', s: ['●','●','●','●','◐','●','○','○','◐','○','◐','○','◐','◐','○'] },
  { name: 'Skills with visibility scopes', s: ['●','●','◐','●','◐','◐','◐','◐','◐','◐','◐','○','◐','●','○'] },
  { name: 'MCP central config', s: ['●','●','◐','◐','●','◐','●','●','●','◐','●','○','◐','◐','○'] },
  { name: 'Tool sandboxing', s: ['●','◐','●','●','◐','◐','●','●','●','◐','●','◐','●','○','○'] },
  { name: 'Per-user/session containers', s: ['●','◐','◐','◐','○','○','●','◐','●','○','◐','◐','●','○','○'] },
  { name: 'Quotas and model management', s: ['●','◐','●','●','◐','◐','○','○','◐','○','○','○','◐','◐','●'] },
  { name: 'Cost attribution and audit', s: ['●','◐','◐','◐','◐','◐','◐','○','◐','◐','◐','◐','◐','◐','●'] },
  { name: 'Human approval', s: ['●','○','◐','○','○','○','●','○','◐','○','○','◐','◐','○','○'] },
  { name: 'File upload / download', s: ['●','●','●','●','●','●','◐','◐','●','◐','◐','◐','◐','◐','○'] },
  { name: 'Multi-agent collaboration', s: ['●','○','●','●','○','◐','◐','◐','◐','◐','●','●','●','◐','○'] },
  { name: 'Org structure / multi-tenancy', s: ['○','●','●','●','◐','●','○','○','◐','○','○','○','◐','○','●'] },
  { name: 'Desktop / local clients', s: ['○','○','○','○','○','○','◐','○','◐','○','○','○','○','○','○'] },
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
/* Big matrix: columns = projects, rows = requirements, last row embeds diagrams */
.platform-research .req-desc {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 400;
  color: var(--vp-c-text-2);
}

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
/* Big matrix: the table scrolls vertically on its own, with the project-name header pinned */
.platform-research .matrix-wrap {
  max-height: 70vh;
  overflow: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}
.platform-research .vp-doc table.matrix {
  display: table;
  width: max-content;
  min-width: 100%;
  margin: 0;
  border-collapse: separate;
  border-spacing: 0;
}
.platform-research .matrix thead th {
  position: sticky;
  top: 0;
  z-index: 4;
  background: var(--vp-c-bg-soft);
  box-shadow: inset 0 -1px 0 var(--vp-c-divider);
}
.platform-research .matrix thead th:first-child {
  z-index: 5;
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

This page benchmarks "user-facing platform" requirements gathered from Linux.do topic 2854294 (the original post plus 146 replies) against 15 same-positioning projects, including the technical principles behind each capability, together with 15 **isomorphic architecture diagrams** (one shared six-layer structure, one shared status legend — flip through them side by side to see who has which slot).

Legend: **● native support　◐ partial / needs a fork　○ missing　★ recently added**.

The full research process, gap analysis and transformation plan live in the repository: `docs/design-docs/LuBanAgent-platform-research-and-transformation.md`.

## Requirements × 15 projects matrix {#comparison-table}

The big table: **each column is a project** (LuBanAgent first for easy comparison), each row is a requirement, and the **last row embeds every project's isomorphic architecture diagram** (click to enlarge). The table **scrolls both ways**, and **both the project-name header and the leftmost requirement column stay frozen**, so you always know which project you are looking at. Cells are coarse verdicts: **● native　◐ partial / needs a fork　○ missing**; requirement descriptions appear under each row label.

<div class="matrix-wrap">
<table class="matrix">
<thead>
<tr><th>Requirement</th><th v-for="p in projects" :key="p.id">{{ p.name }}</th></tr>
</thead>
<tbody>
<tr v-for="r in requirements" :key="r.name">
<th>{{ r.name }}<span class="req-desc">{{ descs[r.name] }}</span></th>
<td v-for="(p, i) in projects" :key="p.id" :class="'st-' + st[r.s[i]]">{{ r.s[i] }}</td>
</tr>
<tr class="matrix-diagrams">
<th>Architecture diagram</th>
<td v-for="p in projects" :key="p.id"><img class="zoomable" :src="diagramUrl(p.id)" :alt="p.name + ' architecture diagram'" loading="lazy" @click="openLightbox(diagramUrl(p.id))" /></td>
</tr>
</tbody>
</table>
</div>

## Scenario-based recommendations {#recommendations}

The goal of benchmarking is picking the right tool per scenario, not defaulting to LuBanAgent everywhere. Decide in three steps: does the agent run real tasks → who uses it → how much governance do you need.

| Your scenario | Recommendation | Alternatives | Why |
| --- | --- | --- | --- |
| A shared ChatGPT-style Q&A portal for the team (mostly chat, no task execution) | Open WebUI | LibreChat | Works out of the box with accounts/sessions/files; an engineering base is overkill |
| Business/ops staff composing AI apps themselves (workflows, plugins, KB Q&A) | Dify | Coze Studio / FastGPT | Low-code orchestration and app publishing are mature; codex-style real task execution is not their strength |
| Knowledge base / RAG is the core need (many documents, high parsing quality bar) | RAGFlow | Weknora / FastGPT | Differentiated document parsing depth; composable with any platform |
| Unified model access, quotas, cost accounting and virtual keys | LiteLLM | — | The standard model gateway; stacks on top of any platform above — not an either/or |
| Agents must do real work: execute code, operate tools, run long tasks | Codex App Server / OpenHands | OpenAI Agents SDK (assemble yourself) | Harness + sandbox + approvals are the core; note OpenHands auth is enterprise-only |
| In-company multi-user agent platform: portal + per-user assignment + quotas + approvals + audit, self-hosted data | LuBanAgent | MultiUserClaw / YC-QM (lightweight self-hosting) | Governance gates plus portal/assignment/dynamic assembly/subject quotas out of the box; tools are governed, lower risk than free-shell setups |
| Framework-level R&D on multi-agent collaboration | AgentScope / Mastra | OpenAI Agents SDK / pi | Provides primitives and design ideas; portal and governance are DIY |
| Running untrusted code/plugins with strict isolation | E2B / OpenSandbox | K8s session pods / Bwrap | Sandboxes are components, not platforms; combinable with anything above |
| Agents execute on employee machines (desktop-first) | WorkBuddy / QwenPaw | Cherry Studio-style DIY | Local execution is isolated for free; no server sandbox needed |

Three selection principles:

1. **First ask whether agents run real tasks**: chat-only → portal tools (Open WebUI/LibreChat); real execution → base/harness tools (LuBanAgent/Codex/OpenHands).
2. **Then ask who uses it**: for developers, an SDK/framework is enough; for everyone in the company, you need portal, permissions and quota governance.
3. **Components compose**: LiteLLM (gateway) + E2B (sandbox) + any platform is a common stack — no need to pick a monolith.

LuBanAgent's boundary: when you need "self-hosted data + real task execution + enterprise governance (assignment/quotas/approvals/audit)" all at once, it is the most convenient out-of-box option; for only one of those (say, a pure chat portal), a lighter tool fits better.

<div v-if="lightbox" class="lightbox" @click="closeLightbox">
<img :src="lightbox" alt="Enlarged architecture diagram" />
</div>
