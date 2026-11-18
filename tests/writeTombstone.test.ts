/**
 * 训练记录幂等替换的墓碑契约
 *
 * 背景（2026-11-18 P0）：`writeTrainingRecords` 会按跨请求幂等键把「同一次外部作答」
 * 的旧行删掉再写新行，但**没打墓碑**。增量同步只看 `updated_at`、看不到 DELETE，
 * 于是被替换掉的旧 id 在其他设备的镜像里永久留存 —— 同一份作答算两遍题量，
 * 而且因为没有周期性对账，永远不会自愈。
 *
 * 这里用真 SQLite 跑完整写入链路（不是 fake），因为要验证的正是「SQL 有没有执行」。
 */
import { describe, expect, it } from 'vitest';
import { listStoreDelta, writeTrainingRecords } from '../functions/api/[[path]]';
import { CORE_SCHEMA, createSqliteD1 } from './helpers/sqliteD1';

const row = (id: string, sourceId: string, updatedAt: string) => ({
  id,
  source: 'fenbi',
  sourceId,
  kind: 'module',
  date: '2024-03-11',
  subject: 'xingce',
  totalQuestions: 20,
  errorCount: 4,
  updatedAt,
});

const seed = (d1: ReturnType<typeof createSqliteD1>, record: ReturnType<typeof row>) => {
  d1.raw
    .prepare('INSERT OR REPLACE INTO trainings (workspace, id, updated_at, data) VALUES (?, ?, ?, ?)')
    .run('ws-a', record.id, record.updatedAt, JSON.stringify(record));
};

const tombstones = (d1: ReturnType<typeof createSqliteD1>) =>
  d1.raw
    .prepare('SELECT id FROM store_deletions WHERE workspace = ? AND store = ? ORDER BY id')
    .all('ws-a', 'trainings')
    .map((r) => (r as { id: string }).id);

describe('训练幂等替换 · 删除必须打墓碑', () => {
  it('同 sourceId 重放：被替换的旧 id 落进 store_deletions', async () => {
    const d1 = createSqliteD1(CORE_SCHEMA);
    seed(d1, row('tr-old', 'S-1', '2026-11-01T00:00:00.000Z'));

    const result = await writeTrainingRecords(
      d1.db,
      'ws-a',
      [row('tr-new', 'S-1', '2026-11-02T00:00:00.000Z')] as never,
    );

    expect(result).toEqual({ written: 1, deleted: 1 });
    expect(tombstones(d1)).toEqual(['tr-old']);
    // 新行已落库，旧行物理删除
    const ids = d1.raw
      .prepare('SELECT id FROM trainings WHERE workspace = ?')
      .all('ws-a')
      .map((r) => (r as { id: string }).id);
    expect(ids).toEqual(['tr-new']);
  });

  it('另一台设备的增量同步能看到这条删除（不再残留幽灵行）', async () => {
    const d1 = createSqliteD1(CORE_SCHEMA);
    seed(d1, row('tr-old', 'S-1', '2026-11-01T00:00:00.000Z'));
    await writeTrainingRecords(d1.db, 'ws-a', [row('tr-new', 'S-1', '2026-11-02T00:00:00.000Z')] as never);

    // 第二台设备水位停在替换之前
    const delta = await listStoreDelta(d1.db, 'trainings', 'ws-a', '2026-11-01T12:00:00.000Z');
    expect(delta.deleted).toContain('tr-old');
    expect(delta.records.map((r) => r.id)).toEqual(['tr-new']);

    // 客户端先删后写后的镜像 = 云端
    const mirror = new Map(delta.records.map((r) => [r.id, r]));
    for (const id of delta.deleted) mirror.delete(id);
    const cloud = d1.raw
      .prepare('SELECT id FROM trainings WHERE workspace = ?')
      .all('ws-a')
      .map((r) => (r as { id: string }).id);
    expect([...mirror.keys()]).toEqual(cloud);
  });

  it('同一 id 重放（无需删除）时不要凭空造墓碑', async () => {
    const d1 = createSqliteD1(CORE_SCHEMA);
    seed(d1, row('tr-1', 'S-2', '2026-11-01T00:00:00.000Z'));

    const result = await writeTrainingRecords(
      d1.db,
      'ws-a',
      [row('tr-1', 'S-2', '2026-11-03T00:00:00.000Z')] as never,
    );

    expect(result.deleted).toBe(0);
    expect(tombstones(d1)).toEqual([]);
  });

  it('来的是更旧的版本（被库内旧行压住）时不写也不删，不产生墓碑', async () => {
    const d1 = createSqliteD1(CORE_SCHEMA);
    seed(d1, row('tr-new', 'S-3', '2026-11-05T00:00:00.000Z'));

    const result = await writeTrainingRecords(
      d1.db,
      'ws-a',
      [row('tr-stale', 'S-3', '2026-11-01T00:00:00.000Z')] as never,
    );

    expect(result).toEqual({ written: 0, deleted: 0 });
    expect(tombstones(d1)).toEqual([]);
    expect(
      d1.raw.prepare('SELECT id FROM trainings WHERE workspace = ?').all('ws-a').map((r) => (r as { id: string }).id),
    ).toEqual(['tr-new']);
  });
});
