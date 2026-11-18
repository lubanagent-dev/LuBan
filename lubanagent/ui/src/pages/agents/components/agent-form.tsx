/**
 * Agent 定义分区表单（Tabs：身份/指令/大脑/能力/记忆与知识/边界/IO）。
 * 全受控：draft 由父层（编辑器页）持有，onChange 产出新 draft。
 * 校验只做 UX 层（JSON 格式提示），业务规则以后端为准。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { AgentDefinition, BrainProfile } from '@/api/hooks';
import { useBrainProfiles, usePrompts } from '@/api/hooks';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n';

import {
  AGENT_STATUSES,
  brainProfileOptions,
  statusLabel,
  toNullableNumber,
  toNumber,
} from '../lib/agent-form';
import { AvatarCard } from './avatar-card';
import { KeyValueEditor } from './key-value-editor';
import { TagInput } from './tag-input';

interface AgentFormProps {
  draft: AgentDefinition;
  onChange: (draft: AgentDefinition) => void;
  /** 只读形态（历史版本查看）：全部控件禁用 */
  readOnly?: boolean;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/**
 * 指令来源双轨：内嵌编辑（默认，instructions 直接可改）或引用 Prompt 库
 * （prompt_key 非空——保存时服务端解析 prompt 当前版内容写入版本快照，此处只读预览）。
 */
