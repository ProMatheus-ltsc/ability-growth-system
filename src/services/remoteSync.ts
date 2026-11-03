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
import { getCurrentAccountId, listAccounts } from '@shared/core';
import {
  exportSnapshot,
  importSnapshot,
  getChangesSince,
  getMeta,
  setMeta,
  pruneTombstones,
  type ExportedSnapshot,
} from './localDB';

export interface D1SyncConfig {
  apiEndpoint: string;
  accountId: string;
  authToken?: string;
  databaseId?: string;
}

const CONFIG_KEY = 'd1-sync-config';
/** push 游标：只由 push 推进，记录「本地变更已推到云端的截止时间」 */
const LAST_PUSH_KEY = 'd1-last-push-at';
/** pull 游标：只由 pull 推进，记录「云端变更已拉到本地的截止时间」 */
const LAST_PULL_KEY = 'd1-last-pull-at';
const LAST_BACKUP_KEY = 'd1-last-backup-at';
/** 旧版共用的单一游标键（用于首次升级时迁移，避免重复推送/漏拉） */
const LEGACY_SYNC_KEY = 'd1-last-sync-at';

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

/**
 * 解析本次同步使用的 accountId（D1 内区分数据来源）：
 * 1. 配置里显式填写了就用配置值（多设备想共用同一份数据时，各端填相同值即可互通）
 * 2. 否则自动取当前登录账户的用户名（同一用户名跨设备登录即可互通）
 * 3. 兜底用固定值 'local-user'（纯单设备备份场景，零配置）
 */
async function resolveAccountId(cfg: D1SyncConfig): Promise<string> {
  if (cfg.accountId?.trim()) return cfg.accountId.trim();
  try {
    const id = getCurrentAccountId();
    if (id) {
      const accounts = await listAccounts();
      const acc = accounts.find((a) => a.id === id);
      if (acc?.username) return acc.username;
    }
  } catch {
    /* 账户库异常时走兜底 */
  }
  return 'local-user';
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

async function authHeaders(cfg: D1SyncConfig, extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra);
  if (cfg.authToken) headers.set('Authorization', `Bearer ${cfg.authToken}`);
  headers.set('X-Sync-Account', await resolveAccountId(cfg));
  return headers;
}

