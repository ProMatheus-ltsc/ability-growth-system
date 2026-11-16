/**
 * 增量同步的共享契约（前后端同一份常量与合并规则）
 *
 * 为什么单独一个文件：服务端 `functions/api/[[path]].ts` 打墓碑、客户端
 * `localDB` 应用镜像，两边必须对「reset 标记」「水位语义」理解一致。
 * 常量复制两份迟早写歪，所以放这里，两边 import 同一个模块。
 *
 * 水位语义：
 * - 水位是 store 的 `updated_at` 列（入库时已归一化 ISO），**不含**记录自身的字段
 * - 服务端按 `updated_at >= since` 并发回新水位，因此同毫秒写入不会被漏掉；
 *   代价是水位处那一批会被重复下发，按 id upsert 是幂等的
 * - 增量拉看不到删除，所以删除必须打墓碑（`deleted`），
 *   `deleted` 里出现 {@link STORE_RESET_TOMBSTONE} 表示整个 store 被清空/重建
 */

/** 首次全量拉的起点 */
export const SYNC_EPOCH = '1970-01-01T00:00:00.000Z';

/** 墓碑里的整体重建标记 */
export const STORE_RESET_TOMBSTONE = '*';

export interface StoreDelta<T> {
  /** 水位之后被写入/覆盖的行 */
  records: T[];
  /** 水位之后被删除的 id（含 {@link STORE_RESET_TOMBSTONE}） */
  deleted: string[];
  /** 服务端给出的新水位，直接用于下次 since */
  watermark: string;
}

export interface DeltaPlan<T> {
  /** 需要丢弃本地镜像、从 epoch 重新全量 */
  reset: boolean;
  /** 要删掉的本地 id */
  deleteIds: string[];
  /** 要写入/覆盖的行 */
  upserts: T[];
}

/**
 * 把一次增量翻译成「对本地镜像的动作清单」。
 *
 * 调用方必须**先删后写**：反过来的话「删掉后又重建同一个 id」会被墓碑再删一次，
 * 用户会看到刚建的记录消失。
 */
export function planDeltaApply<T extends { id: string }>(
  delta: Pick<StoreDelta<T>, 'records' | 'deleted'>,
): DeltaPlan<T> {
  const reset = delta.deleted.includes(STORE_RESET_TOMBSTONE);
  const deleteIds = delta.deleted.filter((id) => id !== STORE_RESET_TOMBSTONE && id.length > 0);
  const upserts = delta.records.filter(
    (record) => record && typeof record.id === 'string' && record.id.length > 0,
  );
  return { reset, deleteIds: reset ? [] : deleteIds, upserts };
}

/**
 * 水位只前进不后退（时钟回拨 / 服务端换库时水位可能变小）。
 * reset 时以服务端水位为新起点。
 */
export function nextWatermark(previous: string, next: string, reset: boolean): string {
  if (reset) return next || previous;
  return next && next > previous ? next : previous;
}
