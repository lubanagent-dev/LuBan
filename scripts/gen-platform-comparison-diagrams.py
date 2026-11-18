#!/usr/bin/env python3
"""生成帖子调研项目的同构 SVG 架构图集。

所有图共用同一版式（六层结构）与同一状态标记：
  ● 原生支持   ◐ 部分/需二开   ○ 缺失   ★ 近期新增（仅 LuBanAgent 图使用）
差异通过"同一槽位的有/无/部分"体现，便于横向对比。

用法：python3 scripts/gen-platform-comparison-diagrams.py
输出：docs/assets/architectures/<slug>.svg
"""

import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "assets", "architectures")

CANVAS_W, CANVAS_H = 1440, 1010
GRAY = "#9AA0A6"

# 层配色（与总体架构图 luban-platform-architecture.svg 一致）
PAL = {
    "access":    ("#E8F0FE", "#4285F4", "#174EA6"),
    "portal":    ("#E6F4EA", "#188038", "#0D652D"),
    "control":   ("#FEF7E0", "#F9AB00", "#B06000"),
    "engine":    ("#F3E8FD", "#A142F4", "#6A1FA2"),
    "resource":  ("#E0F7FA", "#00838F", "#006064"),
    "isolation": ("#FCE8E6", "#C5221F", "#A50E0E"),
    "storage":   ("#F1F3F4", "#5F6368", "#3C4043"),
}

BADGE = {"yes": "●", "part": "◐", "no": "○", "star": "★"}


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def box(x, y, w, h, title, sub, layer, status):
    _, stroke, _ = PAL[layer]
    if status == "no":
        stroke = GRAY
    fill = "#FFFFFF" if status != "no" else "#F8F9FA"
    dash = "" if status in ("yes", "star") else ' stroke-dasharray="5 3"'
    sw = "2" if status == "star" else "1.4"
    tcol = "#202124" if status != "no" else "#80868B"
    badge = BADGE[status]
    subs = sub.split("|")
    out = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}"'
        f"{dash} stroke-width=\"{sw}\"/>",
        f'<text x="{x + w / 2}" y="{y + 18}" text-anchor="middle" font-size="12" font-weight="600" fill="{tcol}">{esc(badge + " " + title)}</text>',
    ]
    n = len(subs)
    for i, s in enumerate(subs):
        out.append(
            f'<text x="{x + w / 2}" y="{y + 36 + i * 14}" text-anchor="middle" font-size="10.5" fill="#5F6368">{esc(s)}</text>'
        )
    if n == 1:
        out[-1] = out[-1].replace(f'y="{y + 36}"', f'y="{y + (h + 14) / 2}"')
    return "\n  ".join(out)


def band(x, y, w, h, layer, label):
    fill, stroke, tcol = PAL[layer]
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>'
        f'\n  <text x="{x + 20}" y="{y + 24}" font-size="13.5" font-weight="700" fill="{tcol}">{esc(label)}</text>'
    )


def slot_row(x0, y0, n, slot_w, gap, h, layer, slots):
    parts = []
    for i, (title, sub, status) in enumerate(slots):
        parts.append(box(x0 + i * (slot_w + gap), y0, slot_w, h, title, sub, layer, status))
    return "\n  ".join(parts)


def render(p):
    s = []
    s.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CANVAS_W}" height="{CANVAS_H}" '
        f'viewBox="0 0 {CANVAS_W} {CANVAS_H}" font-family="\'PingFang SC\',\'Microsoft YaHei\',sans-serif">'
    )
    s.append(f'<rect width="{CANVAS_W}" height="{CANVAS_H}" fill="#FAFAFA"/>')
    s.append(
        f'<text x="{CANVAS_W / 2}" y="40" text-anchor="middle" font-size="22" font-weight="700" fill="#202124">{esc(p["name"])} · 架构图</text>'
    )
    s.append(
        f'<text x="{CANVAS_W / 2}" y="64" text-anchor="middle" font-size="13" fill="#5F6368">{esc(p["tagline"])}</text>'
    )
    s.append(
        f'<text x="{CANVAS_W / 2}" y="86" text-anchor="middle" font-size="11" fill="#80868B">'
        "● 原生支持　◐ 部分 / 需二开　○ 缺失　★ 近期新增　（六层结构与全部项目图一致，便于横向对比）</text>"
    )

    # L1 接入层
    y = 100
    s.append(band(40, y, 1360, 84, "access", "① 接入层（谁在用）"))
    s.append(slot_row(64, y + 30, 4, 308, 24, 44, "access", p["l1"]))

    # L2 门户层
    y = 200
    s.append(band(40, y, 1360, 100, "portal", "② 门户层（用户交互）"))
    s.append(slot_row(64, y + 30, 5, 248, 20, 60, "portal", p["l2"]))

    # L3 平台控制层
    y = 316
    s.append(band(40, y, 1360, 84, "control", "③ 平台控制层（治理入口）"))
    s.append(slot_row(64, y + 30, 4, 308, 24, 44, "control", p["l3"]))

    # L4 引擎层
    y = 416
    s.append(band(40, y, 1360, 96, "engine", "④ 引擎层（Agent 核心）"))
    s.append(slot_row(64, y + 30, 4, 308, 24, 56, "engine", p["l4"]))

    # L5 资源层 + 执行隔离层
    y = 528
    s.append(band(40, y, 800, 132, "resource", "⑤a 共享资源层"))
    s.append(slot_row(64, y + 34, 5, 142, 16, 64, "resource", p["l5a"]))
    s.append(band(856, y, 544, 132, "isolation", "⑤b 执行隔离层"))
    s.append(slot_row(880, y + 34, 3, 160, 16, 64, "isolation", p["l5b"]))

    # L6 存储与观测层
    y = 676
    s.append(band(40, y, 1360, 96, "storage", "⑥ 存储与观测层"))
    s.append(slot_row(64, y + 34, 3, 420, 26, 48, "storage", p["l6"]))

    # 帖子证据 + 对比要点
    s.append(
        f'<text x="60" y="816" font-size="12" fill="#3C4043"><tspan font-weight="700">帖子证据：</tspan>{esc(p["evidence"])}</text>'
    )
    s.append(
        f'<text x="60" y="840" font-size="12" fill="#3C4043"><tspan font-weight="700">与 LuBan 对比：</tspan>{esc(p["diff"])}</text>'
    )
    s.append(
        f'<text x="{CANVAS_W / 2}" y="880" text-anchor="middle" font-size="11" fill="#9AA0A6">'
        f'同构图集 · 生成于 scripts/gen-platform-comparison-diagrams.py · {esc(p["slug"])}.svg</text>'
    )
    s.append("</svg>")
    return "\n".join(s)


