/**
 * 主体配额页：为用户或角色设置 token / 费用 / 并发用量上限。
 * 下拉直接读取真实用户与角色，不再手填主体 ID。权限裁决以后端为准。
 */

import { Loader2, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useDeleteQuota, useQuota, useSetQuota } from '@/api/hooks';
import { useRoles, useUsers } from '@/api/access';
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
import { useT } from '@/lib/i18n';

interface Option {
  id: string;
  label: string;
}

export default function QuotasPage() {
  const t = useT();
  const usersQuery = useUsers();
  const rolesQuery = useRoles();
  const [scope, setScope] = useState<'user' | 'role'>('user');
  const [scopeId, setScopeId] = useState('');
  const quotaQuery = useQuota(scope, scopeId);
  const setQuota = useSetQuota();
  const deleteQuota = useDeleteQuota();
  const [limits, setLimits] = useState({ maxTokens: '', maxCost: '', maxConcurrent: '', window: 'total' });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const subjectOptions: Option[] = useMemo(() => {
    if (scope === 'user') {
      return (usersQuery.data ?? []).map((u) => ({
        id: u.username,
        label: `${u.display_name} (${u.username})`,
      }));
    }
    return (rolesQuery.data ?? []).map((r) => ({ id: r.key, label: r.name }));
  }, [scope, usersQuery.data, rolesQuery.data]);
  const effectiveScopeId = subjectOptions.some((o) => o.id === scopeId)
    ? scopeId
    : (subjectOptions[0]?.id ?? '');

  const submit = () => {
    if (effectiveScopeId.trim() === '' || setQuota.isPending) return;
    setError(null);
    setSaved(false);
    setQuota.mutate(
      {
        scope,
        scopeId: effectiveScopeId.trim(),
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
      <h2 className="mb-1 text-lg font-semibold">{t('quota.title')}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t('quota.desc')}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={scope}
          onValueChange={(value) => {
            setScope(value as 'user' | 'role');
            setScopeId('');
            setSaved(false);
          }}
        >
          <SelectTrigger className="w-24" aria-label={t('assignments.granteeType')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">{t('assignments.user')}</SelectItem>
            <SelectItem value="role">{t('assignments.role')}</SelectItem>
          </SelectContent>
        </Select>
        {subjectOptions.length > 0 ? (
          <Select
            value={effectiveScopeId}
            onValueChange={(value) => {
              setScopeId(value);
              setSaved(false);
            }}
          >
            <SelectTrigger className="w-56" aria-label={t('quota.subjectId')}>
              <SelectValue placeholder={t('assignments.pickGrantee')} />
            </SelectTrigger>
            <SelectContent>
              {subjectOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
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
        )}
      </div>

      {effectiveScopeId.trim() !== '' && (
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
                onClick={() => deleteQuota.mutate({ scope, scopeId: effectiveScopeId.trim() })}
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
