import { useCallback, useEffect, useState } from 'react';
import { fetchStorageStatus, type StorageStatus } from '../services/d1Client';

const EMPTY: StorageStatus = { isOnline: false, totalRecords: 0, lastSyncAt: null };

/**
 * 云端存储状态。
 *
 * 结果缓存与去重在 `d1Client.fetchStorageStatus` 里（30s TTL + 并发合并），
 * 这里只负责把它挂到组件状态上：多个页面同时挂载时不会各打一套统计请求。
 */
export function useSyncStatus(intervalMs: number = 60000) {
  const [status, setStatus] = useState<StorageStatus>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (options: { fresh?: boolean } = {}) => {
    setRefreshing(true);
    try {
      setStatus(await fetchStorageStatus(options));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 定时刷新沿用 30s 缓存：60s 轮询下仍会真的重新取数，只是不会连打两遍
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  return { status, refreshing, refresh };
}
