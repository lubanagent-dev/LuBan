/**
 * /models 模型中心：模型表（脱敏视图）+ 新建/编辑 Dialog + 大脑映射卡。
 */

import { Plus, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  useDeleteModel,
  useModels,
  useSetModelEnabled,
  type ModelDefinitionOut,
} from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useT } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions';

import { BrainMappingCard } from './BrainMappingCard';
import { ModelFormDialog } from './ModelFormDialog';

const CAPABILITY_BADGES = [
  'chat',
  'tool_calling',
  'vision',
  'streaming',
  'structured_output',
  'reasoning',
] as const;

function CapabilityBadges({ model }: { model: ModelDefinitionOut }) {
  const capability = model.capability;
  if (!capability) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {CAPABILITY_BADGES.filter((name) => capability[name]).map((name) => (
        <Badge key={name} variant="outline" className="font-mono text-xs">
          {name}
        </Badge>
      ))}
      <span className="text-xs text-muted-foreground">
        ctx {capability.context_window} / out {capability.max_output}
      </span>
    </div>
  );
}

function ParamsCell({ params }: { params: Record<string, unknown> | undefined }) {
  const entries = Object.entries(params ?? {});
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {entries.map(([name, value]) => `${name}=${JSON.stringify(value)}`).join(' ')}
    </span>
  );
}

function ApiKeyCell({ model }: { model: ModelDefinitionOut }) {
  const t = useT();
  if (model.has_api_key) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="default" className="text-xs">
          {t('models.apiKeySaved')}
        </Badge>
        {model.api_key_env && (
          <span className="font-mono text-xs text-muted-foreground">{model.api_key_env}</span>
        )}
      </div>
    );
  }
  if (model.api_key_env) {
    return <span className="font-mono text-xs text-muted-foreground">{model.api_key_env}</span>;
  }
  return <span className="text-xs text-muted-foreground">{t('models.apiKeyUnset')}</span>;
}

function DeleteModelDialog({
  model,
  onClose,
}: {
  model: ModelDefinitionOut;
  onClose: () => void;
}) {
  const t = useT();
  const remove = useDeleteModel();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !remove.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('models.deleteTitle').replace('{key}', model.key)}</DialogTitle>
          <DialogDescription>{t('models.deleteDesc').replace('{key}', model.key)}</DialogDescription>
        </DialogHeader>
        {remove.error && (
          <p role="alert" className="text-sm text-destructive">
            {remove.error.message}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={remove.isPending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(model.key, { onSuccess: onClose })}
          >
            {remove.isPending ? t('models.deleting') : t('models.confirmDelete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ModelsPage() {
  const t = useT();
  const modelsQuery = useModels();
  const setModelEnabled = useSetModelEnabled();
  const { can } = usePermissions();
  const canWrite = can('config:write');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ModelDefinitionOut | null>(null);
  const [deleting, setDeleting] = useState<ModelDefinitionOut | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const models = modelsQuery.data ?? [];

  function handleToggleEnabled(model: ModelDefinitionOut): void {
    setTogglingKey(model.key);
    setModelEnabled.mutate(
      { key: model.key, enabled: !model.enabled },
      { onSettled: () => setTogglingKey(null) },
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-semibold">{t('models.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('models.desc')}</p>
        </div>
        <Button
          disabled={!canWrite}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t('models.create')}
        </Button>
      </div>

      {modelsQuery.isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
      {modelsQuery.error && (
        <p className="text-sm text-destructive">
          {t('models.loadFailed')}
          {modelsQuery.error.message}
        </p>
      )}
      {setModelEnabled.error && (
        <p role="alert" className="text-sm text-destructive">
          {setModelEnabled.error.message}
        </p>
      )}

      {modelsQuery.isSuccess && (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>{t('models.colApiKey')}</TableHead>
                <TableHead>{t('models.colCapabilities')}</TableHead>
                <TableHead>Params</TableHead>
                <TableHead>{t('models.colStatus')}</TableHead>
                <TableHead className="w-48">{t('models.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.key}>
                  <TableCell className="font-mono text-xs font-medium">{model.key}</TableCell>
                  <TableCell className="text-sm">{model.provider}</TableCell>
                  <TableCell className="font-mono text-xs">{model.model_name}</TableCell>
                  <TableCell>
                    <ApiKeyCell model={model} />
                  </TableCell>
                  <TableCell>
                    <CapabilityBadges model={model} />
                  </TableCell>
                  <TableCell>
                    <ParamsCell params={model.params} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={model.enabled ? 'default' : 'outline'}>
                      {model.enabled ? t('models.enabled') : t('models.disabled')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canWrite}
                        onClick={() => {
                          setEditing(model);
                          setDialogOpen(true);
                        }}
                      >
                        {t('models.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={(model.enabled
                          ? t('models.disableAria')
                          : t('models.enableAria')
                        ).replace('{key}', model.key)}
                        disabled={!canWrite || togglingKey === model.key}
                        onClick={() => handleToggleEnabled(model)}
                      >
                        <Power className="mr-1 h-3.5 w-3.5" />
                        {model.enabled ? t('models.disable') : t('models.enable')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={t('models.deleteAria').replace('{key}', model.key)}
                        disabled={!canWrite}
                        onClick={() => setDeleting(model)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        {t('models.delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {models.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    {t('models.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <BrainMappingCard />

      {dialogOpen && (
        <ModelFormDialog
          key={editing?.key ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
        />
      )}
      {deleting && <DeleteModelDialog model={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
