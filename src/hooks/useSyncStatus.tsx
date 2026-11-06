import { useCallback, useEffect, useState } from 'react';
import { checkHealth, getStats } from '../services/d1Client';

export interface StorageStatus {
  isOnline: boolean;
  totalRecords: number;
  lastSyncAt: string | null;
}

const EMPTY: StorageStatus = { isOnline: false, totalRecords: 0, lastSyncAt: null };

export function useSyncStatus(intervalMs: number = 60000) {
  const [status, setStatus] = useState<StorageStatus>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [isOnline, stats] = await Promise.all([checkHealth(), getStats().catch(() => null)]);
      setStatus({ isOnline, totalRecords: stats?.total ?? 0, lastSyncAt: null });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  return { status, refreshing, refresh };
}
