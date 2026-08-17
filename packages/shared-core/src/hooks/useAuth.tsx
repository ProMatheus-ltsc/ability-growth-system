/**
 * 认证 Hook + Provider：管理登录/注册/登出状态机
 * 可配置版本 - 各项目通过 configureDB 设置不同的数据库前缀
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Account } from '../types';
import { setCurrentAccountId, listAccounts, getDBPrefix } from '../services/db';
import { registerAccount, verifyAccountPassword, resetAccountPassword } from '../services/auth';

type AuthState = 'loading' | 'firstTime' | 'login' | 'authenticated';

interface AuthContextType {
  state: AuthState;
  account: Account | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  resetPassword: (username: string, newPassword: string) => Promise<boolean>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  const SESSION_KEY = `${getDBPrefix()}-current-account`;

  useEffect(() => {
    async function init() {
      try {
        const accounts = await listAccounts();
        const savedId = localStorage.getItem(SESSION_KEY);

        if (savedId) {
          const found = accounts.find((a) => a.id === savedId);
          if (found) {
            setCurrentAccountId(found.id);
            setAccount(found);
            setState('authenticated');
            return;
          }
        }

        setState(accounts.length === 0 ? 'firstTime' : 'login');
      } catch {
        setState('firstTime');
      }
    }
    init();
  }, [SESSION_KEY]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const acc = await verifyAccountPassword(username, password);
      if (!acc) {
        setError('用户名或密码错误');
        return false;
      }
      setCurrentAccountId(acc.id);
      localStorage.setItem(SESSION_KEY, acc.id);
      setAccount(acc);
      setState('authenticated');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
      return false;
    }
  }, [SESSION_KEY]);

  const register = useCallback(async (username: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const acc = await registerAccount(username, password);
      setCurrentAccountId(acc.id);
      localStorage.setItem(SESSION_KEY, acc.id);
      setAccount(acc);
      setState('authenticated');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '注册失败');
      return false;
    }
  }, [SESSION_KEY]);

  const logout = useCallback(() => {
    setCurrentAccountId(undefined);
    localStorage.removeItem(SESSION_KEY);
    setAccount(null);
    setState('login');
    setError(null);
  }, [SESSION_KEY]);

  const resetPassword = useCallback(async (username: string, newPassword: string): Promise<boolean> => {
    setError(null);
    try {
      await resetAccountPassword(username, newPassword);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '重置失败');
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ state, account, login, register, logout, resetPassword, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
