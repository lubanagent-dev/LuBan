/** 日志排查：Run Tab 按执行链筛选；日志 Tab 额外支持请求 ID、时间范围和关键字。 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDiagnosticRuns, useLogs, type LogEntry } from '@/api/diagnostics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';

import { RunStatusBadge } from '@/pages/traces/TracesPage';

const EMPTY_FILTER = {
  session_id: '',
  run_id: '',
  trace_id: '',
  user_id: '',
  status: 'all',
  request_id: '',
  logger: '',
  q: '',
  level: 'all',
  from_time: '',
  to_time: '',
};

/** HTTP 访问流水（请求开始/结束）默认排除：量大且对排查价值低，可一键关掉。 */
const HTTP_NOISE_LOGGER = 'lubanagent.api.requests';

const LEVEL_CLASS: Record<LogEntry['level'], string> = {
  DEBUG: 'text-slate-500',
  INFO: 'text-emerald-500',
  WARNING: 'text-amber-500',
  ERROR: 'text-red-500',
  CRITICAL: 'text-red-600',
};

function short(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length > 16 ? `${value.slice(0, 14)}…` : value;
}

/** datetime-local 是本地无时区表示；后端 from_time/to_time 需要 ISO datetime。 */
function toIso(value: string): string | undefined {
  if (value === '') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function DiagnosticsPage() {
  const navigate = useNavigate();
  const t = useT();
  const [draft, setDraft] = useState(EMPTY_FILTER);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [activeTab, setActiveTab] = useState<'runs' | 'logs'>('runs');
  const [runPage, setRunPage] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [timeError, setTimeError] = useState('');
  const [hideHttpNoise, setHideHttpNoise] = useState(true);
  const pageSize = 20;

  const { session_id, run_id, trace_id, user_id, status, request_id, logger, q } = filter;
  const fromTime = toIso(filter.from_time);
  const toTime = toIso(filter.to_time);
  const runsQuery = useDiagnosticRuns({
    session_id,
    run_id,
    trace_id,
    user_id,
    status: status === 'all' ? undefined : status,
    limit: pageSize,
    offset: runPage * pageSize,
  });
  const logsQuery = useLogs({
    session_id,
    run_id,
    trace_id,
    request_id,
    logger,
    q,
    level: filter.level === 'all' ? undefined : filter.level,
    from_time: fromTime,
    to_time: toTime,
    exclude_logger: hideHttpNoise ? HTTP_NOISE_LOGGER : undefined,
    limit: pageSize,
    offset: logPage * pageSize,
  });

  const activeTotal = activeTab === 'runs' ? runsQuery.data?.total : logsQuery.data?.total;
  const activePage = activeTab === 'runs' ? runPage : logPage;
  const activeHasPrevious = activePage > 0;
  const activeHasNext = activeTotal !== undefined && (activePage + 1) * pageSize < activeTotal;

  function update(field: keyof typeof EMPTY_FILTER, value: string): void {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function normalizedDraftTime(name: 'from_time' | 'to_time'): string | undefined {
    const raw = draft[name];
    if (raw === '') return undefined;
    const iso = toIso(raw);
    if (!iso) throw new Error(t('diag.error.timeFormat'));
    return iso;
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold">{t('diag.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('diag.subtitle')}</p>
      </header>

      <form
        className="grid gap-3 rounded-md border bg-card/40 p-3 md:grid-cols-3 xl:grid-cols-7"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const from = normalizedDraftTime('from_time');
            const to = normalizedDraftTime('to_time');
            if (from && to && new Date(from) > new Date(to)) {
              setTimeError(t('diag.error.timeRange'));
              return;
            }
            setTimeError('');
          } catch {
            setTimeError(t('diag.error.timeFormat'));
            return;
          }
          setRunPage(0);
          setLogPage(0);
          setFilter(draft);
        }}
      >
        {(
          [
            ['session_id', t('diag.filter.session')],
            ['run_id', t('diag.filter.run')],
            ['trace_id', t('diag.filter.trace')],
            ['request_id', t('diag.filter.request')],
            ['logger', t('diag.filter.logger')],
            ['q', t('diag.filter.q')],
          ] as const
        ).map(([name, label]) => (
          <div key={name} className="space-y-1">
            <Label htmlFor={`diag-${name}`}>{label}</Label>
            <Input
              id={`diag-${name}`}
              value={draft[name]}
              onChange={(event) => update(name, event.target.value)}
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="diag-user_id">{t('diag.filter.user')}</Label>
          <Input
            id="diag-user_id"
            value={draft.user_id}
            onChange={(event) => update('user_id', event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>{t('diag.filter.status')}</Label>
          <Select value={draft.status} onValueChange={(value) => update('status', value)}>
            <SelectTrigger aria-label={t('diag.filter.statusAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('diag.filter.allStatuses')}</SelectItem>
              {(
                [
                  'pending',
                  'running',
                  'waiting_approval',
                  'completed',
                  'failed',
                  'cancelled',
                ] as const
              ).map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('diag.filter.level')}</Label>
          <Select value={draft.level} onValueChange={(value) => update('level', value)}>
            <SelectTrigger aria-label={t('diag.filter.levelAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('diag.filter.all')}</SelectItem>
              {(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const).map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="diag-from_time">{t('diag.filter.from')}</Label>
          <Input
            id="diag-from_time"
            type="datetime-local"
            value={draft.from_time}
            onChange={(event) => update('from_time', event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="diag-to_time">{t('diag.filter.to')}</Label>
          <Input
            id="diag-to_time"
            type="datetime-local"
            value={draft.to_time}
            onChange={(event) => update('to_time', event.target.value)}
          />
        </div>
        <div className="flex items-end md:col-span-3 xl:col-span-7">
          <div className="w-full space-y-2">
            {timeError && <p className="text-sm text-red-500">{timeError}</p>}
            <Button type="submit">{t('diag.query')}</Button>
          </div>
        </div>
      </form>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'runs' | 'logs')}>
        <TabsList>
          <TabsTrigger value="runs">
            {t('diag.tabRuns').replace('{n}', String(runsQuery.data?.total ?? 0))}
          </TabsTrigger>
          <TabsTrigger value="logs">
            {t('diag.tabLogs').replace('{n}', String(logsQuery.data?.total ?? 0))}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="runs" className="space-y-3">
          {runsQuery.isError && (
            <div className="rounded border border-red-500/50 p-3 text-sm text-red-500">
              {t('diag.loadFailedPrefix')}
              {runsQuery.error.message}
            </div>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('diag.col.runTrace')}</TableHead>
                  <TableHead>{t('diag.col.session')}</TableHead>
                  <TableHead>{t('diag.col.input')}</TableHead>
                  <TableHead>{t('diag.col.status')}</TableHead>
                  <TableHead>{t('diag.col.parent')}</TableHead>
                  <TableHead>{t('diag.col.time')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runsQuery.data?.items ?? []).map((run) => (
                  <TableRow
                    key={run.id}
                    className="cursor-pointer"
                    data-testid={`diagnostic-run-${run.id}`}
                    onClick={() => navigate(`/diagnostics/${encodeURIComponent(run.id)}`)}
                  >
                    <TableCell className="font-mono text-xs">{short(run.id)}</TableCell>
                    <TableCell className="font-mono text-xs" title={run.session_id ?? ''}>
                      {short(run.session_id)}
                    </TableCell>
                    <TableCell className="max-w-80 truncate">
                      {String((run.input as { user_input?: string } | null)?.user_input ?? '—')}
                    </TableCell>
                    <TableCell>
                      <RunStatusBadge status={run.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs" title={run.parent_run_id ?? ''}>
                      {short(run.parent_run_id)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(run.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {runsQuery.isSuccess && runsQuery.data.items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {t('diag.noRuns')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="logs" className="space-y-3">
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              data-testid="diag-hide-http-noise"
              checked={hideHttpNoise}
              onChange={(event) => {
                setHideHttpNoise(event.target.checked);
                setLogPage(0);
              }}
            />
            {t('diag.hideHttpNoise')}
          </label>
          {logsQuery.data && (logsQuery.data.dropped_count || logsQuery.data.write_failures) ? (
            <p className="text-xs text-amber-500">
              {t('diag.droppedNotice')
                .replace('{dropped}', String(logsQuery.data.dropped_count ?? 0))
                .replace('{failed}', String(logsQuery.data.write_failures ?? 0))}
            </p>
          ) : null}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('diag.col.time')}</TableHead>
                  <TableHead>{t('diag.col.level')}</TableHead>
                  <TableHead>{t('diag.filter.logger')}</TableHead>
                  <TableHead>{t('diag.col.message')}</TableHead>
                  <TableHead>{t('diag.col.exception')}</TableHead>
                  <TableHead>{t('diag.col.related')}</TableHead>
                  <TableHead>{t('diag.col.location')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logsQuery.data?.items ?? []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell className={`font-mono text-xs ${LEVEL_CLASS[log.level]}`}>
                      {log.level}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.logger}</TableCell>
                    <TableCell className="max-w-96 whitespace-pre-wrap break-words">
                      {log.message || '—'}
                    </TableCell>
                    <TableCell className="max-w-96 whitespace-pre-wrap break-words text-[11px] text-red-500">
                      {log.exception ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {short(log.session_id ?? log.run_id ?? log.trace_id ?? log.request_id)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.pathname ? `${log.pathname}:${log.lineno}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {logsQuery.isSuccess && logsQuery.data.items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {t('diag.noLogs')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!activeHasPrevious}
          onClick={() =>
            activeTab === 'runs'
              ? setRunPage((prev) => Math.max(0, prev - 1))
              : setLogPage((prev) => Math.max(0, prev - 1))
          }
        >
          {t('common.prevPage')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t('diag.page').replace('{n}', String(activePage + 1))}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!activeHasNext}
          onClick={() =>
            activeTab === 'runs' ? setRunPage((prev) => prev + 1) : setLogPage((prev) => prev + 1)
          }
        >
          {t('common.nextPage')}
        </Button>
      </div>
    </div>
  );
}
