/**
 * 版本侧栏：列出 v1..当前版（倒序），标注"当前版"；
 * 点击任意版本经 GET /v1/agents/{key}/versions/{v} 拉取不可变快照，只读展示。
 */

import { X } from 'lucide-react';

import { useAgentVersion } from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

import { statusLabel } from '../lib/agent-form';

interface VersionSidebarProps {
  agentKey: string;
  currentVersion: number;
  viewing: number | null;
  onView: (version: number | null) => void;
}

export function VersionSidebar({ agentKey, currentVersion, viewing, onView }: VersionSidebarProps) {
  const t = useT();
  const versions = Array.from({ length: currentVersion }, (_, i) => currentVersion - i);

  return (
    <aside className="flex w-76 shrink-0 flex-col border-l border-border/70 bg-card/50">
      <div className="border-b border-border/70 px-4 py-3.5">
        <h2 className="text-base font-semibold">{t('versions.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('versions.subtitle')}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-border/70 p-3.5">
        {versions.map((version) => (
          <button
            key={version}
            type="button"
            onClick={() => onView(version === viewing ? null : version)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs transition-all',
              viewing === version
                ? 'border-primary bg-primary/10 font-semibold text-primary shadow-sm'
                : 'border-border/70 bg-background/60 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            v{version}
            {version === currentVersion && (
              <Badge variant="secondary" className="px-1 py-0 text-xs">
                {t('versions.current')}
              </Badge>
            )}
          </button>
        ))}
      </div>
      {viewing !== null && viewing <= currentVersion ? (
        <VersionViewer agentKey={agentKey} version={viewing} onClose={() => onView(null)} />
      ) : (
        <p className="p-4 text-xs text-muted-foreground">{t('versions.viewHint')}</p>
      )}
    </aside>
  );
}

function VersionViewer({
  agentKey,
  version,
  onClose,
}: {
  agentKey: string;
  version: number;
  onClose: () => void;
}) {
  const t = useT();
  const query = useAgentVersion(agentKey, version);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="font-mono text-xs font-semibold">
          v{version}
          {t('versions.readonlySuffix')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('versions.closeSnapshot')}
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4 text-xs">
          {query.isLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}
          {query.error && <p className="text-destructive">{query.error.message}</p>}
          {query.data && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {statusLabel(query.data.status, t) ?? query.data.status}
                </Badge>
                <span className="text-muted-foreground">
                  {formatDateTime(query.data.published_at)}
                </span>
              </div>
              <div>
                <p className="mb-1 font-medium text-muted-foreground">{t('versions.name')}</p>
                <p>{query.data.definition.name}</p>
              </div>
              <div>
                <p className="mb-1 font-medium text-muted-foreground">{t('versions.instructions')}</p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-2 font-mono">
                  {query.data.definition.instructions || t('form.empty')}
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium text-muted-foreground">
                  {t('versions.fullDefinition')}
                </p>
                <pre className="overflow-x-auto rounded-md border bg-muted/30 p-2 font-mono leading-relaxed">
                  {JSON.stringify(query.data.definition, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
