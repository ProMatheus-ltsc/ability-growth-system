/**
 * Cloudflare D1 远程同步 - 薄适配层
 *
 * D1 同步的通用实现已下沉到 @shared/core（services/cloudflareD1.ts 的
 * createD1SyncService），本文件只做两件事：
 * 1. 用 localDB 的导出/导入/增量/元数据函数实现 D1SyncDataAdapter，
 *    把本项目的 29 张业务 store 映射为通用快照协议 D1SyncSnapshot
 * 2. 以模块级单例代理 shared-core 同步服务实例，保持原有模块级导出签名
 *    不变，调用方（App / useSyncStatus / SyncPage）零改动
 *
 * 设计要点（与旧实现一致，详见 @shared/core/services/cloudflareD1.ts）：
 * - Local-First: 本地 IndexedDB 为主, D1 仅作为异地备份和多设备同步的容灾存储
 * - Worker 网关协议不变（已部署的 ability-growth-system/worker/ 无需改动）
 * - 冲突策略: Last-Write-Wins
 */
import {
  createD1SyncService,
  getCurrentAccountId,
  listAccounts,
  type BackupPoint,
  type D1SyncConfig,
  type D1SyncDataAdapter,
  type D1SyncSnapshot,
  type SyncStatus,
} from '@shared/core';
import {
  exportSnapshot,
  importSnapshot,
  getChangesSince,
  getMeta,
  setMeta,
  type ExportedSnapshot,
} from './localDB';

export type { BackupPoint, D1SyncConfig };

// ============ 数据访问适配器（localDB -> D1SyncDataAdapter） ============

/**
 * 映射表：
 * - exportSnapshot:  localDB.exportSnapshot() 的 ExportedSnapshot 本就是
 *                    { [storeName]: rows[] } + version/exportedAt 形态，
 *                    与 D1SyncSnapshot 结构天然兼容，浅拷贝消除 interface
 *                    缺少 index signature 的类型差异后直接透传
 * - importSnapshot:  通用快照按 store 名还原为 ExportedSnapshot；
 *                    mode 语义一致：merge=按 id upsert / replace=清空后覆盖
 * - getChangesSince: 各 store 按 updatedAt/createdAt/evaluationTime(及
 *                    vetoOverrides 的 confirmedAt)过滤的增量快照，原样透传
 * - getMeta/setMeta: localDB 的 meta 表即同步配置/时间戳的持久化通道，
 *                    键名（d1-sync-config / d1-last-sync-at / d1-last-backup-at）
 *                    与旧实现一致，老数据无缝衔接
 */
const adapter: D1SyncDataAdapter = {
  async exportSnapshot(): Promise<D1SyncSnapshot> {
    const snap = await exportSnapshot();
    return { ...snap };
  },

  async importSnapshot(snapshot: D1SyncSnapshot, mode: 'merge' | 'replace' = 'merge'): Promise<void> {
    // 通用快照 -> 项目快照：运行时结构一致(store 名 -> 记录数组)，缺失的
    // store 由 localDB.importSnapshot 内部的 ?? [] 兜底，类型上经 unknown 中转
    await importSnapshot(snapshot as unknown as ExportedSnapshot, mode);
  },

  async getChangesSince(since: string | null): Promise<D1SyncSnapshot> {
    const changes = await getChangesSince(since);
    return { ...changes };
  },

  getMeta<T>(key: string, defaultValue: T): Promise<T> {
    return getMeta(key, defaultValue);
  },

  setMeta(key: string, value: unknown): Promise<void> {
    return setMeta(key, value);
  },
};

// ============ accountId 解析（注入 shared-core） ============

/**
 * 配置里 accountId 留空时解析当前登录账户的用户名；
 * 取不到（未登录/账户库异常）时返回空串，由 shared-core 兜底 'local-user'。
 * 完整回退链（与旧实现一致）：显式配置 > 当前登录用户名 > 'local-user'。
 */
async function resolveCurrentUsername(): Promise<string> {
  try {
    const id = getCurrentAccountId();
    if (!id) return '';
    const accounts = await listAccounts();
    return accounts.find((a) => a.id === id)?.username ?? '';
  } catch {
    return '';
  }
}

// ============ 模块级单例 + 代理导出（签名与旧实现一致，调用方零改动） ============

const syncService = createD1SyncService(adapter, { resolveAccountId: resolveCurrentUsername });

export function loadSyncConfig(): Promise<D1SyncConfig | null> {
  return syncService.loadSyncConfig();
}

export function configureSync(config: D1SyncConfig): Promise<void> {
  return syncService.configureSync(config);
}

export function getSyncConfigSync(): D1SyncConfig | null {
  return syncService.getSyncConfigSync();
}

export function clearSyncConfig(): Promise<void> {
  return syncService.clearSyncConfig();
}

export function getSyncStatus(): Promise<SyncStatus> {
  return syncService.getSyncStatus();
}

export function getLastBackupAt(): Promise<string | null> {
  return syncService.getLastBackupAt();
}

export function pushChanges() {
  return syncService.pushChanges();
}

export function pullChanges() {
  return syncService.pullChanges();
}

export function syncBoth() {
  return syncService.syncBoth();
}

export function fullBackupToD1() {
  return syncService.fullBackupToD1();
}

export function restoreFromD1(timestamp?: string) {
  return syncService.restoreFromD1(timestamp);
}

export function listBackupPoints(): Promise<BackupPoint[]> {
  return syncService.listBackupPoints();
}
