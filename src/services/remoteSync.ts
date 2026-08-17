/**
 * Cloudflare D1 远程备份/同步服务
 *
 * 设计要点:
 * - Local-First: 本地 IndexedDB 为主, D1 仅作为异地备份和多设备同步的容灾存储
 * - Worker 网关: 前端通过 HTTPS 调用部署在 Cloudflare Workers 上的 API,
 *   由 Worker 使用 D1 Binding 完成 SQL 读写
 * - 三种模式: 增量推送(pushChanges) / 增量拉取(pullChanges) / 全量备份/恢复(fullBackup/restore)
 * - 冲突策略: Last-Write-Wins, 冲突数上报便于教师端知情
 *
 * 期望的 Cloudflare Worker 端点(前端不实现,由部署方提供):
 *   POST /api/sync/push       -> 接收 ExportedSnapshot,写入 D1,返回 { conflicts }
 *   GET  /api/sync/pull       -> ?accountId&since=ISO 返回 ExportedSnapshot
 *   POST /api/sync/backup     -> 全量覆盖备份
 *   GET  /api/sync/restore    -> 可选 ?timestamp=xxx 返回历史版本
 *   GET  /api/sync/health     -> 连通性检测
 *   GET  /api/sync/backups    -> 列出历史备份点
 */
import type { SyncStatus, SyncResult } from '@shared/core/types';
import {
  exportSnapshot,
  importSnapshot,
  getChangesSince,
  getMeta,
  setMeta,
  type ExportedSnapshot,
} from './localDB';

export interface D1SyncConfig {
  apiEndpoint: string;
  accountId: string;
  authToken?: string;
  databaseId?: string;
}

const CONFIG_KEY = 'd1-sync-config';
const LAST_SYNC_KEY = 'd1-last-sync-at';
const LAST_BACKUP_KEY = 'd1-last-backup-at';

let runtimeConfig: D1SyncConfig | null = null;

export async function loadSyncConfig(): Promise<D1SyncConfig | null> {
  const persisted = await getMeta<D1SyncConfig | null>(CONFIG_KEY, null);
  runtimeConfig = persisted;
  return persisted;
}

export async function configureSync(config: D1SyncConfig): Promise<void> {
  runtimeConfig = config;
  await setMeta(CONFIG_KEY, config);
}

export function getSyncConfigSync(): D1SyncConfig | null {
  return runtimeConfig;
}

export async function clearSyncConfig(): Promise<void> {
  runtimeConfig = null;
  await setMeta(CONFIG_KEY, null);
}

