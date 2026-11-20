/** 顶栏鉴权入口：状态徽章、401 → 弹窗登录恢复 → 查询重拉。 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { server } from '@/mocks/node';
import { clearAllCredentials, markUnauthorized, setSession, type SessionUser } from '@/lib/auth';

import { AuthStatus } from './auth-status';

function renderAuthStatus() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthStatus />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  clearAllCredentials();
});

const authedMe: SessionUser = {
  subject: 'u-admin',
  username: 'alice',
  display_name: 'Alice',
  roles: ['admin'],
  permissions: ['*'],
  auth_enabled: true,
  is_bootstrap: true,
};

describe('AuthStatus（顶栏鉴权入口）', () => {
  it('未登录时徽章显示未登录；401 登记后自动弹窗引导重新登录', async () => {
    renderAuthStatus();
    expect(screen.getByTestId('auth-status')).toHaveTextContent('未登录');
    markUnauthorized();

    await waitFor(() => expect(screen.getByTestId('auth-dialog')).toBeInTheDocument());
    expect(screen.getByTestId('auth-status')).toHaveTextContent('鉴权失败');
    expect(screen.queryByTestId('api-key-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-username')).toBeInTheDocument();
  });

  it('支持账号登录；成功后切换身份并清空 React Query 缓存', async () => {
    server.use(
      http.get('*/v1/auth/me', () => new HttpResponse(null, { status: 401 })),
      http.post('*/v1/auth/login', () =>
        HttpResponse.json({
          access_token: 'session-admin',
          token_type: 'bearer',
          expires_at: '2026-07-23T11:00:00Z',
          user: authedMe,
        }),
      ),
    );
    const user = userEvent.setup();
    renderAuthStatus();
    await waitFor(() => expect(screen.getByTestId('auth-status')).toHaveTextContent('鉴权失败'));
    // 401 已自动打开恢复对话框；不需要再点顶栏入口。
    if (!screen.queryByTestId('auth-dialog')) {
      await user.click(screen.getByRole('button', { name: '账号' }));
    }
    await user.type(screen.getByTestId('login-username'), 'alice');
    await user.type(screen.getByTestId('login-password'), 'admin123');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByTestId('auth-status')).toHaveTextContent('已登录');
    expect(screen.queryByTestId('auth-dialog')).not.toBeInTheDocument();
  });

  it('退出登录清除账号令牌，并回到本地开发身份', async () => {
    setSession('session-admin', authedMe);
    const user = userEvent.setup();
    renderAuthStatus();
    expect(await screen.findByText('Alice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '账号' }));
    await user.click(screen.getByTestId('auth-logout'));

    await screen.findByText('开发模式');
    expect(screen.queryByTestId('auth-dialog')).not.toBeInTheDocument();
  });

  it('登录密码错误只显示表单错误，不登记全局当前凭据 401', async () => {
    server.use(
      http.get('*/v1/auth/me', () => HttpResponse.json(authedMe)),
      http.post('*/v1/auth/login', () =>
        HttpResponse.json(
          { error: { code: 'AUTH_FAILED', message: '用户名或密码错误' } },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderAuthStatus();
    expect(await screen.findByText('Alice')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '账号' }));
    await user.type(screen.getByTestId('login-username'), 'alice');
    await user.type(screen.getByTestId('login-password'), 'wrong-password');
    await user.click(screen.getByTestId('login-submit'));

    expect(await screen.findByTestId('login-error')).toHaveTextContent('用户名或密码错误');
    expect(screen.getByTestId('auth-status')).toHaveTextContent('未登录');
  });
});
