/**
 * 工作台账号登录入口（H13 鉴权闭环）：
 * - 顶栏徽章：未登录（灰）/ 已登录（绿）/ 最近 401（红，打开对话框引导重新登录）；
 * - 对话框：账号 + 密码登录；令牌仅保存在当前页面内存，不写 localStorage、
 *   不进 URL，刷新页面需重新登录；
 * - 401 不自动重试：需要重新登录，这里提供人工恢复路径。
 * 历史：旧版这里还支持粘贴服务端 API Key 作破窗身份，已从 UI 移除——
 * 应急场景直接用 REST 带 Authorization: Bearer <API_KEY> 即可，不进登录框。
 */

import { KeyRound, LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useLogin, useLogout, useMe } from '@/api/access';
import { authStore, clearAllCredentials, setSession } from '@/lib/auth';
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
import { useT } from '@/lib/i18n';

export function useAuthState() {
  return useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot);
}

export function AuthStatus() {
  const t = useT();
  const { sessionToken, rejected } = useAuthState();
  const meQuery = useMe();
  const me = meQuery.data ?? null;
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const login = useLogin();
  const logout = useLogout();
  const previousRejected = useRef(false);

  // 最近 401（Key 缺失/失效/网关拒绝）→ 自动弹出恢复对话框（可关闭，不劫持导航）
  // 只在 401 边沿清缓存：后续 401 不再触发 refetch 风暴，恢复凭据后 rejected 复位。
  useEffect(() => {
    if (rejected && !previousRejected.current) {
      queryClient.clear();
      setOpen(true);
    }
    previousRejected.current = rejected;
  }, [rejected, queryClient]);

  async function handleLogin(): Promise<void> {
    if (username.trim() === '' || password === '') return;
    try {
      const result = await login.mutateAsync({ username: username.trim(), password });
      setSession(result.access_token, result.user);
      setUsername('');
      setPassword('');
      // 切换身份必须清空私密缓存，而不是只标记 stale。
      queryClient.clear();
      // clear 会移除旧账号数据；先回填新身份，让重挂载后的权限闸门
      // 立即命中缓存（数据刚写入视为新鲜，不会重复请求）。
      queryClient.setQueryData(['access', 'me'], result.user);
      // 兜底：epoch 重挂载是主恢复路径；若组件树未随纪元重建（如单测环境），
      // refetchQueries 让仍挂载的 observer 以新凭据重新取数。
      void queryClient.refetchQueries({ type: 'all' });
      setOpen(false);
    } catch {
      // 错误交由登录表单展示。
    }
  }

  function handleLogout(): void {
    logout.mutate(undefined, {
      onSettled: () => {
        clearAllCredentials();
        queryClient.clear();
      },
    });
    setOpen(false);
  }

  const variant = rejected ? 'destructive' : sessionToken !== null ? 'default' : 'secondary';
  const label = rejected
    ? t('auth.statusFailed')
    : sessionToken !== null
      ? t('auth.statusLoggedIn')
      : t('auth.statusNoKey');
  const identityLabel = me?.auth_enabled === false ? t('auth.devMode') : me?.display_name;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        aria-label={t('auth.accountAndKey')}
        onClick={() => setOpen(true)}
      >
        <KeyRound className="h-4 w-4" />
        <Badge variant={variant} className="font-mono text-xs" data-testid="auth-status">
          {label}
        </Badge>
        {identityLabel && (
          <Badge variant="outline" className="font-mono text-xs">
            <UserRound className="mr-1 h-3 w-3" />
            {identityLabel}
          </Badge>
        )}
      </Button>
      <DialogContent data-testid="auth-dialog">
        <DialogHeader>
          <DialogTitle>{t('auth.accountAndKey')}</DialogTitle>
          <DialogDescription>{t('auth.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {me?.auth_enabled === false ? (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
              {t('auth.devModeBanner')}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="login-username">{t('auth.username')}</Label>
                <Input
                  id="login-username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  data-testid="login-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">{t('auth.password')}</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleLogin();
                  }}
                  data-testid="login-password"
                />
              </div>
              {login.isError && (
                <p className="text-sm text-red-500" data-testid="login-error">
                  {t('auth.loginFailedPrefix')}
                  {login.error.message}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void handleLogin()}
                  disabled={login.isPending}
                  data-testid="login-submit"
                >
                  {t('auth.login')}
                </Button>
                {me?.auth_enabled && (
                  <Button variant="outline" onClick={handleLogout} data-testid="auth-logout">
                    <LogOut className="mr-1 h-4 w-4" />
                    {t('auth.logout')}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