function buildUrl(cfg: D1SyncConfig, path: string, params?: Record<string, string | undefined>): string {
  const base = cfg.apiEndpoint.replace(/\/$/, '');
  const url = new URL(`${base}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

function authHeaders(cfg: D1SyncConfig, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (cfg.authToken) headers.set('Authorization', `Bearer ${cfg.authToken}`);
  headers.set('X-Sync-Account', cfg.accountId);
  return headers;
}

async function checkConnectivity(cfg: D1SyncConfig): Promise<boolean> {
  try {
    const res = await fetch(buildUrl(cfg, '/api/sync/health'), {
      method: 'GET',
      headers: authHeaders(cfg),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const SNAPSHOT_LISTS: (keyof ExportedSnapshot)[] = [
  'trainings',
  'gaps',
  'abilities',
  'students',
  'reviews',
  'tasks',
  'templates',
  'assignments',
  'assignmentProgress',
  'exams',
  'corrections',
  'strategies',
  'registrations',
  'stagePlans',
  'spacedReviews',
];

function totalRecords(snap: ExportedSnapshot): number {
  return SNAPSHOT_LISTS.reduce((sum, key) => sum + (Array.isArray(snap[key]) ? (snap[key] as unknown[]).length : 0), 0);
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const cfg = runtimeConfig;
  const lastSyncAt = await getMeta<string | null>(LAST_SYNC_KEY, null);
  const pending = await getChangesSince(lastSyncAt);
  const pendingChanges = totalRecords(pending);
  const isOnline = cfg ? await checkConnectivity(cfg) : false;
  return { lastSyncAt, pendingChanges, isOnline };
}

export async function getLastBackupAt(): Promise<string | null> {
  return getMeta<string | null>(LAST_BACKUP_KEY, null);
}

function emptyResult(error?: string): SyncResult {
  return {
    success: !error,
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    timestamp: new Date().toISOString(),
    error,
  };
}

export async function pushChanges(): Promise<SyncResult> {
  const cfg = runtimeConfig;
  if (!cfg) return emptyResult('未配置 D1 同步服务');
  try {
    const lastSyncAt = await getMeta<string | null>(LAST_SYNC_KEY, null);
    const changes = await getChangesSince(lastSyncAt);
    const total = totalRecords(changes);
    if (total === 0) return { ...emptyResult(), success: true };
    const res = await fetch(buildUrl(cfg, '/api/sync/push'), {
      method: 'POST',
      headers: authHeaders(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        accountId: cfg.accountId,
        snapshot: changes,
        since: lastSyncAt,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`推送失败(HTTP ${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { conflicts?: number };
    const now = new Date().toISOString();
    await setMeta(LAST_SYNC_KEY, now);
    return { success: true, pushed: total, pulled: 0, conflicts: body.conflicts ?? 0, timestamp: now };
  } catch (e) {
    return emptyResult(e instanceof Error ? e.message : '未知错误');
  }
}

export async function pullChanges(): Promise<SyncResult> {
  const cfg = runtimeConfig;
  if (!cfg) return emptyResult('未配置 D1 同步服务');
  try {
    const lastSyncAt = await getMeta<string | null>(LAST_SYNC_KEY, null);
    const res = await fetch(
      buildUrl(cfg, '/api/sync/pull', { accountId: cfg.accountId, since: lastSyncAt ?? undefined }),
      { headers: authHeaders(cfg) },
    );
    if (!res.ok) throw new Error(`拉取失败(HTTP ${res.status}): ${await res.text()}`);
    const remote = (await res.json()) as ExportedSnapshot;

    const local = await exportSnapshot();
    const merged = mergeSnapshots(local, remote);
    await importSnapshot(merged.snapshot, 'replace');

    const now = new Date().toISOString();
    await setMeta(LAST_SYNC_KEY, now);
    return { success: true, pushed: 0, pulled: merged.pulled, conflicts: merged.conflicts, timestamp: now };
  } catch (e) {
    return emptyResult(e instanceof Error ? e.message : '未知错误');
  }
}

export async function syncBoth(): Promise<{ push: SyncResult; pull: SyncResult }> {
  const push = await pushChanges();
  const pull = await pullChanges();
  return { push, pull };
}

export async function fullBackupToD1(): Promise<SyncResult> {
  const cfg = runtimeConfig;
  if (!cfg) return emptyResult('未配置 D1 同步服务');
  try {
    const snapshot = await exportSnapshot();
    const res = await fetch(buildUrl(cfg, '/api/sync/backup'), {
      method: 'POST',
      headers: authHeaders(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        accountId: cfg.accountId,
        snapshot,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`备份失败(HTTP ${res.status}): ${await res.text()}`);
    const now = new Date().toISOString();
    await setMeta(LAST_SYNC_KEY, now);
    await setMeta(LAST_BACKUP_KEY, now);
    return { success: true, pushed: totalRecords(snapshot), pulled: 0, conflicts: 0, timestamp: now };
  } catch (e) {
    return emptyResult(e instanceof Error ? e.message : '未知错误');
  }
}

export async function restoreFromD1(timestamp?: string): Promise<SyncResult> {
  const cfg = runtimeConfig;
  if (!cfg) return emptyResult('未配置 D1 同步服务');
  try {
    const res = await fetch(
      buildUrl(cfg, '/api/sync/restore', { accountId: cfg.accountId, timestamp }),
      { headers: authHeaders(cfg) },
    );
    if (!res.ok) throw new Error(`恢复失败(HTTP ${res.status}): ${await res.text()}`);
    const snapshot = (await res.json()) as ExportedSnapshot;
    await importSnapshot(snapshot, 'replace');
    const now = new Date().toISOString();
    await setMeta(LAST_SYNC_KEY, now);
    return { success: true, pushed: 0, pulled: totalRecords(snapshot), conflicts: 0, timestamp: now };
  } catch (e) {
    return emptyResult(e instanceof Error ? e.message : '未知错误');
  }
}

export interface BackupPoint {
  timestamp: string;
  size: number;
  records: number;
}

export async function listBackupPoints(): Promise<BackupPoint[]> {
  const cfg = runtimeConfig;
  if (!cfg) return [];
  try {
    const res = await fetch(buildUrl(cfg, '/api/sync/backups', { accountId: cfg.accountId }), {
      headers: authHeaders(cfg),
    });
    if (!res.ok) return [];
    return (await res.json()) as BackupPoint[];
  } catch {
    return [];
  }
}

interface MergeReport {
  snapshot: ExportedSnapshot;
  pulled: number;
  conflicts: number;
}

function mergeById<T extends { id: string; updatedAt?: string; createdAt?: string; evaluationTime?: string }>(
  localList: T[],
  remoteList: T[],
): { merged: T[]; pulled: number; conflicts: number } {
  const localMap = new Map(localList.map((r) => [r.id, r]));
  let pulled = 0;
  let conflicts = 0;
  for (const remote of remoteList) {
    const local = localMap.get(remote.id);
    if (!local) {
      localMap.set(remote.id, remote);
      pulled++;
      continue;
    }
    const localTs = local.updatedAt ?? local.createdAt ?? local.evaluationTime ?? '';
    const remoteTs = remote.updatedAt ?? remote.createdAt ?? remote.evaluationTime ?? '';
    if (remoteTs > localTs) {
      localMap.set(remote.id, remote);
      pulled++;
      conflicts++;
    }
  }
  return { merged: Array.from(localMap.values()), pulled, conflicts };
}

function mergeSnapshots(local: ExportedSnapshot, remote: ExportedSnapshot): MergeReport {
  let totalPulled = 0;
  let totalConflicts = 0;
  const merged: ExportedSnapshot = { ...local };

  for (const key of SNAPSHOT_LISTS) {
    const localList = (local[key] as unknown[]) as { id: string; updatedAt?: string; createdAt?: string; evaluationTime?: string }[];
    const remoteList = ((remote[key] ?? []) as unknown[]) as typeof localList;
    const { merged: mergedList, pulled, conflicts } = mergeById(localList, remoteList);
    (merged[key] as unknown) = mergedList;
    totalPulled += pulled;
    totalConflicts += conflicts;
  }

  return {
    snapshot: { ...merged, version: '2.0.0', exportedAt: new Date().toISOString() },
    pulled: totalPulled,
    conflicts: totalConflicts,
  };
}
