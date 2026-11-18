/**
 * Run SSE 流渲染器（调试台 / Prompt 调试共用）：
 * token 打字机、tool.started/finished 条目、model.fallback 提示条、
 * run.completed 汇总卡（取 GET /v1/runs/{id} 的实际模型/用量/费用）、失败/取消错误卡。
 */

import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, Wrench, XCircle } from 'lucide-react';
import { useMemo } from 'react';

import { useRun } from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import { formatDurationMs } from '@/lib/format';
import type { RunStreamStatus, SseEvent } from '@/lib/sse';
import { cn } from '@/lib/utils';

import { asRecord, reduceRunEvents, type ToolCallEntry } from './run-events';

function ToolEntryRow({ entry }: { entry: ToolCallEntry }) {
  const t = useT();
  const icon =
    entry.status === 'running' ? (
      <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
    ) : entry.status === 'done' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2" data-testid="tool-entry">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono font-medium">{entry.tool}</span>
        <span className="text-xs text-muted-foreground">
          {entry.status === 'running'
            ? t('stream.toolRunning')
            : entry.status === 'done'
              ? `${t('stream.toolDonePrefix')}${formatDurationMs(entry.durationMs)}`
              : t('stream.toolFailed')}
        </span>
      </div>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-muted-foreground">{t('stream.argsResult')}</summary>
        <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono">
          {JSON.stringify({ args: entry.args, result: entry.result, error: entry.error }, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function FallbackBanner({ data }: { data: Record<string, unknown> }) {
  const t = useT();
  const from = data.from_profile ?? data.from_model ?? data.from;
  const to = data.to_profile ?? data.to_model ?? data.to;
  const reason = data.reason;
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
      data-testid="fallback-banner"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        {t('stream.fallback')}
        {from !== undefined || to !== undefined
          ? `：${String(from ?? '?')} → ${String(to ?? '?')}`
          : ''}
        {typeof reason === 'string' ? `（${reason}）` : ''}
      </span>
    </div>
  );
}

const NOTICE_KEYS: Record<string, string> = {
  budget_warning: 'notice.budget_warning',
  budget_exceeded: 'notice.budget_exceeded',
  tool_approval_requested: 'notice.tool_approval_requested',
  tool_approval_resolved: 'notice.tool_approval_resolved',
};

/** run.completed 汇总卡：实际模型 / 输入输出 token / 费用 / 结束原因（数据取 Run 记录） */
function RunSummaryCard({ runId, endReason }: { runId: string; endReason: string | null }) {
  const t = useT();
  const runQuery = useRun(runId);
  const run = runQuery.data;
  return (
    <Card className="border-emerald-500/40" data-testid="run-summary">
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 p-3 text-xs sm:grid-cols-5">
        <div>
          <div className="text-muted-foreground">{t('summary.model')}</div>
          <div className="font-mono font-medium">{run?.model_key ?? '…'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('summary.inputTokens')}</div>
          <div className="font-mono font-medium">{run?.token_usage?.input_tokens ?? '…'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('summary.outputTokens')}</div>
          <div className="font-mono font-medium">{run?.token_usage?.output_tokens ?? '…'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('summary.cost')}</div>
          <div className="font-mono font-medium">{run ? `¥${run.cost.toFixed(4)}` : '…'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('summary.endReason')}</div>
          <div className="font-mono font-medium">{run?.end_reason ?? endReason ?? '…'}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export interface RunStreamViewProps {
  events: SseEvent[];
  status: RunStreamStatus;
  error: string | null;
  /** 终态后是否拉取 Run 记录渲染汇总卡（默认开） */
  showSummary?: boolean;
}

export function RunStreamView({ events, status, error, showSummary = true }: RunStreamViewProps) {
  const t = useT();
  const reduced = useMemo(() => reduceRunEvents(events), [events]);
  const streaming = status === 'streaming';

  return (
    <div className="space-y-2" data-testid="run-stream-view">
      {reduced.text !== '' && (
        <div className="whitespace-pre-wrap rounded-md border bg-card px-3 py-2 text-sm leading-6">
          {reduced.text}
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary/70 align-text-bottom" />
          )}
        </div>
      )}

      {reduced.tools.map((entry) => (
        <ToolEntryRow key={entry.id} entry={entry} />
      ))}

      {reduced.fallbacks.map((data, index) => (
        <FallbackBanner key={index} data={data} />
      ))}

      {reduced.notices.map((notice, index) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <Badge
            variant="outline"
            className="border-orange-500/50 text-orange-600 dark:text-orange-400"
          >
            {NOTICE_KEYS[notice.type] ? t(NOTICE_KEYS[notice.type]) : notice.type}
          </Badge>
          <span className="font-mono text-muted-foreground">
            {JSON.stringify(asRecord(notice.data))}
          </span>
        </div>
      ))}

      {reduced.failure && (
        <Card className="border-red-500/50" data-testid="run-error-card">
          <CardContent className="flex items-start gap-2 p-3 text-sm">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <div className="font-mono text-xs text-red-500">{reduced.failure.code}</div>
              <div>{reduced.failure.message ?? t('stream.runFailed')}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {reduced.cancelled && (
        <Card className="border-muted" data-testid="run-cancelled-card">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <CircleSlash className="h-4 w-4" />
            {t('stream.cancelled')}
          </CardContent>
        </Card>
      )}

      {status === 'error' && error !== null && (
        <Card className="border-red-500/50" data-testid="run-error-card">
          <CardContent className="flex items-start gap-2 p-3 text-sm">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>{error}</div>
          </CardContent>
        </Card>
      )}

      {showSummary &&
        reduced.finished &&
        !reduced.cancelled &&
        !reduced.failure &&
        reduced.runId !== null && (
          <RunSummaryCard runId={reduced.runId} endReason={reduced.endReason} />
        )}

      {streaming && events.length === 0 && (
        <div className={cn('flex items-center gap-2 text-sm text-muted-foreground')}>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('stream.waitingModel')}
        </div>
      )}
    </div>
  );
}
