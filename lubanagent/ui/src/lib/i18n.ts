/**
 * 工作台静态文案 i18n：zh-CN 默认，en 可切换。
 * - localStorage（luban-lang）持久化，刷新后保持所选语言；
 * - document.documentElement.lang 跟随切换（a11y / 浏览器翻译提示）；
 * - 仅覆盖 UI 静态字符串：用户数据、后端返回的业务内容、请求 payload 一律不翻译；
 * - 不引入第三方 i18n 依赖，store 用 useSyncExternalStore 驱动整树刷新。
 */

import { useCallback, useSyncExternalStore } from 'react';

import { dictionaries, type Locale } from './locales';

export type { Locale };

export const LOCALES: Locale[] = ['zh-CN', 'en'];

const STORAGE_KEY = 'luban-lang';
const DEFAULT_LOCALE: Locale = 'zh-CN';
const COMMON_MESSAGES: Record<string, [string, string]> = {
  'common.close': ['关闭', 'Close'],
  'api.requestFailed': ['请求失败', 'Request failed'],
  'api.identityFailed': ['读取身份失败', 'Failed to load identity'],
  'api.loginFailed': ['登录失败', 'Login failed'],
  'api.emptyResponse': ['响应无数据', 'Response has no data'],
  'api.uploadFailed': ['上传失败', 'Upload failed'],
  'api.deleteFailed': ['删除失败', 'Delete failed'],
  'api.assignFailed': ['分配失败', 'Assignment failed'],
  'api.emptyStream': [
    '响应无 body，无法读取 SSE 流',
    'Response has no body; cannot read the SSE stream',
  ],
  'common.current': ['当前', 'Current'],
  'brain.alias': ['旧标识', 'previous identifier'],
  'brain.currentDefinition': ['当前定义', 'current definition'],
};

function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en';
}

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

let currentLocale: Locale = readStoredLocale();
const listeners = new Set<() => void>();

/** 同步 <html lang>；jsdom / SSR 无 document 时静默跳过。 */
export function applyDocumentLang(locale: Locale = currentLocale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.title = locale === 'en' ? 'LubanAgent Workbench' : 'LubanAgent 工作台';
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (!isLocale(locale)) return;
  const changed = locale !== currentLocale;
  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 隐私模式等场景：语言仅在当前页面生效，不阻塞切换。
  }
  applyDocumentLang(locale);
  if (changed) listeners.forEach((listener) => listener());
}

export function toggleLocale(): Locale {
  const next: Locale = currentLocale === 'zh-CN' ? 'en' : 'zh-CN';
  setLocale(next);
  return next;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 非响应式读取翻译（模块级常量、纯函数用）；组件内一律用 useT。 */
export function translate(locale: Locale, key: string): string {
  const common = COMMON_MESSAGES[key];
  if (common) return common[locale === 'en' ? 1 : 0];
  return dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
}

export function t(key: string): string {
  return translate(currentLocale, key);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

/** 组件内取翻译函数：订阅 locale store，切换后所有用到的组件整树刷新。 */
export function useT(): (key: string) => string {
  const locale = useLocale();
  return useCallback((key: string) => translate(locale, key), [locale]);
}

/** 语言切换按钮通用文案：显示另一种语言的名字。 */
export function localeToggleLabel(locale: Locale): string {
  return locale === 'zh-CN' ? 'English' : '中文';
}

// 模块加载即对齐 <html lang>，避免默认语言与文档语言不一致。
applyDocumentLang();
