---
title: 平台对标调研
pageClass: platform-research
---

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const images = import.meta.glob('./images/*.svg', { eager: true, query: '?url', import: 'default' });
const diagramUrl = (id) => images[`./images/${id}.svg`];

// 灯箱：点击缩略图在当前页放大，不跳转新页面。
const lightbox = ref('');
const openLightbox = (url) => { lightbox.value = url; };
const closeLightbox = () => { lightbox.value = ''; };
const onKeydown = (e) => { if (e.key === 'Escape') closeLightbox(); };
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

// 图集与 docs/design-docs 调研报告 §1.5 保持同源；生成脚本可复现。
const diagrams = [
  { id: 'lubanagent', name: 'LuBanAgent', tagline: '治理四件套 + 门户/分配/动态装配/主体配额' },
  { id: 'open-webui', name: 'Open WebUI', tagline: '门户五件套几乎全有，治理/审批/配额缺' },
  { id: 'dify', name: 'Dify', tagline: '租户/配额/沙箱/知识库全，审批与预算治理缺' },
  { id: 'coze-studio', name: 'Coze Studio', tagline: '与 Dify 同赛道，编排/知识库/插件全' },
  { id: 'librechat', name: 'LibreChat', tagline: '注册/会话/文件/MCP 齐，治理薄' },
  { id: 'fastgpt', name: 'FastGPT', tagline: '知识库/团队权限强，执行隔离弱' },
  { id: 'codex-app-server', name: 'Codex App Server', tagline: 'harness/沙箱/审批模式强，平台层全自建' },
  { id: 'dsh', name: 'DSH', tagline: '沙箱/工作区抽象好，生产慎用' },
  { id: 'openhands', name: 'OpenHands', tagline: '每会话容器隔离标杆，认证在企业版' },
  { id: 'pi', name: 'pi', tagline: '极简 harness 理念参考' },
  { id: 'openai-agents-sdk', name: 'OpenAI Agents SDK', tagline: 'session/guardrail/tracing 原语全' },
  { id: 'agentscope', name: 'AgentScope', tagline: '消息传递多 Agent，沙箱官方支持' },
  { id: 'mastra', name: 'Mastra', tagline: 'TS 生态同类原语，门户无' },
  { id: 'deer-flow', name: 'deer-flow', tagline: '研究型编排+计划确认，二开成本高' },
  { id: 'agent-teams', name: 'AgentTeams（HiClaw）', tagline: '一 Agent 一容器 + Matrix 群聊协作' },
  { id: 'multiuserclaw', name: 'MultiUserClaw', tagline: '多租户门户开箱即用，治理弱' },
  { id: 'yc-qm', name: 'YC-QM', tagline: '组织权限是卖点' },
  { id: 'multica', name: 'Multica', tagline: 'runtime 双形态 + 资源 git repo 化' },
  { id: 'hermes', name: 'Hermes', tagline: 'Skill 生态强，profile 非权限隔离' },
  { id: 'workbuddy', name: 'WorkBuddy', tagline: '客户端分发模式（路线 D 实例）' },
  { id: 'qwenpaw', name: 'QwenPaw', tagline: '渠道触达强，多用户缺' },
  { id: 'litellm', name: 'LiteLLM', tagline: '配额/虚拟 Key 标配，无 Agent 层' },
  { id: 'weknora', name: 'Weknora / WebKnorv', tagline: '纯知识底座' },
  { id: 'ragflow', name: 'RAGFlow', tagline: '文档解析深度差异化' },
  { id: 'e2b-opensandbox', name: 'E2B / OpenSandbox', tagline: 'microVM 沙箱即服务' },
  { id: 'k8s-session-sandbox', name: 'K8s 会话沙箱', tagline: 'Pod 级硬隔离上限方案' },
  { id: 'bwrap-cubesandbox', name: 'Bwrap / CubeSandbox', tagline: '进程级轻沙箱' },
];

