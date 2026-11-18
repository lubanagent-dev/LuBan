/**
 * /audit-events 审计事件页（R9）：登录/授权/配额/审批/文件操作留痕查询。
 * 只读；权限 audit:read（审计员/管理员），后端逐请求裁决。
 */

import { useState } from 'react';

import { useAuditEvents } from '@/api/hooks';
import { Input } from '@/components/ui/input';
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
import { useT } from '@/lib/i18n';

const EVENT_TYPES = [
  'portal.login',
  'portal.login_failed',
  'portal.register',
  'assignment.grant',
  'assignment.revoke',
  'quota.set',
  'quota.delete',
  'approval.decision',
  'session.file_upload',
  'session.file_delete',
  'session.delete',
] as const;

export default function AuditEventsPage() {
  const t = useT();
  const [eventType, setEventType] = useState<string>('all');
  const [outcome, setOutcome] = useState<string>('all');
  const [actor, setActor] = useState('');
  const eventsQuery = useAuditEvents({
    event_type: eventType === 'all' ? undefined : eventType,
    outcome: outcome === 'all' ? undefined : outcome,
    actor: actor.trim() === '' ? undefined : actor.trim(),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6" data-testid="audit-events-page">
      <h1 className="text-lg font-semibold">{t('audit.title')}</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="w-56" aria-label={t('audit.eventType')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('audit.allTypes')}</SelectItem>
            {EVENT_TYPES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger className="w-36" aria-label={t('audit.outcome')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('audit.allOutcomes')}</SelectItem>
            <SelectItem value="success">{t('audit.success')}</SelectItem>
            <SelectItem value="denied">{t('audit.denied')}</SelectItem>
            <SelectItem value="error">{t('audit.error')}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="w-64"
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          placeholder={t('audit.actor')}
          aria-label={t('audit.actor')}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('audit.time')}</TableHead>
            <TableHead>{t('audit.eventType')}</TableHead>
            <TableHead>{t('audit.actor')}</TableHead>
            <TableHead>{t('audit.outcome')}</TableHead>
            <TableHead>{t('audit.resource')}</TableHead>
            <TableHead>{t('audit.detail')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(eventsQuery.data ?? []).map((event) => (
            <TableRow key={event.id} data-testid="audit-row">
              <TableCell className="whitespace-nowrap font-mono text-xs">
                {new Date(event.created_at).toLocaleString()}
              </TableCell>
              <TableCell className="font-mono text-xs">{event.event_type}</TableCell>
              <TableCell className="font-mono text-xs">{event.actor}</TableCell>
              <TableCell>
                <span
                  className={
                    'rounded px-1.5 py-0.5 font-mono text-xs ' +
                    (event.outcome === 'success'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-destructive/10 text-destructive')
                  }
                >
                  {event.outcome}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {event.resource_type === null
                  ? '-'
                  : `${event.resource_type}:${event.resource_id ?? ''}`}
              </TableCell>
              <TableCell className="max-w-72 truncate font-mono text-xs">
                {event.detail === null ? '-' : JSON.stringify(event.detail)}
              </TableCell>
            </TableRow>
          ))}
          {(eventsQuery.data ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                {t('audit.empty')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