async function checkConnectivity(cfg: D1SyncConfig): Promise<boolean> {
  try {
    const res = await fetch(buildUrl(cfg, '/api/sync/health'), {
      method: 'GET',
      headers: await authHeaders(cfg),
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
  'pdcaProblems',
  'careerAssessments',
  'careerReports',
  'subjectiveAnswers',
  'interviewRecords',
  'pdcaArtifacts',
  'customTools',
  'weeklyChecklists',
  'collaborationEvents',
  'vetoOverrides',
  'politicsHotspots',
  'careerObservationPoints',
  'careerRetestReflections',
  'careerAiImports',
];

/**
 * 读取游标。首次运行时把旧版共用的 d1-last-sync-at 迁移到新键，
 * 避免升级后把历史数据全量重推一遍（push 幂等，但仍会白跑流量）。
 */
async function getCursor(key: string): Promise<string | null> {
  const value = await getMeta<string | null>(key, null);
  if (value) return value;
  const legacy = await getMeta<string | null>(LEGACY_SYNC_KEY, null);
  if (!legacy) return null;
  await setMeta(key, legacy);
  return legacy;
}

/** 读取 push 游标 */
function getPushCursor(): Promise<string | null> {
  return getCursor(LAST_PUSH_KEY);
}

/** 读取 pull 游标 */
function getPullCursor(): Promise<string | null> {
  return getCursor(LAST_PULL_KEY);
}

function totalRecords(snap: ExportedSnapshot): number {
  return SNAPSHOT_LISTS.reduce((sum, key) => sum + (Array.isArray(snap[key]) ? (snap[key] as unknown[]).length : 0), 0)
    + (snap.tombstones?.length ?? 0);
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const cfg = runtimeConfig;
  const lastPushAt = await getPushCursor();
  const lastPullAt = await getPullCursor();
  // 取两者较晚者作为「上次同步时间」展示
  const lastSyncAt =
    lastPushAt && lastPullAt ? (lastPushAt > lastPullAt ? lastPushAt : lastPullAt) : (lastPushAt ?? lastPullAt);
  const pending = await getChangesSince(lastPushAt);
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
    const pushCursor = await getPushCursor();
    const changes = await getChangesSince(pushCursor);
    const total = totalRecords(changes);
    if (total === 0) return { ...emptyResult(), success: true };
    const res = await fetch(buildUrl(cfg, '/api/sync/push'), {
      method: 'POST',
      headers: await authHeaders(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        accountId: await resolveAccountId(cfg),
        snapshot: changes,
        since: pushCursor,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`推送失败(HTTP ${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { conflicts?: number };
    const now = new Date().toISOString();
    await setMeta(LAST_PUSH_KEY, now);
    return { success: true, pushed: total, pulled: 0, conflicts: body.conflicts ?? 0, timestamp: now };
  } catch (e) {
    return emptyResult(e instanceof Error ? e.message : '未知错误');
  }
}

export async function pullChanges(): Promise<SyncResult> {
  const cfg = runtimeConfig;
  if (!cfg) return emptyResult('未配置 D1 同步服务');
  try {
    // 用独立的 pull 游标：push 刚推进过时间戳也不会让本次拉取变成空查询
    const pullCursor = await getPullCursor();
    const res = await fetch(
      buildUrl(cfg, '/api/sync/pull', { accountId: await resolveAccountId(cfg), since: pullCursor ?? undefined }),
      { headers: await authHeaders(cfg) },
    );
    if (!res.ok) throw new Error(`拉取失败(HTTP ${res.status}): ${await res.text()}`);
    const remote = (await res.json()) as ExportedSnapshot;

    const local = await exportSnapshot();
    const merged = mergeSnapshots(local, remote);
    await importSnapshot(merged.snapshot, 'replace');

    const now = new Date().toISOString();
    await setMeta(LAST_PULL_KEY, now);
    return { success: true, pushed: 0, pulled: merged.pulled, conflicts: merged.conflicts, timestamp: now };
  } catch (e) {
    return emptyResult(e instanceof Error ? e.message : '未知错误');
  }
}

export async function syncBoth(): Promise<{ push: SyncResult; pull: SyncResult }> {
  const push = await pushChanges();
  const pull = await pullChanges();
  // 同步完成后顺手清理过期墓碑，避免 tombstones 表无限增长
  if (push.success && pull.success) {
    try {
      await pruneTombstones();
    } catch {
      /* 清理失败不影响主流程 */
    }
  }
  return { push, pull };
}

export async function fullBackupToD1(): Promise<SyncResult> {
  const cfg = runtimeConfig;
  if (!cfg) return emptyResult('未配置 D1 同步服务');
  try {
    const snapshot = await exportSnapshot();
    const res = await fetch(buildUrl(cfg, '/api/sync/backup'), {
      method: 'POST',
      headers: await authHeaders(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        accountId: await resolveAccountId(cfg),
        snapshot,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`备份失败(HTTP ${res.status}): ${await res.text()}`);
    const now = new Date().toISOString();
    // 只记录备份时间，绝不动 push/pull 游标：
    // 全量备份写的是 sync_backups 表，不改变业务表，推进游标会让未推送的变更永远丢失。
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
      buildUrl(cfg, '/api/sync/restore', { accountId: await resolveAccountId(cfg), timestamp }),
      { headers: await authHeaders(cfg) },
    );
    if (!res.ok) throw new Error(`恢复失败(HTTP ${res.status}): ${await res.text()}`);
    const snapshot = (await res.json()) as ExportedSnapshot;
    await importSnapshot(snapshot, 'replace');
    const now = new Date().toISOString();
    // 恢复后本地内容与云端一致，两个游标都推进
    await setMeta(LAST_PUSH_KEY, now);
    await setMeta(LAST_PULL_KEY, now);
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
    const res = await fetch(buildUrl(cfg, '/api/sync/backups', { accountId: await resolveAccountId(cfg) }), {
      headers: await authHeaders(cfg),
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

/** 墓碑的最小结构（与 localDB.Tombstone 对齐，store 用宽松 string 以兼容远端数据） */
interface TombsoneLike {
  id: string;
  store: string;
  recordId: string;
  deletedAt: string;
  updatedAt: string;
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

  // 两侧墓碑取并集：同一记录被任一设备删除，就在合并结果里删掉
  const tombstoneMap = new Map<string, TombsoneLike>();
  for (const t of [...(local.tombstones ?? []), ...(remote.tombstones ?? [])]) {
    const prev = tombstoneMap.get(t.id);
    if (!prev || t.updatedAt > prev.updatedAt) tombstoneMap.set(t.id, t);
  }
  const tombstones = Array.from(tombstoneMap.values());

  for (const key of SNAPSHOT_LISTS) {
    const localList = (local[key] as unknown[]) as { id: string; updatedAt?: string; createdAt?: string; evaluationTime?: string }[];
    const remoteList = ((remote[key] ?? []) as unknown[]) as typeof localList;
    const { merged: mergedList, pulled, conflicts } = mergeById(localList, remoteList);

    // 剔除已被墓碑标记的记录：删除必须能压过「远端还有这条旧数据」
    const surviving = mergedList.filter((r) => {
      const t = tombstoneMap.get(`${key}:${r.id}`);
      if (!t) return true;
      const ts = r.updatedAt ?? r.createdAt ?? r.evaluationTime ?? '';
      // 墓碑晚于记录更新时间 → 确认删除；记录在删除之后又被更新 → 保留（用户重新创建）
      return ts > t.deletedAt;
    });

    (merged[key] as unknown) = surviving;
    totalPulled += pulled;
    totalConflicts += conflicts;
  }

  return {
    snapshot: {
      ...merged,
      version: '7.0.0',
      exportedAt: new Date().toISOString(),
      tombstones: tombstones as ExportedSnapshot['tombstones'],
    },
    pulled: totalPulled,
    conflicts: totalConflicts,
  };
}
