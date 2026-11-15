/**
 * 服务端账户会话 —— 转发到 shared-core 的统一认证。
 *
 * 本项目原先自建了一整套认证 Provider（会话探测、登录、注册、登出、
 * 401 全局事件监听），与 @shared/core 的实现重复。这次把认证收归共享包：
 * - 认证状态机、错误语义：shared-core 的 `AuthProvider` / `useAuth`
 * - 传输与 401 处理：本项目的 `services/authDriver` + `services/d1Client`
 *
 * 对外形状保持不变（调用方无须改写）：
 *   state: 'loading' | 'authenticated' | 'unauthenticated'
 *   account / error / login / register / logout
 *
 * 与共享包的差异（在本文件消化）：共享包是四态（多一个 'login' /
 * 'firstTime'），本项目把「未登录」统一映射成 'unauthenticated'。
 */
import { useEffect, type ReactNode } from 'react';
import { AuthProvider as SharedAuthProvider, useAuth as useSharedAuth } from '@shared/core/auth';
import { UNAUTHORIZED_EVENT_NAME } from '../services/d1Client';
import { restAuthDriver } from '../services/authDriver';

/** 本项目的认证状态：未登录统一是 'unauthenticated' */
export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

/** 对外暴露的认证上下文 */
export interface AuthContextValue {
  state: AuthState;
  account: { id: string; username: string } | null;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SharedAuthProvider driver={restAuthDriver} errorMode="boolean">
      {children}
    </SharedAuthProvider>
  );
}

export function useAuth(): AuthContextValue {
  const shared = useSharedAuth();

  // 后端返回 401 时 d1Client 会派发全局事件，登录态随之失效
  useEffect(() => {
    const handler = () => {
      void shared.logout();
    };
    window.addEventListener(UNAUTHORIZED_EVENT_NAME, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT_NAME, handler);
  }, [shared]);

  const state: AuthState =
    shared.state === 'loading'
      ? 'loading'
      : shared.state === 'authenticated'
        ? 'authenticated'
        : 'unauthenticated';

  return {
    state,
    account: shared.user ? { id: shared.user.id, username: shared.user.username } : null,
    error: shared.error,
    login: shared.login,
    register: shared.register,
    logout: shared.logout,
  };
}
