import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { securityUsers } from '@/mocks/fixtures';
import { server } from '@/mocks/node';
import { routeObjects } from '@/routes';

function renderSecurity() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routeObjects, { initialEntries: ['/security'] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function openRolesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('security-tab-roles'));
  await screen.findByTestId('security-role-detail');
}

describe('用户与角色页（RBAC 管理端）', () => {
  it('用户列表与角色权限矩阵分开两个 Tab；admin 保持受保护', async () => {
    const user = userEvent.setup();
    renderSecurity();
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByTestId('security-user-bob')).toBeInTheDocument();

    await openRolesTab(user);
    expect(screen.getByTestId('security-role-admin')).toBeInTheDocument();
    // 默认选中第一个角色（admin），右侧权限矩阵中 admin 权限点禁用。
    expect(screen.getByTestId('security-role-detail')).toHaveTextContent('管理员');
    const adminPermission = document.querySelector<HTMLInputElement>(
      '#role-admin-security\\:manage',
    );
    expect(adminPermission).not.toBeNull();
    expect(adminPermission).toBeDisabled();
  });

  it('新建用户走弹窗并分配初始角色', async () => {
    const user = userEvent.setup();
    renderSecurity();
    expect(await screen.findByText('Alice')).toBeInTheDocument();

    await user.click(screen.getByTestId('security-open-create-user'));
    await screen.findByTestId('create-user-dialog');
    await user.type(screen.getByLabelText('用户名'), 'carol');
    await user.type(screen.getByLabelText('显示名'), 'Carol');
    await user.type(screen.getByLabelText('初始密码'), 'secret123');
    const viewerCheckbox = document.querySelector<HTMLInputElement>('#new-user-role-viewer');
    expect(viewerCheckbox).not.toBeNull();
    await user.click(viewerCheckbox!);
    await user.click(screen.getByTestId('create-user-submit'));

    expect(await screen.findByTestId('security-user-carol')).toBeInTheDocument();
    expect(screen.getByTestId('security-user-carol')).toHaveTextContent('Carol');
    expect(screen.queryByTestId('create-user-dialog')).not.toBeInTheDocument();
  });

  it('搜索框按用户名/显示名过滤用户列表', async () => {
    const user = userEvent.setup();
    renderSecurity();
    expect(await screen.findByTestId('security-user-alice')).toBeInTheDocument();

    await user.type(screen.getByTestId('security-user-search'), 'bob');
    expect(screen.queryByTestId('security-user-alice')).not.toBeInTheDocument();
    expect(screen.getByTestId('security-user-bob')).toBeInTheDocument();

    await user.clear(screen.getByTestId('security-user-search'));
    expect(screen.getByTestId('security-user-alice')).toBeInTheDocument();
  });

  it('用户读取失败时显示错误，而不是让用户表看起来是空列表', async () => {
    server.use(
      http.get('*/v1/security/users', () =>
        HttpResponse.json(
          { error: { code: 'DB_ERROR', message: 'user store unavailable' } },
          { status: 500 },
        ),
      ),
    );
    renderSecurity();
    expect(await screen.findByText('数据读取失败：user store unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('security-user-alice')).not.toBeInTheDocument();
  });

  it('重置密码走 PATCH 并刷新当前账号权限缓存', async () => {
    const user = userEvent.setup();
    const patchBodies: Array<Record<string, unknown>> = [];
    let meCalls = 0;
    server.use(
      http.get('*/v1/auth/me', () => {
        meCalls += 1;
        return HttpResponse.json({
          subject: 'user:1',
          id: 'u-admin',
          username: 'alice',
          display_name: 'Alice',
          roles: ['admin'],
          role_keys: ['admin'],
          permissions: ['*'],
          auth_enabled: true,
          is_bootstrap: true,
        });
      }),
      http.patch('*/v1/security/users/:id', async ({ request }) => {
        patchBodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(securityUsers[0]);
      }),
    );
    renderSecurity();
    expect(await screen.findByTestId('security-user-alice')).toBeInTheDocument();

    const aliceRow = screen.getByTestId('security-user-alice');
    await user.click(within(aliceRow).getByRole('button', { name: '重置密码' }));
    await user.type(screen.getByTestId('reset-password-input'), 'new-password-123');
    await user.click(screen.getByTestId('reset-password-submit'));

    await waitFor(() => expect(patchBodies).toEqual([{ password: 'new-password-123' }]));
    await waitFor(() => expect(meCalls).toBeGreaterThan(1));
    expect(screen.queryByTestId('reset-password-dialog')).not.toBeInTheDocument();
  });

  it('编辑用户角色走弹窗；请求未完成前禁用，避免快速点击竞态', async () => {
    const user = userEvent.setup();
    let patchCalls = 0;
    server.use(
      http.patch('*/v1/security/users/:id', async () => {
        patchCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return HttpResponse.json(securityUsers[1]);
      }),
    );
    renderSecurity();
    expect(await screen.findByTestId('security-user-bob')).toBeInTheDocument();

    await user.click(screen.getByTestId('security-edit-roles-bob'));
    await screen.findByTestId('user-roles-dialog');

    const checkbox = document.querySelector<HTMLInputElement>('#user-u-operator-role-viewer');
    expect(checkbox).not.toBeNull();
    await user.click(checkbox!);
    expect(checkbox).toBeDisabled();

    await user.click(checkbox!);
    await waitFor(() => expect(checkbox).not.toBeDisabled());
    expect(patchCalls).toBe(1);
  });

  it('选中角色后编辑权限矩阵；变更后刷新 access/me 同步 UI 权限', async () => {
    const user = userEvent.setup();
    let meCalls = 0;
    let rolePatch: Record<string, unknown> | null = null;
    server.use(
      http.get('*/v1/auth/me', () => {
        meCalls += 1;
        return HttpResponse.json({
          subject: 'user:1',
          id: 'u-admin',
          username: 'alice',
          display_name: 'Alice',
          roles: ['admin'],
          role_keys: ['admin'],
          permissions: ['*'],
          auth_enabled: true,
          is_bootstrap: true,
        });
      }),
      http.patch('*/v1/security/roles/:key', async ({ request }) => {
        rolePatch = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          key: 'operator',
          name: '操作员',
          protected: false,
          permissions: ['config:read', 'config:write', 'run:read'],
        });
      }),
    );
    renderSecurity();
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    await openRolesTab(user);

    // 默认选中 admin；切换到 operator 后编辑其权限。
    await user.click(screen.getByTestId('security-role-operator'));
    expect(screen.getByTestId('security-role-detail')).toHaveTextContent('操作员');

    await user.click(
      within(screen.getByTestId('security-role-detail')).getByLabelText('修改配置（config:write）'),
    );

    await waitFor(() => expect(rolePatch).not.toBeNull());
    expect(rolePatch).toMatchObject({ name: '操作员' });
    await waitFor(() => expect(meCalls).toBeGreaterThan(1));
  });
});
