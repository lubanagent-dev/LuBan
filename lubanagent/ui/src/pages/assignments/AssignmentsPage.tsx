/**
 * /assignments 分配与配额管理页（R8）：给用户/角色授权资源（view/use/manage）+
 * 配置主体配额（token/费用/并发）。权限裁决以后端为准（security:manage），UI 只是体验层。
 */

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  useAssignments,
  useDeleteQuota,
  useGrantAssignment,
  useQuota,
  useRevokeAssignment,
  useSetQuota,
} from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
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

const RESOURCE_TYPES = ['agent', 'knowledge', 'skill', 'mcp', 'tool', 'prompt'] as const;
const GRANTEE_TYPES = ['user', 'role'] as const;
const PERMS = ['view', 'use', 'manage'] as const;

export default function AssignmentsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6">
      <AssignmentSection />
      <QuotaSection />
    </div>
  );
}

function AssignmentSection() {
  const t = useT();
  const assignmentsQuery = useAssignments();
  const grant = useGrantAssignment();
  const revoke = useRevokeAssignment();
  const [form, setForm] = useState({
    resource_type: 'knowledge',
    resource_id: '',
    grantee_type: 'user',
    grantee_id: '',
    perm: 'use',
  });
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (form.resource_id.trim() === '' || form.grantee_id.trim() === '' || grant.isPending) return;
    setError(null);
    grant.mutate(
      {
        resource_type: form.resource_type as (typeof RESOURCE_TYPES)[number],
        resource_id: form.resource_id.trim(),
        grantee_type: form.grantee_type as (typeof GRANTEE_TYPES)[number],
        grantee_id: form.grantee_id.trim(),
        perm: form.perm as (typeof PERMS)[number],
      },
      { onError: (exc) => setError(exc instanceof ApiError ? exc.message : t('api.assignFailed')) },
    );
  };

  return (
    <section data-testid="assignments-section">
      <h2 className="mb-4 text-lg font-semibold">{t('assignments.title')}</h2>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={form.resource_type}
          onValueChange={(value) => setForm((f) => ({ ...f, resource_type: value }))}
        >
          <SelectTrigger className="w-36" aria-label={t('assignments.resourceType')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_TYPES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-44"
          value={form.resource_id}
          onChange={(event) => setForm((f) => ({ ...f, resource_id: event.target.value }))}
          placeholder={t('assignments.resourceId')}
          aria-label={t('assignments.resourceId')}
        />
        <Select
          value={form.grantee_type}
          onValueChange={(value) => setForm((f) => ({ ...f, grantee_type: value }))}
        >
          <SelectTrigger className="w-28" aria-label={t('assignments.granteeType')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRANTEE_TYPES.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`assignments.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-52"
          value={form.grantee_id}
          onChange={(event) => setForm((f) => ({ ...f, grantee_id: event.target.value }))}
          placeholder={t('assignments.granteeId')}
          aria-label={t('assignments.granteeId')}
        />
        <Select value={form.perm} onValueChange={(value) => setForm((f) => ({ ...f, perm: value }))}>
          <SelectTrigger className="w-28" aria-label={t('assignments.perm')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERMS.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={submit} disabled={grant.isPending}>
          {grant.isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1 h-4 w-4" />
          )}
          {t('assignments.grant')}
        </Button>
      </div>
      {error !== null && <p className="mb-2 text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('assignments.resource')}</TableHead>
            <TableHead>{t('assignments.grantee')}</TableHead>
            <TableHead>{t('assignments.perm')}</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(assignmentsQuery.data ?? []).map((item) => (
            <TableRow key={item.id} data-testid="assignment-row">
              <TableCell className="font-mono text-xs">
                {item.resource_type}:{item.resource_id}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {item.grantee_type}:{item.grantee_id}
              </TableCell>
              <TableCell>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{item.perm}</span>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={t('assignments.revoke')}
                  disabled={revoke.isPending}
                  onClick={() =>
                    revoke.mutate({
                      resource_type: item.resource_type as 'agent',
                      resource_id: item.resource_id,
                      grantee_type: item.grantee_type as 'user',
                      grantee_id: item.grantee_id,
                      perm: item.perm as 'view',
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {(assignmentsQuery.data ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                {t('assignments.empty')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}

function QuotaSection() {
  const t = useT();
  const [scope, setScope] = useState<'user' | 'role'>('user');
  const [scopeId, setScopeId] = useState('');
  const quotaQuery = useQuota(scope, scopeId);
  const setQuota = useSetQuota();
  const deleteQuota = useDeleteQuota();
  const [limits, setLimits] = useState({ maxTokens: '', maxCost: '', maxConcurrent: '', window: 'total' });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = () => {
    if (scopeId.trim() === '' || setQuota.isPending) return;
    setError(null);
    setSaved(false);
    setQuota.mutate(
      {
        scope,
        scopeId: scopeId.trim(),
        body: {
          max_tokens: limits.maxTokens === '' ? null : Number(limits.maxTokens),
          max_cost: limits.maxCost === '' ? null : limits.maxCost,
          max_concurrent_runs: limits.maxConcurrent === '' ? null : Number(limits.maxConcurrent),
          window: limits.window as 'total',
        },
      },
      {
        onSuccess: () => setSaved(true),
        onError: (exc) => setError(exc instanceof ApiError ? exc.message : t('api.requestFailed')),
      },
    );
  };

  const quota = quotaQuery.data ?? null;

  return (
    <section data-testid="quota-section">
      <h2 className="mb-4 text-lg font-semibold">{t('quota.title')}</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={scope} onValueChange={(value) => setScope(value as 'user')}>
          <SelectTrigger className="w-28" aria-label={t('assignments.granteeType')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">{t('assignments.user')}</SelectItem>
            <SelectItem value="role">{t('assignments.role')}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="w-56"
          value={scopeId}
          onChange={(event) => {
            setScopeId(event.target.value);
            setSaved(false);
          }}
          placeholder={t('quota.subjectId')}
          aria-label={t('quota.subjectId')}
        />
      </div>

      {scopeId.trim() !== '' && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-40"
              value={limits.maxTokens}
              onChange={(event) => setLimits((l) => ({ ...l, maxTokens: event.target.value }))}
              placeholder={t('quota.maxTokens')}
              aria-label={t('quota.maxTokens')}
              inputMode="numeric"
            />
            <Input
              className="w-40"
              value={limits.maxCost}
              onChange={(event) => setLimits((l) => ({ ...l, maxCost: event.target.value }))}
              placeholder={t('quota.maxCost')}
              aria-label={t('quota.maxCost')}
              inputMode="decimal"
            />
            <Input
              className="w-44"
              value={limits.maxConcurrent}
              onChange={(event) => setLimits((l) => ({ ...l, maxConcurrent: event.target.value }))}
              placeholder={t('quota.maxConcurrent')}
              aria-label={t('quota.maxConcurrent')}
              inputMode="numeric"
            />
            <Select
              value={limits.window}
              onValueChange={(value) => setLimits((l) => ({ ...l, window: value }))}
            >
              <SelectTrigger className="w-32" aria-label={t('quota.window')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t('quota.day')}</SelectItem>
                <SelectItem value="month">{t('quota.month')}</SelectItem>
                <SelectItem value="total">{t('quota.total')}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={submit} disabled={setQuota.isPending}>
              {setQuota.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t('quota.save')}
            </Button>
            {quota !== null && (
              <Button
                variant="outline"
                size="sm"
                disabled={deleteQuota.isPending}
                onClick={() => deleteQuota.mutate({ scope, scopeId: scopeId.trim() })}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {t('quota.remove')}
              </Button>
            )}
          </div>
          {quota !== null && (
            <p className="text-xs text-muted-foreground" data-testid="quota-current">
              {t('quota.current')}: {t('quota.maxTokens')}={quota.max_tokens ?? '∞'} ·{' '}
              {t('quota.maxCost')}={quota.max_cost ?? '∞'} · {t('quota.maxConcurrent')}=
              {quota.max_concurrent_runs ?? '∞'} · {t('quota.window')}={quota.window}
            </p>
          )}
          {saved && <p className="text-xs text-green-600">{t('quota.saved')}</p>}
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}
