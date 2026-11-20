/**
 * 门户侧栏（Codex 式）：登录用户可见。
 * 结构 = 顶部门户标识 + 「新对话」 + 智能体列表 + 历史会话 + 当前会话文件 + 底部账号。
 * 数据边界：会话/文件按 subject 隔离由后端保证；智能体可见性按分配过滤（后端裁决）。
 */

import {
  FileDown,
  FileUp,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';

import {
  deleteSessionFile,
  downloadSessionFile,
  uploadSessionFile,
  useAgents,
  useCreateSession,
  useDeleteSession,
  useSessionFiles,
  useSessions,
} from '@/api/hooks';
import { ApiError } from '@/api/client';
import { AgentAvatar } from '@/components/agent-avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useT } from '@/lib/i18n';
import { clearPortalSession, getPortalUser } from '@/lib/portal';
import { cn } from '@/lib/utils';

interface Props {
  activeSessionId: string | null;
  selectedAgentKey: string | null;
  onSelectAgent: (agentKey: string) => void;
  onNewChat: () => void;
  onSelect: (sessionId: string, title: string) => void;
}

export function SessionSidebar({
  activeSessionId,
  selectedAgentKey,
  onSelectAgent,
  onNewChat,
  onSelect,
}: Props) {
  const t = useT();
  const user = getPortalUser();
  const agentsQuery = useAgents();
  const sessionsQuery = useSessions();
  const filesQuery = useSessionFiles(activeSessionId);
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const agents = (agentsQuery.data ?? []).filter((agent) => agent.status !== 'deprecated');
  const sessions = sessionsQuery.data ?? [];
  const files = filesQuery.data ?? [];

  const onUpload = async (file: File) => {
    if (activeSessionId === null) return;
    setFileError(null);
    try {
      await uploadSessionFile(activeSessionId, file);
    } catch (exc) {
      setFileError(exc instanceof ApiError ? exc.message : t('api.uploadFailed'));
    }
  };

  return (
    <aside
      className="flex w-72 shrink-0 flex-col border-r bg-muted/30"
      data-testid="portal-session-sidebar"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <MessageCircle className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold">{t('portal.title')}</span>
      </div>

      <div className="shrink-0 p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={createSession.isPending}
          onClick={onNewChat}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t('chat.newSession')}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-2">
          <section aria-label={t('portal.agents')}>
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {t('portal.agents')}
            </p>
            <nav className="space-y-0.5">
              {agents.map((agent) => (
                <button
                  key={agent.key}
                  type="button"
                  data-testid="portal-agent-item"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    agent.key === selectedAgentKey
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50',
                  )}
                  onClick={() => onSelectAgent(agent.key)}
                >
                  <AgentAvatar agent={agent} size={22} />
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                </button>
              ))}
              {agents.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">{t('portal.agentEmpty')}</p>
              )}
            </nav>
          </section>

          <section aria-label={t('portal.recentSessions')}>
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {t('portal.recentSessions')}
            </p>
            <nav className="space-y-0.5">
              {sessionsQuery.isLoading && (
                <p className="px-2 py-1 text-sm text-muted-foreground">{t('common.loading')}</p>
              )}
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm',
                    session.id === activeSessionId
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50',
                  )}
                >
                  <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() => onSelect(session.id, session.title ?? '')}
                  >
                    {session.title === '' ? t('portal.untitledSession') : session.title}
                  </button>
                  <button
                    type="button"
                    aria-label={t('portal.deleteSession')}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => {
                      if (session.id === activeSessionId) {
                        onSelect(session.id, session.title ?? '');
                      }
                      deleteSession.mutate(session.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
              {!sessionsQuery.isLoading && sessions.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">{t('portal.noSessions')}</p>
              )}
            </nav>
          </section>

          {activeSessionId !== null && (
            <section aria-label={t('portal.files')}>
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('portal.files')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="mr-0.5 h-3 w-3" />
                  {t('portal.upload')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file !== undefined) void onUpload(file);
                  }}
                />
              </div>
              {fileError !== null && <p className="px-2 text-xs text-destructive">{fileError}</p>}
              <ul className="space-y-0.5">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="group flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent/50"
                  >
                    <span className="min-w-0 flex-1 truncate" title={file.filename}>
                      {file.filename}
                    </span>
                    <button
                      type="button"
                      aria-label={t('portal.download')}
                      onClick={() => void downloadSessionFile(file.session_id, file.id)}
                    >
                      <FileDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('portal.deleteFile')}
                      onClick={() => void deleteSessionFile(file.session_id, file.id)}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </ScrollArea>

      <div className="flex h-12 shrink-0 items-center gap-2 border-t px-3">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {user?.display_name ?? user?.username ?? ''}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={t('portal.signOut')}
          onClick={() => {
            clearPortalSession();
            window.location.assign('/portal');
          }}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </aside>
  );
}
