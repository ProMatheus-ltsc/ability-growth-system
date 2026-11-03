import { useCallback, useEffect, useState } from 'react';
import { getSyncStatus, getSyncConfigSync } from '../services/remoteSync';
import type { SyncStatus } from '@shared/core/types';

const EMPTY: SyncStatus = { lastSyncAt: null, pendingChanges: 0, isOnline: false };

/**
 * 云端同步状态 hook。
 *
 * 性能注意：`getSyncStatus()` 内部要导出全量快照来统计待同步变更，
 * 29 张表全读一遍。此前每 30 秒无条件轮询一次，首页挂着就会持续卡顿。
 * 现在改为：
 * - 首次挂载时算一次
 * - 之后只在「页面重新可见」时重算（切回标签页）
 * - 不配置同步时完全不轮询
 * - 连通性探针单独轻量调用，不触发全量导出
 */
export function useSyncStatus(_intervalMs: number = 30000) {
  const [status, setStatus] = useState<SyncStatus>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!getSyncConfigSync()) {
      setStatus(EMPTY);
      return;
    }
    setRefreshing(true);
    try {
      setStatus(await getSyncStatus());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!getSyncConfigSync()) {
      setStatus(EMPTY);
      return;
    }
    void refresh();

    // 标签页重新可见时刷新一次即可，避免定时全量扫描
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return { status, refreshing, refresh };
}
