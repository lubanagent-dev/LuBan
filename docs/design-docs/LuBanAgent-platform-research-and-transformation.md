# LuBanAgent 用户端平台化改造 · 调研报告与改造方案

> 信息来源：linux.do 帖子《公司需要搭建一个 agent 平台，怎么选框架》（topic/2854294，146 楼全部评论，2026-09 至 2026-11 讨论）。
> 目标：把帖子中收集到的需求、观点、结论、开源项目全部沉淀，输出 LuBanAgent 的改造方案。
> 架构图：`docs/assets/luban-platform-architecture.svg`

---

## 1. 帖子调研总结

### 1.1 需求画像（原帖 + 高频共鸣回复）

| 需求 | 来源 | 说明 |
| --- | --- | --- |
| Web 页面统一入口 | 主楼 | 各部门的人都能在页面上使用 Agent |
| 共享知识库 / MCP / Skill | 主楼 | 平台统一配置，大家共用，不必每人本地装 |
| 多用户环境不崩 | 主楼 | 多人使用时避免把服务器环境改崩 |
| 业务部门零门槛 | 主楼二次编辑 | 部门不太会用 Agent，需要平台配好直接用 |
| 服务端统一管理与调试 | 主楼二次编辑 | 出问题在服务器上统一排查 |
| 权限分级可见 | #39 | 低权限人员看不到不该看的 Skill 和知识库 |
| 桌面端 vs Web 端之争 | #4/#20/#50/#139 | 桌面端各用各电脑天然隔离；Web 集中好管理但需隔离 |
| 用量/费用管理 | #63 | 模型管理、用量配额、Key 分发、审计日志、组织架构 |
| 会话历史与文件 | #53/#56 | 历史会话持久化、文件上传下载是高频痛点 |

### 1.2 评论区的四条架构路线（含共识结论）

| 路线 | 代表观点 | 结论 |
| --- | --- | --- |
| A. Web 集中式 + workspace/审批隔离 | 楼主最终方案；#58 | 内部可信用户够用，最轻；`--sandbox danger-full-access` 依赖外层容器兜底 |
| B. 每用户一个 Docker 容器 | #18/#36/#38/#134 | 隔离彻底、可限资源；重，但每用户镜像定义好"别人只管用" |
| C. 单 Agent + 会话隔离 + 动态权限注册（17 赞最高票观点 #69） | #69/#110/#112 | 只维护一个 Agent，网关按用户权限动态注册工具/知识库；查询类场景够用，写操作需另配沙箱 |
| D. 桌面端/本地客户端 | #4/#20/#95/#123/#139 | 天然隔离；但外部/客服人员不好分发，配置同步复杂 |

**帖子共识**：Web 集中式对非技术用户最友好（多数选择）；隔离强度按用户信任度分级；真正的难点不是容器编排，而是**配置管理**——文件权限、沙箱与 harness 的上下文边界、跨节点会话稳定（#74，6 赞）。

### 1.3 评论区踩坑教训（直接影响改造设计）

1. **DSH（DeepSeek Harness）**：breaking change 一堆、架构二开麻烦、现阶段不适合生产（#27/#47）→ 引擎选型要贴上游稳定版。
2. **Open WebUI**：文件下载/上传折腾很久（#53/#56）；人少能白标、多了不行，缺审计/组织架构（#63）→ 文件管理必须一等设计。
3. **容器与沙盒互斥**（#119）：按租户分容器后，容器内没法再用 sandbox 隔离不同工作区 → 隔离层级只能选一层做细。
4. **MCP 接口多了会有问题**（#82）：外部系统强制做成 CLI 连接器更稳 → LuBan 的 Tool 即 Python 代码路线正好规避。
5. **Hermes 多 profile 只是"人设"隔离**，不是权限隔离（#111–#113）→ 用户级隔离必须做在运行时装配层，不能靠会话配置。
6. **吃服务器资源**（#40）：每功能接一个常驻服务很费钱 → 沙箱按会话起、用完销毁。

### 1.4 帖子中收集到的开源项目全景

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

### 1.5 同构架构图集（28 张，统一版式便于对比）

全部图共用同一六层结构与同一状态标记：**● 原生支持　◐ 部分/需二开　○ 缺失　★ 本次改造新增**。横向翻图即可看出"同一槽位谁有谁没有"。生成脚本：`scripts/gen-platform-comparison-diagrams.py`（数据驱动，可复现）。

