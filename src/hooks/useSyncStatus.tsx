import { useCallback, useEffect, useState } from 'react';
import { getSyncStatus, getSyncConfigSync } from '../services/remoteSync';
import type { SyncStatus } from '@shared/core/types';

const EMPTY: SyncStatus = { lastSyncAt: null, pendingChanges: 0, isOnline: false };

export function useSyncStatus(intervalMs: number = 30000) {
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
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, intervalMs]);

  return { status, refreshing, refresh };
}
