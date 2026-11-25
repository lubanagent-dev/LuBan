/**
 * /knowledge 知识库管理：知识源列表 + 多格式文档上传 + 切块查看 + 重新切块 + 检索测试。
 * 上传经 POST /v1/knowledge/sources（multipart，支持 md/txt/pdf/docx/csv/json/html/xml），
 * 文件落盘 data/knowledge/{name}/，切块向量化入 KnowledgeStore；重切按新参数从盘上重读；
 * 检索测试直接调 POST /v1/knowledge/query 看命中块与 score（调 Agent 阈值用）。
 */

import { Search, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';

import {
  useDeleteKnowledgeSource,
  useKnowledgeChunks,
  useKnowledgeQuery,
  useKnowledgeSources,
  useRechunkKnowledgeSource,
  useUploadKnowledgeSource,
  type KnowledgeSourceOut,
} from '@/api/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n';

const SOURCE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace('T', ' ').replace(/:\d+\.\d+Z?$/, '');
}

export default function KnowledgePage() {
  const t = useT();
  const sourcesQuery = useKnowledgeSources();
  const delSource = useDeleteKnowledgeSource();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewingChunks, setViewingChunks] = useState<KnowledgeSourceOut | null>(null);
  const [rechunking, setRechunking] = useState<KnowledgeSourceOut | null>(null);

  const sources = sourcesQuery.data ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-semibold">{t('kb.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('kb.subtitle')}</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="mr-1.5 h-4 w-4" />
          {t('kb.upload')}
        </Button>
      </div>

      {sourcesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
      {sourcesQuery.error && (
        <p className="text-sm text-destructive">
          {t('diag.loadFailedPrefix')}
          {sourcesQuery.error.message}
        </p>
      )}

      {sourcesQuery.isSuccess && (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('versions.name')}</TableHead>
                <TableHead>{t('form.description')}</TableHead>
                <TableHead>{t('kb.col.files')}</TableHead>
                <TableHead>{t('kb.col.chunks')}</TableHead>
                <TableHead>{t('kb.col.params')}</TableHead>
                <TableHead>{t('diag.col.time')}</TableHead>
                <TableHead className="w-52">{t('evals.col.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.name}>
                  <TableCell className="font-mono text-xs font-medium">{source.name}</TableCell>
                  <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                    {source.description || '—'}
                  </TableCell>
                  <TableCell className="text-sm">{source.files?.length ?? 0}</TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="outline">{source.chunk_count}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {source.managed ? (
                      <span className="font-mono text-xs">
                        {source.chunk_size}/{source.overlap}
                      </span>
                    ) : (
                      <Badge variant="secondary">{t('kb.builtin')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(source.updated_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingChunks(source)}
                      >
                        {t('kb.viewChunks')}
                      </Button>
                      {source.managed && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setRechunking(source)}>
                            {t('kb.rechunk')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={delSource.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t('kb.deleteConfirm').replace('{name}', source.name),
                                )
                              )
                                delSource.mutate(source.name);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    {t('kb.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <RetrievalTestPanel sources={sources} />

      <UploadSourceDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <ChunksDialog source={viewingChunks} onClose={() => setViewingChunks(null)} />
      <RechunkDialog source={rechunking} onClose={() => setRechunking(null)} />
    </div>
  );
}

function UploadSourceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const upload = useUploadKnowledgeSource();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chunkSize, setChunkSize] = useState(500);
  const [overlap, setOverlap] = useState(50);
  const [files, setFiles] = useState<File[]>([]);

  const nameValid = SOURCE_NAME_PATTERN.test(name);
  const paramsValid = chunkSize > 0 && overlap >= 0 && overlap < chunkSize;
  const valid = nameValid && paramsValid && files.length > 0;

  const close = () => {
    onOpenChange(false);
    setName('');
    setDescription('');
    setChunkSize(500);
    setOverlap(50);
    setFiles([]);
  };

  const submit = () => {
    if (!valid) return;
    upload.mutate(
      { name, description, chunk_size: chunkSize, overlap, files },
      { onSuccess: close },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('kb.uploadTitle')}</DialogTitle>
          <DialogDescription>{t('kb.uploadDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ks-name">{t('kb.nameLabel')}</Label>
            <Input
              id="ks-name"
              placeholder={t('kb.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {name !== '' && !nameValid && (
              <p className="text-xs text-destructive">
                {t('kb.nameError')}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ks-desc">{t('kb.descLabel')}</Label>
            <Input
              id="ks-desc"
              placeholder={t('kb.descPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ks-chunk">{t('kb.chunkSizeLabel')}</Label>
              <Input
                id="ks-chunk"
                type="number"
                min={1}
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ks-overlap">{t('kb.overlapLabel')}</Label>
              <Input
                id="ks-overlap"
                type="number"
                min={0}
                value={overlap}
                onChange={(e) => setOverlap(Number(e.target.value))}
              />
            </div>
          </div>
          {!paramsValid && (
            <p className="text-xs text-destructive">{t('kb.overlapError')}</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ks-files">{t('kb.filesLabel')}</Label>
            <input
              id="ks-files"
              type="file"
              multiple
              accept=".md,.txt,.pdf,.docx,.csv,.json,.html,.xml"
              className="text-sm"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('kb.selectedFiles').replace('{n}', String(files.length))}
                {files.map((f) => f.name).join('、')}
              </p>
            )}
          </div>
        </div>
        {upload.error && <p className="text-sm text-destructive">{upload.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!valid || upload.isPending} onClick={submit}>
            {upload.isPending ? t('avatar.uploading') : t('avatar.upload')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChunksDialog({
  source,
  onClose,
}: {
  source: KnowledgeSourceOut | null;
  onClose: () => void;
}) {
  const t = useT();
  const chunksQuery = useKnowledgeChunks(source?.name ?? '');
  const chunks = chunksQuery.data ?? [];

  return (
    <Dialog open={source !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {source?.name}
            {t('kb.chunksSuffix')}
          </DialogTitle>
          <DialogDescription>
            {t('kb.chunksCount')
              .replace('{total}', String(source?.chunk_count ?? 0))
              .replace('{shown}', String(Math.min(chunks.length, 200)))}
          </DialogDescription>
        </DialogHeader>
        {chunksQuery.isLoading && (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        )}
        {chunksQuery.error && (
          <p className="text-sm text-destructive">
            {t('diag.loadFailedPrefix')}
            {chunksQuery.error.message}
          </p>
        )}
        {chunksQuery.isSuccess && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>{t('kb.col.content')}</TableHead>
                  <TableHead className="w-32">{t('kb.col.sourceFile')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chunks.map((chunk) => (
                  <TableRow key={chunk.chunk_index}>
                    <TableCell className="font-mono text-xs">{chunk.chunk_index}</TableCell>
                    <TableCell
                      className="max-w-96 truncate text-sm"
                      title={chunk.content}
                    >
                      {chunk.content}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {String(chunk.metadata?.filename ?? '—')}
                    </TableCell>
                  </TableRow>
                ))}
                {chunks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      {t('kb.noChunks')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RechunkDialog({
  source,
  onClose,
}: {
  source: KnowledgeSourceOut | null;
  onClose: () => void;
}) {
  const t = useT();
  const rechunk = useRechunkKnowledgeSource(source?.name ?? '');
  const [chunkSize, setChunkSize] = useState(0);
  const [overlap, setOverlap] = useState(0);
  const [initialized, setInitialized] = useState('');

  // 对话框每次打开按源当前参数预填（initialized 记 source.name 防止重复初始化）
  if (source && initialized !== source.name) {
    setChunkSize(source.chunk_size ?? 500);
    setOverlap(source.overlap ?? 50);
    setInitialized(source.name);
  }

  const paramsValid = chunkSize > 0 && overlap >= 0 && overlap < chunkSize;

  const submit = () => {
    if (!source || !paramsValid) return;
    if (
      !window.confirm(
        t('kb.rechunkConfirm')
          .replace('{size}', String(chunkSize))
          .replace('{overlap}', String(overlap))
          .replace('{name}', source.name),
      )
    )
      return;
    rechunk.mutate({ chunk_size: chunkSize, overlap }, { onSuccess: onClose });
  };

  return (
    <Dialog open={source !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('kb.rechunkTitle').replace('{name}', source?.name ?? '')}</DialogTitle>
          <DialogDescription>
            {t('kb.rechunkDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rc-chunk">{t('kb.chunkSizeLabel')}</Label>
            <Input
              id="rc-chunk"
              type="number"
              min={1}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc-overlap">{t('kb.overlapLabel')}</Label>
            <Input
              id="rc-overlap"
              type="number"
              min={0}
              value={overlap}
              onChange={(e) => setOverlap(Number(e.target.value))}
            />
          </div>
        </div>
        {!paramsValid && <p className="text-xs text-destructive">{t('kb.overlapError')}</p>}
        {rechunk.error && <p className="text-sm text-destructive">{rechunk.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!paramsValid || rechunk.isPending} onClick={submit}>
            {rechunk.isPending ? t('kb.rechunking') : t('kb.rechunk')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RetrievalTestPanel({ sources }: { sources: KnowledgeSourceOut[] }) {
  const t = useT();
  const queryMutation = useKnowledgeQuery();
  const [source, setSource] = useState('all');
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const hits = queryMutation.data ?? [];

  const submit = () => {
    if (!query.trim()) return;
    queryMutation.mutate({
      query: query.trim(),
      source: source === 'all' ? null : source,
      top_k: topK,
    });
  };

  return (
    <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm">
      <h2 className="mb-1 text-base font-semibold">{t('kb.testTitle')}</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {t('kb.testDesc')}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56 space-y-1.5">
          <Label htmlFor="rt-source">{t('kb.testSource')}</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger id="rt-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('kb.testAllSources')}</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="rt-query">{t('kb.testQueryLabel')}</Label>
          <Textarea
            id="rt-query"
            placeholder={t('kb.testQueryPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor="rt-topk">top_k</Label>
          <Input
            id="rt-topk"
            type="number"
            min={1}
            max={50}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
          />
        </div>
        <Button
          disabled={!query.trim() || queryMutation.isPending}
          onClick={submit}
        >
          <Search className="mr-1.5 h-4 w-4" />
          {queryMutation.isPending ? t('kb.testing') : t('kb.testButton')}
        </Button>
      </div>
      {queryMutation.error && (
        <p className="mt-3 text-sm text-destructive">
          {t('kb.testFailedPrefix')}
          {queryMutation.error.message}
        </p>
      )}
      {queryMutation.isSuccess && (
        <div className="mt-3 space-y-2">
          {hits.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('kb.noHits')}</p>
          )}
          {hits.map((hit) => (
            <div key={`${hit.source}-${hit.chunk_index}`} className="rounded-md border p-2">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{hit.score.toFixed(3)}</Badge>
                <span className="font-mono">{hit.source}</span>
                <span>#{hit.chunk_index}</span>
                {hit.metadata?.filename ? <span>{String(hit.metadata.filename)}</span> : null}
              </div>
              <p className="text-sm">{hit.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
