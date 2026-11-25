/**
 * /agents —— Agent 列表页：卡片视图（名称/描述/状态徽章/当前版本/操作）+ 新建入口。
 * 数据：GET /v1/agents；新建：POST /v1/agents（CreateAgentDialog）。
 */

import { Bot, Cpu, MessageSquareCode, Plus, Sparkles, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAgents, type AgentDefinition } from '@/api/hooks';
import { AgentAvatar } from '@/components/agent-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';

import { CreateAgentDialog } from './components/create-agent-dialog';
import { statusLabel } from './lib/agent-form';

function statusVariant(status: AgentDefinition['status']): 'default' | 'secondary' | 'outline' {
  if (status === 'published') return 'default';
  if (status === 'draft') return 'secondary';
  return 'outline';
}

export default function AgentsPage() {
  const { data: agents, isLoading, error } = useAgents();
  const [createOpen, setCreateOpen] = useState(false);
  const t = useT();

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('agents.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('agents.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shadow-sm">
          <Plus className="mr-1.5 h-4 w-4" />
          {t('agents.create')}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error.message}
        </p>
      )}

      {agents && agents.length === 0 && (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-sm text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Bot className="h-6 w-6" />
            </div>
            {t('agents.empty')}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {agents?.map((agent) => (
          <AgentCard key={agent.key} agent={agent} />
        ))}
      </div>

      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentDefinition }) {
  const navigate = useNavigate();
  const t = useT();

  return (
    <Card
      className="group relative flex cursor-pointer flex-col justify-between overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
      onClick={() => navigate(`/agents/${agent.key}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {agent.avatar && agent.show_avatar !== false && (
              <div className="shrink-0 rounded-xl ring-1 ring-border/70">
                <AgentAvatar agent={agent} size={40} />
              </div>
            )}
            <div className="min-w-0">
              <CardTitle className="truncate text-base transition-colors group-hover:text-primary">
                {agent.name}
              </CardTitle>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{agent.key}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant={statusVariant(agent.status)}>
              {statusLabel(agent.status, t) ?? agent.status}
            </Badge>
            <Badge variant="outline" className="font-mono">
              v{agent.version}
            </Badge>
          </div>
        </div>
        <CardDescription className="mt-2 line-clamp-2 min-h-10 leading-relaxed">
          {agent.description || t('agents.noDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between border-t border-border/50 bg-muted/20 pt-3 pb-3.5">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Wrench className="h-3 w-3 opacity-70" />
            {t('agents.toolsCount').replace('{n}', String(agent.tools?.length ?? 0))}
          </span>
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 opacity-70" />
            {t('agents.skillsCount').replace('{n}', String(agent.skills?.length ?? 0))}
          </span>
          <span className="inline-flex items-center gap-1 font-mono">
            <Cpu className="h-3 w-3 opacity-70" />
            brain: {agent.brain?.profile ?? 'smart'}
          </span>
        </div>
        <div className="flex gap-1.5" onClick={(event) => event.stopPropagation()}>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/agents/${agent.key}/debug`}>
              <MessageSquareCode className="mr-1 h-3.5 w-3.5" />
              {t('agents.debug')}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/agents/${agent.key}`}>{t('agents.edit')}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