| 图 | 项目 | 一句话定位 |
| --- | --- | --- |
| [open-webui](../assets/architectures/open-webui.svg) | Open WebUI | 门户五件套几乎全有，治理/审批/配额缺 |
| [dify](../assets/architectures/dify.svg) | Dify | 租户/配额/沙箱/知识库全，审批与预算治理缺 |
| [coze-studio](../assets/architectures/coze-studio.svg) | Coze Studio | 与 Dify 同赛道，编排/知识库/插件全 |
| [librechat](../assets/architectures/librechat.svg) | LibreChat | 注册/会话/文件/MCP 齐，治理薄 |
| [fastgpt](../assets/architectures/fastgpt.svg) | FastGPT | 知识库/团队权限强，执行隔离弱 |
| [codex-app-server](../assets/architectures/codex-app-server.svg) | Codex App Server | harness/沙箱/审批模式强，平台层全自建 |
| [dsh](../assets/architectures/dsh.svg) | DSH | 沙箱/工作区抽象好，生产慎用 |
| [openhands](../assets/architectures/openhands.svg) | OpenHands | 每会话容器隔离标杆，认证在企业版 |
| [pi](../assets/architectures/pi.svg) | pi | 极简 harness 理念参考 |
| [openai-agents-sdk](../assets/architectures/openai-agents-sdk.svg) | OpenAI Agents SDK | session/guardrail/tracing 原语全 |
| [agentscope](../assets/architectures/agentscope.svg) | AgentScope | 消息传递多 Agent，沙箱官方支持 |
| [mastra](../assets/architectures/mastra.svg) | Mastra | TS 生态同类原语，门户无 |
| [deer-flow](../assets/architectures/deer-flow.svg) | deer-flow | 研究型编排+计划确认，二开成本高 |
| [agent-teams](../assets/architectures/agent-teams.svg) | AgentTeams（HiClaw） | 一 Agent 一容器 + Matrix 群聊协作 |
| [multiuserclaw](../assets/architectures/multiuserclaw.svg) | MultiUserClaw | 多租户门户开箱即用，治理弱 |
| [yc-qm](../assets/architectures/yc-qm.svg) | YC-QM | 组织权限是卖点 |
| [multica](../assets/architectures/multica.svg) | Multica | runtime 双形态 + 资源 git repo 化 |
| [hermes](../assets/architectures/hermes.svg) | Hermes | Skill 生态强，profile 非权限隔离 |
| [workbuddy](../assets/architectures/workbuddy.svg) | WorkBuddy | 客户端分发模式（路线 D 实例） |
| [qwenpaw](../assets/architectures/qwenpaw.svg) | QwenPaw | 渠道触达强，多用户缺 |
| [litellm](../assets/architectures/litellm.svg) | LiteLLM | 配额/虚拟 Key 标配，无 Agent 层 |
| [weknora](../assets/architectures/weknora.svg) | Weknora / WebKnorv | 纯知识底座 |
| [ragflow](../assets/architectures/ragflow.svg) | RAGFlow | 文档解析深度差异化 |
| [e2b-opensandbox](../assets/architectures/e2b-opensandbox.svg) | E2B / OpenSandbox | microVM 沙箱即服务 |
| [k8s-session-sandbox](../assets/architectures/k8s-session-sandbox.svg) | K8s 会话沙箱 | Pod 级硬隔离上限方案 |
| [bwrap-cubesandbox](../assets/architectures/bwrap-cubesandbox.svg) | Bwrap / CubeSandbox | 进程级轻沙箱 |
| [lubanagent-current](../assets/architectures/lubanagent-current.svg) | **LuBanAgent 现状** | 治理四件套全图集独有，门户/分配缺 |
| [lubanagent-transformed](../assets/architectures/lubanagent-transformed.svg) | **LuBanAgent 改造后** | 补齐门户/装配隔离/主体配额（★ 项） |

对比结论：把任意一张图与 [lubanagent-current](../assets/architectures/lubanagent-current.svg) 并排看，灰色虚线框（○）就是它缺的、彩色实线框（●）就是它有而 LuBan 要评估的；再翻到 [lubanagent-transformed](../assets/architectures/lubanagent-transformed.svg) 看 ★ 项如何补齐。

---

## 2. 调研报告表：需求维度 × 开源项目支持情况 × 技术原理