// 大总表的列顺序：LuBanAgent 放最前，其余按调研顺序。
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
  { id: 'k8s-session-sandbox', name: 'K8s 沙箱' },
  { id: 'bwrap-cubesandbox', name: 'Bwrap' },
];
const st = { '●': 'full', '◐': 'part', '○': 'none' };
const descs = {
  'Web 用户端聊天门户': '非技术用户浏览器即用，无侧栏全屏对话',
  '注册/登录/账号体系': '外部人员自助注册或管理员开户，SSO',
  '多用户会话隔离': 'A 的上下文不能串到 B',
  '会话历史持久化': '刷新/换设备能找回历史',
  '知识库配置+按权限分配': '平台建库，按用户/角色授权可见',
  'Skill 统一配置+可见范围': '平台统一装 Skill，低权限看不到不该看的',
  'MCP 统一配置+动态注册': '平台统一接 MCP Server，按人下发',
  '工具执行沙箱隔离': '防止工具代码破坏宿主机',
  '每用户/每会话容器': '强隔离兜底',
  '用量配额与模型管理': '按人/部门限 Token 和费用',
  '费用归因与审计': '每次调用算清谁花了多少钱、干了什么',
  '高风险操作人工审批': '大额退款等敏感动作人工确认',
  '文件上传/下载/输出物': '用户传文档提问、下载生成物',
  '多 Agent 协作': '复杂任务拆给多个 Agent',
  '组织架构/多租户': '部门、租户、行级数据隔离',
  '桌面端/本地客户端': 'Agent 在员工本机执行，天然隔离',
};

// 每行状态数组与 projects 顺序一一对应；粗粒度结论，逐项依据见下方明细表。
const requirements = [
  { name: 'Web 用户端聊天门户', s: ['●','●','●','●','●','●','○','○','◐','○','○','◐','○','◐','◐','●','◐','◐','◐','◐','●','○','◐','◐','○','○','○'] },
  { name: '注册/登录/账号体系', s: ['●','●','●','●','●','●','○','○','◐','○','○','○','○','○','◐','●','◐','◐','◐','◐','●','○','◐','●','○','○','○'] },
  { name: '多用户会话隔离', s: ['●','●','●','●','●','●','●','●','●','○','◐','●','◐','◐','●','●','◐','●','○','●','◐','○','◐','◐','●','●','●'] },
  { name: '会话历史持久化', s: ['●','●','●','●','●','●','●','●','●','◐','●','●','●','◐','●','●','◐','●','●','●','●','○','○','◐','◐','○','○'] },
  { name: '知识库配置+按权限分配', s: ['●','●','●','●','◐','●','○','○','◐','○','○','◐','◐','○','◐','◐','◐','◐','◐','◐','◐','○','●','●','○','○','○'] },
  { name: 'Skill 统一配置+可见范围', s: ['●','●','◐','●','◐','◐','◐','◐','◐','◐','◐','◐','◐','○','◐','◐','◐','◐','●','◐','●','○','○','○','○','○','○'] },
  { name: 'MCP 统一配置+动态注册', s: ['●','●','◐','◐','●','◐','●','●','●','◐','◐','●','●','○','◐','◐','◐','●','◐','◐','◐','○','○','○','○','○','○'] },
  { name: '工具执行沙箱隔离', s: ['●','◐','●','●','◐','◐','●','●','●','◐','◐','●','◐','◐','●','◐','◐','●','○','◐','◐','○','○','○','●','●','●'] },
  { name: '每用户/每会话容器', s: ['●','◐','◐','◐','○','○','●','◐','●','○','○','◐','○','◐','●','●','◐','●','○','○','○','○','○','○','●','●','◐'] },
  { name: '用量配额与模型管理', s: ['●','◐','●','●','◐','◐','○','○','◐','○','○','○','○','○','◐','◐','◐','◐','◐','◐','◐','●','○','◐','◐','○','○'] },
  { name: '费用归因与审计', s: ['●','◐','◐','◐','◐','◐','◐','○','◐','◐','●','◐','◐','◐','◐','◐','◐','◐','◐','◐','◐','●','○','○','◐','◐','○'] },
  { name: '高风险操作人工审批', s: ['●','○','◐','○','○','○','●','○','◐','○','●','○','○','◐','◐','○','○','○','○','○','○','○','○','○','○','○','○'] },
  { name: '文件上传/下载/输出物', s: ['●','●','●','●','●','●','◐','◐','●','◐','◐','◐','◐','◐','◐','●','◐','◐','◐','●','●','○','●','●','●','○','○'] },
  { name: '多 Agent 协作', s: ['●','○','●','●','○','◐','◐','◐','◐','◐','●','●','●','●','●','◐','◐','●','◐','◐','◐','○','○','○','○','○','○'] },
  { name: '组织架构/多租户', s: ['○','●','●','●','◐','●','○','○','◐','○','○','○','○','○','◐','●','●','◐','○','○','◐','●','◐','◐','◐','◐','○'] },
  { name: '桌面端/本地客户端', s: ['○','○','○','○','○','○','◐','○','◐','○','○','○','○','○','○','○','○','○','○','●','●','○','○','○','○','○','○'] },
];
</script>

