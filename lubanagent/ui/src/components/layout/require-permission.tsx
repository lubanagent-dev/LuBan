/** 路由级权限闸门：未登录引导登录，已登录但无权限显示 403。 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { setLoginModalOpen } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions';

export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { me, isLoading, error, can } = usePermissions();
  const t = useT();

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">{t('perm.loading')}</p>;
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/40">
          <CardHeader>
            <CardTitle className="text-xl">{t('perm.loadFailed')}</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="p-6">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="text-xl">{t('perm.loginRequired')}</CardTitle>
            <CardDescription>{t('perm.loginRequiredDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2.5">
            <Button onClick={() => setLoginModalOpen(true)}>
              {t('auth.login')}
            </Button>
            <Button asChild variant="outline">
              <Link to="/agents">{t('perm.backToWorkbench')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!can(permission)) {
    return (
      <div className="p-6">
        <Card className="mx-auto max-w-lg border-red-500/40" data-testid="forbidden-page">
          <CardHeader>
            <CardTitle className="text-xl">{t('perm.forbidden')}</CardTitle>
            <CardDescription>
              {t('perm.forbiddenDescPre').replace('{name}', me.display_name)}
              <span className="font-mono">{permission}</span>
              {t('perm.forbiddenDescPost')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2.5">
            <Button onClick={() => setLoginModalOpen(true)}>
              {t('auth.login')}
            </Button>
            <Button asChild variant="outline">
              <Link to="/agents">{t('perm.backToWorkbench')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
