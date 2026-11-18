/**
 * /agents —— Agent 列表页：卡片视图（名称/描述/状态徽章/当前版本/操作）+ 新建入口。
 * 数据：GET /v1/agents；新建：POST /v1/agents（CreateAgentDialog）。
 */

import { Bot, MessageSquareCode, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAgents, type AgentDefinition } from '@/api/hooks';
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
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('agents.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('agents.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t('agents.create')}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      )}

      {agents && agents.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
            <Bot className="h-8 w-8" />
            {t('agents.empty')}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => navigate(`/agents/${agent.key}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{agent.name}</CardTitle>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{agent.key}</p>
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
        <CardDescription className="line-clamp-2 min-h-8">
          {agent.description || t('agents.noDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between pt-0">
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{t('agents.toolsCount').replace('{n}', String(agent.tools?.length ?? 0))}</span>
          <span>{t('agents.skillsCount').replace('{n}', String(agent.skills?.length ?? 0))}</span>
          <span className="font-mono">brain: {agent.brain?.profile ?? 'smart'}</span>
        </div>
        <div className="flex gap-1" onClick={(event) => event.stopPropagation()}>
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
