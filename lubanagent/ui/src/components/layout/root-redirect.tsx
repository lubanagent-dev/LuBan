/** 根路径默认落点：门户用户直达对话页；未登录进门户登录页。工作台固定走 /agents。 */

import { Navigate } from 'react-router-dom';

import { getPortalToken } from '@/lib/portal';

export function RootRedirect() {
  return <Navigate to={getPortalToken() !== null ? '/chat' : '/portal'} replace />;
}
