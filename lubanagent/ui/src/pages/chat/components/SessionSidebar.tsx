/**
 * 门户会话侧栏（R7/R6）：登录用户可见——会话列表/新建/删除 + 当前会话文件上传下载。
 * 数据全部来自 /v1/sessions*（subject 隔离由后端保证）；未登录不渲染。
 */

import { FileDown, FileUp, MessageSquare, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  deleteSessionFile,
  downloadSessionFile,
  uploadSessionFile,
  useCreateSession,
  useDeleteSession,
  useSessionFiles,
  useSessions,
} from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useT } from '@/lib/i18n';
import { getPortalUser } from '@/lib/portal';
import { cn } from '@/lib/utils';

interface Props {
  activeSessionId: string | null;
  onSelect: (sessionId: string, title: string) => void;
  onClose: () => void;
}

export function SessionSidebar({ activeSessionId, onSelect, onClose }: Props) {
  const t = useT();
  const user = getPortalUser();
  const sessionsQuery = useSessions();
  const filesQuery = useSessionFiles(activeSessionId);
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

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
    <aside className="flex w-64 shrink-0 flex-col border-r bg-card/40" data-testid="portal-session-sidebar">
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="truncate text-sm font-medium">
          {user?.display_name ?? user?.username ?? ''}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8"
          aria-label={t('portal.closeSidebar')}
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={createSession.isPending}
          onClick={() => createSession.mutate({ title: t('portal.untitledSession') })}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t('portal.newSession')}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="space-y-0.5 p-2">
          {sessionsQuery.isLoading && (
            <p className="px-2 py-1 text-sm text-muted-foreground">{t('common.loading')}</p>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm',
                session.id === activeSessionId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
            >
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
                  if (session.id === activeSessionId) onSelect(session.id, session.title ?? ''); // 删除当前会话由父层重置
                  deleteSession.mutate(session.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
          {!sessionsQuery.isLoading && sessions.length === 0 && (
            <p className="px-2 py-1 text-sm text-muted-foreground">{t('portal.noSessions')}</p>
          )}
        </nav>
      </ScrollArea>

      {activeSessionId !== null && (
        <div className="border-t p-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">{t('portal.files')}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={activeSessionId === null}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="mr-1 h-3.5 w-3.5" />
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
          {fileError !== null && <p className="px-1 text-xs text-destructive">{fileError}</p>}
          <ul className="max-h-32 space-y-0.5 overflow-y-auto">
            {files.map((file) => (
              <li key={file.id} className="group flex items-center gap-1 rounded px-1 py-0.5 text-xs">
                <span className="min-w-0 flex-1 truncate" title={file.filename}>
                  {file.filename}
                </span>
                <button
                  type="button"
                  aria-label={t('portal.download')}
                  onClick={() => void downloadSessionFile(file.session_id, file.id)}
                >
                  <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  aria-label={t('portal.deleteFile')}
                  onClick={() => void deleteSessionFile(file.session_id, file.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
