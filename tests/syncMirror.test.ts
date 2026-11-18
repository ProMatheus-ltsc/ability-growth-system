/**
 * 增量同步契约测试
 *
 * 这些规则一旦写反，症状都很隐蔽：
 * - 水位用 `>` 而不是 `>=` → 同毫秒批量写入的行被漏掉（训练记录重复导入后丢行）
 * - 先写后删 → 「删掉又重建同一个 id」会被墓碑再删一次（用户看到刚建的记录消失）
 * - reset 标记不识别 → 备份恢复后各端镜像停留在旧结果集
 */
import { describe, expect, it } from 'vitest';
import {
  nextWatermark,
  planDeltaApply,
  STORE_RESET_TOMBSTONE,
  SYNC_EPOCH,
  type StoreDelta,
} from '../src/services/syncMirror';

const record = (id: string) => ({ id, updatedAt: '2026-11-16T00:00:00.000Z' });
const delta = (records: { id: string }[], deleted: string[] = [], watermark = SYNC_EPOCH): StoreDelta<{ id: string }> => ({
  records,
  deleted,
  watermark,
});

describe('增量同步 · 动作清单', () => {
  it('普通增量：墓碑进删除列表，新行进 upsert', () => {
    const plan = planDeltaApply(delta([record('t2')], ['t1']));
    expect(plan.reset).toBe(false);
    expect(plan.deleteIds).toEqual(['t1']);
    expect(plan.upserts.map((r) => r.id)).toEqual(['t2']);
  });

  it('同一批里「删了又重建同一个 id」以 upsert 为准（先删后写）', () => {
    const plan = planDeltaApply(delta([record('t1')], ['t1']));
    expect(plan.deleteIds).toEqual(['t1']);
    expect(plan.upserts.map((r) => r.id)).toEqual(['t1']);
    // 调用方按 deleteIds → upserts 的顺序执行，最终 t1 存在
    const after = new Map<string, { id: string }>([['t2', record('t2')]]);
    for (const id of plan.deleteIds) after.delete(id);
    for (const row of plan.upserts) after.set(row.id, row);
    expect([...after.keys()].sort()).toEqual(['t1', 't2']);
  });

  it('reset 标记表示整表被清空/重建，不再逐条删', () => {
    const plan = planDeltaApply(delta([record('t9')], [STORE_RESET_TOMBSTONE]));
    expect(plan.reset).toBe(true);
    expect(plan.deleteIds).toEqual([]);
  });

  it('脏数据（没有 id 的行）被忽略，不会污染镜像', () => {
    const plan = planDeltaApply({
      records: [{ id: '' }, { id: 'ok' }, null as unknown as { id: string }],
      deleted: [''],
    });
    expect(plan.upserts.map((r) => r.id)).toEqual(['ok']);
    expect(plan.deleteIds).toEqual([]);
  });
});

describe('增量同步 · 重建墓碑不会被反复消费', () => {
  const resetAt = '2026-11-16T12:00:00.000Z';
  const resetDelta = (watermark: string) => ({
    ...delta([], [STORE_RESET_TOMBSTONE], watermark),
    resetAt,
  });

  it('第一次见到该重建：清镜像全量', () => {
    expect(planDeltaApply(resetDelta(resetAt)).reset).toBe(true);
  });

  it('水位正好等于墓碑时间（reset 之后就是这个状态）：不再全量', () => {
    const plan = planDeltaApply(resetDelta(resetAt), { resetConsumedAt: resetAt });
    expect(plan.reset).toBe(false);
  });

  it('出现更晚的新重建：照常全量', () => {
    const newer = { ...resetDelta('2026-11-16T15:00:00.000Z'), resetAt: '2026-11-16T15:00:00.000Z' };
    expect(planDeltaApply(newer, { resetConsumedAt: resetAt }).reset).toBe(true);
  });

  it('服务端没给 resetAt（旧版本）时宁可多全量一次，也不漏重建', () => {
    const plan = planDeltaApply(delta([], [STORE_RESET_TOMBSTONE]), { resetConsumedAt: resetAt });
    expect(plan.reset).toBe(true);
  });
});

describe('增量同步 · 水位', () => {
  it('水位只前进不后退（时钟回拨/换库时不重复拉历史）', () => {
    expect(nextWatermark('2026-11-16T10:00:00.000Z', '2026-11-16T09:00:00.000Z', false)).toBe(
      '2026-11-16T10:00:00.000Z',
    );
  });

  it('reset 时以服务端水位为新起点', () => {
    expect(nextWatermark('2026-11-16T10:00:00.000Z', '2026-11-15T10:00:00.000Z', true)).toBe(
      '2026-11-15T10:00:00.000Z',
    );
  });

  it('服务端没回水位时保持原水位', () => {
    expect(nextWatermark('2026-11-16T10:00:00.000Z', '', false)).toBe('2026-11-16T10:00:00.000Z');
  });

  it('epoch 起点可用于首次全量', () => {
    expect(SYNC_EPOCH < '2026-11-16T00:00:00.000Z').toBe(true);
  });
});
