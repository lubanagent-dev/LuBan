/**
 * /tools Tool 中心：工具表（风险徽章/超时/重试/幂等/需审批）+ 详情
 * （args_schema 渲染表单）+ 在线执行（POST /v1/tools/{key}/test）看结果。
 */

import { Check, Minus, Play } from 'lucide-react';
import { useState } from 'react';

import { useTestTool, useTools, type ToolDescriptor } from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDurationMs } from '@/lib/format';
import { useT } from '@/lib/i18n';

import { JsonTree } from './json-tree';
import { buildArgs, initialValues, SchemaForm, type SchemaValues } from './schema-form';

const RISK_STYLE: Record<
  ToolDescriptor['risk'],
  { variant: 'secondary' | 'outline' | 'destructive'; labelKey: string }
> = {
  low: { variant: 'secondary', labelKey: 'toolsPage.riskLow' },
  medium: { variant: 'outline', labelKey: 'toolsPage.riskMedium' },
  high: { variant: 'destructive', labelKey: 'toolsPage.riskHigh' },
};

/** 与 Topbar 同源的 mock/live 判定：真实执行语义提示随环境切换 */
const IS_MOCK =
  (import.meta.env.VITE_USE_MOCK ?? (import.meta.env.DEV ? 'true' : 'false')) === 'true';

function BoolMark({ value, label }: { value: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      {value ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function ToolDetail({ tool }: { tool: ToolDescriptor }) {
  const t = useT();
  const testTool = useTestTool();
  const [values, setValues] = useState<SchemaValues>(() => initialValues(tool.args_schema));
  const [formError, setFormError] = useState<string | null>(null);
  // 高风险工具两段式确认（H13）：第一次点击只武装确认按钮，再次点击才真实执行
  const [confirming, setConfirming] = useState(false);

  function handleRun(): void {
    setFormError(null);
    const { args, error } = buildArgs(tool.args_schema, values);
    if (error) {
      setFormError(error);
      return;
    }
    if (tool.risk === 'high' && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    testTool.mutate({ key: tool.key, args: args ?? {} });
  }

  const result = testTool.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="font-mono text-base">{tool.key}</CardTitle>
          <Badge variant={RISK_STYLE[tool.risk].variant}>
            {t(RISK_STYLE[tool.risk].labelKey)}
          </Badge>
          {tool.contract?.approval_required && (
            <Badge variant="destructive">{t('toolsPage.approvalBadge')}</Badge>
          )}
        </div>
        <CardDescription>{tool.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SchemaForm
          schema={tool.args_schema}
          values={values}
          onChange={(name, raw) => setValues((prev) => ({ ...prev, [name]: raw }))}
        />
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        {/* H13 真实调用语义区分：live 模式是在线真实执行（副作用真实生效），且
            该调试端点不经 Runtime，不触发 Run 内审批闸——需审批工具的审批仅在实际
            Run 中生效。mock 模式（顶栏徽章）返回模拟数据，不产生任何副作用。 */}
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400" data-testid="tool-test-semantics">
          {IS_MOCK ? t('toolsPage.mockNote') : t('toolsPage.liveNote')}
        </p>
        <Button
          onClick={handleRun}
          disabled={testTool.isPending}
          variant={confirming ? 'destructive' : 'default'}
          data-testid="tool-run-button"
        >
          <Play className="mr-1 h-4 w-4" />
          {testTool.isPending
            ? t('toolsPage.executing')
            : confirming
              ? t('toolsPage.confirmLive')
              : t('toolsPage.run')}
        </Button>

        {testTool.error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {t('toolsPage.loadFailedPrefix')}
            {testTool.error.message}
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Badge variant={result.success ? 'default' : 'destructive'}>
                {result.success ? 'success' : 'error'}
              </Badge>
              <span>{t('toolsPage.duration').replace('{ms}', formatDurationMs(result.duration_ms))}</span>
              <span>{t('toolsPage.attempts').replace('{n}', String(result.attempts))}</span>
            </div>
            {result.success ? (
              <JsonTree value={result.value} />
            ) : (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
                <p className="font-mono text-xs text-destructive">
                  {(result.error as { code?: string } | null)?.code ?? 'UNKNOWN'}
                </p>
                <p className="mt-1 text-destructive">
                  {(result.error as { message?: string } | null)?.message ??
                    t('toolsPage.execFailed')}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ToolsPage() {
  const t = useT();
  const toolsQuery = useTools();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const tools = toolsQuery.data ?? [];
  const selected = tools.find((tool) => tool.key === selectedKey) ?? null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t('toolsPage.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('toolsPage.desc')}</p>
      </div>

      {toolsQuery.isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
      {toolsQuery.error && (
        <p className="text-sm text-destructive">
          {t('toolsPage.loadFailedPrefix')}
          {toolsQuery.error.message}
        </p>
      )}

      {toolsQuery.isSuccess && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>{t('toolsPage.colDesc')}</TableHead>
                <TableHead>{t('toolsPage.colRisk')}</TableHead>
                <TableHead>{t('toolsPage.colTimeout')}</TableHead>
                <TableHead>{t('toolsPage.colRetry')}</TableHead>
                <TableHead>{t('toolsPage.colIdempotent')}</TableHead>
                <TableHead>{t('toolsPage.colApproval')}</TableHead>
                <TableHead className="w-20">{t('toolsPage.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((tool) => (
                <TableRow key={tool.key}>
                  <TableCell className="font-mono text-xs font-medium">{tool.key}</TableCell>
                  <TableCell className="max-w-72 truncate text-sm">{tool.description}</TableCell>
                  <TableCell>
                    <Badge variant={RISK_STYLE[tool.risk].variant}>
                      {t(RISK_STYLE[tool.risk].labelKey)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {tool.contract?.timeout_seconds ?? '—'}s
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {tool.contract?.max_retries ?? '—'}
                  </TableCell>
                  <TableCell>
                    <BoolMark
                      value={tool.contract?.idempotent ?? false}
                      label={t('toolsPage.colIdempotent')}
                    />
                  </TableCell>
                  <TableCell>
                    <BoolMark
                      value={tool.contract?.approval_required ?? false}
                      label={t('toolsPage.colApproval')}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('toolsPage.testAria').replace('{key}', tool.key)}
                      onClick={() => setSelectedKey(tool.key)}
                    >
                      {t('toolsPage.test')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {tools.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    {t('toolsPage.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && <ToolDetail key={selected.key} tool={selected} />}
    </div>
  );
}