PROJECTS = [
    # ============ 门户/平台类 ============
    dict(
        slug="open-webui", name="Open WebUI",
        tagline="功能最全的开源 Web 门户 · 人少好用、人多吃资源",
        evidence="#16 采纳 · #40（35 赞最高票实践）· #53 文件路由坑 · #63 缺审计/组织架构",
        diff="门户五件套几乎全有；缺治理闸/审批/配额，费用与审计要靠外挂 LiteLLM 补",
        l1=[("终端用户", "浏览器即用·多用户", "yes"), ("管理员", "内置后台管理", "yes"), ("业务系统", "API 集成", "part"), ("外部渠道", "无 IM 渠道", "no")],
        l2=[("注册登录", "本地/OAuth/LDAP", "yes"), ("会话历史", "完整持久化", "yes"), ("流式聊天", "SSE·Markdown", "yes"), ("文件上传下载", "有|路由与沙盒坑多", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "管理员/用户角色", "yes"), ("多用户隔离", "用户级模型权限|执行不隔离", "part"), ("配额用量", "用户配额有限", "part"), ("审计日志", "管理审计缺", "no")],
        l4=[("Agent 定义", "模型+预设组合", "part"), ("Runtime 编排", "Pipelines 插件", "yes"), ("治理闸", "无预算熔断", "no"), ("模型管理", "多供应商接入", "yes")],
        l5a=[("知识库", "内置 RAG", "yes"), ("Skill 工具集", "Functions 市场", "yes"), ("MCP", "mcp-proxy 适配", "part"), ("Tool 执行", "Python 函数", "yes"), ("Prompt 管理", "预设管理", "yes")],
        l5b=[("进程沙箱", "代码解释器容器", "part"), ("容器编排", "单容器整体部署", "part"), ("工作区隔离", "会话文件目录", "part")],
        l6=[("存储", "SQLAlchemy 多库", "yes"), ("观测追踪", "对话记录为主", "part"), ("部署交付", "Docker 一键", "yes")],
    ),
    dict(
        slug="dify", name="Dify",
        tagline="低代码可视化平台 · 编排强、codex 式任务执行弱",
        evidence="#7 #22 #23 #62 #88 推荐 · #115/#117 质疑无任务执行能力",
        diff="租户/配额/沙箱/知识库全有；无人工审批与预算治理，业务规则埋在节点配置里",
        l1=[("终端用户", "WebApp 发布页", "yes"), ("管理员", "团队/租户后台", "yes"), ("业务系统", "API/嵌入", "yes"), ("外部渠道", "发布到 IM 配置", "part")],
        l2=[("注册登录", "租户邀请制", "yes"), ("会话历史", "应用会话持久化", "yes"), ("流式聊天", "SSE", "yes"), ("文件上传下载", "文件变量", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "租户+成员角色", "yes"), ("多用户隔离", "租户数据隔离", "yes"), ("配额用量", "额度/用量统计", "yes"), ("审计日志", "操作日志有限", "part")],
        l4=[("Agent 定义", "可视化编排节点", "yes"), ("Runtime 编排", "Workflow/DAG", "yes"), ("治理闸", "内容审核", "part"), ("模型管理", "多供应商统一", "yes")],
        l5a=[("知识库", "RAG 强项", "yes"), ("Skill 工具集", "插件生态", "yes"), ("MCP", "插件形式", "part"), ("Tool 执行", "自定义/HTTP 工具", "yes"), ("Prompt 管理", "编排内管理", "yes")],
        l5b=[("进程沙箱", "dify-sandbox seccomp", "yes"), ("容器编排", "Compose/K8s", "yes"), ("工作区隔离", "租户级", "yes")],
        l6=[("存储", "PG+Redis+Celery", "yes"), ("观测追踪", "内置+Langfuse", "yes"), ("部署交付", "Docker Compose", "yes")],
    ),
    dict(
        slug="coze-studio", name="Coze Studio（字节开源）",
        tagline="仿飞书 Aily 逻辑 · 帖子建议照它的产品形态做（#83）",
        evidence="#83 参考其成熟度 · #101 提及",
        diff="与 Dify 同赛道：编排/知识库/插件全；治理与审批同样缺失",
        l1=[("终端用户", "Web 发布", "yes"), ("管理员", "空间/团队", "yes"), ("业务系统", "API/SDK", "yes"), ("外部渠道", "渠道发布", "part")],
        l2=[("注册登录", "账号体系", "yes"), ("会话历史", "持久化", "yes"), ("流式聊天", "SSE", "yes"), ("文件上传下载", "知识库/变量", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "空间权限", "yes"), ("多用户隔离", "空间隔离", "yes"), ("配额用量", "用量统计", "part"), ("审计日志", "有限", "part")],
        l4=[("Agent 定义", "可视化编排", "yes"), ("Runtime 编排", "Workflow 引擎", "yes"), ("治理闸", "基础审核", "part"), ("模型管理", "多模型接入", "yes")],
        l5a=[("知识库", "内置 RAG", "yes"), ("Skill 工具集", "插件库", "yes"), ("MCP", "支持", "yes"), ("Tool 执行", "插件/工作流", "yes"), ("Prompt 管理", "编排内", "yes")],
        l5b=[("进程沙箱", "代码节点沙箱", "part"), ("容器编排", "Docker 部署", "yes"), ("工作区隔离", "空间级", "yes")],
        l6=[("存储", "多种存储组件", "yes"), ("观测追踪", "内置", "part"), ("部署交付", "Docker Compose", "yes")],
    ),
    dict(
        slug="librechat", name="LibreChat",
        tagline="多模型聊天门户 · 注册体系全，Agent 治理薄",
        evidence="#76 需二开 · #104 #138 纯 Web 可选",
        diff="注册/会话/文件/MCP 齐；无治理闸/配额，多用户隔离停留在用户级",
        l1=[("终端用户", "多用户 Web", "yes"), ("管理员", "管理面板", "yes"), ("业务系统", "API", "part"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "OAuth/本地/GitHub", "yes"), ("会话历史", "Mongo 会话树", "yes"), ("流式聊天", "SSE·Artifacts", "yes"), ("文件上传下载", "RAG API 上传", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "多用户注册", "yes"), ("多用户隔离", "用户级", "part"), ("配额用量", "限速有限", "part"), ("审计日志", "基础", "part")],
        l4=[("Agent 定义", "Agents 配置", "yes"), ("Runtime 编排", "Agents 运行时", "yes"), ("治理闸", "无", "no"), ("模型管理", "全模型接入", "yes")],
        l5a=[("知识库", "RAG API", "part"), ("Skill 工具集", "内置+自定义", "yes"), ("MCP", "一等支持", "yes"), ("Tool 执行", "Code Interpreter", "yes"), ("Prompt 管理", "提示词库", "yes")],
        l5b=[("进程沙箱", "代码解释器容器", "part"), ("容器编排", "Docker 部署", "yes"), ("工作区隔离", "用户级", "part")],
        l6=[("存储", "MongoDB", "yes"), ("观测追踪", "基础日志", "part"), ("部署交付", "Docker", "yes")],
    ),
    dict(
        slug="fastgpt", name="FastGPT",
        tagline="知识库为核心的平台 · 团队协作，编排为辅",
        evidence="#13 有知识库需求可选 · #104 提及",
        diff="知识库/团队权限强；执行隔离与治理弱，与 LuBan 的 Tool 治理思路不同",
        l1=[("终端用户", "Web 分享页", "yes"), ("管理员", "团队后台", "yes"), ("业务系统", "API", "yes"), ("外部渠道", "飞书等", "part")],
        l2=[("注册登录", "账号体系", "yes"), ("会话历史", "持久化", "yes"), ("流式聊天", "SSE", "yes"), ("文件上传下载", "数据集上传", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "团队协作权限", "yes"), ("多用户隔离", "团队级", "yes"), ("配额用量", "用量统计", "part"), ("审计日志", "有限", "part")],
        l4=[("Agent 定义", "应用编排", "yes"), ("Runtime 编排", "Flow 引擎", "yes"), ("治理闸", "无", "no"), ("模型管理", "多模型", "yes")],
        l5a=[("知识库", "核心强项", "yes"), ("Skill 工具集", "插件", "part"), ("MCP", "支持", "part"), ("Tool 执行", "HTTP 工具", "yes"), ("Prompt 管理", "编排内", "yes")],
        l5b=[("进程沙箱", "沙盒有限", "part"), ("容器编排", "Docker 部署", "yes"), ("工作区隔离", "团队级", "yes")],
        l6=[("存储", "Mongo+PG 向量", "yes"), ("观测追踪", "内置", "part"), ("部署交付", "Docker Compose", "yes")],
    ),
    # ============ 基座/harness 类 ============
    dict(
        slug="codex-app-server", name="Codex App Server",
        tagline="楼主最终选型 · harness 强，平台层全部要自建",
        evidence="主楼三次编辑采纳 · #45 调研中 · 官方建议容器内 danger-full-access",
        diff="执行沙箱与审批模式强；无门户/RBAC/配额/知识库，LuBan 正好补平台层",
        l1=[("终端用户", "无门户", "no"), ("管理员", "无", "no"), ("业务系统", "app server 对接", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "单用户账号登录", "part"), ("会话历史", "本地 rollout 记录", "part"), ("流式聊天", "协议事件流", "yes"), ("文件上传下载", "本地工作区读写", "part"), ("人工审批", "命令执行审批模式", "yes")],
        l3=[("鉴权 RBAC", "单用户无 RBAC", "no"), ("多用户隔离", "需自建", "no"), ("配额用量", "无", "no"), ("审计日志", "session 日志", "part")],
        l4=[("Agent 定义", "配置非版本化", "part"), ("Runtime 编排", "harness 强项", "yes"), ("治理闸", "审批模式兜底", "part"), ("模型管理", "OpenAI 系", "part")],
        l5a=[("知识库", "无", "no"), ("Skill 工具集", "AGENTS.md/Skill", "part"), ("MCP", "一等支持", "yes"), ("Tool 执行", "shell/apply_patch", "yes"), ("Prompt 管理", "AGENTS.md", "part")],
        l5b=[("进程沙箱", "Seatbelt/Landlock", "yes"), ("容器编排", "建议外层容器", "part"), ("工作区隔离", "workspace 写限制", "yes")],
        l6=[("存储", "本地文件", "part"), ("观测追踪", "无", "no"), ("部署交付", "app server 封装", "part")],
    ),
    dict(
        slug="dsh", name="DSH（DeepSeek Harness）",
        tagline="workspace/sandbox 抽象可借鉴 · 帖子共识生产慎用",
        evidence="#3 推荐 · #27 现阶段不能用于生产 · #47 breaking change 多难二开",
        diff="沙箱/工作区抽象好；平台层全无且升级不稳，不适合做基座",
        l1=[("终端用户", "无门户", "no"), ("管理员", "无", "no"), ("业务系统", "API 二开", "part"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "本地", "part"), ("流式聊天", "CLI 流式", "yes"), ("文件上传下载", "workspace 读写", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "无", "no"), ("多用户隔离", "无", "no"), ("配额用量", "无", "no"), ("审计日志", "无", "no")],
        l4=[("Agent 定义", "提示词工程", "part"), ("Runtime 编排", "harness 核心", "yes"), ("治理闸", "基础", "part"), ("模型管理", "DeepSeek 系", "part")],
        l5a=[("知识库", "无", "no"), ("Skill 工具集", "基础工具", "yes"), ("MCP", "支持", "yes"), ("Tool 执行", "shell 工具", "yes"), ("Prompt 管理", "内置模板", "yes")],
        l5b=[("进程沙箱", "sandbox 抽象可替换", "yes"), ("容器编排", "需自建", "no"), ("工作区隔离", "workspace 隔离", "yes")],
        l6=[("存储", "本地文件", "part"), ("观测追踪", "无", "no"), ("部署交付", "源码二开", "part")],
    ),
    dict(
        slug="openhands", name="OpenHands",
        tagline="每会话一个 Docker runtime · 隔离最强，认证在企业版",
        evidence="#11 功能对口但非 enterprise 版无认证",
        diff="会话级容器隔离是标杆；无 RBAC/配额，知识库缺失",
        l1=[("终端用户", "浏览器 VSCode", "yes"), ("管理员", "部署级", "part"), ("业务系统", "API", "part"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "非企业版无认证", "part"), ("会话历史", "事件流回放", "yes"), ("流式聊天", "事件流", "yes"), ("文件上传下载", "workspace 管理", "yes"), ("人工审批", "动作确认", "yes")],
        l3=[("鉴权 RBAC", "企业版功能", "no"), ("多用户隔离", "每会话容器", "yes"), ("配额用量", "无", "no"), ("审计日志", "事件流", "part")],
        l4=[("Agent 定义", "内置可配", "part"), ("Runtime 编排", "EventStream 事件流", "yes"), ("治理闸", "确认机制", "part"), ("模型管理", "LiteLLM 多模型", "yes")],
        l5a=[("知识库", "无", "no"), ("Skill 工具集", "bash/浏览器/Jupyter", "yes"), ("MCP", "支持", "yes"), ("Tool 执行", "代码执行全套", "yes"), ("Prompt 管理", "系统提示词", "part")],
        l5b=[("进程沙箱", "容器即沙箱", "yes"), ("容器编排", "每会话 runtime", "yes"), ("工作区隔离", "容器内 workspace", "yes")],
        l6=[("存储", "事件持久化", "yes"), ("观测追踪", "事件流可视化", "yes"), ("部署交付", "Docker", "yes")],
    ),
    dict(
        slug="pi", name="pi",
        tagline="极简 harness · 核心代码极少，设计理念被反复借鉴",
        evidence="#18 参考 · #30 #32 套壳 · #38 第一 runtime · #50 #77",
        diff="极简runtime可借鉴理念；治理/平台层全无，LuBan 不换引擎只借鉴设计",
        l1=[("终端用户", "CLI/简单 UI", "part"), ("管理员", "无", "no"), ("业务系统", "代码嵌入", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "会话文件", "part"), ("流式聊天", "流式", "yes"), ("文件上传下载", "工作区", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "无", "no"), ("多用户隔离", "无", "no"), ("配额用量", "无", "no"), ("审计日志", "无", "no")],
        l4=[("Agent 定义", "极简配置", "part"), ("Runtime 编排", "极简 harness", "yes"), ("治理闸", "无", "no"), ("模型管理", "多模型", "part")],
        l5a=[("知识库", "无", "no"), ("Skill 工具集", "基础工具", "yes"), ("MCP", "支持", "part"), ("Tool 执行", "扩展机制", "yes"), ("Prompt 管理", "系统提示词", "yes")],
        l5b=[("进程沙箱", "无", "no"), ("容器编排", "无", "no"), ("工作区隔离", "目录约定", "part")],
        l6=[("存储", "本地文件", "part"), ("观测追踪", "无", "no"), ("部署交付", "极简", "part")],
    ),
    dict(
        slug="openai-agents-sdk", name="OpenAI Agents SDK",
        tagline="官方 SDK 原语齐全 · session/guardrail/tracing，平台层无",
        evidence="#12 提及 · #58 平台跑通",
        diff="sessions/guardrails/tracing 原语与 LuBan 治理同思路；无门户无多用户",
        l1=[("终端用户", "无（SDK）", "no"), ("管理员", "无", "no"), ("业务系统", "代码集成", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "Sessions 抽象", "yes"), ("流式聊天", "流式 API", "yes"), ("文件上传下载", "应用层", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "无", "no"), ("多用户隔离", "无", "no"), ("配额用量", "无", "no"), ("审计日志", "Tracing", "part")],
        l4=[("Agent 定义", "代码定义", "yes"), ("Runtime 编排", "Runner/Handoff", "yes"), ("治理闸", "Guardrails", "yes"), ("模型管理", "多模型接入", "yes")],
        l5a=[("知识库", "无", "no"), ("Skill 工具集", "内置工具", "yes"), ("MCP", "一等支持", "yes"), ("Tool 执行", "Function Tools", "yes"), ("Prompt 管理", "Instructions", "yes")],
        l5b=[("进程沙箱", "Code Interpreter", "part"), ("容器编排", "无", "no"), ("工作区隔离", "应用层", "part")],
        l6=[("存储", "Session 后端可插拔", "part"), ("观测追踪", "Tracing 内置", "yes"), ("部署交付", "应用自部署", "part")],
    ),
    dict(
        slug="agentscope", name="AgentScope（阿里）",
        tagline="消息传递多 Agent 框架 · workspace/sandbox 官方支持",
        evidence="#60 提及 · #61 在用（Python/Java 双栈）· #73",
        diff="沙箱/工作区官方支持是亮点；门户/治理/配额全无",
        l1=[("终端用户", "无（框架）", "no"), ("管理员", "无", "no"), ("业务系统", "代码集成", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "应用层实现", "part"), ("流式聊天", "应用层", "part"), ("文件上传下载", "应用层", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "无", "no"), ("多用户隔离", "无", "no"), ("配额用量", "无", "no"), ("审计日志", "无", "no")],
        l4=[("Agent 定义", "代码定义", "yes"), ("Runtime 编排", "消息传递多 Agent", "yes"), ("治理闸", "无", "no"), ("模型管理", "多模型", "yes")],
        l5a=[("知识库", "RAG 组件", "part"), ("Skill 工具集", "Toolkit", "yes"), ("MCP", "支持", "yes"), ("Tool 执行", "Python 工具", "yes"), ("Prompt 管理", "代码管理", "yes")],
        l5b=[("进程沙箱", "官方 sandbox 支持", "yes"), ("容器编排", "需自建", "no"), ("工作区隔离", "workspace 支持", "yes")],
        l6=[("存储", "可插拔", "yes"), ("观测追踪", "Studio 追踪", "yes"), ("部署交付", "应用自部署", "part")],
    ),
    dict(
        slug="mastra", name="Mastra",
        tagline="TypeScript Agent 框架 · workflow/存储/评测全，门户无",
        evidence="#64 文档推荐",
        diff="TS 生态的 LuBan 同类原语（workflow/storage/evals）；门户与多用户缺",
        l1=[("终端用户", "无（框架）", "no"), ("管理员", "Playground", "part"), ("业务系统", "TS 应用集成", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "Storage 抽象", "part"), ("流式聊天", "AI SDK 流式", "yes"), ("文件上传下载", "应用层", "part"), ("人工审批", "suspend/resume", "yes")],
        l3=[("鉴权 RBAC", "无", "no"), ("多用户隔离", "无", "no"), ("配额用量", "无", "no"), ("审计日志", "无", "no")],
        l4=[("Agent 定义", "代码定义", "yes"), ("Runtime 编排", "Workflow 引擎", "yes"), ("治理闸", "评测体系", "part"), ("模型管理", "Vercel AI 多模型", "yes")],
        l5a=[("知识库", "RAG 组件", "yes"), ("Skill 工具集", "Tools", "yes"), ("MCP", "支持", "yes"), ("Tool 执行", "TS 工具", "yes"), ("Prompt 管理", "代码管理", "yes")],
        l5b=[("进程沙箱", "E2B 集成", "part"), ("容器编排", "需自建", "no"), ("工作区隔离", "应用层", "part")],
        l6=[("存储", "Storage 多库", "yes"), ("观测追踪", "Playground 追踪", "yes"), ("部署交付", "应用自部署", "part")],
    ),
    dict(
        slug="deer-flow", name="deer-flow",
        tagline="字节深度研究框架 · LangGraph 底座，二开改动大",
        evidence="#10 二开（bug 多头疼）· #25 大改动量 · #26 配 Bwrap 沙箱",
        diff="研究型编排+确认交互；治理/平台层薄，二开成本高",
        l1=[("终端用户", "Web UI 简版", "part"), ("管理员", "无", "no"), ("业务系统", "API", "part"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "有限", "part"), ("流式聊天", "SSE", "yes"), ("文件上传下载", "研究产物", "part"), ("人工审批", "计划确认", "yes")],
        l3=[("鉴权 RBAC", "无", "no"), ("多用户隔离", "无", "no"), ("配额用量", "无", "no"), ("审计日志", "无", "no")],
        l4=[("Agent 定义", "图编排代码", "yes"), ("Runtime 编排", "LangGraph", "yes"), ("治理闸", "无", "no"), ("模型管理", "多模型", "yes")],
        l5a=[("知识库", "检索集成", "part"), ("Skill 工具集", "研究工具", "yes"), ("MCP", "支持", "part"), ("Tool 执行", "Python/爬虫", "yes"), ("Prompt 管理", "内置模板", "yes")],
        l5b=[("进程沙箱", "Bwrap Provider", "yes"), ("容器编排", "需自建", "no"), ("工作区隔离", "基础", "part")],
        l6=[("存储", "本地/可选", "part"), ("观测追踪", "LangSmith/自部署", "yes"), ("部署交付", "应用自部署", "part")],
    ),
    # ============ 多租户/协作平台类 ============
    dict(
        slug="agent-teams", name="AgentTeams（阿里 HiClaw）",
        tagline="每 Agent 一 Docker · Matrix 聊天室协作，权限管理内置",
        evidence="#33 详细介绍（私聊+群聊多 Agent）· #126 关注",
        diff="容器隔离与群聊协作强；治理闸/配额缺，Agent 生命周期重",
        l1=[("终端用户", "Web 私聊", "yes"), ("管理员", "权限管理", "yes"), ("业务系统", "API", "part"), ("外部渠道", "Matrix 底层", "yes")],
        l2=[("注册登录", "账号体系", "yes"), ("会话历史", "聊天记录", "yes"), ("流式聊天", "Matrix 房间", "yes"), ("文件上传下载", "基础", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "权限管理", "yes"), ("多用户隔离", "一 Agent 一容器", "yes"), ("配额用量", "有限", "part"), ("审计日志", "基础", "part")],
        l4=[("Agent 定义", "配置创建", "yes"), ("Runtime 编排", "每 Agent 容器", "yes"), ("治理闸", "无", "no"), ("模型管理", "多模型", "part")],
        l5a=[("知识库", "配置接入", "part"), ("Skill 工具集", "基础", "part"), ("MCP", "支持", "part"), ("Tool 执行", "容器内执行", "yes"), ("Prompt 管理", "人设配置", "yes")],
        l5b=[("进程沙箱", "容器即沙箱", "yes"), ("容器编排", "Docker 编排", "yes"), ("工作区隔离", "容器内", "yes")],
        l6=[("存储", "Matrix/DB", "yes"), ("观测追踪", "基础", "part"), ("部署交付", "Docker 整体", "yes")],
    ),
    dict(
        slug="multiuserclaw", name="MultiUserClaw",
        tagline="多租户二开源 · 注册/管理端/共享端齐全，公司自用半年",
        evidence="#143 公司生产自用（声明保留原作者权利）",
        diff="多租户门户开箱即用；治理与执行隔离弱，继承上游边界",
        l1=[("终端用户", "注册即用", "yes"), ("管理员", "管理端", "yes"), ("业务系统", "API", "part"), ("外部渠道", "基础", "part")],
        l2=[("注册登录", "多租户注册", "yes"), ("会话历史", "持久化", "yes"), ("流式聊天", "支持", "yes"), ("文件上传下载", "基础", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "租户+角色", "yes"), ("多用户隔离", "租户级", "yes"), ("配额用量", "有限", "part"), ("审计日志", "基础", "part")],
        l4=[("Agent 定义", "配置化", "yes"), ("Runtime 编排", "继承上游", "yes"), ("治理闸", "无", "no"), ("模型管理", "多模型", "yes")],
        l5a=[("知识库", "共享配置", "part"), ("Skill 工具集", "共享", "part"), ("MCP", "支持", "part"), ("Tool 执行", "继承上游", "yes"), ("Prompt 管理", "配置", "part")],
        l5b=[("进程沙箱", "继承上游", "part"), ("容器编排", "单服务", "part"), ("工作区隔离", "租户级", "part")],
        l6=[("存储", "DB", "yes"), ("观测追踪", "基础", "part"), ("部署交付", "Docker", "yes")],
    ),
    dict(
        slug="yc-qm", name="YC-QM",
        tagline="孵化器出品的多人 agent harness · 组织权限是卖点",
        evidence="#75 二开中 · #141 支持组织权限、服务器部署",
        diff="组织权限/服务器部署齐；治理闸缺，生态文档少",
        l1=[("终端用户", "组织成员", "yes"), ("管理员", "组织后台", "yes"), ("业务系统", "API", "part"), ("外部渠道", "基础", "part")],
        l2=[("注册登录", "组织账号", "yes"), ("会话历史", "持久化", "yes"), ("流式聊天", "支持", "yes"), ("文件上传下载", "基础", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "组织权限管理", "yes"), ("多用户隔离", "组织级", "yes"), ("配额用量", "有限", "part"), ("审计日志", "基础", "part")],
        l4=[("Agent 定义", "配置化", "yes"), ("Runtime 编排", "harness", "yes"), ("治理闸", "无", "no"), ("模型管理", "多模型", "part")],
        l5a=[("知识库", "组织共享", "part"), ("Skill 工具集", "基础", "part"), ("MCP", "支持", "part"), ("Tool 执行", "执行", "yes"), ("Prompt 管理", "配置", "part")],
        l5b=[("进程沙箱", "有限", "part"), ("容器编排", "服务器部署", "part"), ("工作区隔离", "组织级", "part")],
        l6=[("存储", "DB", "yes"), ("观测追踪", "基础", "part"), ("部署交付", "服务器", "yes")],
    ),
    dict(
        slug="multica", name="Multica",
        tagline="人机协作平台 · runtime 本机/云沙箱，共享资源 git repo 化",
        evidence="#78 改改能用 · #103 共享 skill/mcp/知识库（git repo）· #116 基本满足",
        diff="runtime 双形态+资源 git 化思路好；治理闸/配额缺",
        l1=[("终端用户", "Web 协作", "yes"), ("管理员", "组织管理", "part"), ("业务系统", "API", "part"), ("外部渠道", "集成", "part")],
        l2=[("注册登录", "账号体系", "yes"), ("会话历史", "持久化", "yes"), ("流式聊天", "支持", "yes"), ("文件上传下载", "工作区共享", "yes"), ("人工审批", "human-in-loop", "yes")],
        l3=[("鉴权 RBAC", "组织权限", "part"), ("多用户隔离", "会话/工作区", "part"), ("配额用量", "有限", "part"), ("审计日志", "基础", "part")],
        l4=[("Agent 定义", "智能体配置", "yes"), ("Runtime 编排", "本机/远端 runtime", "yes"), ("治理闸", "基础", "part"), ("模型管理", "多模型", "yes")],
        l5a=[("知识库", "git repo 共享", "yes"), ("Skill 工具集", "Skill 共享", "yes"), ("MCP", "共享配置", "yes"), ("Tool 执行", "runtime 执行", "yes"), ("Prompt 管理", "版本化", "part")],
        l5b=[("进程沙箱", "runtime 级", "part"), ("容器编排", "云主机沙箱", "yes"), ("工作区隔离", "git 工作区", "yes")],
        l6=[("存储", "服务端", "yes"), ("观测追踪", "基础", "part"), ("部署交付", "self-host", "yes")],
    ),
    dict(
        slug="hermes", name="Hermes",
        tagline="共享 runtime + profile 人设隔离 · 权限隔离不足",
        evidence="#14 实践 · #36 一人一容器+skill 市场 · #111/#113 profile 非权限隔离 · #134 反代分用户",
        diff="Skill 生态与 IM 渠道强；profile 不是权限隔离，LuBan 必须做装配级过滤",
        l1=[("终端用户", "Web/IM 接入", "part"), ("管理员", "有限", "part"), ("业务系统", "API", "part"), ("外部渠道", "IM 渠道", "yes")],
        l2=[("注册登录", "无独立账号", "no"), ("会话历史", "会话记录", "part"), ("流式聊天", "支持", "yes"), ("文件上传下载", "基础", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "无", "no"), ("多用户隔离", "profile 仅人设级", "no"), ("配额用量", "无", "no"), ("审计日志", "有限", "part")],
        l4=[("Agent 定义", "profile 配置", "part"), ("Runtime 编排", "Hermes runtime", "yes"), ("治理闸", "无", "no"), ("模型管理", "多模型", "yes")],
        l5a=[("知识库", "外接", "part"), ("Skill 工具集", "Skill 生态", "yes"), ("MCP", "支持", "yes"), ("Tool 执行", "内置+扩展", "yes"), ("Prompt 管理", "profile 人设", "yes")],
        l5b=[("进程沙箱", "无", "no"), ("容器编排", "一人一容器反代", "part"), ("工作区隔离", "实例级", "part")],
        l6=[("存储", "实例内", "part"), ("观测追踪", "基础", "part"), ("部署交付", "容器反代", "part")],
    ),
    dict(
        slug="workbuddy", name="WorkBuddy",
        tagline="好用的客户端 · 配合 Key 派发后端给员工用",
        evidence="#51 派发 API Key + 企业微信扫码 · 知识库未建",
        diff="客户端分发模式（路线 D 实例）；服务端治理/隔离全靠中转站补",
        l1=[("终端用户", "员工客户端", "yes"), ("管理员", "Key 派发后台", "part"), ("业务系统", "中转 API", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "企微扫码派 Key", "part"), ("会话历史", "客户端内", "part"), ("流式聊天", "支持", "yes"), ("文件上传下载", "客户端", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "Key 隔离", "part"), ("多用户隔离", "Key 级", "part"), ("配额用量", "中转站计费", "part"), ("审计日志", "中转日志", "part")],
        l4=[("Agent 定义", "客户端配置", "part"), ("Runtime 编排", "客户端 harness", "yes"), ("治理闸", "无", "no"), ("模型管理", "中转多模型", "yes")],
        l5a=[("知识库", "未搭建", "no"), ("Skill 工具集", "客户端功能", "yes"), ("MCP", "支持", "yes"), ("Tool 执行", "客户端", "yes"), ("Prompt 管理", "配置", "part")],
        l5b=[("进程沙箱", "本地执行", "no"), ("容器编排", "无", "no"), ("工作区隔离", "本地", "yes")],
        l6=[("存储", "本地+中转", "part"), ("观测追踪", "中转统计", "part"), ("部署交付", "客户端分发", "yes")],
    ),
    dict(
        slug="qwenpaw", name="QwenPaw",
        tagline="自部署个人助手 · Web+桌面+多 IM 渠道，Skills 扩展",
        evidence="#68",
        diff="渠道触达强（对标 LuBan 商用渠道层）；多用户/治理缺",
        l1=[("终端用户", "Web/桌面/IM", "yes"), ("管理员", "自管", "part"), ("业务系统", "API", "part"), ("外部渠道", "钉钉/飞书/微信/TG", "yes")],
        l2=[("注册登录", "单用户自部署", "part"), ("会话历史", "持久化", "yes"), ("流式聊天", "支持", "yes"), ("文件上传下载", "基础", "part"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "单用户", "no"), ("多用户隔离", "无", "no"), ("配额用量", "无", "no"), ("审计日志", "基础", "part")],
        l4=[("Agent 定义", "配置化", "yes"), ("Runtime 编排", "个人助手", "yes"), ("治理闸", "无", "no"), ("模型管理", "多模型", "yes")],
        l5a=[("知识库", "个人知识", "part"), ("Skill 工具集", "Skills 扩展", "yes"), ("MCP", "支持", "yes"), ("Tool 执行", "技能执行", "yes"), ("Prompt 管理", "人设", "yes")],
        l5b=[("进程沙箱", "无", "no"), ("容器编排", "自部署", "part"), ("工作区隔离", "本机", "part")],
        l6=[("存储", "本地/DB", "yes"), ("观测追踪", "基础", "part"), ("部署交付", "本地/云", "yes")],
    ),
    # ============ 基础设施类 ============
    dict(
        slug="litellm", name="LiteLLM",
        tagline="模型网关标配 · 统一协议/虚拟 Key/配额，无 Agent 能力",
        evidence="#63 与 Open WebUI 搭配：分功能模型管理/用量配额/Key",
        diff="配额与 Key 管理正是 LuBan 主体配额闸的对标物；无任何 Agent 层",
        l1=[("终端用户", "无（网关）", "no"), ("管理员", "代理管理 UI", "yes"), ("业务系统", "OpenAI 协议接入", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "无", "no"), ("流式聊天", "透传流式", "yes"), ("文件上传下载", "无", "no"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "虚拟 Key+团队", "yes"), ("多用户隔离", "Key 级", "yes"), ("配额用量", "预算/限速强项", "yes"), ("审计日志", "调用级日志", "yes")],
        l4=[("Agent 定义", "无", "no"), ("Runtime 编排", "无", "no"), ("治理闸", "预算/冷却", "yes"), ("模型管理", "100+ 模型路由", "yes")],
        l5a=[("知识库", "无", "no"), ("Skill 工具集", "无", "no"), ("MCP", "透传", "part"), ("Tool 执行", "无", "no"), ("Prompt 管理", "无", "no")],
        l5b=[("进程沙箱", "无", "no"), ("容器编排", "无", "no"), ("工作区隔离", "无", "no")],
        l6=[("存储", "DB 用量记录", "yes"), ("观测追踪", "用量/花费看板", "yes"), ("部署交付", "Docker/企业版", "yes")],
    ),
    dict(
        slug="weknora", name="Weknora / WebKnorv",
        tagline="知识库服务 · 文档解析+RAG API，被当平台知识底座",
        evidence="#84 同事用 WebKnorv 搭知识库 · #86 ima 开源版",
        diff="纯知识底座，对标 LuBan knowledge 模块；无 Agent/门户",
        l1=[("终端用户", "无（服务）", "no"), ("管理员", "管理端", "part"), ("业务系统", "API 接入", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "无", "no"), ("流式聊天", "检索增强回答", "part"), ("文件上传下载", "文档上传解析", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "API Key", "part"), ("多用户隔离", "应用级", "part"), ("配额用量", "无", "no"), ("审计日志", "无", "no")],
        l4=[("Agent 定义", "无", "no"), ("Runtime 编排", "无", "no"), ("治理闸", "无", "no"), ("模型管理", "embedding 配置", "part")],
        l5a=[("知识库", "核心强项", "yes"), ("Skill 工具集", "检索 API", "yes"), ("MCP", "无", "no"), ("Tool 执行", "无", "no"), ("Prompt 管理", "RAG 模板", "part")],
        l5b=[("进程沙箱", "无", "no"), ("容器编排", "Docker 部署", "yes"), ("工作区隔离", "无", "no")],
        l6=[("存储", "向量+对象存储", "yes"), ("观测追踪", "基础", "part"), ("部署交付", "Docker", "yes")],
    ),
    dict(
        slug="ragflow", name="RAGFlow",
        tagline="深度文档理解 RAG · 切块可视化，简单场景一把梭（#72）",
        evidence="#72 够用论 · #104 提及",
        diff="文档解析深度是差异化；Agent 编排弱，治理缺",
        l1=[("终端用户", "Web 聊天", "yes"), ("管理员", "团队管理", "yes"), ("业务系统", "API", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "账号体系", "yes"), ("会话历史", "持久化", "yes"), ("流式聊天", "支持", "yes"), ("文件上传下载", "深度解析上传", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "团队权限", "yes"), ("多用户隔离", "团队级", "yes"), ("配额用量", "基础", "part"), ("审计日志", "有限", "part")],
        l4=[("Agent 定义", "Agent 编排", "part"), ("Runtime 编排", "工作流", "part"), ("治理闸", "无", "no"), ("模型管理", "多模型", "yes")],
        l5a=[("知识库", "强项·切块可视化", "yes"), ("Skill 工具集", "检索工具", "yes"), ("MCP", "支持", "part"), ("Tool 执行", "基础", "part"), ("Prompt 管理", "模板", "yes")],
        l5b=[("进程沙箱", "无", "no"), ("容器编排", "Docker 部署", "yes"), ("工作区隔离", "团队级", "part")],
        l6=[("存储", "ES+MinIO+MySQL", "yes"), ("观测追踪", "基础", "part"), ("部署交付", "Docker Compose", "yes")],
    ),
    dict(
        slug="e2b-opensandbox", name="E2B / OpenSandbox（云沙箱）",
        tagline="沙箱即服务 · microVM 秒级起、用完销毁，平台执行底座",
        evidence="#93 Neutree Agent Platform+OpenSandbox 组合 · #85 思路一致",
        diff="对应 LuBan R10 会话级容器的替代底座；治理在调用方",
        l1=[("终端用户", "无（服务）", "no"), ("管理员", "控制台", "part"), ("业务系统", "SDK 起沙箱", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "无", "no"), ("流式聊天", "无", "no"), ("文件上传下载", "沙箱内 FS API", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "API Key", "yes"), ("多用户隔离", "沙箱实例级", "yes"), ("配额用量", "用量计费", "part"), ("审计日志", "基础", "part")],
        l4=[("Agent 定义", "无", "no"), ("Runtime 编排", "无", "no"), ("治理闸", "超时/资源限制", "yes"), ("模型管理", "无", "no")],
        l5a=[("知识库", "无", "no"), ("Skill 工具集", "无", "no"), ("MCP", "无", "no"), ("Tool 执行", "代码执行环境", "yes"), ("Prompt 管理", "无", "no")],
        l5b=[("进程沙箱", "Firecracker microVM", "yes"), ("容器编排", "秒级起停", "yes"), ("工作区隔离", "沙箱生命周期", "yes")],
        l6=[("存储", "沙箱临时 FS", "part"), ("观测追踪", "执行日志", "part"), ("部署交付", "云服务/self-host", "yes")],
    ),
    dict(
        slug="k8s-session-sandbox", name="K8s 会话级容器沙箱",
        tagline="每会话一 Pod · CTF 平台验证过并发场景（#70）",
        evidence="#70 参考 CTF 平台并发 · #121 腾讯开源分布式沙盒",
        diff="自建执行底座的上限方案；治理/Agent 层全要自己拼",
        l1=[("终端用户", "无（底座）", "no"), ("管理员", "集群运维", "yes"), ("业务系统", "K8s API 起 Pod", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "无", "no"), ("流式聊天", "无", "no"), ("文件上传下载", "PV 挂载", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "K8s RBAC", "yes"), ("多用户隔离", "Pod 级硬隔离", "yes"), ("配额用量", "ResourceQuota", "yes"), ("审计日志", "K8s audit", "yes")],
        l4=[("Agent 定义", "无", "no"), ("Runtime 编排", "无", "no"), ("治理闸", "limits/requests", "yes"), ("模型管理", "无", "no")],
        l5a=[("知识库", "无", "no"), ("Skill 工具集", "无", "no"), ("MCP", "无", "no"), ("Tool 执行", "容器内任意", "yes"), ("Prompt 管理", "无", "no")],
        l5b=[("进程沙箱", "namespace/cgroup", "yes"), ("容器编排", "Pod 编排强项", "yes"), ("工作区隔离", "PV per session", "yes")],
        l6=[("存储", "PV/PVC", "yes"), ("观测追踪", "Prometheus 生态", "yes"), ("部署交付", "集群", "yes")],
    ),
    dict(
        slug="bwrap-cubesandbox", name="Bwrap / CubeSandbox（进程沙箱）",
        tagline="进程级轻沙箱 · namespace+cgroup 毫秒级，仅 Linux",
        evidence="#26 deer-flow 的 BwrapSandboxProvider · #19 #106 CubeSandbox（要裸金属）",
        diff="最轻隔离层，容器与沙盒互斥教训下的非容器选择",
        l1=[("终端用户", "无（库/工具）", "no"), ("管理员", "无", "no"), ("业务系统", "Provider 接入", "yes"), ("外部渠道", "无", "no")],
        l2=[("注册登录", "无", "no"), ("会话历史", "无", "no"), ("流式聊天", "无", "no"), ("文件上传下载", "挂载目录控制", "yes"), ("人工审批", "无", "no")],
        l3=[("鉴权 RBAC", "无", "no"), ("多用户隔离", "进程级", "part"), ("配额用量", "cgroup 限制", "yes"), ("审计日志", "无", "no")],
        l4=[("Agent 定义", "无", "no"), ("Runtime 编排", "无", "no"), ("治理闸", "超时限制", "part"), ("模型管理", "无", "no")],
        l5a=[("知识库", "无", "no"), ("Skill 工具集", "无", "no"), ("MCP", "无", "no"), ("Tool 执行", "沙箱内执行", "yes"), ("Prompt 管理", "无", "no")],
        l5b=[("进程沙箱", "bubblewrap 核心", "yes"), ("容器编排", "无需容器", "part"), ("工作区隔离", "目录白名单", "yes")],
        l6=[("存储", "宿主目录", "yes"), ("观测追踪", "无", "no"), ("部署交付", "Linux 裸金属", "yes")],
    ),
    # ============ LuBanAgent ============
    dict(
        slug="lubanagent", name="LuBanAgent",
        tagline="治理四件套 + 用户端门户 · 分配与动态装配 · 主体配额",
        evidence="README / AGENTS.md · R1–R11 已落地 · docs/design-docs/LuBanAgent-platform-research-and-transformation.md",
        diff="治理四件套（定义版本化/治理闸/审批/归因）+门户五件套+装配级隔离+主体配额；对齐或超越帖内方案",
        l1=[("终端用户", "门户自助使用", "star"), ("管理员", "分配与配额管理页", "star"), ("业务系统", "REST/SSE 不变", "yes"), ("外部渠道", "商用渠道层", "part")],
        l2=[("注册登录", "终端用户账号域", "star"), ("会话历史", "会话列表持久化", "star"), ("流式聊天", "SSE·形象·MD", "yes"), ("文件上传下载", "会话级上传下载", "star"), ("人工审批", "气泡内审批", "yes")],
        l3=[("鉴权 RBAC", "工作台+门户分域", "star"), ("多用户隔离", "动态装配按人过滤", "star"), ("配额用量", "主体配额闸", "star"), ("审计日志", "用户端事件审计", "star")],
        l4=[("Agent 定义", "入库版本化", "yes"), ("Runtime 编排", "LangGraph 统一", "yes"), ("治理闸", "四道闸+审批", "yes"), ("模型管理", "四槽位工厂", "yes")],
        l5a=[("知识库", "分配可见", "star"), ("Skill 工具集", "分配可见", "star"), ("MCP", "分配可见", "star"), ("Tool 执行", "Python 受治理", "yes"), ("Prompt 管理", "一等实体化", "yes")],
        l5b=[("进程沙箱", "治理闸打底", "part"), ("容器编排", "会话级容器可选", "star"), ("工作区隔离", "per-session workspace", "star")],
        l6=[("存储", "DB 唯一可信源", "yes"), ("观测追踪", "Langfuse 双写", "yes"), ("部署交付", "compose profile", "star")],
    ),
]


def main():
    out = os.path.abspath(OUT_DIR)
    os.makedirs(out, exist_ok=True)
    for p in PROJECTS:
        svg = render(p)
        path = os.path.join(out, p["slug"] + ".svg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(svg)
        print(f"wrote {path}  ({len(svg)} bytes)")
    print(f"\n共 {len(PROJECTS)} 张图 → {out}")


if __name__ == "__main__":
    main()
