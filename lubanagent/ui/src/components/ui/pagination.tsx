/**
 * 通用客户端分页条：配合任意已取回内存的列表使用。
 * usePaged 负责切片，PaginationBar 负责展示 上一页/下一页 与区间信息。
 */

import { useMemo, useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

export function usePaged<T>(items: T[], defaultPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  return {
    paged,
    page: safePage,
    pageSize,
    total,
    totalPages,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };
}

export function PaginationBar({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const t = useT();
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-end gap-2 pt-2 text-sm text-muted-foreground">
      <span data-testid="pagination-info">
        {t('pagination.info')
          .replace('{start}', String(start))
          .replace('{end}', String(end))
          .replace('{total}', String(total))}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        aria-label={t('pagination.prev')}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-14 text-center">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        aria-label={t('pagination.next')}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
