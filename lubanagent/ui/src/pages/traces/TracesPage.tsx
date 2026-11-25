/**
 * Trace 列表（/traces）：Run 表（run_id 截断 / 会话 ID / 用户 / agent / 状态徽章 /
 * 实际模型 / total tokens / 耗时 / 结束原因 / 开始时间），agent_key 下拉筛选，
 * 点击行进详情回放。数据：GET /v1/runs（G0 补充端点）+ GET /v1/agents（筛选项）。
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAgents, useRuns, type Run } from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { durationBetween, formatDateTime, formatDurationMs } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

const STATUS_LABEL: Record<Run['status'], string> = {
  pending: 'traces.pending',
  running: 'traces.running',
  waiting_approval: 'traces.waitingApproval',
  completed: 'traces.completed',
  failed: 'traces.failed',
  cancelled: 'traces.cancelled',
};

const STATUS_CLASS: Record<Run['status'], string> = {
  pending: 'border-slate-400/50 text-slate-500',
  running: 'border-blue-500/50 text-blue-500',
  waiting_approval: 'border-cyan-500/50 text-cyan-500',
  completed: 'border-emerald-500/50 text-emerald-500',
  failed: 'border-red-500/50 text-red-500',
  cancelled: 'border-muted-foreground/50 text-muted-foreground',
};

export function RunStatusBadge({ status }: { status: Run['status'] }) {
  const t = useT();
  return (
    <Badge variant="outline" className={cn('font-normal', STATUS_CLASS[status])}>
      {STATUS_LABEL[status] ? t(STATUS_LABEL[status]) : status}
    </Badge>
  );
}

function truncateId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 12)}…` : id;
}

function totalTokens(run: Run): number {
  return (run.token_usage?.input_tokens ?? 0) + (run.token_usage?.output_tokens ?? 0);
}

export default function TracesPage() {
  const t = useT();
  const navigate = useNavigate();
  const [agentFilter, setAgentFilter] = useState('all');
  const agentsQuery = useAgents();
  const runsQuery = useRuns({
    agent_key: agentFilter === 'all' ? undefined : agentFilter,
    limit: 50,
  });

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
        <h1 className="text-xl font-semibold">{t('traces.title')}</h1>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-56" aria-label={t('traces.filterAria')}>
            <SelectValue placeholder={t('traces.allAgents')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('traces.allAgents')}</SelectItem>
            {(agentsQuery.data ?? []).map((agent) => (
              <SelectItem key={agent.key} value={agent.key}>
                {agent.name}（{agent.key}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {runsQuery.data ? t('traces.count').replace('{n}', String(runsQuery.data.length)) : ''}
        </span>
      </header>

      {runsQuery.isError && (
        <div className="rounded-md border border-red-500/50 p-3 text-sm text-red-500">
          {t('traces.loadFailed')}
          {runsQuery.error.message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run ID</TableHead>
              <TableHead>{t('traces.colSession')}</TableHead>
              <TableHead>{t('traces.colUser')}</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>{t('traces.colStatus')}</TableHead>
              <TableHead>{t('traces.colModel')}</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">{t('traces.colDuration')}</TableHead>
              <TableHead>{t('traces.colEndReason')}</TableHead>
              <TableHead>{t('traces.colStarted')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(runsQuery.data ?? []).map((run) => (
              <TableRow
                key={run.id}
                className="cursor-pointer"
                onClick={() => navigate(`/traces/${encodeURIComponent(run.id)}`)}
              >
                <TableCell className="font-mono text-xs" title={run.id}>
                  {truncateId(run.id)}
                </TableCell>
                <TableCell className="font-mono text-xs" title={run.session_id ?? ''}>
                  {run.session_id ? truncateId(run.session_id) : '—'}
                </TableCell>
                <TableCell className="font-mono text-xs" title={run.user_id ?? ''}>
                  {run.user_id ? truncateId(run.user_id) : '—'}
                </TableCell>
                <TableCell className="font-mono text-xs">{run.agent_key}</TableCell>
                <TableCell>
                  <RunStatusBadge status={run.status} />
                </TableCell>
                <TableCell className="font-mono text-xs">{run.model_key ?? '—'}</TableCell>
                <TableCell className="text-right font-mono text-xs">{totalTokens(run)}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatDurationMs(durationBetween(run.started_at, run.ended_at))}
                </TableCell>
                <TableCell className="font-mono text-xs">{run.end_reason ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(run.started_at ?? run.created_at)}
                </TableCell>
              </TableRow>
            ))}
            {runsQuery.isSuccess && runsQuery.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                  {t('traces.empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
