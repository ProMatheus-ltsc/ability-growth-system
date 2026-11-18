/**
 * 增量列表接口测试
 *
 * 覆盖两个容易写错的点：
 * 1. 水位必须用 `>=`（同毫秒批量写入不被漏掉），SQL 里能看到 `updated_at >= ?`
 * 2. 新水位取「行 updated_at」与「墓碑 deleted_at」的最大值 ——
 *    只算行的话，纯删除（没有任何新行）永远不会推进水位，墓碑会被反复下发
 */
import { describe, expect, it } from 'vitest';
import { listStoreDelta, normalizeSince } from '../functions/api/[[path]]';
import { STORE_RESET_TOMBSTONE, SYNC_EPOCH } from '../src/services/syncMirror';

function fakeDb(
  rows: { id: string; data: string; updated_at: string }[],
  tombstones: { id: string; deleted_at: string }[],
  options: { tombstoneTableFails?: boolean } = {},
) {
  const sqls: string[] = [];
  const db = {
    prepare(sql: string) {
      sqls.push(sql);
      return {
        bind() {
          return this;
        },
        async run() {
          if (options.tombstoneTableFails && sql.includes('store_deletions')) {
            throw new Error('D1_ERROR: no such table');
          }
          return { success: true, results: [] };
        },
        async all() {
          return { success: true, results: sql.includes('store_deletions') ? tombstones : rows };
        },
      };
    },
  };
  return { db: db as unknown as D1Database, sqls };
}

describe('增量列表 · 水位语义', () => {
  it('返回水位之后的行与墓碑，水位取两者最大值', async () => {
    const { db, sqls } = fakeDb(
      [
        {
          id: 't1',
          data: JSON.stringify({ id: 't1', updatedAt: '2026-11-16T10:00:00.000Z' }),
          updated_at: '2026-11-16T10:00:00.000Z',
        },
      ],
      [{ id: 't0', deleted_at: '2026-11-16T11:00:00.000Z' }],
    );

    const delta = await listStoreDelta(db, 'trainings', 'ws-a', '2026-11-16T09:00:00.000Z');

    expect(delta.records.map((r) => r.id)).toEqual(['t1']);
    expect(delta.deleted).toEqual(['t0']);
    expect(delta.watermark).toBe('2026-11-16T11:00:00.000Z');
    expect(sqls.some((sql) => sql.includes('updated_at >= ?'))).toBe(true);
  });

  it('单行 JSON 损坏不能拖垮整张表：退化成只有 id 的空壳', async () => {
    const { db } = fakeDb(
      [
        { id: 'bad', data: '{不是 JSON', updated_at: '2026-11-16T10:00:00.000Z' },
        {
          id: 'ok',
          data: JSON.stringify({ id: 'ok', date: '2024-03-11' }),
          updated_at: '2026-11-16T10:00:00.000Z',
        },
      ],
      [],
    );
    const delta = await listStoreDelta(db, 'trainings', 'ws-a', '2026-11-16T09:00:00.000Z');
    expect(delta.records.map((r) => r.id).sort()).toEqual(['bad', 'ok']);
    expect(delta.records.find((r) => r.id === 'bad')).toEqual({ id: 'bad' });
  });

  it('只有删除没有新行时水位也必须前进（否则墓碑会被反复下发）', async () => {
    const { db } = fakeDb([], [{ id: 't0', deleted_at: '2026-11-16T11:00:00.000Z' }]);
    const delta = await listStoreDelta(db, 'trainings', 'ws-a', '2026-11-16T09:00:00.000Z');
    expect(delta.records).toEqual([]);
    expect(delta.watermark).toBe('2026-11-16T11:00:00.000Z');
  });

  it('没有任何变化时水位保持不变', async () => {
    const { db } = fakeDb([], []);
    const delta = await listStoreDelta(db, 'trainings', 'ws-a', '2026-11-16T09:00:00.000Z');
    expect(delta.watermark).toBe('2026-11-16T09:00:00.000Z');
  });

  it('整体重建墓碑原样下发，客户端据此清镜像', async () => {
    const { db } = fakeDb([], [{ id: STORE_RESET_TOMBSTONE, deleted_at: '2026-11-16T12:00:00.000Z' }]);
    const delta = await listStoreDelta(db, 'trainings', 'ws-a', '2026-11-16T09:00:00.000Z');
    expect(delta.deleted).toContain(STORE_RESET_TOMBSTONE);
  });
});

describe('since 参数归一化', () => {
  it('非法值退回 epoch（等价全量），不会把水位搞成 NaN', () => {
    expect(normalizeSince('not-a-date')).toBe(SYNC_EPOCH);
    expect(normalizeSince(null)).toBe(SYNC_EPOCH);
  });

  it('带偏移的时间归一化为 UTC ISO', () => {
    expect(normalizeSince('2026-11-16T18:00:00+08:00')).toBe('2026-11-16T10:00:00.000Z');
  });
});
