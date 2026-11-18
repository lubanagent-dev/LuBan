/**
 * 新建 Agent 对话框：key/name/description/instructions + 大脑槽位 → POST /v1/agents。
 * 成功后跳到该 Agent 的编辑器。校验只做 UX 层（必填/key 格式），冲突等业务错误展示 error.message。
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useBrainProfiles, useCreateAgent, type BrainProfile } from '@/api/hooks';
import { Button } from '@/components/ui/button';
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

import { brainProfileOptions, defaultBrainProfile, emptyAgentDefinition } from '../lib/agent-form';

const KEY_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAgentDialog({ open, onOpenChange }: CreateAgentDialogProps) {
  const t = useT();
  const navigate = useNavigate();
  const createAgent = useCreateAgent();
  const profilesQuery = useBrainProfiles();
  const slots = profilesQuery.data?.items ?? [];

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [profile, setProfile] = useState<BrainProfile | ''>('');
  const selectedProfile = slots.some((slot) => slot.key === profile)
    ? profile
    : defaultBrainProfile(slots);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setKey('');
    setName('');
    setDescription('');
    setInstructions('');
    setProfile('');
    setFormError(null);
    createAgent.reset();
  };

  const submit = () => {
    if (key.trim() === '' || name.trim() === '') {
      setFormError(t('create.errorRequired'));
      return;
    }
    if (!KEY_PATTERN.test(key.trim())) {
      setFormError(t('create.errorKeyFormat'));
      return;
    }
    if (!selectedProfile || !profilesQuery.isSuccess) {
      setFormError(t('create.errorNoSlot'));
      return;
    }
    setFormError(null);
    const definition = emptyAgentDefinition(
      key.trim(),
      name.trim(),
      description.trim(),
      instructions,
      selectedProfile,
    );
    createAgent.mutate(definition, {
      onSuccess: (created) => {
        onOpenChange(false);
        reset();
        navigate(`/agents/${created.key}`);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-agent-key">{t('create.keyLabel')}</Label>
              <Input
                id="new-agent-key"
                value={key}
                placeholder={t('create.keyPlaceholder')}
                className="font-mono"
                onChange={(event) => setKey(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-agent-name">{t('form.name')}</Label>
              <Input
                id="new-agent-name"
                value={name}
                placeholder={t('create.namePlaceholder')}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
              <Label htmlFor="new-agent-description">{t('form.description')}</Label>
            <Input
              id="new-agent-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
              <Label htmlFor="new-agent-instructions">{t('create.instructionsLabel')}</Label>
            <Textarea
              id="new-agent-instructions"
              value={instructions}
              rows={5}
              className="font-mono text-sm"
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
              <Label>{t('create.slotLabel')}</Label>
            <Select value={selectedProfile} onValueChange={setProfile}>
              <SelectTrigger aria-label={t('create.slotLabel')}>
                <SelectValue placeholder={t('create.slotPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {brainProfileOptions(slots).map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {profilesQuery.error && (
            <p className="text-sm text-destructive">
              {t('form.slotLoadFailedPrefix')}
              {profilesQuery.error.message}
            </p>
          )}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          {createAgent.error && (
            <p className="text-sm text-destructive">{createAgent.error.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={createAgent.isPending || !selectedProfile || !profilesQuery.isSuccess}
            onClick={submit}
          >
            {createAgent.isPending ? t('create.creating') : t('create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
