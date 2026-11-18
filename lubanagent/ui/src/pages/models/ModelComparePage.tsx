/**
 * /models/compare 模型对比：选一个 Agent + 一段输入 + 两个配置标签（brain profile），
 * 同一输入两次 SSE 试跑并排渲染：输出 / token / 耗时 / 结束原因。
 * 注：v1 runs API 不接受 profile 覆盖，标签仅作本次试跑的标识备注。
 */

import { Play } from 'lucide-react';
import { useEffect, useState } from 'react';

import { API_BASE } from '@/api/client';
import { useAgents, useBrainProfiles, useRun, type BrainProfile, type Run } from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { durationBetween, formatDurationMs } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useRunStream, type RunStream, type SseEvent } from '@/lib/sse';
import { brainProfileOptions, defaultBrainProfile } from '@/pages/agents/lib/agent-form';

function runIdOf(events: SseEvent[]): string {
  for (const event of events) {
    const id = (event.data as { run_id?: unknown })?.run_id;
    if (typeof id === 'string') return id;
  }
  return '';
}

function streamText(events: SseEvent[]): string {
  return events
    .filter((event) => event.event === 'token.delta')
    .map((event) => (event.data as { text?: string }).text ?? '')
    .join('');
}

function toolLines(events: SseEvent[], t: (key: string) => string): string[] {
  return events
    .filter((event) => event.event === 'tool.started' || event.event === 'tool.finished')
    .map((event) => {
      const data = event.data as { tool?: string; duration_ms?: number };
      return event.event === 'tool.started'
        ? t('compare.toolRunning').replace('{tool}', String(data.tool ?? '?'))
        : t('compare.toolDone')
            .replace('{tool}', String(data.tool ?? '?'))
            .replace('{ms}', String(data.duration_ms ?? 0));
    });
}

function ComparePanel({
  label,
  stream,
  run,
}: {
  label: BrainProfile;
  stream: RunStream;
  run: Run | undefined;
}) {
  const t = useT();
  const text = streamText(stream.events);
  const lines = toolLines(stream.events, t);
  const statusText: Record<RunStream['status'], string> = {
    idle: t('compare.statusIdle'),
    streaming: t('compare.statusStreaming'),
    done: t('compare.statusDone'),
    cancelled: t('compare.statusCancelled'),
    error: t('compare.statusError'),
  };
  const completed = stream.events.find((event) => event.event === 'run.completed');
  const endReason =
    run?.end_reason ?? (completed?.data as { end_reason?: string } | undefined)?.end_reason;

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {t('compare.configLabel')} <Badge className="font-mono">{label}</Badge>
          </CardTitle>
          <Badge variant={stream.status === 'done' ? 'default' : 'outline'}>
            {statusText[stream.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="min-h-32 rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
          {text || run?.output || (
            <span className="text-muted-foreground">
              {stream.status === 'idle' ? t('compare.notYetRun') : t('compare.waitingOutput')}
            </span>
          )}
        </div>
        {lines.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {lines.map((line, index) => (
              <li key={index}>· {line}</li>
            ))}
          </ul>
        )}
        {stream.error && <p className="text-sm text-destructive">{stream.error}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-3 text-xs">
          <dt className="text-muted-foreground">{t('compare.endReason')}</dt>
          <dd className="font-mono">{endReason ?? '—'}</dd>
          <dt className="text-muted-foreground">{t('compare.model')}</dt>
          <dd className="font-mono">{run?.model_key ?? '—'}</dd>
          <dt className="text-muted-foreground">{t('compare.tokens')}</dt>
          <dd className="font-mono">
            {run?.token_usage
              ? `${run.token_usage.input_tokens} / ${run.token_usage.output_tokens}`
              : '—'}
          </dd>
          <dt className="text-muted-foreground">{t('compare.duration')}</dt>
          <dd className="font-mono">
            {formatDurationMs(durationBetween(run?.started_at, run?.ended_at))}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

export default function ModelComparePage() {
  const t = useT();
  const agentsQuery = useAgents();
  const profilesQuery = useBrainProfiles();
  const slots = profilesQuery.data?.items ?? [];
  const [agentKey, setAgentKey] = useState('');
  const [input, setInput] = useState('');
  const [labelA, setLabelA] = useState<BrainProfile>('');
  const [labelB, setLabelB] = useState<BrainProfile>('');
  const selectedA = slots.some((slot) => slot.key === labelA) ? labelA : defaultBrainProfile(slots);
  const selectedB = slots.some((slot) => slot.key === labelB)
    ? labelB
    : (slots.find((slot) => slot.key !== selectedA)?.key ?? selectedA);

  const streamA = useRunStream();
  const streamB = useRunStream();
  const [doneIdA, setDoneIdA] = useState('');
  const [doneIdB, setDoneIdB] = useState('');

  useEffect(() => {
    if (streamA.status === 'done') setDoneIdA(runIdOf(streamA.events));
  }, [streamA.status, streamA.events]);
  useEffect(() => {
    if (streamB.status === 'done') setDoneIdB(runIdOf(streamB.events));
  }, [streamB.status, streamB.events]);

  const runA = useRun(doneIdA);
  const runB = useRun(doneIdB);

  const running = streamA.status === 'streaming' || streamB.status === 'streaming';
  const canStart = agentKey !== '' && input.trim() !== '' && !running;

  function handleStart(): void {
    setDoneIdA('');
    setDoneIdB('');
    const url = `${API_BASE}/v1/agents/${agentKey}/runs`;
    const body = { input: input.trim() };
    void streamA.start(url, body);
    void streamB.start(url, body);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t('compare.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('compare.desc')}</p>
      </div>

      <div className="grid gap-3 rounded-md border p-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Agent</p>
          <Select value={agentKey} onValueChange={setAgentKey}>
            <SelectTrigger aria-label={t('compare.agentAria')} className="font-mono text-xs">
              <SelectValue placeholder={t('compare.agentPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {(agentsQuery.data ?? []).map((agent) => (
                <SelectItem key={agent.key} value={agent.key} className="font-mono text-xs">
                  {`${agent.key}（${agent.name}）`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('compare.labelA')}</p>
          <Select value={selectedA} onValueChange={setLabelA}>
            <SelectTrigger aria-label={t('compare.labelA')} className="font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {brainProfileOptions(slots).map((profile) => (
                <SelectItem key={profile.key} value={profile.key} className="text-xs">
                  {profile.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('compare.labelB')}</p>
          <Select value={selectedB} onValueChange={setLabelB}>
            <SelectTrigger aria-label={t('compare.labelB')} className="font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {brainProfileOptions(slots).map((profile) => (
                <SelectItem key={profile.key} value={profile.key} className="text-xs">
                  {profile.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={handleStart} disabled={!canStart}>
            <Play className="mr-1 h-4 w-4" />
            {running ? t('compare.running') : t('compare.start')}
          </Button>
        </div>
        <div className="lg:col-span-4">
          <Textarea
            aria-label={t('compare.inputAria')}
            placeholder={t('compare.inputPlaceholder')}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={2}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t('compare.note')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ComparePanel label={selectedA} stream={streamA} run={runA.data} />
        <ComparePanel label={selectedB} stream={streamB} run={runB.data} />
      </div>
    </div>
  );
}
