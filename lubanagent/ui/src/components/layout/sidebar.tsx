import {
  BookOpen,
  ClipboardList,
  Bot,
  FileText,
  Gauge,
  GitBranch,
  MessageCircle,
  MessagesSquare,
  Package,
  SearchCode,
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';

import { useAgents } from '@/api/hooks';
import { useT } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  permission: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/agents', labelKey: 'nav.agents', icon: Bot, permission: 'config:read' },
  { to: '/prompts', labelKey: 'nav.prompts', icon: FileText, permission: 'config:read' },
  { to: '/models', labelKey: 'nav.models', icon: Gauge, permission: 'config:read' },
  { to: '/tools', labelKey: 'nav.tools', icon: Wrench, permission: 'config:read' },
  { to: '/skills', labelKey: 'nav.skills', icon: Package, permission: 'config:read' },
  { to: '/knowledge', labelKey: 'nav.knowledge', icon: BookOpen, permission: 'config:read' },
  { to: '/graphs', labelKey: 'nav.graphs', icon: GitBranch, permission: 'config:read' },
  { to: '/traces', labelKey: 'nav.traces', icon: ScrollText, permission: 'run:read' },
  { to: '/diagnostics', labelKey: 'nav.diagnostics', icon: SearchCode, permission: 'diagnostics:read' },
  { to: '/evals', labelKey: 'nav.evals', icon: MessagesSquare, permission: 'eval:read' },
  { to: '/security', labelKey: 'nav.security', icon: ShieldCheck, permission: 'security:manage' },
  {
    to: '/assignments',
    labelKey: 'nav.assignments',
    icon: ClipboardList,
    permission: 'security:manage',
  },
  { to: '/audit-events', labelKey: 'nav.audit', icon: ShieldAlert, permission: 'audit:read' },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium transition-colors',
    isActive
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
  );
}

export function Sidebar() {
  // 调试台入口指向第一个 Agent；无 Agent 时落到列表页引导新建
  const { data: agents } = useAgents();
  const t = useT();
  const { can } = usePermissions();
  const debugTarget = agents?.length ? `/agents/${agents[0].key}/debug` : '/agents';
  const navItems = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-card/50">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Terminal className="h-5 w-5 text-primary" />
        <span className="text-lg font-semibold tracking-tight">LubanAgent</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {can('run:execute') && (
          <NavLink to={debugTarget} className={navLinkClass} end={false}>
            <MessagesSquare className="h-4 w-4" />
            {t('sidebar.debugConsole')}
          </NavLink>
        )}
        {/* /chat 是并列路由（不在 AppShell 内）：点击即离开布局壳进全屏聊天 */}
        <NavLink to="/chat" className={navLinkClass} end>
          <MessageCircle className="h-4 w-4" />
          {t('sidebar.userChat')}
        </NavLink>
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={navLinkClass} end={item.to === '/agents'}>
            <item.icon className="h-4 w-4" />
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