说明：`● 原生支持` / `◐ 需二开/部分支持` / `○ 不支持`。

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
| 费用归因与审计 | 每次调用算清谁花了多少钱、干了什么 | LuBanAgent ●（Run/Trace 全程留痕+费用归因，帖子同类方案普遍缺）；LiteLLM ●（调用级日志）；Open WebUI ◐ | 每次 Run 记录 model/tool/token/费用，写入 trace 树；双写观测后端（Langfuse 自部署）；审计事件（登录/审批/权限变更）独立 append-only 表 |
| 高风险操作人工审批 | 大额退款等敏感动作人工确认 | LuBanAgent ●（审批持久化、并发安全、可恢复）；Dify ◐；OpenAI Agents SDK ●（guardrail+interrupt）；#58 直接禁系统操作 ◐ | Tool 执行前检查风险标签→挂起 Run、持久化待审批记录→UI/API 批准/拒绝→恢复 Run 继续；审批状态机与 Run 生命周期绑定 |
| 文件上传/下载/输出物 | 用户传文档提问、下载生成物 | Open WebUI ●（坑多）；Dify ●（文件变量）；#84 ●（esbuild wasm 在线编译）；LuBanAgent ◐（知识库上传有，会话级文件无） | 上传走预签名直传或后端代理落对象存储/本地盘；会话文件挂 per-session 目录；下载经鉴权签名 URL，避免 Open WebUI 式沙盒文件路由坑 |
| 多 Agent 协作 | 复杂任务拆给多个 Agent | AgentTeams ●（Matrix 群聊多 Agent）；AgentScope ●（消息传递）；LuBanAgent ●（LangGraph supervisor 委派，编排 Run 是会话 Run 子 Run） | supervisor 节点按任务图路由到子 Agent；共享黑板/消息总线传递状态；预算继承+取消传播 |
| 组织架构/多租户 | 部门、租户、行级数据隔离 | Dify ●（租户模型）；FastGPT ●（团队）；YC-QM ●；MultiUserClaw ●；LuBanAgent ○（定位明确不做，见 §4 定位修订） | tenant_id 贯穿所有表；RBAC：user→role→permission，后端逐请求裁决；行级隔离=查询层强制 tenant 谓词（PostgreSQL RLS 或应用层） |
| 桌面端/本地客户端 | Agent 在员工本机执行，天然隔离 | WorkBuddy ●；QwenPaw ●（Web+桌面）；Cherry Studio 模式 ●（#20）；LuBanAgent ○（无客户端） | Electron/Tauri 壳 + 本地 runtime 进程；配置/资源从管理中心拉取；本机文件直接访问，无需服务端沙箱 |

---

## 3. LuBanAgent 现状差距分析

| 能力 | 帖子需求 | LuBanAgent 现状 | 差距 |
| --- | --- | --- | --- |
| 用户端门户 | 外部客服浏览器即用 | `/chat` 示例级：无注册、无会话列表、复用工作台令牌 | **大**：升级为一等用户端 |
| 资源按人分配 | 知识库/Skill/MCP 按权限可见 | 管理页齐全，分配仅工作台维度 | **大**：分配模型扩展到最终用户 |
| 运行时动态装配 | 按用户过滤工具集（#69 路线 C） | Agent 定义全量装配 | **大**：run 装配时按 subject 过滤 |
| 按主体配额 | 每人限额 | 预算三道闸是全局/Run 级 | **中**：加 subject 维度累计 |
| 会话历史 | 持久化列表 | Run/Trace 已留痕，/chat 无列表 | **中**：复用持久层加会话表 |
| 文件上传下载 | 会话级文件 | 知识库上传有，会话文件无 | **中** |
| 执行隔离 | 防环境崩 | 治理闸+审批；无进程/容器沙箱 | **中**：LuBan Tool 受治理，风险低于 free-shell 类；按需补容器运行手册 |
| 审计 | 操作留痕 | Run/Trace+日志排查页 | **小**：补用户端行为事件 |
| 费用归因 | 算清谁花钱 | 已有 | 无 |
| 人工审批 | 敏感操作确认 | 已有（持久化、可恢复） | 无 |
| 多 Agent | 复杂任务 | supervisor 委派已有 | 无 |

---

## 4. 改造方案

### 4.1 总体架构

改造后架构见 `docs/assets/luban-platform-architecture.svg`。要点：

1. **用户端门户（新增一等交付物）**：注册/登录（复用并扩展现有平台访问控制的用户/角色/权限体系，从"工作台账号"扩展出"终端用户账号"）、全屏聊天、会话历史列表、文件上传下载、气泡内审批。走 REST/SSE，与工作台同源同治理。
2. **动态资源装配器（核心改造，对应路线 C）**：在 `lubanagent/runtime` 装配 Agent 时，按当前 subject 的权限集过滤其可见的 Tool/MCP/Skill/知识库，再 bind 进 prebuilt agent——Agent 定义不变，"每个人看到的 Agent 能力不一样"在装配层实现，不靠 Prompt 声明（与"确定性规则由代码执行"的定位一致）。
3. **资源分配模型**：知识库/Skill/MCP/Agent 增加分配关系（对角色或对个人），管理端工作台增加"分配"管理界面；检索与调用前先过权限谓词。
4. **主体配额**：预算三道闸扩展 subject 维度——用户/角色级 Token、费用、并发限额，网关前置检查，超限熔断并留痕。
5. **会话与文件**：会话表（subject 绑定）+ 消息表，/chat 历史可回溯；会话级文件目录（per-session workspace），下载走鉴权 URL。
6. **隔离分级（对应帖子教训）**：LuBan Tool 是受治理的 Python 代码（非 free shell），默认 workspace+治理闸+审批即可（路线 A+C）；提供可选的"会话级容器沙箱"部署形态（docker compose profile + 运行手册），给不可信外部用户场景——同一套代码，只换执行底座，注意"容器与沙盒互斥"教训：容器形态下不开进程级 sandbox。
7. **审计扩展**：登录、授权变更、审批、文件操作进审计事件表；现有 Run/Trace 不动。

