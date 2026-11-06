/**
 * 服务端账户会话
 * 登录状态由 HttpOnly Cookie 承载，前端只保存内存中的用户信息。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  D1ApiError,
  UNAUTHORIZED_EVENT_NAME,
  fetchMe,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AuthUser,
} from '../services/d1Client';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  state: AuthState;
  account: AuthUser | null;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [account, setAccount] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const me = await fetchMe();
        if (!mounted.current) return;
        setAccount(me.user);
        setState('authenticated');
      } catch (err) {
        if (!mounted.current) return;
        if (!(err instanceof D1ApiError && err.status === 401)) {
          setError(err instanceof Error ? err.message : '无法连接服务器');
        }
        setState('unauthenticated');
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setAccount(null);
      setState('unauthenticated');
    };
    window.addEventListener(UNAUTHORIZED_EVENT_NAME, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT_NAME, handler);
  }, []);

  const authenticate = useCallback(
    async (action: () => Promise<{ user: AuthUser }>): Promise<boolean> => {
      setError(null);
      try {
        const result = await action();
        setAccount(result.user);
        setState('authenticated');
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : '操作失败');
        return false;
      }
    },
    [],
  );

  const login = useCallback(
    (username: string, password: string) => authenticate(() => loginAccount(username, password)),
    [authenticate],
  );

  const register = useCallback(
    (username: string, password: string) => authenticate(() => registerAccount(username, password)),
    [authenticate],
  );

  const logout = useCallback(async () => {
    try {
      await logoutAccount();
    } catch {
      // 会话可能已过期，本地状态照常清理
    }
    setAccount(null);
    setState('unauthenticated');
    setError(null);
  }, []);

  return <Ctx.Provider value={{ state, account, error, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return value;
}
