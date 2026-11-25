/**
 * 用户与角色管理（RBAC 管理端）：
 * - Tab 一：用户列表（搜索、新建用户弹窗、编辑角色弹窗、启停、重置密码）；
 * - Tab 二：角色主从视图（左侧角色列表，右侧权限矩阵按资源分组）；
 * - 前端只隐藏入口；真正的越权请求仍由后端拒绝，受保护角色由后端兜底。
 */

import { useMemo, useState } from 'react';

import {
  useCreateRole,
  useCreateUser,
  useDeleteRole,
  usePermissions as usePermissionCatalog,
  useRoles,
  useUpdateRole,
  useUpdateUser,
  useUsers,
  type RoleOut,
  type RoleUpsert,
  type UserOut,
} from '@/api/access';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PaginationBar, usePaged } from '@/components/ui/pagination';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions';
import { cn } from '@/lib/utils';

/** 权限点按 `资源:动作` 前缀分组；未知前缀原样展示。 */
const GROUP_LABELS: Record<string, string> = {
  audit: '审计',
  config: '配置',
  diagnostics: '排查',
  eval: '评测',
  run: '运行',
  security: '安全',
};

function groupPermissions(permissions: Array<{ key: string; name: string }>) {
  const groups = new Map<string, Array<{ key: string; name: string }>>();
  for (const permission of permissions) {
    const prefix = permission.key.split(':')[0] ?? permission.key;
    const bucket = groups.get(prefix) ?? [];
    bucket.push(permission);
    groups.set(prefix, bucket);
  }
  return [...groups.entries()];
}

