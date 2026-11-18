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
  { id: 'lubanagent-current', name: 'LuBanAgent 现状', tagline: '治理四件套全图集独有，门户/分配缺' },
  { id: 'lubanagent-transformed', name: 'LuBanAgent 改造后', tagline: '补齐门户/装配隔离/主体配额（★ 项）' },
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

// 大总表的列顺序：LuBan 现状/改造后放最前，其余按全景表顺序。
const projects = [
  { id: 'lubanagent-current', name: 'LuBan 现状' },
  { id: 'lubanagent-transformed', name: 'LuBan 改造后' },
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
const sym = { full: '●', part: '◐', none: '○' };

// 每行状态数组与 projects 顺序一一对应；粗粒度结论，逐项依据见下方明细表。
const requirements = [
  { name: 'Web 用户端聊天门户', s: ['◐','●','●','●','●','●','●','○','○','◐','○','○','◐','○','◐','◐','●','◐','◐','◐','◐','●','○','◐','◐','○','○','○'] },
  { name: '注册/登录/账号体系', s: ['◐','●','●','●','●','●','●','○','○','◐','○','○','○','○','○','◐','●','◐','◐','◐','◐','●','○','◐','●','○','○','○'] },
  { name: '多用户会话隔离', s: ['◐','●','●','●','●','●','●','●','●','●','○','◐','●','◐','◐','●','●','◐','●','○','●','◐','○','◐','◐','●','●','●'] },
  { name: '会话历史持久化', s: ['◐','●','●','●','●','●','●','●','●','●','◐','●','●','●','◐','●','●','◐','●','●','●','●','○','○','◐','◐','○','○'] },
  { name: '知识库配置+按权限分配', s: ['◐','●','●','●','●','◐','●','○','○','◐','○','○','◐','◐','○','◐','◐','◐','◐','◐','◐','◐','○','●','●','○','○','○'] },
  { name: 'Skill 统一配置+可见范围', s: ['◐','●','●','◐','●','◐','◐','◐','◐','◐','◐','◐','◐','◐','○','◐','◐','◐','◐','●','◐','●','○','○','○','○','○','○'] },
  { name: 'MCP 统一配置+动态注册', s: ['◐','●','●','◐','◐','●','◐','●','●','●','◐','◐','●','●','○','◐','◐','◐','●','◐','◐','◐','○','○','○','○','○','○'] },
  { name: '工具执行沙箱隔离', s: ['◐','●','◐','●','●','◐','◐','●','●','●','◐','◐','●','◐','◐','●','◐','◐','●','○','◐','◐','○','○','○','●','●','●'] },
  { name: '每用户/每会话容器', s: ['○','●','◐','◐','◐','○','○','●','◐','●','○','○','◐','○','◐','●','●','◐','●','○','○','○','○','○','○','●','●','◐'] },
  { name: '用量配额与模型管理', s: ['◐','●','◐','●','●','◐','◐','○','○','◐','○','○','○','○','○','◐','◐','◐','◐','◐','◐','◐','●','○','◐','◐','○','○'] },
  { name: '费用归因与审计', s: ['●','●','◐','◐','◐','◐','◐','◐','○','◐','◐','●','◐','◐','◐','◐','◐','◐','◐','◐','◐','◐','●','○','○','◐','◐','○'] },
  { name: '高风险操作人工审批', s: ['●','●','○','◐','○','○','○','●','○','◐','○','●','○','○','◐','◐','○','○','○','○','○','○','○','○','○','○','○','○'] },
  { name: '文件上传/下载/输出物', s: ['◐','●','●','●','●','●','●','◐','◐','●','◐','◐','◐','◐','◐','◐','●','◐','◐','◐','●','●','○','●','●','●','○','○'] },
  { name: '多 Agent 协作', s: ['●','●','○','●','●','○','◐','◐','◐','◐','◐','●','●','●','●','●','◐','◐','●','◐','◐','◐','○','○','○','○','○','○'] },
  { name: '组织架构/多租户', s: ['○','○','●','●','●','◐','●','○','○','◐','○','○','○','○','○','◐','●','●','◐','○','○','◐','●','◐','◐','◐','◐','○'] },
  { name: '桌面端/本地客户端', s: ['○','○','○','○','○','○','○','◐','○','◐','○','○','○','○','○','○','○','○','○','○','●','●','○','○','○','○','○','○'] },
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

本页是面向"用户端平台化"的对标调研：需求来自 Linux.do 主题 2854294（原帖 + 146 条回复），横向对比 25+ 开源项目的支持情况与技术原理，并附 28 张**同构架构图**（同一六层结构、同一状态标记，横向翻图即可看出"同一槽位谁有谁没有"）。

图例：**● 原生支持　◐ 需二开/部分支持　○ 不支持　★ 本次改造新增**。

完整调研过程、差距分析与改造方案见仓库文档：`docs/design-docs/LuBanAgent-platform-research-and-transformation.md`。

## 需求维度 × 28 个项目总表 {#comparison-table}

大表：**每一列是一个项目**（LuBan 现状/改造后放最前，便于对照），每行一个需求维度，**最后一行是各项目的同构架构图**（点击放大）。表格很宽，可**横向滑动**，最左"需求维度"列固定。单元格为粗粒度状态：**● 原生支持　◐ 需二开/部分　○ 缺失**；逐项依据、需求说明与技术原理见下方[明细表](#detail-table)。

<div class="matrix-wrap">
<table class="matrix">
<thead>
<tr><th>需求维度</th><th v-for="p in projects" :key="p.id">{{ p.name }}</th></tr>
</thead>
<tbody>
<tr v-for="r in requirements" :key="r.name">
<th>{{ r.name }}</th>
<td v-for="(p, i) in projects" :key="p.id" :class="'st-' + r.s[i]">{{ sym[r.s[i]] }}</td>
</tr>
<tr class="matrix-diagrams">
<th>同构架构图</th>
<td v-for="p in projects" :key="p.id"><img class="zoomable" :src="diagramUrl(p.id)" :alt="p.name + ' 架构图'" loading="lazy" @click="openLightbox(diagramUrl(p.id))" /></td>
</tr>
</tbody>
</table>
</div>

### 支持明细与技术原理 {#detail-table}

| 需求维度 | 需求说明 | 开源项目支持情况 | 技术原理 |
| --- | --- | --- | --- |
| Web 用户端聊天门户 | 非技术用户浏览器即用，无侧栏全屏对话 | Open WebUI ●；Dify ●（应用发布页）；LibreChat ●；LuBanAgent ◐（/chat 为示例级） | SPA（Svelte/React）+ FastAPI/Express 后端；SSE 流式 token 推送；会话状态存 DB，前端仅渲染 |
| 用户注册/登录/账号体系 | 外部人员自助注册或管理员开户，SSO | LibreChat ●（内置注册+OAuth）；Open WebUI ●；Dify ●（租户+邀请制）；MultiUserClaw ●（多租户注册）；LuBanAgent ◐（仅工作台 RBAC 账号） | 本地账号表 + bcrypt/argon2 口令哈希；OAuth2/OIDC 跳转换取 id_token；会话用签名 JWT 或服务端 session cookie |
| 多用户会话隔离 | A 的上下文不能串到 B | OpenHands ●（每会话容器）；MultiUserClaw ●；LuBanAgent ◐（单用户示例） | 每个 session 绑定 subject_id，ContextVar 贯穿请求链；DB 层所有查询带 tenant/subject 谓词（行级过滤）；内存态靠 per-request 依赖注入隔离 |
| 会话历史持久化 | 刷新/换设备能找回历史 | Open WebUI ●；LibreChat ●（Mongo 会话树）；Dify ●；LuBanAgent ◐（Run 留痕但 /chat 无会话列表） | 消息表（session_id, role, content, seq）；前端拉列表分页；消息写入与 SSE 完成事件解耦，异步落库 |
| 知识库统一配置+按权限分配 | 平台建库，按用户/角色授权可见 | Dify ●（知识库+团队权限）；FastGPT ●（团队协作）；RAGFlow ●；#39 提到厂商产品 ●；LuBanAgent ◐（有库管理，无分配） | 知识库表 + ACL 关联表（kb_id, subject/role, perm）；检索前先过权限谓词再走向量检索；文档切块→embedding→向量库（Qdrant/Milvus），混合检索 BM25+向量 |
| Skill 统一配置+可见范围 | 平台统一装 Skill，低权限看不到不该看的 | #39 厂商产品 ●；WorkBuddy ◐；#36 skill 市场+CLI ●；LuBanAgent ◐（Skill 管理页有"分配"，缺用户端维度） | Skill 清单存 DB（版本化）；分配表（skill_id, subject/role）；运行时按 subject 过滤后注册进 Agent 工具集 |
| MCP 统一配置+动态注册 | 平台统一接 MCP Server，按人下发 | Dify ◐（工具插件制）；Multica ●（共享 MCP 以 git repo 配置）；AgentScope ●；LuBanAgent ◐（MCP Client 有，缺按人下发） | 网关持有 MCP Server 连接池（stdio/SSE）；按用户生成"资源视图"，run 装配时把可见 MCP tool 动态 bind 进 LangGraph prebuilt agent 的 tools 参数 |
| 工具执行环境隔离（沙箱） | 防止工具代码破坏宿主机 | OpenHands ●（Docker runtime）；Dify ●（dify-sandbox：seccomp+独立进程）；deer-flow ◐（Bwrap）；E2B/OpenSandbox ●（microVM/gVisor）；LuBanAgent ◐（治理闸有，进程沙箱无） | 四档隔离强度：进程级（seccomp/bubblewrap namespace+cgroup）→ 容器级（namespace 全套+只读 rootfs+资源限额）→ microVM（Firecracker 硬件虚拟化）→ 无（仅代码审查+治理闸）。LuBan Tool 是受审 Python 代码，治理闸为主，沙箱可选 |
| 每用户/每会话容器 | 强隔离兜底 | #36 ●（一人一容器）；AgentTeams ●（一 Agent 一容器）；#82 ●（一会话一容器）；#70 K8s ● | Docker/K8s API 动态建 Pod/Container，挂载 per-user volume；空闲回收/跑完销毁；反代按子域路由（hermes.youhost.com/usera/） |
| 用量配额与模型管理 | 按人/部门限 Token 和费用 | LiteLLM ●（proxy 层配额+预算+虚拟 Key）；Dify ●；Open WebUI ◐；LuBanAgent ◐（有全局预算三道闸，缺按主体配额） | 网关层拦截：请求前查配额表（已用<限额），请求后异步累计用量；token 用 tiktoken 估算、响应回填真实 usage；超限返回 429 并熔断 |
| 费用归因与审计 | 每次调用算清谁花了多少钱、干了什么 | LuBanAgent ●（Run/Trace 全程留痕+费用归因，帖子同类方案普遍缺）；LiteLLM ●（调用级日志）；Open WebUI ◐ | 每次 Run 记录 model/tool/token/费用，写入 trace 树；双写观测后端；审计事件（登录/审批/权限变更）独立 append-only 表 |
| 高风险操作人工审批 | 大额退款等敏感动作人工确认 | LuBanAgent ●（审批持久化、并发安全、可恢复）；Dify ◐；OpenAI Agents SDK ●（guardrail+interrupt）；#58 直接禁系统操作 ◐ | Tool 执行前检查风险标签→挂起 Run、持久化待审批记录→UI/API 批准/拒绝→恢复 Run 继续；审批状态机与 Run 生命周期绑定 |
| 文件上传/下载/输出物 | 用户传文档提问、下载生成物 | Open WebUI ●（坑多）；Dify ●（文件变量）；#84 ●（esbuild wasm 在线编译）；LuBanAgent ◐（知识库上传有，会话级文件无） | 上传走预签名直传或后端代理落对象存储/本地盘；会话文件挂 per-session 目录；下载经鉴权签名 URL，避免 Open WebUI 式沙盒文件路由坑 |
| 多 Agent 协作 | 复杂任务拆给多个 Agent | AgentTeams ●（Matrix 群聊多 Agent）；AgentScope ●（消息传递）；LuBanAgent ●（LangGraph supervisor 委派，编排 Run 是会话 Run 子 Run） | supervisor 节点按任务图路由到子 Agent；共享黑板/消息总线传递状态；预算继承+取消传播 |
| 组织架构/多租户 | 部门、租户、行级数据隔离 | Dify ●（租户模型）；FastGPT ●（团队）；YC-QM ●；MultiUserClaw ●；LuBanAgent ○（定位明确不做，见调研报告 §4 定位修订） | tenant_id 贯穿所有表；RBAC：user→role→permission，后端逐请求裁决；行级隔离=查询层强制 tenant 谓词（PostgreSQL RLS 或应用层） |
| 桌面端/本地客户端 | Agent 在员工本机执行，天然隔离 | WorkBuddy ●；QwenPaw ●（Web+桌面）；Cherry Studio 模式 ●（#20）；LuBanAgent ○（无客户端） | Electron/Tauri 壳 + 本地 runtime 进程；配置/资源从管理中心拉取；本机文件直接访问，无需服务端沙箱 |

## 帖子中收集到的开源项目全景 {#project-panorama}

| 项目 | 赛道 | 帖内评价 |
| --- | --- | --- |
| Open WebUI | Web 门户 | 最高票实践（#40，35 赞）；多用户隔离+统一装 Skill/MCP；吃资源、文件坑多 |
| Dify / Coze | 低代码平台 | "该有的都有"（#23/#88）；偏编排，无 codex 式任务执行（#115/#117） |
| codex app server | 基座 | 楼主最终选择；官方建议容器内 danger-full-access |
| DSH | 基座 | 吐槽多：breaking change、难二开（#27/#47） |
| OpenHands | 平台 | 功能对口但非 enterprise 版无认证（#11） |
| FastGPT | 知识库平台 | 有知识库需求可选（#13） |
| LibreChat | 聊天门户 | 功能全需二开（#76） |
| AgentScope | 框架 | workspace/sandbox 官方支持，Python/Java 双栈（#61） |
| Mastra | 框架 | 文档推荐（#64） |
| deer-flow | 框架 | 二开改动量大但可用（#10/#25），配 BwrapSandboxProvider（#26） |
| pi | 极简 harness | 设计理念被反复引用（#18/#30/#32/#38/#77） |
| OpenAI Agents SDK | SDK | sandbox/skill 原语齐全，跑通过（#58） |
| Hermes | Agent runtime | 共享实例+profile；隔离不足（#14/#111） |
| Multica | 人机协作平台 | runtime 本机/远端云沙箱，共享资源 git repo 形式（#78/#103） |
| AgentTeams（阿里 HiClaw） | 多 Agent 平台 | 每 Agent 一 Docker；Matrix 聊天室底层；权限管理（#33） |
| MultiUserClaw | 多租户 | 注册/管理端/共享端齐全，公司自用半年（#143） |
| Tether-AI | 基座 | 计划基于此开发（#144） |
| YC-QM | 多人 harness | 组织权限管理、服务器部署（#75/#141） |
| WorkBuddy | 客户端 | 派发 API Key 后端（#51） |
| QwenPaw | 自部署助手 | Web+桌面，多渠道，Skills 扩展（#68） |
| LiteLLM | 模型网关 | 模型管理/配额/Key 的标配推荐（#63） |
| WebKnorv / Weknora | 知识库 | 腾讯开源 / ima 开源版（#84/#86） |
| RAGFlow | 知识库 | "简单 RagFlow 就够"（#72） |
| E2B 类 / OpenSandbox / K8s | 云沙箱 | 会话级容器编排；CTF 平台并发先例（#70/#93） |
| Bwrap / CubeSandbox | 轻沙箱 | 用户态 namespace 沙箱（#19/#26） |

## 同构架构图集（28 张） {#architecture-gallery}

全部图共用同一六层结构与同一状态标记。把任意一张图与 [LuBanAgent 现状](#lubanagent-current) 并排看，灰色虚线框（○）就是它缺的、彩色实线框（●）就是它有而 LuBan 要评估的；再翻到 [LuBanAgent 改造后](#lubanagent-transformed) 看 ★ 项如何补齐。点击图片可打开原图。生成脚本：`scripts/gen-platform-comparison-diagrams.py`（数据驱动，可复现）。

<section v-for="d in diagrams" :key="d.id" class="diagram-card">
<h3 :id="d.id">{{ d.name }}</h3>
<p>{{ d.tagline }}</p>
<img class="zoomable" :src="diagramUrl(d.id)" :alt="`${d.name} 同构架构图`" loading="lazy" @click="openLightbox(diagramUrl(d.id))" />
</section>

<div v-if="lightbox" class="lightbox" @click="closeLightbox">
<img :src="lightbox" alt="架构图放大视图" />
</div>
