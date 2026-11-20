/** 一次 Run 的完整排查视图：父子 Run 树、Trace 时间线和关联程序日志。 */

import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useDiagnosticDetail, useDiagnosticRuns, useLogs } from '@/api/diagnostics';

import type { LogEntry } from '@/api/diagnostics';
import { useSessionMessages, type Run, type TraceOut } from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';

import { JsonTree } from '@/pages/traces/json-tree';
import { RunStatusBadge } from '@/pages/traces/TracesPage';
import { TraceTimeline } from '@/pages/traces/trace-timeline';

const LOG_PAGE_SIZE = 50;

/** 展示任意值：null 显示占位，对象走 JSON 树，其余直接展示。 */
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

function short(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length > 16 ? `${value.slice(0, 14)}…` : value;
}

/** Run 树单项：默认展开当前 Run，其余收起；展开后显示输入/输出/Error 全量。 */
function RunTreeItem({ run, isCurrent }: { run: Run; isCurrent: boolean }) {
  const [open, setOpen] = useState(isCurrent);
  const t = useT();
  return (
    <div className="rounded border p-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="w-3 text-muted-foreground">{open ? '▾' : '▸'}</span>
        <span className="font-mono">{run.id}</span>
        <RunStatusBadge status={run.status} />
        {isCurrent && (
          <Badge variant="outline" className="text-[10px]">
            {t('common.current')}
          </Badge>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t pt-2 text-[11px]">
          <div>
            <span className="text-muted-foreground">{t('diagdetail.agentLabel')}</span>
            <span className="font-mono">{run.agent_key}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('diagdetail.parentLabel')}</span>
            <span className="font-mono">{run.parent_run_id ?? 'root'}</span>
          </div>
          <div>
            <div className="text-muted-foreground">{t('diagdetail.fullInput')}</div>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
              {displayValue(run.input)}
            </pre>
          </div>
          <div>
            <div className="text-muted-foreground">{t('diagdetail.fullOutput')}</div>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
              {displayValue(run.output)}
            </pre>
          </div>
          <div>
            <div className="text-muted-foreground">{t('diagdetail.errorLabel')}</div>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-red-500">
              {displayValue(run.error)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** extra 字段：默认收起，点开后用 JSON 树展示，避免撑爆表格。 */
function ExtraTree({ extra }: { extra: Record<string, unknown> }) {
  const t = useT();
  const hasContent = extra && Object.keys(extra).length > 0;
  if (!hasContent) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <details>
      <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
        {t('diagdetail.extraToggle')}
      </summary>
      <div className="mt-1 max-w-72">
        <JsonTree value={extra} />
      </div>
    </details>
  );
}

export default function DiagnosticDetailPage() {
  const { runOrTraceId = '' } = useParams();
  const t = useT();
  const detailQuery = useDiagnosticDetail(runOrTraceId);
  const primary = detailQuery.data?.run ?? null;
  // 详情页默认展示整棵根 Run 的链路；需要聚焦单个子 Run 时由列表筛选进入。
  const rootRunId = detailQuery.data?.runs[0]?.id ?? primary?.id ?? runOrTraceId;
  // 服务端分页：limit=50 + offset，total 直接信任响应，不本地切片——
  // 本地切片在日志总量超过拉取上限时会无提示漏掉后面的记录。
  const [logPageIndex, setLogPageIndex] = useState(0);
  // 切换详情（route id / root run 变化）时回到第一页，避免 offset 落在新链路之外。
  useEffect(() => {
    setLogPageIndex(0);
  }, [runOrTraceId, rootRunId]);
  // root run 未就绪前不查日志，避免用 route id 误查导致结果漂移。
  const logsQuery = useLogs(
    { root_run_id: rootRunId, limit: LOG_PAGE_SIZE, offset: logPageIndex * LOG_PAGE_SIZE },
    { enabled: detailQuery.isSuccess && rootRunId !== '' },
  );
  // 会话聚合（排查入口 = 会话 ID 时看全局）：同会话全部 Run + 完整对话消息。
  const sessionId = primary?.session_id ?? null;
  const sessionRunsQuery = useDiagnosticRuns(
    { session_id: sessionId ?? undefined, limit: 200 },
  );
  const sessionMessagesQuery = useSessionMessages(sessionId);
  const sessionRuns = (sessionRunsQuery.data?.items ?? []).filter(
    (run) => run.parent_run_id === null,
  );
  const sessionMessages = sessionMessagesQuery.data ?? [];

  const totalLogs = logsQuery.data?.total ?? 0;
  const totalLogPages = Math.max(1, Math.ceil(totalLogs / LOG_PAGE_SIZE));
  const safeLogPage = Math.min(logPageIndex + 1, totalLogPages);
  const pageLogs = logsQuery.data?.items ?? [];

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/diagnostics">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('diagdetail.back')}
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">{t('diagdetail.title')}</h1>
        <span className="font-mono text-sm text-muted-foreground">{runOrTraceId}</span>
      </header>

      {detailQuery.isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
      {detailQuery.isError && (
        <div className="rounded border border-red-500/50 p-3 text-sm text-red-500">
          {t('diag.loadFailedPrefix')}
          {detailQuery.error.message}
        </div>
      )}

      {detailQuery.data && (
        <>
          <section className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  {t('diagdetail.currentRun')}
                  {primary && <RunStatusBadge status={primary.status} />}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{t('diagdetail.sessionId')}</div>
                    <div className="break-all font-mono text-xs">{primary?.session_id ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t('diagdetail.user')}</div>
                    <div className="break-all font-mono text-xs">{primary?.user_id ?? '—'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('diagdetail.input')}</div>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                    {String((primary?.input as { user_input?: string } | null)?.user_input ?? '—')}
                  </pre>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t('diagdetail.answer')}</div>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                    {primary?.output ?? '—'}
                  </pre>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('diagdetail.runTree')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {detailQuery.data.runs.map((run) => (
                  <RunTreeItem key={run.id} run={run} isCurrent={run.id === primary?.id} />
                ))}
                <p className="text-xs text-muted-foreground">
                  {t('diagdetail.logCount').replace('{n}', String(detailQuery.data.log_count))}
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-2">
            {sessionId !== null && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {t('diagdetail.sessionContext')
                      .replace('{runs}', String(sessionRuns.length))
                      .replace('{messages}', String(sessionMessages.length))}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('diag.col.runTrace')}</TableHead>
                          <TableHead>{t('diag.col.input')}</TableHead>
                          <TableHead>{t('diag.col.status')}</TableHead>
                          <TableHead>{t('diag.col.time')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessionRuns.map((run) => (
                          <TableRow
                            key={run.id}
                            className={
                              run.id === primary?.id
                                ? 'bg-accent/40'
                                : 'cursor-pointer hover:bg-accent/30'
                            }
                            onClick={() => {
                              if (run.id !== primary?.id) {
                                window.location.assign(
                                  `/diagnostics/${encodeURIComponent(run.id)}`,
                                );
                              }
                            }}
                          >
                            <TableCell className="font-mono text-xs">{short(run.id)}</TableCell>
                            <TableCell className="max-w-80 truncate">
                              {String(
                                (run.input as { user_input?: string } | null)?.user_input ?? '—',
                              )}
                            </TableCell>
                            <TableCell>
                              <RunStatusBadge status={run.status} />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDateTime(run.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {sessionRuns.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                              {t('diagdetail.noSessionRuns')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="max-h-96 space-y-2 overflow-y-auto rounded border bg-muted/20 p-3">
                    {sessionMessages.map((message) => (
                      <div key={message.id} className="space-y-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {message.role}
                        </span>
                        <p className="whitespace-pre-wrap break-words text-xs leading-5">
                          {message.content}
                        </p>
                      </div>
                    ))}
                    {sessionMessages.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t('diagdetail.noSessionMessages')}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <h2 className="text-sm font-medium text-muted-foreground">
              {t('diagdetail.traceTimeline')}
            </h2>
            {detailQuery.data.traces.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('diagdetail.noTrace')}</p>
            ) : (
              detailQuery.data.traces.map((trace) => {
                const traceRun = detailQuery.data?.runs.find(
                  (item) => item.id === trace.trace.run_id,
                );
                const isCurrentTrace = trace.trace.run_id === primary?.id;
                return (
                  <TraceSection
                    key={trace.trace.id}
                    agentKey={traceRun?.agent_key ?? '—'}
                    runId={trace.trace.run_id ?? '—'}
                    traceId={trace.trace.id}
                    isCurrent={isCurrentTrace}
                    defaultOpen={isCurrentTrace}
                    events={trace.events}
                  />
                );
              })
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('diagdetail.relatedLogs')}
            </h2>
            {logsQuery.data && (logsQuery.data.dropped_count || logsQuery.data.write_failures) ? (
              <p className="text-xs text-amber-500">
                {t('diag.droppedNotice')
                  .replace('{dropped}', String(logsQuery.data.dropped_count ?? 0))
                  .replace('{failed}', String(logsQuery.data.write_failures ?? 0))}
              </p>
            ) : null}
            {logsQuery.isError && (
              <div className="rounded border border-red-500/50 p-3 text-sm text-red-500">
                {t('diagdetail.logLoadFailedPrefix')}
                {logsQuery.error.message}
              </div>
            )}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('diag.col.time')}</TableHead>
                    <TableHead>{t('diagdetail.col.levelLogger')}</TableHead>
                    <TableHead>{t('diagdetail.col.source')}</TableHead>
                    <TableHead>{t('diag.col.related')}</TableHead>
                    <TableHead>{t('diag.col.message')}</TableHead>
                    <TableHead>{t('diag.col.exception')}</TableHead>
                    <TableHead>{t('diagdetail.col.extra')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageLogs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                  {logsQuery.isSuccess && totalLogs === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        {t('diagdetail.noLogs')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalLogs > LOG_PAGE_SIZE && (
              <div className="flex items-center justify-end gap-2 text-xs">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safeLogPage <= 1}
                  onClick={() => setLogPageIndex((p) => Math.max(0, p - 1))}
                >
                  {t('common.prevPage')}
                </Button>
                <span className="text-muted-foreground">
                  {t('diagdetail.pageOf')
                    .replace('{page}', String(safeLogPage))
                    .replace('{total}', String(totalLogPages))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safeLogPage >= totalLogPages}
                  onClick={() => setLogPageIndex((p) => Math.min(totalLogPages - 1, p + 1))}
                >
                  {t('common.nextPage')}
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** 单条日志行：消息与异常分列，互不覆盖。 */
function LogRow({ log }: { log: LogEntry }) {
  return (
    <TableRow key={log.id}>
      <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">
        {formatDateTime(log.created_at)}
      </TableCell>
      <TableCell className="font-mono text-[11px]">
        <span className={log.level.toLowerCase() === 'error' ? 'text-red-500' : ''}>
          {log.level}
        </span>
        <span className="text-muted-foreground"> / {log.logger}</span>
      </TableCell>
      <TableCell className="font-mono text-[11px] text-muted-foreground">
        {log.pathname ? `${log.pathname}:${log.lineno}` : '—'}
      </TableCell>
      <TableCell className="font-mono text-[11px]">
        {[log.run_id, log.trace_id, log.request_id].filter(Boolean).join(' / ') || '—'}
      </TableCell>
      <TableCell className="max-w-96 whitespace-pre-wrap break-words text-[11px]">
        {log.message || '—'}
      </TableCell>
      <TableCell className="max-w-96 whitespace-pre-wrap break-words text-[11px] text-red-500">
        {log.exception ?? '—'}
      </TableCell>
      <TableCell>
        <ExtraTree extra={log.extra} />
      </TableCell>
    </TableRow>
  );
}

interface TraceSectionProps {
  agentKey: string;
  runId: string;
  traceId: string;
  isCurrent: boolean;
  defaultOpen: boolean;
  events: TraceOut['events'];
}

/** 单个 Trace 分组：默认只展开当前 Run 的 Trace。 */
function TraceSection({
  agentKey,
  runId,
  traceId,
  isCurrent,
  defaultOpen,
  events,
}: TraceSectionProps) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border p-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="w-3 text-muted-foreground">{open ? '▾' : '▸'}</span>
        <span className="font-mono">
          Agent {agentKey} / Run {runId} / Trace {traceId}
        </span>
        {isCurrent && (
          <Badge variant="outline" className="text-[10px]">
            {t('common.current')}
          </Badge>
        )}
      </button>
      {open && (
        <div className="mt-2 border-t pt-2">
          <TraceTimeline events={events} />
        </div>
      )}
    </div>
  );
}
