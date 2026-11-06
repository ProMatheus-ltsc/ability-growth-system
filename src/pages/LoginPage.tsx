import { useState } from 'react';
import { PasswordInput } from '@shared/core';
import { Sparkles, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { login, register, error, state } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!username.trim() || username.trim().length < 3) {
      setLocalError('用户名至少 3 位');
      return;
    }
    if (password.length < 8) {
      setLocalError('密码至少 8 位');
      return;
    }
    setBusy(true);
    try {
      await (mode === 'login' ? login(username.trim(), password) : register(username.trim(), password));
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md card p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">通用能力增长系统</h1>
            <p className="text-xs text-slate-500">
              {mode === 'login' ? '登录后同步你的云端数据' : '创建账户，数据按用户名隔离'}
            </p>
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-5">
          <button
            type="button"
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => {
              setMode('login');
              setLocalError(null);
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => {
              setMode('register');
              setLocalError(null);
            }}
          >
            注册
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">用户名</label>
            <input
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如: teacher-li"
              autoFocus
              autoComplete="username"
              required
            />
            <p className="mt-1 text-xs text-slate-400">3-32 位，不含空格；登录时忽略大小写。</p>
          </div>
          <div>
            <label className="label">密码（≥8位）</label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              showPassword={showPassword}
              onToggleVisibility={() => setShowPassword(!showPassword)}
              maxLength={72}
            />
          </div>

          {(localError || error) && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{localError || error}</div>
          )}

          <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
            {mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
            {busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账户'}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400 leading-relaxed">
          账户与业务数据存储在 Cloudflare D1，按用户名隔离并在多设备间共享；登录状态由服务端会话 Cookie 维护。
        </p>
      </div>
    </div>
  );
}
