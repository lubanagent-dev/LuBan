/**
 * /agents/:key —— Agent 定义编辑器。
 * 分区表单编辑当前定义；保存 = POST /v1/agents/{key}/versions（version+1，不可变快照）；
 * 右侧版本侧栏可查看任意历史版本的只读形态。
 * 当前 Agent 由 :key 路由参数派生 + react-query 缓存共享，无需额外全局 context。
 */

import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAgent, useCreateAgentVersion, type AgentDefinition } from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

import { AgentForm } from './components/agent-form';
import { VersionSidebar } from './components/version-sidebar';
import { normalizeDefinition, statusLabel } from './lib/agent-form';

export default function AgentEditorPage() {
  const { key = '' } = useParams();
  const agentQuery = useAgent(key);
  const saveVersion = useCreateAgentVersion(key);
  const t = useT();

  const [draft, setDraft] = useState<AgentDefinition | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // 先清旧 Agent 的页面状态，再从查询缓存初始化，避免清掉刚回填的草稿。
  useEffect(() => {
    setDraft(null);
    setViewing(null);
    setSavedMessage(null);
  }, [key]);

  // 首次加载（或切换 Agent）时用服务端定义初始化草稿；
  // 保存成功后 draft 以 mutation 返回的快照为准，不被 refetch 覆盖
  useEffect(() => {
    if (!agentQuery.data || agentQuery.data.key !== key) return;
    setDraft((prev) =>
      prev === null || prev.key !== agentQuery.data.key
        ? normalizeDefinition(agentQuery.data)
        : prev,
    );
  }, [key, agentQuery.data]);

  const save = () => {
    if (!draft) return;
    setSavedMessage(null);
    saveVersion.mutate(
      { ...draft, version: draft.version + 1 },
      {
        onSuccess: (snapshot) => {
          setDraft(normalizeDefinition(snapshot.definition));
          setSavedMessage(t('editor.savedVersion').replace('{n}', String(snapshot.version)));
        },
      },
    );
  };

  if (agentQuery.isLoading || draft === null || draft.key !== key) {
    return (
      <div className="space-y-2 p-6 text-sm text-muted-foreground">
        {agentQuery.error ? (
          <>
            <p className="text-destructive">
              {t('editor.loadFailed')}
              {agentQuery.error.message ? `：${agentQuery.error.message}` : ''}
            </p>
            <p className="text-xs">
              {t('editor.loadFailedHint')}
            </p>
            <Button variant="outline" size="sm" onClick={() => agentQuery.refetch()}>
              {t('common.retry')}
            </Button>
          </>
        ) : (
          t('editor.loadingDefinition')
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/80 px-5 py-3.5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">
                {t('editor.titlePrefix')}
                {key}
              </h1>
              <Badge variant="secondary">{statusLabel(draft.status, t) ?? draft.status}</Badge>
              <Badge variant="outline" className="font-mono">
                v{draft.version}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to={`/agents/${key}/debug`}>{t('editor.goDebug')}</Link>
              </Button>
              <Button size="sm" disabled={saveVersion.isPending} onClick={save}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {saveVersion.isPending
                  ? t('editor.saving')
                  : t('editor.saveNewVersion').replace('{n}', String(draft.version + 1))}
              </Button>
            </div>
          </div>

          {savedMessage && (
            <p className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primary">
              {savedMessage}
            </p>
          )}
          {saveVersion.error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {saveVersion.error.message}
            </p>
          )}

          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm">
            <AgentForm draft={draft} onChange={setDraft} />
          </div>
        </div>
      </div>

      <VersionSidebar
        agentKey={key}
        currentVersion={draft.version}
        viewing={viewing}
        onView={setViewing}
      />
    </div>
  );
}
