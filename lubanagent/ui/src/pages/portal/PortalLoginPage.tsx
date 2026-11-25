/**
 * /portal 门户登录/注册页（R7）：终端用户入口，独立于工作台鉴权。
 * 令牌进 sessionStorage（lib/portal.ts），成功后跳 /chat 使用会话侧栏与文件面板。
 */

import { ArrowRight, KeyRound, Loader2, MessageCircle, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { portalLogin, portalRegister } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setLocale, localeToggleLabel, toggleLocale, useLocale, useT } from '@/lib/i18n';
import { setPortalSession } from '@/lib/portal';

type Mode = 'login' | 'register';

export default function PortalLoginPage() {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (username.trim() === '' || password === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response =
        mode === 'login'
          ? await portalLogin(username.trim(), password)
          : await portalRegister(username.trim(), password, displayName.trim() || undefined);
      setPortalSession(response);
      void navigate('/chat');
    } catch (exc) {
      setError(exc instanceof ApiError ? exc.message : t('portal.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.14),transparent_65%)]" />
      <div className="relative z-10 w-full max-w-md space-y-6 rounded-2xl border border-border/80 bg-card/95 p-8 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <MessageCircle className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">{t('portal.title')}</h1>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto font-mono text-xs"
            onClick={() => setLocale(toggleLocale())}
          >
            {localeToggleLabel(locale)}
          </Button>
        </div>

        <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/70 p-1 text-sm">
          {(['login', 'register'] as Mode[]).map((item) => (
            <button
              key={item}
              type="button"
              className={
                'flex-1 rounded-lg px-3 py-2 transition-all ' +
                (mode === item
                  ? 'bg-card font-medium text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground')
              }
              onClick={() => {
                setMode(item);
                setError(null);
              }}
            >
              {item === 'login' ? t('portal.login') : t('portal.register')}
            </button>
          ))}
        </div>

        <div className="space-y-3.5">
          <div className="relative">
            <UserRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t('portal.username')}
              aria-label={t('portal.username')}
              autoComplete="username"
            />
          </div>
          {mode === 'register' && (
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t('portal.displayName')}
              aria-label={t('portal.displayName')}
            />
          )}
          <div className="relative">
            <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              placeholder={t('portal.password')}
              aria-label={t('portal.password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          {mode === 'register' && (
            <p className="text-xs text-muted-foreground">{t('portal.passwordHint')}</p>
          )}
          {error !== null && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button className="w-full" onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {mode === 'login' ? t('portal.login') : t('portal.register')}
          </Button>
          <div className="border-t border-border/60 pt-3 text-center">
            <Link
              to="/agents"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              {t('chat.backToWorkbench')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
