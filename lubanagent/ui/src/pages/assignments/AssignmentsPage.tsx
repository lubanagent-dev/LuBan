/**
 * 资源分配页：给用户/角色授予某个具体资源的 view/use/manage 权限。
 * 下拉直接读取真实数据（不再手填 ID），列表显示友好名称并分页。
 * 配额管理拆分到独立页面 /quotas。权限裁决以后端为准，UI 只是体验层。
 */

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  useAgents,
  useAssignments,
  useGrantAssignment,
  useKnowledgeSources,
  usePrompts,
  useRevokeAssignment,
  useSkills,
  useTools,
} from '@/api/hooks';
import { useRoles, useUsers } from '@/api/access';
import { ApiError } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaginationBar, usePaged } from '@/components/ui/pagination';
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
const PERMS = ['view', 'use', 'manage'] as const;

interface Option {
  id: string;
  label: string;
}

/** 列表展示用：把资源 ID 解析成"友好名 (id)"；解析不到时回退原 ID。 */
function resourceLabel(type: string, id: string, options: Record<string, Option[]>): string {
  const hit = options[type]?.find((item) => item.id === id);
  return hit ? hit.label : id;
}

export default function AssignmentsPage() {
  return (
    <div className="space-y-6 p-6">
      <AssignmentSection />
    </div>
  );
}

function AssignmentSection() {
  const t = useT();
  const assignmentsQuery = useAssignments();
  const grant = useGrantAssignment();
  const revoke = useRevokeAssignment();
  const agentsQuery = useAgents();
  const skillsQuery = useSkills();
  const toolsQuery = useTools();
  const promptsQuery = usePrompts();
  const knowledgeQuery = useKnowledgeSources();
  const usersQuery = useUsers();
  const rolesQuery = useRoles();

  const [resourceType, setResourceType] = useState<string>('agent');
  const [resourceId, setResourceId] = useState<string>('');
  const [granteeType, setGranteeType] = useState<'user' | 'role'>('user');
  const [granteeId, setGranteeId] = useState<string>('');
  const [perm, setPerm] = useState<string>('use');
  const [error, setError] = useState<string | null>(null);

  // 各资源类型的真实可选项；mcp 暂无列表接口，保留手填。
  const resourceOptions: Record<string, Option[]> = useMemo(
    () => ({
      agent: (agentsQuery.data ?? []).map((a) => ({ id: a.key, label: `${a.name} (${a.key})` })),
      knowledge: (knowledgeQuery.data ?? []).map((k) => ({ id: k.name, label: k.name })),
      skill: (skillsQuery.data ?? []).map((s) => ({ id: s.key, label: s.name || s.key })),
      mcp: [],
      tool: (toolsQuery.data ?? []).map((tool) => ({ id: tool.key, label: tool.key })),
      prompt: (promptsQuery.data ?? []).map((p) => ({ id: p.key, label: p.name || p.key })),
    }),
    [agentsQuery.data, knowledgeQuery.data, skillsQuery.data, toolsQuery.data, promptsQuery.data],
  );
  const granteeOptions: Option[] = useMemo(() => {
    if (granteeType === 'user') {
      return (usersQuery.data ?? []).map((u) => ({
        id: u.username,
        label: `${u.display_name} (${u.username})`,
      }));
    }
    return (rolesQuery.data ?? []).map((r) => ({ id: r.key, label: r.name }));
  }, [granteeType, usersQuery.data, rolesQuery.data]);

  const options = resourceOptions[resourceType] ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const {
    paged: pagedAssignments,
    page,
    pageSize,
    total,
    totalPages,
    setPage,
  } = usePaged(assignments);
  const effectiveResourceId = resourceId !== '' && options.some((o) => o.id === resourceId)
    ? resourceId
    : (options[0]?.id ?? resourceId);
  const effectiveGranteeId =
    granteeId !== '' && granteeOptions.some((o) => o.id === granteeId)
      ? granteeId
      : (granteeOptions[0]?.id ?? '');

  const submit = () => {
    if (effectiveResourceId.trim() === '' || effectiveGranteeId.trim() === '' || grant.isPending) {
      return;
    }
    setError(null);
    grant.mutate(
      {
        resource_type: resourceType as 'agent',
        resource_id: effectiveResourceId.trim(),
        grantee_type: granteeType,
        grantee_id: effectiveGranteeId.trim(),
        perm: perm as 'view',
      },
      { onError: (exc) => setError(exc instanceof ApiError ? exc.message : t('api.assignFailed')) },
    );
  };

  return (
    <section data-testid="assignments-section" className="space-y-5">
      <div className="border-b border-border/60 pb-4">
        <h1 className="text-xl font-semibold">{t('assignments.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('assignments.desc')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <Select
          value={resourceType}
          onValueChange={(value) => {
            setResourceType(value);
            setResourceId('');
          }}
        >
          <SelectTrigger className="w-32" aria-label={t('assignments.resourceType')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_TYPES.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`assignments.type.${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {options.length > 0 ? (
          <Select value={effectiveResourceId} onValueChange={setResourceId}>
            <SelectTrigger className="w-64" aria-label={t('assignments.resourceId')}>
              <SelectValue placeholder={t('assignments.pickResource')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="w-64"
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
            placeholder={t('assignments.resourceId')}
            aria-label={t('assignments.resourceId')}
          />
        )}
        <Select
          value={granteeType}
          onValueChange={(value) => {
            setGranteeType(value as 'user' | 'role');
            setGranteeId('');
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
        {granteeOptions.length > 0 ? (
          <Select value={effectiveGranteeId} onValueChange={setGranteeId}>
            <SelectTrigger className="w-56" aria-label={t('assignments.granteeId')}>
              <SelectValue placeholder={t('assignments.pickGrantee')} />
            </SelectTrigger>
            <SelectContent>
              {granteeOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="w-56"
            value={granteeId}
            onChange={(event) => setGranteeId(event.target.value)}
            placeholder={t('assignments.granteeId')}
            aria-label={t('assignments.granteeId')}
          />
        )}
        <Select value={perm} onValueChange={setPerm}>
          <SelectTrigger className="w-24" aria-label={t('assignments.perm')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERMS.map((item) => (
              <SelectItem key={item} value={item}>
                {t(`assignments.permLabel.${item}`)}
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

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
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
          {pagedAssignments.map((item) => (
            <TableRow key={item.id} data-testid="assignment-row">
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {t(`assignments.type.${item.resource_type}`)}
                  </Badge>
                  <span>
                    {resourceLabel(item.resource_type, item.resource_id, resourceOptions)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {item.grantee_type === 'user'
                      ? t('assignments.user')
                      : t('assignments.role')}
                  </Badge>
                  <span>
                    {item.grantee_type === 'user'
                      ? ((usersQuery.data ?? []).find((u) => u.username === item.grantee_id)
                          ?.display_name ?? item.grantee_id)
                      : ((rolesQuery.data ?? []).find((r) => r.key === item.grantee_id)?.name ??
                          item.grantee_id)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-normal">
                  {t(`assignments.permLabel.${item.perm}`)}
                </Badge>
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
      </div>
      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </section>
  );
}