### 4.2 与现有硬约束的关系（需要修订的定位条款）

| 硬约束（AGENTS.md） | 本方案的处理 |
| --- | --- |
| "不做租户/部门/行级数据隔离" | **修订建议**：用户端门户面向终端用户后，"subject 级会话与资源隔离"成为基座安全能力（与工作台访问控制同类），应纳入开源核心；多租户（组织/部门树）仍不做，留给业务系统。即：**按"人"隔离做，按"组织"隔离不做。 |
| "用户端由业务系统自建" | **修订建议**：`/chat` 从"示例级入口"升级为"一等用户端门户"（可关闭，`PORTAL_ENABLED` 开关），业务系统仍可完全绕过门户走 REST/SSE 自建——门户只是自建路径的参考实现，不堵死原路径。 |
| "不做通用企业后台" | 不做组织架构/部门树/审批流引擎；分配与配额都以"用户/角色"最小模型实现，守住边界。 |
| 领地三重隔离 | 全部新代码进 `lubanagent/`（portal、assignment、quota）与 `lubanagent/ui`（门户前端），`app/` 领地不动，upstream 契约不受影响。 |

### 4.3 改造项清单（按构建依赖序，不分期）

| 序 | 改造项 | 领地 | 依赖 |
| --- | --- | --- | --- |
| R1 | 资源分配模型：`assignments` 表（resource_type, resource_id, grantee_type, grantee_id, perm）+ 迁移 + 权限谓词查询 | lubanagent/persistence + core | 无（最底层） |
| R2 | 动态资源装配器：run 装配时按 subject 过滤 Tool/MCP/Skill/知识库 | lubanagent/runtime | R1 |
| R3 | 主体配额：subject 配额表 + 网关前置检查 + 用量累计 | lubanagent/core 治理层 + api | R1 |
| R4 | 会话持久化：sessions/messages 表（subject 绑定）+ /chat 历史列表 API | lubanagent/persistence + api | R1 |
| R5 | 终端用户账号：注册/登录（扩展现有 security 路由），门户会话令牌与工作台 RBAC 分域 | lubanagent/api/auth + security | R4 |
| R6 | 会话文件：上传/下载 API + per-session 目录管理 + 鉴权下载 URL | lubanagent/api + persistence | R4 |
| R7 | 用户端门户前端：登录页、会话列表侧栏、聊天页升级（文件、审批沿用） | lubanagent/ui | R2/R4/R5/R6 |
| R8 | 工作台"分配与配额"管理页：给角色/用户配知识库、Skill、MCP、Agent、配额 | lubanagent/ui | R1/R3 |
| R9 | 审计事件：登录/授权/审批/文件操作入审计表 + 排查页展示 | lubanagent/observability | R5 |
| R10 | 会话级容器沙箱（可选部署形态）：compose profile + 运行手册 + 隔离层级说明文档 | docker/ + docs | R2 |
| R11 | 文档同步：PRD/技术方案/架构设计/用户手册/AGENTS.md 定位条款修订 | docs | 全部完成后收口 |

### 4.4 验收口径（对齐帖子场景）

1. 外部客服账号登录门户，只能看到分配给他的 Agent/知识库/Skill；未分配的 MCP 工具在运行时确实不可调用（装配层过滤，非 Prompt 约束）。
2. 同一 Agent 两个用户并发使用，会话、文件、配额互不串扰；费用按人归因可查。
3. 超配额用户被熔断且事件可审计；高风险操作在门户气泡内完成审批并留痕。
4. 刷新/换设备后历史会话可回溯；文件可上传、生成的文件可下载。
5. 打开容器沙箱 profile 后，工具代码在一次性容器内执行，跑完销毁；关闭后回到治理闸模式。
6. `PORTAL_ENABLED=false` 时系统退回纯基座形态，业务系统走 REST/SSE 自建不受影响。

---

## 5. 一句话结论

帖子 146 楼的实践收敛出一个共识：**Web 集中门户（给非技术用户）+ 装配层权限过滤（每个人看到的 Agent 能力不同）+ 分级隔离（治理闸打底、容器按需）+ 配额与审计（平台管住钱和事）**。LuBanAgent 的治理层、审批流、费用归因、Run 留痕恰好是这批开源项目普遍缺失的部分；缺的只是"面向终端用户的门户"和"资源按人分配/动态装配"两块，本次改造补齐它们。
