/** 可编辑槽位目录与按环境隔离的模型映射；删除保护由后端最终裁决。 */

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  useBrainMappings,
  useBrainProfileReferences,
  useBrainProfiles,
  useCreateBrainProfile,
  useDeleteBrainProfile,
  useModels,
  useSetBrainMapping,
  useUpdateBrainProfile,
  type BrainProfile,
  type BrainProfileOut,
  type BrainProfileReference,
  type ModelDefinitionOut,
} from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions';

const PROFILE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const REFERENCE_FIELD_KEYS: Record<string, string> = {
  'brain.profile': 'brain.profile',
  'brain.fallback_profiles': 'brain.fallback_profiles',
  'memory.summary': 'brain.memorySummary',
};

function ModelSlotSelect({
  profile,
  models,
  value,
  onChange,
  disabled = false,
}: {
  profile: BrainProfile;
  models: ModelDefinitionOut[];
  value: string;
  onChange: (modelKey: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={t('brain.slotAria').replace('{profile}', profile)}
        className="w-56 font-mono text-xs"
      >
        <SelectValue placeholder={t('brain.selectModel')} />
      </SelectTrigger>
      <SelectContent>
        {value && !models.some((model) => model.key === value) && (
          <SelectItem value={value}>
            {value} {t('brain.currentMappingUnavailable')}
          </SelectItem>
        )}
        {models.map((model) => (
          <SelectItem key={model.key} value={model.key} className="font-mono text-xs">
            {model.key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BrainProfileDialog({
  initial,
  models,
  modelKey,
  env,
  onClose,
}: {
  initial: BrainProfileOut | null;
  models: ModelDefinitionOut[];
  modelKey: string;
  env: string;
  onClose: () => void;
}) {
  const create = useCreateBrainProfile();
  const update = useUpdateBrainProfile();
  const [key, setKey] = useState(initial?.key ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [model, setModel] = useState(modelKey || 'unmapped');
  const [formError, setFormError] = useState('');
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const t = useT();

  function submit(): void {
    if (!PROFILE_PATTERN.test(key.trim()) || !name.trim()) {
      setFormError(t('brain.nameInvalid'));
      return;
    }
    setFormError('');
    const body = {
      key: key.trim(),
      name: name.trim(),
      description: description.trim(),
      env,
      ...(model !== 'unmapped' && model !== modelKey ? { model_key: model } : {}),
    };
    if (initial) update.mutate({ key: initial.key, patch: body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? t('brain.titleEdit') : t('brain.titleNew')}</DialogTitle>
          <DialogDescription>{t('brain.desc')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brain-slot-name">{t('brain.nameLabel')}</Label>
              <Input
                id="brain-slot-name"
                value={name}
                maxLength={128}
                disabled={pending}
                placeholder={t('brain.namePlaceholder')}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brain-slot-key">{t('brain.keyLabel')}</Label>
              <Input
                id="brain-slot-key"
                value={key}
                maxLength={64}
                disabled={pending}
                className="font-mono"
                placeholder={t('brain.keyPlaceholder')}
                onChange={(event) => setKey(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brain-slot-description">{t('brain.descLabel')}</Label>
            <Textarea
              id="brain-slot-description"
              value={description}
              maxLength={512}
              disabled={pending}
              rows={3}
              placeholder={t('brain.descPlaceholder')}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('brain.mappingLabel').replace('{env}', env)}</Label>
            <Select value={model} onValueChange={setModel} disabled={pending}>
              <SelectTrigger aria-label={t('brain.mappingAria')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unmapped" disabled={!!modelKey}>
                  {modelKey ? t('brain.keepMapping') : t('brain.noMappingYet')}
                </SelectItem>
                {modelKey && !models.some((item) => item.key === modelKey) && (
                  <SelectItem value={modelKey}>
                    {modelKey} {t('brain.currentMappingUnavailable')}
                  </SelectItem>
                )}
                {models.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(formError || error) && (
            <p role="alert" className="text-sm text-destructive">
              {formError || error?.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('modelForm.saving') : t('brain.saveSlot')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBrainProfileDialog({
  slot,
  onClose,
}: {
  slot: BrainProfileOut;
  onClose: () => void;
}) {
  const query = useBrainProfileReferences(slot.key);
  const remove = useDeleteBrainProfile();
  // 查询后又有 Agent 保存时，以 DELETE 409 返回的引用为准，不能只相信弹窗预检。
  const conflictRefs = remove.error?.details.references as BrainProfileReference[] | undefined;
  const references = conflictRefs ?? query.data?.references ?? [];
  const used = references.length > 0;
  const t = useT();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !remove.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{used ? t('brain.usedTitle') : t('brain.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('brain.deleteDesc')
              .replace('{name}', slot.name)
              .replace('{key}', slot.key)}
          </DialogDescription>
        </DialogHeader>
        {query.isFetching && <p className="text-sm text-muted-foreground">{t('brain.checkingUsage')}</p>}
        {used ? (
          <ul
            aria-label={t('brain.usageAria')}
            className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3"
          >
            {references.map((ref) => (
              <li
                key={`${ref.agent_key}-${ref.version}-${ref.field}`}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="font-medium">{ref.agent_name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {ref.agent_key} · v{ref.version}
                </span>
                <Badge variant="outline">
                  {ref.current ? t('brain.currentVersion') : t('brain.historyVersion')}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t(REFERENCE_FIELD_KEYS[ref.field] ?? 'brain.memorySummary')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          query.isSuccess && (
            <p className="text-sm">{t('brain.notUsed')}</p>
          )
        )}
        {(query.error || remove.error) && (
          <p role="alert" className="text-sm text-destructive">
            {remove.error?.message ?? query.error?.message}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={remove.isPending} onClick={onClose}>
            {used ? t('common.close') : t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={!query.isSuccess || query.isFetching || used || remove.isPending}
            onClick={() => remove.mutate(slot.key, { onSuccess: onClose })}
          >
            {remove.isPending ? t('brain.deleting') : t('brain.confirmDelete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BrainMappingCard() {
  const t = useT();
  const modelsQuery = useModels();
  const profilesQuery = useBrainProfiles();
  const env = profilesQuery.data?.env ?? '';
  const mappingsQuery = useBrainMappings(env);
  const { me, can } = usePermissions();
  const canWrite = can('config:write');
  const setMapping = useSetBrainMapping();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [savedProfile, setSavedProfile] = useState<BrainProfile | null>(null);
  const [editing, setEditing] = useState<BrainProfileOut | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<BrainProfileOut | null>(null);

  const models = modelsQuery.data ?? [];
  const slots = profilesQuery.data?.items ?? [];
  const mapped = Object.fromEntries(
    (mappingsQuery.data ?? []).map((mapping) => [mapping.profile, mapping.model_key]),
  );

  function handleSave(profile: BrainProfile): void {
    const modelKey = selection[profile] ?? mapped[profile];
    if (!modelKey || !env) return;
    setMapping.mutate(
      { env, profile, model_key: modelKey },
      {
        onSuccess: () => {
          setSavedProfile(profile);
          setSelection((previous) => {
            if (previous[profile] !== modelKey) return previous;
            const next = { ...previous };
            delete next[profile];
            return next;
          });
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{t('brain.cardTitle')}</CardTitle>
            <Badge variant="outline" className="font-mono text-xs">
              env: {env || t('brain.envLoading')}
            </Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!canWrite || !env}
            onClick={() => setEditing(null)}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('brain.addSlot')}
          </Button>
        </div>
        <CardDescription>
          {t('brain.cardDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {profilesQuery.isLoading && <p className="text-sm text-muted-foreground">{t('brain.loadingSlots')}</p>}
        {profilesQuery.error && (
          <p role="alert" className="text-sm text-destructive">
            {t('brain.loadFailed')}
            {profilesQuery.error.message}
          </p>
        )}
        {mappingsQuery.error && (
          <p role="alert" className="text-sm text-destructive">
            {t('brain.mappingLoadFailed')}
            {mappingsQuery.error.message}
          </p>
        )}
        {profilesQuery.isSuccess && slots.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('brain.empty')}</p>
        )}
        {slots.map((slot) => (
          <div
            key={slot.key}
            data-brain-profile={slot.key}
            className="flex flex-wrap items-center gap-3 rounded-md border px-4 py-3"
          >
            <div className="min-w-40 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{slot.name}</span>
                {slot.name !== slot.key && (
                  <span className="font-mono text-xs text-muted-foreground">{slot.key}</span>
                )}
                {slot.agent_count > 0 && (
                  <Badge variant="outline">
                    {t('brain.agentCount').replace('{count}', String(slot.agent_count))}
                  </Badge>
                )}
              </div>
              {slot.description && (
                <p className="mt-1 text-xs text-muted-foreground">{slot.description}</p>
              )}
              {slot.aliases.length > 0 && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {t('brain.aliases').replace('{aliases}', slot.aliases.join(', '))}
                </p>
              )}
            </div>
            <ModelSlotSelect
              profile={slot.key}
              models={models}
              value={selection[slot.key] ?? mapped[slot.key] ?? ''}
              disabled={!canWrite || !mappingsQuery.isSuccess}
              onChange={(modelKey) => {
                setSelection((prev) => ({ ...prev, [slot.key]: modelKey }));
                setSavedProfile(null);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={
                !canWrite ||
                !(selection[slot.key] ?? mapped[slot.key]) ||
                !mappingsQuery.isSuccess ||
                setMapping.isPending
              }
              onClick={() => handleSave(slot.key)}
            >
              {t('brain.saveMapping').replace('{key}', slot.key)}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('brain.editAria').replace('{key}', slot.key)}
              disabled={!canWrite || !mappingsQuery.isSuccess}
              onClick={() => setEditing(slot)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('brain.deleteAria').replace('{key}', slot.key)}
              disabled={!canWrite}
              onClick={() => setDeleting(slot)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {savedProfile === slot.key && (
              <span className="text-xs text-emerald-500">{t('brain.saved')}</span>
            )}
          </div>
        ))}
        {setMapping.error && <p className="text-sm text-destructive">{setMapping.error.message}</p>}
        {me && !canWrite && (
          <p className="text-xs text-muted-foreground">
            {t('brain.readonlyNote')}
          </p>
        )}
      </CardContent>
      {editing !== undefined && (
        <BrainProfileDialog
          key={editing?.key ?? 'new'}
          initial={editing}
          models={models}
          modelKey={editing ? (mapped[editing.key] ?? '') : ''}
          env={env}
          onClose={() => setEditing(undefined)}
        />
      )}
      {deleting && <DeleteBrainProfileDialog slot={deleting} onClose={() => setDeleting(null)} />}
    </Card>
  );
}
