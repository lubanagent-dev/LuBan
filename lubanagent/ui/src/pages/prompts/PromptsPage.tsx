/**
 * /prompts Prompt 库：以 Prompt 为维度管理——列表 + 新建 + 编辑发版（不可变版本）+
 * 分配到 Agent（服务端落库前解析 content 写入 Agent 版本快照）+ 从 Agent 抽取。
 * Prompt 新版不自动作用于已引用它的 Agent：Agent 吃新版须经"分配"产生新 Agent 版本。
 */

import { FilePlus2, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  useAgents,
  useAssignPromptToAgents,
  useCreatePrompt,
  useCreatePromptVersion,
  usePrompts,
  usePromptVersions,
  type AgentDefinition,
  type PromptDefinition,
} from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { KeyValueEditor } from '@/pages/agents/components/key-value-editor';
import { useT } from '@/lib/i18n';

export default function PromptsPage() {
  const t = useT();
  const promptsQuery = usePrompts();
  const agentsQuery = useAgents();
  const [selectedKey, setSelectedKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<PromptDefinition | null>(null);

  const prompts = promptsQuery.data ?? [];
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);
  const selected = prompts.find((p) => p.key === selectedKey) ?? null;

  // 反查：prompt key → 引用它的 Agent 列表
  const referenceMap = useMemo(() => {
    const m = new Map<string, AgentDefinition[]>();
    for (const a of agents) {
      if (a.prompt_key && !m.has(a.prompt_key)) m.set(a.prompt_key, []);
      if (a.prompt_key) m.get(a.prompt_key)!.push(a);
    }
    return m;
  }, [agents]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('prompts.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('prompts.desc')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <FilePlus2 className="mr-1.5 h-4 w-4" />
          {t('prompts.create')}
        </Button>
      </div>

      {promptsQuery.isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
      {promptsQuery.error && (
        <p className="text-sm text-destructive">
          {t('prompts.loadFailed')}
          {promptsQuery.error.message}
        </p>
      )}

      {promptsQuery.isSuccess && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('prompts.colName')}</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>{t('prompts.colVersion')}</TableHead>
                <TableHead>{t('prompts.colDesc')}</TableHead>
                <TableHead>{t('prompts.colAgents')}</TableHead>
                <TableHead className="w-28">{t('prompts.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.map((prompt) => {
                const referenced = referenceMap.get(prompt.key) ?? [];
                return (
                  <TableRow
                    key={prompt.key}
                    className="cursor-pointer"
                    onClick={() => setSelectedKey(prompt.key)}
                  >
                    <TableCell className="text-sm font-medium">{prompt.name}</TableCell>
                    <TableCell className="font-mono text-xs">{prompt.key}</TableCell>
                    <TableCell className="font-mono text-xs">v{prompt.version}</TableCell>
                    <TableCell className="max-w-72 truncate text-sm text-muted-foreground">
                      {prompt.description || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {referenced.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="outline">{referenced.length}</Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => setAssigning(prompt)}>
                        <Share2 className="mr-1 h-3.5 w-3.5" />
                        {t('prompts.assign')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {prompts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    {t('prompts.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && <PromptEditor prompt={selected} />}

      <CreatePromptDialog open={creating} onOpenChange={setCreating} />
      <AssignPromptDialog
        prompt={assigning}
        agents={agents}
        onClose={() => setAssigning(null)}
      />
    </div>
  );
}

/** 编辑区：改 content/variables 后"保存为新版本"（不可变版本追加，不能覆盖） */
function PromptEditor({ prompt }: { prompt: PromptDefinition }) {
  const t = useT();
  const versionsQuery = usePromptVersions(prompt.key);
  const createVersion = useCreatePromptVersion(prompt.key);
  const [content, setContent] = useState(prompt.content);
  const [variables, setVariables] = useState<Record<string, string>>(prompt.variables ?? {});

  useEffect(() => {
    setContent(prompt.content);
    setVariables(prompt.variables ?? {});
  }, [prompt.key, prompt.version]);

  const versions = versionsQuery.data ?? [];
  const dirty = content !== prompt.content || JSON.stringify(variables) !== JSON.stringify(prompt.variables ?? {});

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_260px]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="font-medium">{prompt.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {prompt.key} · v{prompt.version}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">{t('prompts.contentLabel')}</Label>
            <Textarea
              aria-label={t('prompts.contentAria')}
              rows={12}
              className="font-mono text-xs"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('prompts.defaultVars')}</Label>
            <KeyValueEditor value={variables} onChange={setVariables} />
          </div>
          {createVersion.error && (
            <p className="text-sm text-destructive">{createVersion.error.message}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!dirty || createVersion.isPending}
              onClick={() =>
                createVersion.mutate({
                  ...prompt,
                  content,
                  variables,
                  version: prompt.version + 1,
                })
              }
            >
              {createVersion.isPending
                ? t('prompts.saving')
                : t('prompts.saveNewVersion').replace('{version}', String(prompt.version + 1))}
            </Button>
            {dirty && (
              <span className="text-xs text-muted-foreground">{t('prompts.unsavedNote')}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('prompts.versionHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {versions.map((v) => (
            <div
              key={v.version}
              className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs"
            >
              <span className="font-mono">v{v.version}</span>
              <span className="text-muted-foreground">
                {v.version === prompt.version
                  ? t('prompts.current')
                  : t('prompts.chars').replace('{n}', String(v.content.length))}
              </span>
            </div>
          ))}
          {versions.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('prompts.noVersions')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreatePromptDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreatePrompt();
  const t = useT();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  const submit = () => {
    if (key.trim() === '' || name.trim() === '') return;
    create.mutate(
      { key: key.trim(), name: name.trim(), description, content, variables: {}, version: 1 },
      {
        onSuccess: () => {
          onOpenChange(false);
          setKey('');
          setName('');
          setDescription('');
          setContent('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('prompts.create')}</DialogTitle>
          <DialogDescription>{t('prompts.newDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Key</Label>
              <Input
                aria-label="Prompt key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="faq-prompt"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('prompts.nameLabel')}</Label>
              <Input
                aria-label={t('prompts.nameAria')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('prompts.namePlaceholder')}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('prompts.descLabel')}</Label>
            <Input
              aria-label={t('prompts.descAria')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('prompts.contentShortLabel')}</Label>
            <Textarea
              aria-label={t('prompts.contentInitAria')}
              rows={8}
              className="font-mono text-xs"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={key.trim() === '' || name.trim() === '' || create.isPending}
            onClick={submit}
          >
            {create.isPending ? t('prompts.creating') : t('prompts.createAction')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignPromptDialog({
  prompt,
  agents,
  onClose,
}: {
  prompt: PromptDefinition | null;
  agents: AgentDefinition[];
  onClose: () => void;
}) {
  const assign = useAssignPromptToAgents();
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (prompt) {
      setSelected(
        new Set(agents.filter((a) => a.prompt_key === prompt.key).map((a) => a.key)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt?.key, agents]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = () => {
    if (!prompt) return;
    const targets: Record<string, boolean> = {};
    for (const k of selected) targets[k] = true;
    assign.mutate({ promptKey: prompt.key, targets, agents }, { onSuccess: () => onClose() });
  };

  if (!prompt) return null;

  return (
    <Dialog open={prompt !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('prompts.assignTitle').replace('{key}', prompt.key)}
          </DialogTitle>
          <DialogDescription>
            {t('prompts.assignDesc')
              .replace('{version}', String(prompt.version))}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {agents.map((a) => (
            <label
              key={a.key}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={selected.has(a.key)}
                onChange={() => toggle(a.key)}
              />
              <span className="font-medium">{a.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{a.key}</span>
              <span className="ml-auto text-xs text-muted-foreground">v{a.version}</span>
            </label>
          ))}
          {agents.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('prompts.noAgents')}</p>
          )}
        </div>
        {assign.error && <p className="text-sm text-destructive">{assign.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={assign.isPending} onClick={submit}>
            {assign.isPending ? t('prompts.saving') : t('prompts.saveAssign')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
