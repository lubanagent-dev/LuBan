import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/client';
import { Topbar } from '@/components/layout/topbar';
import { formatDateTime } from '@/lib/format';

import { getLocale, setLocale, t, translate, useT } from './i18n';
import { dictionaries } from './locales';

afterEach(() => {
  act(() => setLocale('zh-CN'));
  localStorage.removeItem('luban-lang');
  vi.restoreAllMocks();
});

describe('workbench language', () => {
  it('both dictionaries contain the same nonempty translations', () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual(Object.keys(dictionaries['zh-CN']).sort());
    for (const message of Object.values(dictionaries.en)) expect(message.trim()).not.toBe('');
  });

  it('every literal translation key used by the interface resolves in English', () => {
    function check(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) check(path);
        else if (/\.tsx?$/.test(path) && !path.includes('.test.')) {
          const source = readFileSync(path, 'utf8');
          for (const match of source.matchAll(/\bt\(['"]([^'"]+)['"]\)/g)) {
            expect(translate('en', match[1]), `${path}: ${match[1]}`).not.toBe(match[1]);
          }
        }
      }
    }
    check(join(process.cwd(), 'src'));
  });

  it('switches the top bar, HTML language and title and remembers the choice', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Topbar />
      </QueryClientProvider>,
    );
    expect(screen.getByText('开发者工作台')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '切换语言' }));
    expect(screen.getByText('Developer Workbench')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('LubanAgent Workbench');
    expect(localStorage.getItem('luban-lang')).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }));
    expect(screen.getByText('开发者工作台')).toBeInTheDocument();
    client.clear();
  });

  it('changes static text without remounting or changing business input', () => {
    function Editor() {
      const text = useT();
      return (
        <>
          <label htmlFor="business">{text('topbar.title')}</label>
          <input id="business" defaultValue="我的业务输入" />
        </>
      );
    }
    render(<Editor />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '你好 — preserve me' } });
    act(() => setLocale('en'));
    expect(screen.getByText('Developer Workbench')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('你好 — preserve me');
  });

  it('keeps backend messages verbatim and only translates fallback errors', () => {
    setLocale('en');
    expect(new ApiError({ message: '业务错误原文' }, 400).message).toBe('业务错误原文');
    expect(new ApiError({}, 500).message).toBe('Request failed: 500');
    expect(translate('en', 'an-unknown-business-value')).toBe('an-unknown-business-value');
    expect(t('api.uploadFailed')).toBe('Upload failed');
  });

  it('uses the selected locale for dates and survives unavailable storage', () => {
    const date = '2026-11-16T01:02:03Z';
    setLocale('en');
    expect(formatDateTime(date)).toBe(new Date(date).toLocaleString('en', { hour12: false }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setLocale('zh-CN')).not.toThrow();
    expect(getLocale()).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
