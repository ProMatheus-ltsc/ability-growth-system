import { useCallback, useEffect, useState } from 'react';
import {
  CloudUpload,
  CloudDownload,
  Cloud,
  CloudOff,
  RefreshCw,
  Save,
  ShieldCheck,
  History,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import { ResponsiveGrid, useToast } from '@shared/core';
import type { SyncResult } from '@shared/core/types';
import { PageHeader } from '../components/PageHeader';
import { useSyncStatus } from '../hooks/useSyncStatus';
import {
  configureSync,
  getSyncConfigSync,
  clearSyncConfig,
  pushChanges,
  pullChanges,
  syncBoth,
  fullBackupToD1,
  restoreFromD1,
  getLastBackupAt,
  listBackupPoints,
  loadSyncConfig,
  type D1SyncConfig,
  type BackupPoint,
} from '../services/remoteSync';

export function SyncPage() {
  const { showToast } = useToast();
  const { status, refresh, refreshing } = useSyncStatus();

  const [config, setConfig] = useState<D1SyncConfig>({
    apiEndpoint: '',
    accountId: '',
    authToken: '',
  });
  const [configured, setConfigured] = useState<boolean>(!!getSyncConfigSync());
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupPoint[]>([]);

  const refreshBackupInfo = useCallback(async () => {
    setLastBackupAt(await getLastBackupAt());
    setBackups(await listBackupPoints());
  }, []);

  useEffect(() => {
    void loadSyncConfig().then((c) => {
      if (c) setConfig(c);
      setConfigured(!!c);
    });
    void refreshBackupInfo();
  }, [refreshBackupInfo]);

  const persistConfig = async () => {
    if (!config.apiEndpoint.startsWith('http')) {
      showToast('API 地址必须以 http/https 开头', 'error');
      return;
    }
    await configureSync(config);
    setConfigured(true);
    showToast('配置已保存', 'success');
    void refresh();
  };

  const runAction = async (label: string, fn: () => Promise<SyncResult>) => {
    setBusy(true);
    setBusyLabel(label);
    try {
      const result = await fn();
      setLastResult(result);
      if (result.success) {
        showToast(`${label}成功`, 'success');
      } else {
        showToast(`${label}失败: ${result.error ?? '未知'}`, 'error');
      }
      void refresh();
      void refreshBackupInfo();
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const disconnect = async () => {
    if (!window.confirm('确认断开云端同步配置？本地数据不会被删除')) return;
    await clearSyncConfig();
    setConfigured(false);
    showToast('已断开配置', 'info');
    void refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="云端同步 · Cloudflare D1"
        description="Local-First 架构:本地 IndexedDB 为主, Cloudflare D1 为远程备份/多端同步的容灾存储。 冲突采用 Last-Write-Wins 策略。"
        actions={
          <button className="btn-ghost" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> 刷新状态
          </button>
        }
      />

      <ResponsiveGrid minItemWidth="220px" gap="0.75rem">
        <StatCard
          icon={status.isOnline ? <Cloud size={18} /> : <CloudOff size={18} />}
          label="连通性"
          value={status.isOnline ? '在线' : '未连接'}
          tone={status.isOnline ? 'emerald' : 'slate'}
        />
        <StatCard
          icon={<History size={18} />}
          label="上次同步"
          value={status.lastSyncAt ? status.lastSyncAt.slice(0, 19).replace('T', ' ') : '从未'}
          tone="blue"
        />
        <StatCard
          icon={<ShieldCheck size={18} />}
          label="待同步变更"
          value={String(status.pendingChanges)}
          tone={status.pendingChanges > 0 ? 'orange' : 'slate'}
        />
      </ResponsiveGrid>

      <div className="card p-5 space-y-3 cq">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Save size={16} /> D1 服务配置
        </h2>
        <p className="text-sm text-slate-500">
          需要先部署 Cloudflare Worker + D1 数据库 (前端只依赖 HTTP API)。 参考端点: <code>/api/sync/push · /api/sync/pull · /api/sync/backup · /api/sync/restore</code>。
        </p>
        <div className="cq-grid cq-cols-2 gap-3">
          <div>
            <label className="label">API 网关(Worker) 地址</label>
            <input
              className="input"
              value={config.apiEndpoint}
              onChange={(e) => setConfig({ ...config, apiEndpoint: e.target.value })}
              placeholder="https://your-worker.example.workers.dev"
            />
          </div>
          <div>
            <label className="label">账户 ID (可选, 留空自动)</label>
            <input
              className="input"
              value={config.accountId}
              onChange={(e) => setConfig({ ...config, accountId: e.target.value })}
              placeholder="留空则自动使用当前登录账户名"
            />
          </div>
          <div className="cq-span-2">
            <label className="label">访问令牌 (Bearer Token, 可选)</label>
            <input
              className="input"
              type="password"
              value={config.authToken ?? ''}
              onChange={(e) => setConfig({ ...config, authToken: e.target.value })}
              placeholder="留空则不带 Authorization 请求头"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={persistConfig}>
            <Save size={16} /> 保存配置
          </button>
          {configured && (
            <button className="btn-secondary text-red-600 border-red-200 hover:bg-red-50" onClick={disconnect}>
              断开配置
            </button>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">同步操作</h2>
        <p className="text-sm text-slate-500">
          增量推送/拉取用于日常同步; 全量备份/恢复用于容灾。
        </p>
        <ResponsiveGrid minItemWidth="160px" gap="0.75rem">
          <ActionButton
            icon={<ArrowUpCircle size={16} />}
            label="推送本地变更"
            disabled={!configured || busy}
            onClick={() => runAction('推送', pushChanges)}
          />
          <ActionButton
            icon={<ArrowDownCircle size={16} />}
            label="拉取云端变更"
            disabled={!configured || busy}
            onClick={() => runAction('拉取', pullChanges)}
          />
          <ActionButton
            icon={<RefreshCw size={16} />}
            label="双向同步"
            disabled={!configured || busy}
            onClick={async () => {
              setBusy(true);
              setBusyLabel('双向同步');
              try {
                const both = await syncBoth();
                const merged: SyncResult = {
                  success: both.push.success && both.pull.success,
                  pushed: both.push.pushed,
                  pulled: both.pull.pulled,
                  conflicts: both.push.conflicts + both.pull.conflicts,
                  timestamp: both.pull.timestamp,
                  error: both.push.error ?? both.pull.error,
                };
                setLastResult(merged);
                showToast(merged.success ? '双向同步完成' : `同步失败: ${merged.error}`, merged.success ? 'success' : 'error');
                void refresh();
              } finally {
                setBusy(false);
                setBusyLabel('');
              }
            }}
          />
          <ActionButton
            icon={<CloudUpload size={16} />}
            label="全量备份到 D1"
            disabled={!configured || busy}
            onClick={() => runAction('全量备份', fullBackupToD1)}
          />
          <ActionButton
            icon={<CloudDownload size={16} />}
            label="从 D1 恢复(最新)"
            disabled={!configured || busy}
            onClick={async () => {
              if (!window.confirm('恢复将覆盖本地数据(合并保留最新记录),继续?')) return;
              await runAction('从 D1 恢复', () => restoreFromD1());
            }}
          />
        </ResponsiveGrid>

        {busy && (
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <RefreshCw size={14} className="animate-spin" /> 正在{busyLabel}...
          </div>
        )}

        {lastResult && (
          <div
            className={`text-sm p-3 rounded-lg ${
              lastResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            上次操作 · {lastResult.timestamp.slice(0, 19).replace('T', ' ')}
            <br />
            推送 {lastResult.pushed} · 拉取 {lastResult.pulled} · 冲突 {lastResult.conflicts}
            {lastResult.error && (
              <div className="mt-1">
                <b>错误:</b> {lastResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <History size={16} /> 历史备份点
        </h2>
        <div className="text-sm text-slate-500 mt-1 mb-3">
          上次全量备份: {lastBackupAt ? lastBackupAt.slice(0, 19).replace('T', ' ') : '从未'}
        </div>
        {backups.length === 0 ? (
          <div className="text-sm text-slate-400">暂无历史备份点(可能后端未实现 /api/sync/backups 端点,或尚未产生备份)</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {backups.map((b) => (
              <div key={b.timestamp} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="text-slate-800">{b.timestamp.slice(0, 19).replace('T', ' ')}</div>
                  <div className="text-xs text-slate-400">
                    {b.records} 条记录 · {(b.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  className="btn-secondary text-sm"
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(`确认恢复到 ${b.timestamp} 时的快照? 本地数据将被覆盖`)) return;
                    await runAction('恢复到该备份点', () => restoreFromD1(b.timestamp));
                  }}
                >
                  恢复到此
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'emerald' | 'blue' | 'orange' | 'slate';
}) {
  const toneMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    orange: 'bg-orange-50 text-orange-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className={`rounded-xl p-4 ${toneMap[tone]}`}>
      <div className="flex items-center gap-2 opacity-80 text-sm">
        {icon} {label}
      </div>
      <div className="text-lg font-bold mt-1 truncate">{value}</div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className="btn-secondary text-sm justify-center" disabled={disabled} onClick={onClick}>
      {icon} {label}
    </button>
  );
}