function Checkbox({
  id,
  checked,
  disabled,
  onCheckedChange,
  label,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5 text-sm',
        !disabled && 'cursor-pointer hover:bg-muted/60',
        disabled && 'text-muted-foreground',
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export default function SecurityPage() {
  const t = useT();
  const usersQuery = useUsers();
  const rolesQuery = useRoles();
  const permissionCatalog = usePermissionCatalog();
  const { me } = usePermissions();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const users = usersQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const permissions = permissionCatalog.data ?? [];

  // ---- 用户 Tab 状态 ----
  const [userSearch, setUserSearch] = useState('');
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserRoleKeys, setNewUserRoleKeys] = useState<string[]>([]);
  const [rolesTarget, setRolesTarget] = useState<UserOut | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<{ id: string; username: string } | null>(
    null,
  );
  const [resetPassword, setResetPassword] = useState('');

  // ---- 角色 Tab 状态 ----
  const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);

  const mutationError = [
    createUser.error,
    updateUser.error,
    createRole.error,
    updateRole.error,
    deleteRole.error,
  ].find((error) => error !== null);

  const queryError = [usersQuery.error, rolesQuery.error, permissionCatalog.error].find(
    (error) => error !== null,
  );
  const queryLoading = usersQuery.isLoading || rolesQuery.isLoading || permissionCatalog.isLoading;

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    if (keyword === '') return users;
    return users.filter(
      (user) =>
        user.username.toLowerCase().includes(keyword) ||
        user.display_name.toLowerCase().includes(keyword),
    );
  }, [users, userSearch]);
  const {
    paged: pagedUsers,
    page,
    pageSize,
    total,
    totalPages,
    setPage,
  } = usePaged(filteredUsers);

  const selectedRole: RoleOut | null =
    roles.find((role) => role.key === selectedRoleKey) ?? roles[0] ?? null;
  const permissionGroups = useMemo(() => groupPermissions(permissions), [permissions]);

  function toggleValue(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function submitCreateUser(): Promise<void> {
    if (!newUsername.trim() || newPassword === '') return;
    try {
      await createUser.mutateAsync({
        username: newUsername.trim(),
        display_name: newDisplayName.trim() || newUsername.trim(),
        password: newPassword,
        role_keys: newUserRoleKeys,
        enabled: true,
      });
      setCreateUserOpen(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      setNewUserRoleKeys([]);
    } catch {
      // mutation.error 已统一展示，这里只阻止 Promise 冒泡成 unhandled rejection。
    }
  }

  async function submitCreateRole(): Promise<void> {
    if (!newRoleKey.trim()) return;
    const body: RoleUpsert = {
      key: newRoleKey.trim(),
      name: newRoleName.trim() || newRoleKey.trim(),
      permissions: newRolePermissions,
    };
    try {
      const created = await createRole.mutateAsync(body);
      setCreateRoleOpen(false);
      setNewRoleKey('');
      setNewRoleName('');
      setNewRolePermissions([]);
      setSelectedRoleKey(created.key);
    } catch {
      // 同上：错误状态由 mutation 对象保留。
    }
  }

  async function submitResetPassword(): Promise<void> {
    if (!passwordTarget || resetPassword === '') return;
    try {
      await updateUser.mutateAsync({
        id: passwordTarget.id,
        patch: { password: resetPassword },
      });
      setPasswordTarget(null);
      setResetPassword('');
    } catch {
      // 全局 mutationError 展示后端校验/权限错误。
    }
  }

  function toggleUserRole(user: UserOut, roleKey: string, checked: boolean): void {
    updateUser.mutate({
      id: user.id,
      patch: {
        role_keys: checked
          ? [...user.role_keys, roleKey]
          : user.role_keys.filter((key) => key !== roleKey),
      },
    });
  }

  function toggleRolePermission(role: RoleOut, permissionKey: string, checked: boolean): void {
    updateRole.mutate({
      key: role.key,
      name: role.name,
      permissions: checked
        ? [...role.permissions, permissionKey]
        : role.permissions.filter((key) => key !== permissionKey),
    });
  }

  function roleNameOf(key: string): string {
    return roles.find((role) => role.key === key)?.name ?? key;
  }

  return (
    <div className="space-y-6 p-6">
      <header className="border-b border-border/60 pb-4">
        <h1 className="text-xl font-semibold">{t('security.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('security.desc')}</p>
      </header>

      {mutationError && (
        <div className="rounded border border-red-500/50 p-3 text-sm text-red-500">
          {t('security.mutationFailed')}
          {mutationError.message}
        </div>
      )}
      {queryError && (
        <div className="rounded border border-red-500/50 p-3 text-sm text-red-500">
          {t('security.loadFailed')}
          {queryError.message}
        </div>
      )}
      {queryLoading && <p className="text-sm text-muted-foreground">{t('security.loading')}</p>}

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" data-testid="security-tab-users">
            {t('security.tabUsers').replace('{count}', String(users.length))}
          </TabsTrigger>
          <TabsTrigger value="roles" data-testid="security-tab-roles">
            {t('security.tabRoles').replace('{count}', String(roles.length))}
          </TabsTrigger>
        </TabsList>

        {/* ===== 用户 Tab ===== */}
        <TabsContent value="users" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Input
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder={t('security.searchPlaceholder')}
              className="max-w-xs"
              data-testid="security-user-search"
            />
            <Button onClick={() => setCreateUserOpen(true)} data-testid="security-open-create-user">
              {t('security.createUser')}
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('security.colAccount')}</TableHead>
                  <TableHead>{t('security.colRoles')}</TableHead>
                  <TableHead>{t('security.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('security.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedUsers.map((user) => (
                  <TableRow key={user.id} data-testid={`security-user-${user.username}`}>
                    <TableCell>
                      <div className="font-medium">{user.display_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {user.username}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {user.role_keys.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            {t('security.noRoles')}
                          </span>
                        )}
                        {user.role_keys.map((key) => (
                          <Badge key={key} variant="secondary" className="font-normal">
                            {roleNameOf(key)}
                          </Badge>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setRolesTarget(user)}
                          data-testid={`security-edit-roles-${user.username}`}
                        >
                          {t('security.editRoles')}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.enabled ? 'default' : 'outline'}>
                        {user.enabled ? t('security.enabled') : t('security.disabled')}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={me?.username === user.username}
                        onClick={() =>
                          updateUser.mutate({
                            id: user.id,
                            patch: { enabled: !user.enabled },
                          })
                        }
                      >
                        {user.enabled ? t('security.disableAction') : t('security.enableAction')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPasswordTarget({ id: user.id, username: user.username })}
                      >
                        {t('security.resetPassword')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && !usersQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      {t('security.usersEmpty')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </TabsContent>

        {/* ===== 角色 Tab：左列表 + 右权限矩阵 ===== */}
        <TabsContent value="roles">
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => setCreateRoleOpen(true)}
                  data-testid="security-open-create-role"
                >
                  {t('security.createRole')}
                </Button>
              </div>
              <div className="space-y-1.5">
                {roles.map((role) => (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => setSelectedRoleKey(role.key)}
                    data-testid={`security-role-${role.key}`}
                    className={cn(
                      'w-full rounded-md border p-3 text-left transition-colors',
                      selectedRole?.key === role.key
                        ? 'border-primary/60 bg-primary/5'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{role.name}</span>
                      {role.protected && (
                        <Badge variant="outline" className="text-xs">
                          {t('security.protectedTag')}
                        </Badge>
                      )}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{role.key}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {role.permissions.includes('*')
                        ? t('security.allPermissions')
                        : t('security.permissionCount').replace(
                            '{count}',
                            String(role.permissions.length),
                          )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {selectedRole && (
              <Card data-testid="security-role-detail">
                <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-base">{selectedRole.name}</CardTitle>
                    <p className="font-mono text-xs text-muted-foreground">
                      {selectedRole.key}
                      {selectedRole.permissions.includes('*') ? ' · *' : ''}
                    </p>
                  </div>
                  {!selectedRole.protected && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deleteRole.isPending && deleteRole.variables === selectedRole.key}
                      onClick={() => {
                        deleteRole.mutate(selectedRole.key);
                        setSelectedRoleKey(null);
                      }}
                    >
                      {t('security.delete')}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedRole.protected && (
                    <p className="text-xs text-muted-foreground">{t('security.protectedNote')}</p>
                  )}
                  {permissionGroups.map(([prefix, items]) => (
                    <div key={prefix}>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        {GROUP_LABELS[prefix] ?? prefix}
                      </div>
                      <div className="grid gap-0.5 rounded-md border p-1 sm:grid-cols-2">
                        {items.map((permission) => (
                          <Checkbox
                            key={permission.key}
                            id={`role-${selectedRole.key}-${permission.key}`}
                            label={`${permission.name}（${permission.key}）`}
                            checked={
                              selectedRole.protected ||
                              selectedRole.permissions.includes(permission.key) ||
                              selectedRole.permissions.includes('*')
                            }
                            disabled={
                              selectedRole.protected ||
                              (updateRole.isPending && updateRole.variables?.key === selectedRole.key)
                            }
                            onCheckedChange={(checked) =>
                              toggleRolePermission(selectedRole, permission.key, checked)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ===== 新建用户弹窗 ===== */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent data-testid="create-user-dialog">
          <DialogHeader>
            <DialogTitle>{t('security.createUser')}</DialogTitle>
            <DialogDescription>{t('security.createUserDesc')}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCreateUser();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-username">{t('security.username')}</Label>
              <Input
                id="new-username"
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-display-name">{t('security.displayName')}</Label>
              <Input
                id="new-display-name"
                value={newDisplayName}
                onChange={(event) => setNewDisplayName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-password">{t('security.initialPassword')}</Label>
              <Input
                id="new-password"
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('security.initialRoles')}</Label>
              <div className="flex flex-wrap gap-1">
                {roles.map((role) => (
                  <Checkbox
                    key={role.key}
                    id={`new-user-role-${role.key}`}
                    label={role.name}
                    checked={newUserRoleKeys.includes(role.key)}
                    onCheckedChange={() =>
                      setNewUserRoleKeys((prev) => toggleValue(prev, role.key))
                    }
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createUser.isPending} data-testid="create-user-submit">
                {t('security.createUser')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== 编辑用户角色弹窗 ===== */}
      <Dialog
        open={rolesTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRolesTarget(null);
        }}
      >
        <DialogContent data-testid="user-roles-dialog">
          <DialogHeader>
            <DialogTitle>
              {t('security.rolesForUser').replace('{name}', rolesTarget?.display_name ?? '')}
            </DialogTitle>
            <DialogDescription>{t('security.rolesForUserDesc')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
            {roles.map((role) => (
              <Checkbox
                key={role.key}
                id={`user-${rolesTarget?.id}-role-${role.key}`}
                label={role.name}
                checked={rolesTarget?.role_keys.includes(role.key) ?? false}
                disabled={updateUser.isPending && updateUser.variables?.id === rolesTarget?.id}
                onCheckedChange={(checked) => {
                  if (rolesTarget) toggleUserRole(rolesTarget, role.key, checked);
                }}
              />
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRolesTarget(null)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 新建角色弹窗 ===== */}
      <Dialog open={createRoleOpen} onOpenChange={setCreateRoleOpen}>
        <DialogContent data-testid="create-role-dialog">
          <DialogHeader>
            <DialogTitle>{t('security.createRole')}</DialogTitle>
            <DialogDescription>{t('security.createRoleDesc')}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCreateRole();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-role-key">{t('security.roleKey')}</Label>
              <Input
                id="new-role-key"
                value={newRoleKey}
                onChange={(event) => setNewRoleKey(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-role-name">{t('security.roleName')}</Label>
              <Input
                id="new-role-name"
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('security.permissions')}</Label>
              <div className="grid gap-0.5 sm:grid-cols-2">
                {permissions.map((permission) => (
                  <Checkbox
                    key={permission.key}
                    id={`new-role-${permission.key}`}
                    label={permission.name}
                    checked={newRolePermissions.includes(permission.key)}
                    onCheckedChange={() =>
                      setNewRolePermissions((prev) => toggleValue(prev, permission.key))
                    }
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createRole.isPending} data-testid="create-role-submit">
                {t('security.createRole')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== 重置密码弹窗 ===== */}
      <Dialog
        open={passwordTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordTarget(null);
            setResetPassword('');
          }
        }}
      >
        <DialogContent data-testid="reset-password-dialog">
          <DialogHeader>
            <DialogTitle>{t('security.resetPassword')}</DialogTitle>
            <DialogDescription>
              {t('security.resetDesc').replace('{name}', passwordTarget?.username ?? '')}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitResetPassword();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="reset-password">{t('security.newPassword')}</Label>
              <Input
                id="reset-password"
                type="password"
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                data-testid="reset-password-input"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPasswordTarget(null);
                  setResetPassword('');
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={updateUser.isPending}
                data-testid="reset-password-submit"
              >
                {t('security.saveNewPassword')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
