import { useCallback, useEffect, useState } from 'react';
import { Cloud, CloudOff, Database, History, RefreshCw, Upload } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { createBackup, listBackups, restoreBackup, type BackupPoint } from '../services/d1Client';

export function StoragePage() {
  const { showToast } = useToast();
  const { account } = useAuth();
  const { status, refresh, refreshing } = useSyncStatus();

  const [backups, setBackups] = useState<BackupPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');

  const refreshCloud = useCallback(async () => {
    void refresh();
    const points = await listBackups().catch(() => []);
    setBackups(points);
  }, [refresh]);

  useEffect(() => {
    void refreshCloud();
  }, [refreshCloud]);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setBusyLabel(label);
    try {
      await action();
      await refreshCloud();
    } catch (error) {
      showToast(`${label}失败：${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const backupNow = () =>
    run('创建备份', async () => {
      const result = await createBackup();
      showToast(`备份已创建：${result.timestamp.slice(0, 19).replace('T', ' ')}`, 'success');
    });

  const restore = (timestamp: string) => {
    if (!window.confirm(`确认用 ${timestamp.slice(0, 19).replace('T', ' ')} 的备份覆盖当前账户云端数据？`)) return;
    void run('恢复备份', async () => {
      await restoreBackup(timestamp);
      showToast('已恢复到该备份点', 'success');
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="数据存储 · Cloudflare D1"
        description="业务数据直接存储于 D1，通过 Pages 同域 /api 读写；同一用户名在不同设备自动共享数据。"
        actions={
          <button className="btn-ghost" onClick={refreshCloud} disabled={refreshing || busy}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> 刷新状态
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          icon={status.isOnline ? <Cloud size={18} /> : <CloudOff size={18} />}
          label="连通性"
          value={status.isOnline ? '在线' : '未连接'}
          tone={status.isOnline ? 'emerald' : 'slate'}
        />
        <StatCard icon={<Database size={18} />} label="工作空间" value={account?.username ?? '未登录'} tone="blue" />
        <StatCard icon={<History size={18} />} label="云端记录" value={String(status.totalRecords)} tone="orange" />
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <History size={16} /> 云端备份
        </h2>
        <p className="text-sm text-slate-500">
          备份保存在 D1 的 <code>sync_backups</code> 表，每个账户保留最近 20 个版本。恢复会用备份覆盖当前账户的 15 张业务表。
        </p>
        <button className="btn-primary" onClick={backupNow} disabled={busy}>
          <Upload size={16} /> 立即备份
        </button>

        {busy && (
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <RefreshCw size={14} className="animate-spin" /> 正在{busyLabel}...
          </div>
        )}

        {backups.length === 0 ? (
          <div className="text-sm text-slate-400">暂无备份点</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {backups.map((point) => (
              <div key={point.timestamp} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="text-slate-800">{point.timestamp.slice(0, 19).replace('T', ' ')}</div>
                  <div className="text-xs text-slate-400">
                    {point.records} 条记录 · {(point.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button className="btn-secondary text-sm" disabled={busy} onClick={() => restore(point.timestamp)}>
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