function PromptSourceField({
  draft,
  readOnly,
  patch,
}: {
  draft: AgentDefinition;
  readOnly?: boolean;
  patch: (partial: Partial<AgentDefinition>) => void;
}) {
  const t = useT();
  const promptsQuery = usePrompts();
  const prompts = promptsQuery.data ?? [];
  const referenced = prompts.find((p) => p.key === draft.prompt_key) ?? null;

  if (draft.prompt_key) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t('form.instructionsInline')}</Label>
          <span className="rounded-full border border-blue-500/50 px-2 py-0.5 font-mono text-xs text-blue-500">
            {t('form.promptFromPrefix')}
            {draft.prompt_key} v{draft.prompt_version ?? referenced?.version ?? '?'}
          </span>
        </div>
        <pre className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap">
          {draft.instructions || t('form.empty')}
        </pre>
        <p className="text-xs text-muted-foreground">
          {t('form.promptRefReadonly')}
          {t('form.promptRefManagePre')}
          <a className="underline" href="#/prompts">
            {t('form.promptLibraryLink')}
          </a>
          {t('form.promptRefManagePost')}
        </p>
        {!readOnly && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => patch({ prompt_key: null, prompt_version: null })}
          >
            {t('form.embeddedEdit')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Field label={t('form.instructionsLabel')}>
        <Textarea
          value={draft.instructions ?? ''}
          rows={10}
          className="font-mono text-sm"
          disabled={readOnly}
          onChange={(event) => patch({ instructions: event.target.value })}
        />
      </Field>
      {prompts.length > 0 && !readOnly && (
        <Field label={t('form.referencePromptLibrary')}>
          <Select
            value="none"
            onValueChange={(value) => {
              if (value === 'none') return;
              patch({ prompt_key: value, prompt_version: null });
            }}
          >
            <SelectTrigger aria-label={t('form.referencePromptAria')} className="text-xs">
              <SelectValue placeholder={t('form.embeddedNoRef')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('form.embeddedNoRef')}</SelectItem>
              {prompts.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.name}（{p.key} v{p.version}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

export function AgentForm({ draft, onChange, readOnly = false }: AgentFormProps) {
  const t = useT();
  const profilesQuery = useBrainProfiles();
  const brain = draft.brain ?? { profile: 'smart' as BrainProfile, allow_run_override: false };
  const profiles = brainProfileOptions(profilesQuery.data?.items ?? [], [
    brain.profile,
    ...(brain.fallback_profiles ?? []),
  ]);
  const primaryKey = profiles.find((slot) => slot.key === brain.profile)?.canonicalKey;
  const boundary = draft.boundary ?? {
    max_steps: 16,
    timeout_seconds: 300,
    allow_human_handoff: false,
  };
  const io = draft.io ?? { input_type: 'text' as const, streaming: true };
  const memory = draft.memory ?? {
    session: true,
    long_term: false,
    summary: false,
    window_size: 20,
  };
  const knowledge = draft.knowledge ?? {
    cite: true,
    top_k: 5,
    score_threshold: 0,
    no_hit_fallback: null,
    max_age_days: null,
    sources: [],
  };
  const budget = boundary.budget ?? null;

  const patch = (partial: Partial<AgentDefinition>) => onChange({ ...draft, ...partial });

  const outputSchemaText = io.output_schema ? JSON.stringify(io.output_schema, null, 2) : '';

  return (
    <Tabs defaultValue="identity" className="w-full">
      <TabsList className="flex w-full flex-wrap justify-start">
        <TabsTrigger value="identity">{t('form.tab.identity')}</TabsTrigger>
        <TabsTrigger value="instructions">{t('form.tab.instructions')}</TabsTrigger>
        <TabsTrigger value="brain">{t('form.tab.brain')}</TabsTrigger>
        <TabsTrigger value="capabilities">{t('form.tab.capabilities')}</TabsTrigger>
        <TabsTrigger value="memory">{t('form.tab.memory')}</TabsTrigger>
        <TabsTrigger value="boundary">{t('form.tab.boundary')}</TabsTrigger>
        <TabsTrigger value="io">{t('form.tab.io')}</TabsTrigger>
      </TabsList>

      {/* ---- 身份 ---- */}
      <TabsContent value="identity" className="space-y-4 pt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('form.key')}>
            <Input value={draft.key} readOnly disabled className="font-mono" />
          </Field>
          <Field label={t('form.name')}>
            <Input
              value={draft.name}
              disabled={readOnly}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </Field>
          <Field label={t('form.role')}>
            <Input
              value={draft.role ?? ''}
              placeholder={t('form.rolePlaceholder')}
              disabled={readOnly}
              onChange={(event) => patch({ role: event.target.value })}
            />
          </Field>
          <Field label={t('form.status')}>
            <Select
              value={draft.status}
              disabled={readOnly}
              onValueChange={(value) => patch({ status: value as AgentDefinition['status'] })}
            >
              <SelectTrigger aria-label={t('form.status')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabel(status, t)}（{status}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label={t('form.description')}>
          <Textarea
            value={draft.description ?? ''}
            rows={2}
            disabled={readOnly}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>
        <Field label={t('form.greeting')}>
          <Textarea
            value={draft.greeting ?? ''}
            rows={2}
            disabled={readOnly}
            onChange={(event) => patch({ greeting: event.target.value })}
          />
        </Field>
        <SwitchRow
          label={t('form.showAvatar')}
          hint={t('form.showAvatarHint')}
          checked={draft.show_avatar ?? true}
          disabled={readOnly}
          onCheckedChange={(checked) => patch({ show_avatar: checked })}
        />
        {!readOnly && (
          <AvatarCard
            agent={draft}
            onSynced={(synced) => patch({ version: synced.version, avatar: synced.avatar })}
          />
        )}
      </TabsContent>

      {/* ---- 指令 ---- */}
      <TabsContent value="instructions" className="space-y-4 pt-4">
        <PromptSourceField draft={draft} readOnly={readOnly} patch={patch} />
        <Field label={t('form.promptVariables')}>
          <KeyValueEditor
            value={draft.prompt_variables ?? {}}
            disabled={readOnly}
            onChange={(variables) => patch({ prompt_variables: variables })}
          />
        </Field>
      </TabsContent>

      {/* ---- 大脑 ---- */}
      <TabsContent value="brain" className="space-y-4 pt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('form.brainSlot')}>
            <Select
              value={brain.profile}
              disabled={readOnly}
              onValueChange={(value) => {
                const canonical = profiles.find((slot) => slot.key === value)?.canonicalKey;
                patch({
                  brain: {
                    ...brain,
                    profile: value as BrainProfile,
                    fallback_profiles: (brain.fallback_profiles ?? []).filter(
                      (key) =>
                        profiles.find((slot) => slot.key === key)?.canonicalKey !== canonical,
                    ),
                  },
                });
              }}
            >
              <SelectTrigger aria-label={t('form.brainSlotAria')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile.key} value={profile.key}>
                    {profile.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('form.fallbackSlots')}</Label>
            <div className="flex flex-wrap gap-3 rounded-md border px-3 py-2">
              {profiles
                .filter(
                  (profile, index) =>
                    profile.canonicalKey !== primaryKey &&
                    profiles.findIndex((slot) => slot.canonicalKey === profile.canonicalKey) ===
                      index,
                )
                .map((profile) => {
                  const fallbacks = brain.fallback_profiles ?? [];
                  const checked = fallbacks.some(
                    (key) =>
                      profiles.find((slot) => slot.key === key)?.canonicalKey ===
                      profile.canonicalKey,
                  );
                  return (
                    <label key={profile.key} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={checked}
                        disabled={readOnly}
                        onChange={(event) =>
                          patch({
                            brain: {
                              ...brain,
                              fallback_profiles: event.target.checked
                                ? [...fallbacks, profile.key]
                                : fallbacks.filter(
                                    (item) =>
                                      profiles.find((slot) => slot.key === item)?.canonicalKey !==
                                      profile.canonicalKey,
                                  ),
                            },
                          })
                        }
                      />
                      {profile.label}
                    </label>
                  );
                })}
            </div>
          </div>
        </div>
        {profilesQuery.error && (
          <p className="text-sm text-destructive">
            {t('form.slotLoadFailedPrefix')}
            {profilesQuery.error.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t('form.slotCatalogHint')}
        </p>
        <SwitchRow
          label={t('form.allowRunOverride')}
          hint={t('form.allowRunOverrideHint')}
          checked={brain.allow_run_override}
          disabled={readOnly}
          onCheckedChange={(checked) => patch({ brain: { ...brain, allow_run_override: checked } })}
        />
      </TabsContent>

      {/* ---- 能力 ---- */}
      <TabsContent value="capabilities" className="space-y-4 pt-4">
        <Field label={t('form.toolsLabel')}>
          <TagInput
            values={draft.tools ?? []}
            placeholder={t('form.toolPlaceholder')}
            aria-label={t('form.addTool')}
            disabled={readOnly}
            onChange={(tools) => patch({ tools })}
          />
        </Field>
        <Field label={t('form.skillsLabel')}>
          <TagInput
            values={draft.skills ?? []}
            placeholder={t('form.skillPlaceholder')}
            aria-label={t('form.addSkill')}
            disabled={readOnly}
            onChange={(skills) => patch({ skills })}
          />
        </Field>
        <Field label={t('form.mcpLabel')}>
          <TagInput
            values={draft.mcp_servers ?? []}
            placeholder={t('form.mcpPlaceholder')}
            aria-label={t('form.addMcp')}
            disabled={readOnly}
            onChange={(servers) => patch({ mcp_servers: servers })}
          />
        </Field>
      </TabsContent>

      {/* ---- 记忆与知识 ---- */}
      <TabsContent value="memory" className="space-y-4 pt-4">
        <div className="space-y-2">
          <SwitchRow
            label={t('form.memorySession')}
            checked={memory.session}
            disabled={readOnly}
            onCheckedChange={(checked) => patch({ memory: { ...memory, session: checked } })}
          />
          <SwitchRow
            label={t('form.memoryLongTerm')}
            checked={memory.long_term}
            disabled={readOnly}
            onCheckedChange={(checked) => patch({ memory: { ...memory, long_term: checked } })}
          />
          <SwitchRow
            label={t('form.memorySummary')}
            checked={memory.summary}
            disabled={readOnly}
            onCheckedChange={(checked) => patch({ memory: { ...memory, summary: checked } })}
          />
        </div>
        <Field label={t('form.memoryWindow')}>
          <Input
            type="number"
            min={1}
            className="w-40"
            value={memory.window_size}
            disabled={readOnly}
            onChange={(event) =>
              patch({
                memory: {
                  ...memory,
                  window_size: toNumber(event.target.value, memory.window_size),
                },
              })
            }
          />
        </Field>
        <div className="space-y-2 rounded-md border p-3">
          <SwitchRow
            label={t('form.knowledgeCite')}
            hint={t('form.knowledgeCiteHint')}
            checked={knowledge.cite}
            disabled={readOnly}
            onCheckedChange={(checked) => patch({ knowledge: { ...knowledge, cite: checked } })}
          />
          <Field label={t('form.knowledgeSources')}>
            <TagInput
              values={knowledge.sources ?? []}
              placeholder={t('form.knowledgeSourcePlaceholder')}
              aria-label={t('form.addKnowledgeSource')}
              disabled={readOnly}
              onChange={(sources) => patch({ knowledge: { ...knowledge, sources } })}
            />
          </Field>
          <Field label={t('form.topK')}>
            <Input
              type="number"
              min={1}
              className="w-40"
              value={knowledge.top_k}
              disabled={readOnly}
              onChange={(event) =>
                patch({
                  knowledge: { ...knowledge, top_k: toNumber(event.target.value, knowledge.top_k) },
                })
              }
            />
          </Field>
          <Field label={t('form.scoreThreshold')}>
            <Input
              type="number"
              min={0}
              max={1}
              step="0.01"
              className="w-40"
              value={knowledge.score_threshold}
              disabled={readOnly}
              onChange={(event) =>
                patch({
                  knowledge: {
                    ...knowledge,
                    score_threshold: toNumber(event.target.value, knowledge.score_threshold),
                  },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t('form.scoreThresholdHint')}
            </p>
          </Field>
          <Field label={t('form.noHitFallback')}>
            <Textarea
              rows={2}
              placeholder={t('form.noHitFallbackPlaceholder')}
              value={knowledge.no_hit_fallback ?? ''}
              disabled={readOnly}
              onChange={(event) =>
                patch({
                  knowledge: {
                    ...knowledge,
                    no_hit_fallback: event.target.value.trim() === '' ? null : event.target.value,
                  },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t('form.noHitFallbackHint')}
            </p>
          </Field>
          <Field label={t('form.maxAgeDays')}>
            <Input
              type="number"
              min={0}
              className="w-40"
              value={knowledge.max_age_days ?? ''}
              placeholder={t('form.unlimited')}
              disabled={readOnly}
              onChange={(event) =>
                patch({
                  knowledge: {
                    ...knowledge,
                    max_age_days: toNullableNumber(event.target.value),
                  },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t('form.maxAgeHint')}
            </p>
          </Field>
        </div>
      </TabsContent>

      {/* ---- 边界 ---- */}
      <TabsContent value="boundary" className="space-y-4 pt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('form.maxSteps')}>
            <Input
              type="number"
              min={1}
              value={boundary.max_steps}
              disabled={readOnly}
              onChange={(event) =>
                patch({
                  boundary: {
                    ...boundary,
                    max_steps: toNumber(event.target.value, boundary.max_steps),
                  },
                })
              }
            />
          </Field>
          <Field label={t('form.timeout')}>
            <Input
              type="number"
              min={1}
              value={boundary.timeout_seconds}
              disabled={readOnly}
              onChange={(event) =>
                patch({
                  boundary: {
                    ...boundary,
                    timeout_seconds: toNumber(event.target.value, boundary.timeout_seconds),
                  },
                })
              }
            />
          </Field>
        </div>
        <SwitchRow
          label={t('form.humanHandoff')}
          checked={boundary.allow_human_handoff}
          disabled={readOnly}
          onCheckedChange={(checked) =>
            patch({ boundary: { ...boundary, allow_human_handoff: checked } })
          }
        />
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('form.budget')}</p>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="max_tokens">
              <Input
                type="number"
                min={0}
                value={budget?.max_tokens ?? ''}
                placeholder={t('form.unlimited')}
                disabled={readOnly}
                onChange={(event) =>
                  patch({
                    boundary: {
                      ...boundary,
                      budget: { ...budget, max_tokens: toNullableNumber(event.target.value) },
                    },
                  })
                }
              />
            </Field>
            <Field label={t('form.maxCost')}>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={budget?.max_cost ?? ''}
                placeholder={t('form.unlimited')}
                disabled={readOnly}
                onChange={(event) =>
                  patch({
                    boundary: {
                      ...boundary,
                      budget: { ...budget, max_cost: toNullableNumber(event.target.value) },
                    },
                  })
                }
              />
            </Field>
            <Field label="max_seconds">
              <Input
                type="number"
                min={0}
                value={budget?.max_seconds ?? ''}
                placeholder={t('form.unlimited')}
                disabled={readOnly}
                onChange={(event) =>
                  patch({
                    boundary: {
                      ...boundary,
                      budget: { ...budget, max_seconds: toNullableNumber(event.target.value) },
                    },
                  })
                }
              />
            </Field>
          </div>
        </div>
      </TabsContent>

      {/* ---- IO ---- */}
      <TabsContent value="io" className="space-y-4 pt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('form.inputType')}>
            <Select
              value={io.input_type}
              disabled={readOnly}
              onValueChange={(value) =>
                patch({ io: { ...io, input_type: value as typeof io.input_type } })
              }
            >
              <SelectTrigger aria-label={t('form.inputType')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">text</SelectItem>
                <SelectItem value="json">json</SelectItem>
                <SelectItem value="multimodal">multimodal</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-end pb-1">
            <SwitchRow
              label={t('form.streaming')}
              checked={io.streaming}
              disabled={readOnly}
              onCheckedChange={(checked) => patch({ io: { ...io, streaming: checked } })}
            />
          </div>
        </div>
        <OutputSchemaField
          value={outputSchemaText}
          disabled={readOnly}
          onValid={(schema) => patch({ io: { ...io, output_schema: schema } })}
        />
      </TabsContent>
    </Tabs>
  );
}

/** output_schema JSON 编辑：本地文本态，解析成功才提交（UX 层格式校验） */
function OutputSchemaField({
  value,
  disabled,
  onValid,
}: {
  value: string;
  disabled: boolean;
  onValid: (schema: Record<string, unknown> | null) => void;
}) {
  const t = useT();
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  // 自己提交的值不回填（避免边打字边被 pretty-print 打断）；仅外部变化时同步
  const selfCommitted = useRef<string | null>(null);

  useEffect(() => {
    if (selfCommitted.current === value) return;
    selfCommitted.current = null;
    setText(value);
    setError(null);
  }, [value]);

  return (
    <Field label={t('form.outputSchema')}>
      <Textarea
        value={text}
        rows={6}
        className="font-mono text-xs"
        placeholder='{"type":"object", ...}'
        disabled={disabled}
        aria-label={t('form.outputSchemaAria')}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next.trim() === '') {
            setError(null);
            selfCommitted.current = '';
            onValid(null);
            return;
          }
          try {
            const schema = JSON.parse(next) as Record<string, unknown>;
            selfCommitted.current = JSON.stringify(schema, null, 2);
            onValid(schema);
            setError(null);
          } catch {
            setError(t('form.outputSchemaError'));
          }
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Field>
  );
}
