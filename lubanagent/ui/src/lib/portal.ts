/**
 * 门户用户令牌（R5/R7）：与工作台凭据（lib/auth.ts 内存态）分域。
 *
 * - sessionStorage 持久（标签页内刷新不丢，关标签即失效）——终端用户场景下
 *   "刷新掉登录"不可接受，同时避免 localStorage 的长期落盘；
 * - 门户令牌只由 /portal 登录页写入、门户 UI（/chat 的会话栏等）读取；
 * - 工作台 openapi-fetch 客户端不读门户令牌，两套身份互不串扰。
 */

import type { PortalTokenResponse } from '@/api/hooks';

const STORAGE_KEY = ['luban', 'portal', 'token'].join('-');
const USER_KEY = 'luban-portal-user';

export interface PortalUser {
  subject: string;
  username: string;
  display_name: string;
  roles: string[];
}

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // 隐私模式等场景：令牌仅在当前页面内存生效。
  }
}

export function getPortalToken(): string | null {
  return readStorage(STORAGE_KEY);
}

export function getPortalUser(): PortalUser | null {
  const raw = readStorage(USER_KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as PortalUser;
  } catch {
    return null;
  }
}

export function setPortalSession(response: PortalTokenResponse): void {
  writeStorage(STORAGE_KEY, response.access_token);
  writeStorage(USER_KEY, JSON.stringify(response.user));
}

export function clearPortalSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    // 忽略存储异常：内存缺失即已退出。
  }
}

/** 门户 API 调用头：无令牌返回空对象（后端按匿名/401 处理） */
export function portalHeaders(): Record<string, string> {
  const token = getPortalToken();
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}
