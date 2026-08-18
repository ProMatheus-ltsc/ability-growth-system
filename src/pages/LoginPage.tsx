import { useState } from 'react';
import { useAuth } from '@shared/core';
import { useNavigate } from 'react-router-dom';
import { Sparkles, LogIn, UserPlus } from 'lucide-react';

export function LoginPage() {
  const { login, register, error, state } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>(state === 'firstTime' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || password.length < 4) return;
    setBusy(true);
    try {
      const ok = mode === 'login'
        ? await login(username.trim(), password)
        : await register(username.trim(), password);
      if (ok) navigate('/');
    } finally {
      setBusy(false);
    }
  };

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
              {mode === 'login' ? '欢迎回来，继续追踪能力增长' : '首次使用，创建你的本地账户'}
            </p>
          </div>
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
              required
            />
          </div>
          <div>
            <label className="label">密码（≥4位）</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={4}
              required
            />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

          <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
            {mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
            {mode === 'login' ? '登录' : '创建账户'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
          <span>{mode === 'login' ? '还没有账户？' : '已经有账户？'}</span>
          <button
            className="text-blue-600 hover:underline"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? '注册' : '登录'}
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-400 leading-relaxed">
          所有数据默认保存在浏览器本地(IndexedDB)。 登录后可在「云端同步」中配置 Cloudflare D1 远程备份。
        </p>
      </div>
    </div>
  );
}
