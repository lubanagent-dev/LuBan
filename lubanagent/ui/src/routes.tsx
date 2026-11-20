import { createBrowserRouter, Navigate, type RouteObject, useParams } from 'react-router-dom';

import { AppShell } from '@/components/layout/app-shell';
import AssignmentsPage from '@/pages/assignments/AssignmentsPage';
import AuditEventsPage from '@/pages/audit/AuditEventsPage';
import QuotasPage from '@/pages/quotas/QuotasPage';
import PortalLoginPage from '@/pages/portal/PortalLoginPage';
import AgentDebugPage from '@/pages/agents/AgentDebugPage';
import AgentEditorPage from '@/pages/agents/AgentEditorPage';
import AgentsPage from '@/pages/agents/AgentsPage';
import ChatPage from '@/pages/chat/ChatPage';
import DiagnosticDetailPage from '@/pages/diagnostics/DiagnosticDetailPage';
import DiagnosticsPage from '@/pages/diagnostics/DiagnosticsPage';
import EvalsPage from '@/pages/evals/EvalsPage';
import GraphsPage from '@/pages/graphs/GraphsPage';
import KnowledgePage from '@/pages/knowledge/KnowledgePage';
import ModelComparePage from '@/pages/models/ModelComparePage';
import ModelsPage from '@/pages/models/ModelsPage';
import PromptsPage from '@/pages/prompts/PromptsPage';
import SecurityPage from '@/pages/security/SecurityPage';
import SkillsPage from '@/pages/skills/SkillsPage';
import ToolsPage from '@/pages/tools/ToolsPage';
import { RequirePermission } from '@/components/layout/require-permission';
import { RouteErrorBoundary } from '@/components/layout/route-error-boundary';
import { RootRedirect } from '@/components/layout/root-redirect';

/** 路由表 = 验收单位（17 条页面路由，其中 /chat 用户端聊天页为并列路由、不在 AppShell 布局壳内；D4-1 契约存档为旧清单，以此为准）；测试复用同一份 routeObjects */
/** Traces 已并入日志排查（/diagnostics）；旧链接 302 到对应位置。 */
function TracesRedirect() {
  const { runId } = useParams();
  return <Navigate to={runId ? `/diagnostics/${runId}` : '/diagnostics'} replace />;
}

export const routeObjects: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <RootRedirect /> },
      {
        path: 'agents',
        element: (
          <RequirePermission permission="config:read">
            <AgentsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'agents/:key',
        element: (
          <RequirePermission permission="config:read">
            <AgentEditorPage />
          </RequirePermission>
        ),
      },
      {
        path: 'agents/:key/debug',
        element: (
          <RequirePermission permission="run:execute">
            <AgentDebugPage />
          </RequirePermission>
        ),
      },
      {
        path: 'prompts',
        element: (
          <RequirePermission permission="config:read">
            <PromptsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'models',
        element: (
          <RequirePermission permission="config:read">
            <ModelsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'models/compare',
        element: (
          <RequirePermission permission="run:execute">
            <ModelComparePage />
          </RequirePermission>
        ),
      },
      {
        path: 'tools',
        element: (
          <RequirePermission permission="config:read">
            <ToolsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'skills',
        element: (
          <RequirePermission permission="config:read">
            <SkillsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'knowledge',
        element: (
          <RequirePermission permission="config:read">
            <KnowledgePage />
          </RequirePermission>
        ),
      },
      {
        path: 'graphs',
        element: (
          <RequirePermission permission="config:read">
            <GraphsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'traces',
        element: (
          <RequirePermission permission="run:read">
            <Navigate to="/diagnostics" replace />
          </RequirePermission>
        ),
      },
      {
        path: 'traces/:runId',
        element: (
          <RequirePermission permission="run:read">
            <TracesRedirect />
          </RequirePermission>
        ),
      },
      {
        path: 'evals',
        element: (
          <RequirePermission permission="eval:read">
            <EvalsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'diagnostics',
        element: (
          <RequirePermission permission="diagnostics:read">
            <DiagnosticsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'diagnostics/:runOrTraceId',
        element: (
          <RequirePermission permission="diagnostics:read">
            <DiagnosticDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'security',
        element: (
          <RequirePermission permission="security:manage">
            <SecurityPage />
          </RequirePermission>
        ),
      },
      {
        path: 'assignments',
        element: (
          <RequirePermission permission="security:manage">
            <AssignmentsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'quotas',
        element: (
          <RequirePermission permission="security:manage">
            <QuotasPage />
          </RequirePermission>
        ),
      },
      {
        path: 'audit-events',
        element: (
          <RequirePermission permission="audit:read">
            <AuditEventsPage />
          </RequirePermission>
        ),
      },
      { path: '*', element: <RootRedirect /> },
    ],
  },
  // 用户端聊天页：并列路由（无侧边栏/顶栏的全屏聊天；带门户令牌时启用会话侧栏）
  { path: '/chat', element: <ChatPage />, errorElement: <RouteErrorBoundary /> },
  // 门户登录/注册页（R7）：终端用户入口，独立于工作台鉴权
  { path: '/portal', element: <PortalLoginPage />, errorElement: <RouteErrorBoundary /> },
  // 门户首页即对话页（Codex 式：侧栏智能体 + 会话，主区聊天）
  { path: '/portal/app', element: <Navigate to="/chat" replace />, errorElement: <RouteErrorBoundary /> },
];

export const router = createBrowserRouter(routeObjects);