<style>
/* 调研页专属：宽表横向滚动时首列（需求维度/项目名）保持可见 */
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
/* 大总表：列=项目，行=需求维度，末行内嵌架构图缩略图 */
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
/* 当前页放大：灯箱遮罩 + 大图，点击任意处或 Esc 关闭 */
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

# 平台对标调研

本页是面向"用户端平台化"的对标调研：需求来自 Linux.do 主题 2854294（原帖 + 146 条回复），横向对比 25+ 开源项目的支持情况与技术原理，并附 27 张**同构架构图**（同一六层结构、同一状态标记，横向翻图即可看出"同一槽位谁有谁没有"）。

图例：**● 原生支持　◐ 需二开/部分支持　○ 不支持　★ 近期新增**。

完整调研过程、差距分析与改造方案见仓库文档：`docs/design-docs/LuBanAgent-platform-research-and-transformation.md`。

## 需求维度 × 28 个项目总表 {#comparison-table}

大表：**每一列是一个项目**（LuBanAgent 放最前，便于对照），每行一个需求维度，**最后一行是各项目的同构架构图**（点击放大）。表格很宽，可**横向滑动**，最左"需求维度"列固定。单元格为粗粒度状态：**● 原生支持　◐ 需二开/部分　○ 缺失**；需求说明见首列小字。

<div class="matrix-wrap">
<table class="matrix">
<thead>
<tr><th>需求维度</th><th v-for="p in projects" :key="p.id">{{ p.name }}</th></tr>
</thead>
<tbody>
<tr v-for="r in requirements" :key="r.name">
<th>{{ r.name }}<span class="req-desc">{{ descs[r.name] }}</span></th>
<td v-for="(p, i) in projects" :key="p.id" :class="'st-' + st[r.s[i]]">{{ r.s[i] }}</td>
</tr>
<tr class="matrix-diagrams">
<th>同构架构图</th>
<td v-for="p in projects" :key="p.id"><img class="zoomable" :src="diagramUrl(p.id)" :alt="p.name + ' 架构图'" loading="lazy" @click="openLightbox(diagramUrl(p.id))" /></td>
</tr>
</tbody>
</table>
</div>

## 同构架构图集（27 张） {#architecture-gallery}

全部图共用同一六层结构与同一状态标记。把任意一张图与 [LuBanAgent](#lubanagent) 并排看：灰色虚线框（○）是对方缺的能力，彩色实线框（●）是双方都有的能力，★ 标记 LuBanAgent 近期新增能力。点击图片在当前页放大。生成脚本：`scripts/gen-platform-comparison-diagrams.py`（数据驱动，可复现）。

<section v-for="d in diagrams" :key="d.id" class="diagram-card">
<h3 :id="d.id">{{ d.name }}</h3>
<p>{{ d.tagline }}</p>
<img class="zoomable" :src="diagramUrl(d.id)" :alt="`${d.name} 同构架构图`" loading="lazy" @click="openLightbox(diagramUrl(d.id))" />
</section>

<div v-if="lightbox" class="lightbox" @click="closeLightbox">
<img :src="lightbox" alt="架构图放大视图" />
</div>
