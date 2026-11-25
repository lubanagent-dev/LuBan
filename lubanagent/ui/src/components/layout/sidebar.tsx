import {
  BookOpen,
  ClipboardList,
  Bot,
  ChevronDown,
  ChevronRight,
  FileText,
  Gauge,
  GitBranch,
  MessageCircle,
  MessagesSquare,
  Package,
  SearchCode,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

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

/** 平铺导航项（主菜单）。 */
const NAV_ITEMS: NavItem[] = [
  { to: '/agents', labelKey: 'nav.agents', icon: Bot, permission: 'config:read' },
  { to: '/prompts', labelKey: 'nav.prompts', icon: FileText, permission: 'config:read' },
  { to: '/models', labelKey: 'nav.models', icon: Gauge, permission: 'config:read' },
  { to: '/tools', labelKey: 'nav.tools', icon: Wrench, permission: 'config:read' },
  { to: '/skills', labelKey: 'nav.skills', icon: Package, permission: 'config:read' },
  { to: '/knowledge', labelKey: 'nav.knowledge', icon: BookOpen, permission: 'config:read' },
  { to: '/graphs', labelKey: 'nav.graphs', icon: GitBranch, permission: 'config:read' },
  {
    to: '/diagnostics',
    labelKey: 'nav.diagnostics',
    icon: SearchCode,
    permission: 'diagnostics:read',
  },
  { to: '/evals', labelKey: 'nav.evals', icon: MessagesSquare, permission: 'eval:read' },
];

/** 可折叠导航组：权限与审计相关页面收进同一组，避免菜单无限变长。 */
interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'sidebar.adminGroup',
    items: [
      { to: '/security', labelKey: 'nav.security', icon: ShieldCheck, permission: 'security:manage' },
      {
        to: '/assignments',
        labelKey: 'nav.assignments',
        icon: ClipboardList,
        permission: 'security:manage',
      },
      { to: '/quotas', labelKey: 'nav.quotas', icon: Gauge, permission: 'security:manage' },
      { to: '/audit-events', labelKey: 'nav.audit', icon: ShieldAlert, permission: 'audit:read' },
    ],
  },
];

/** 分组展开状态记 localStorage；子项激活时强制展开。 */
const GROUP_OPEN_KEY = 'luban.sidebar.group-open';

function readGroupOpen(): boolean {
  try {
    return localStorage.getItem(GROUP_OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-base font-medium transition-all duration-150',
    isActive
      ? 'bg-primary/15 text-primary shadow-sm ring-1 ring-primary/25'
      : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
  );
}

export function Sidebar() {
  // 调试台入口指向第一个 Agent；无 Agent 时落到列表页引导新建
  const { data: agents } = useAgents();
  const t = useT();
  const { can } = usePermissions();
  const location = useLocation();
  const debugTarget = agents?.length ? `/agents/${agents[0].key}/debug` : '/agents';
  const navItems = NAV_ITEMS.filter((item) => can(item.permission));
  const [groupOpen, setGroupOpen] = useState(readGroupOpen);

  const toggleGroup = () => {
    const next = !groupOpen;
    setGroupOpen(next);
    try {
      localStorage.setItem(GROUP_OPEN_KEY, String(next));
    } catch {
      // localStorage 不可用（隐私模式等）时仅在内存中生效。
    }
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border/80 bg-card/90 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-2.5 border-b border-border/80 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
          <Terminal className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold tracking-tight">LubanAgent</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <div className="mb-3 space-y-1 rounded-xl border border-border/60 bg-muted/30 p-1.5">
          {can('run:execute') && (
            <NavLink to={debugTarget} className={navLinkClass} end={false}>
              <MessagesSquare className="h-4 w-4 shrink-0" />
              {t('sidebar.debugConsole')}
            </NavLink>
          )}
          {/* /chat 是并列路由（不在 AppShell 内）：点击即离开布局壳进全屏聊天 */}
          <NavLink to="/chat" className={navLinkClass} end>
            <MessageCircle className="h-4 w-4 shrink-0" />
            {t('sidebar.userChat')}
          </NavLink>
        </div>
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={navLinkClass} end={item.to === '/agents'}>
            <item.icon className="h-4 w-4 shrink-0" />
            {t(item.labelKey)}
          </NavLink>
        ))}
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => can(item.permission));
          if (items.length === 0) return null;
          const hasActive = items.some((item) => location.pathname.startsWith(item.to));
          const open = groupOpen || hasActive;
          return (
            <div key={group.labelKey} className="pt-3">
              <button
                type="button"
                onClick={toggleGroup}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
                data-testid="sidebar-admin-group"
              >
                {open ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {t(group.labelKey)}
              </button>
              {open && (
                <div className="ml-3.5 mt-1 space-y-1 border-l border-border/80 pl-2.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => cn(navLinkClass({ isActive }), 'text-sm')}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {t(item.labelKey)}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
