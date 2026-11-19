/**
 * 窗口 / 游标分页接口测试（GET /api/stores/:store?limit=&before=）
 *
 * 用真 SQLite 跑真 SQL（tests/helpers/sqliteD1），因为这里要验收的正是 SQL 行为：
 * - **翻页不重不漏**：游标是 `(排序值, id)` 复合键，同时间戳的行不能整批被跳过；
 * - `since` 只做写入时间剪枝，`dateFrom/dateTo` 是业务日期口径，两者正交；
 * - facets 只随首页返回，翻页不再重复算 DISTINCT；
 * - 一行 JSON 损坏不能把整条窗口查询打死（`json_extract` 碰坏 JSON 会直接报错）。
 */
import { describe, expect, it } from 'vitest';
import { listStoreWindow } from '../functions/api/[[path]]';
import {
  buildWindowSql,
  parseWindowQuery,
  windowSearchParams,
  type WindowQuery,
} from '../src/services/recordWindow';
import { CORE_SCHEMA, createSqliteD1 } from './helpers/sqliteD1';

const WORKSPACE = 'alice';

function query(overrides: Partial<WindowQuery> = {}): WindowQuery {
  return { limit: 10, order: 'updated', facets: [], ...overrides };
}

function seedTrainings(
  rows: Array<{ id: string; updatedAt: string; date: string; subject?: string; gradeLevel?: string }>,
): ReturnType<typeof createSqliteD1> {
  const db = createSqliteD1(CORE_SCHEMA);
  for (const row of rows) {
    db.raw
      .prepare('INSERT INTO trainings (workspace, id, updated_at, data) VALUES (?, ?, ?, ?)')
      .run(
        WORKSPACE,
        row.id,
        row.updatedAt,
        JSON.stringify({
          id: row.id,
          date: row.date,
          subject: row.subject ?? 'math',
          ...(row.gradeLevel ? { gradeLevel: row.gradeLevel } : {}),
          updatedAt: row.updatedAt,
        }),
      );
  }
  return db;
}

/** 一路翻到底，返回所有 id（按页序） */
async function pageThrough(
  db: ReturnType<typeof createSqliteD1>['db'],
  base: Partial<WindowQuery>,
): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = [];
  let cursor: { before?: string; beforeId?: string } = {};
  for (let page = 0; page < 100; page += 1) {
    const result = await listStoreWindow(db, 'trainings', WORKSPACE, query({ ...base, ...cursor }));
    ids.push(...result.records.map((record) => record.id));
    if (!result.hasMore) return { ids, pages: page + 1 };
    cursor = { before: result.nextBefore, beforeId: result.nextBeforeId };
  }
  throw new Error('翻页没有收敛，疑似游标不前进');
}

describe('窗口分页 · 不重不漏', () => {
  it('逐页翻完覆盖全部行，且没有重复', async () => {
    const rows = Array.from({ length: 23 }, (_, index) => ({
      id: `t${String(index).padStart(2, '0')}`,
      updatedAt: `2026-11-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      date: '2026-11-01',
    }));
    const { db } = seedTrainings(rows);

    const { ids, pages } = await pageThrough(db, { limit: 5 });

    expect(pages).toBe(5); // 5 + 5 + 5 + 5 + 3
    expect(ids).toHaveLength(23);
    expect(new Set(ids).size).toBe(23);
    // 默认 updated DESC：最后写入的排在最前
    expect(ids[0]).toBe('t22');
  });

  it('同一时间戳的批量写入也必须一行不漏（id 兜底决胜）', async () => {
    const sameTime = '2026-11-16T10:00:00.000Z';
    // 模拟一次性导入：10 行 updated_at 完全相同
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: `bulk-${index}`,
      updatedAt: sameTime,
      date: '2024-03-11',
    }));
    const { db } = seedTrainings(rows);

    // 只按时间翻页的实现会在第一页之后一行都拿不到（时间戳相等 → `<` 全部为假）
    const { ids } = await pageThrough(db, { limit: 3 });

    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });

  it('没有下一页时 hasMore=false，且页内条数不超过 limit', async () => {
    const { db } = seedTrainings([{ id: 'a', updatedAt: '2026-11-01T00:00:00.000Z', date: '2026-11-01' }]);
    const result = await listStoreWindow(db, 'trainings', WORKSPACE, query({ limit: 5 }));
    expect(result.hasMore).toBe(false);
    expect(result.records).toHaveLength(1);
  });

  it('多取一条只用于判定 hasMore，不会漏进返回结果', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `t${index}`,
      updatedAt: `2026-11-0${index + 1}T00:00:00.000Z`,
      date: '2026-11-01',
    }));
    const { db } = seedTrainings(rows);
    const result = await listStoreWindow(db, 'trainings', WORKSPACE, query({ limit: 5 }));
    expect(result.records).toHaveLength(5);
    expect(result.hasMore).toBe(true);
  });
});

describe('窗口分页 · 参数语义', () => {
  it('since 只取水位之后写入的行', async () => {
    const { db } = seedTrainings([
      { id: 'old', updatedAt: '2026-10-01T00:00:00.000Z', date: '2026-10-01' },
      { id: 'new', updatedAt: '2026-11-10T00:00:00.000Z', date: '2026-11-10' },
    ]);
    const result = await listStoreWindow(
      db,
      'trainings',
      WORKSPACE,
      query({ since: '2026-11-01T00:00:00.000Z' }),
    );
    expect(result.records.map((record) => record.id)).toEqual(['new']);
  });

  it('since 用 `>=`：水位处那一批不会因为边界被漏掉', async () => {
    const at = '2026-11-01T00:00:00.000Z';
    const { db } = seedTrainings([{ id: 'edge', updatedAt: at, date: '2026-11-01' }]);
    const result = await listStoreWindow(db, 'trainings', WORKSPACE, query({ since: at }));
    expect(result.records.map((record) => record.id)).toEqual(['edge']);
  });

  it('dateFrom / dateTo 按业务日期过滤，与写入时间正交', async () => {
    const { db } = seedTrainings([
      // 老记录最近被编辑过：写入时间新，业务日期老
      { id: 'edited-old', updatedAt: '2026-11-18T00:00:00.000Z', date: '2026-08-01' },
      { id: 'recent', updatedAt: '2026-11-17T00:00:00.000Z', date: '2026-11-10' },
    ]);
    const result = await listStoreWindow(
      db,
      'trainings',
      WORKSPACE,
      query({ since: '2026-11-01T00:00:00.000Z', dateFrom: '2026-11-01', dateTo: '2026-11-30' }),
    );
    expect(result.records.map((record) => record.id)).toEqual(['recent']);
  });

  it('subject / studentId 过滤只看对应 JSON 字段', async () => {
    const { db } = seedTrainings([
      { id: 'm', updatedAt: '2026-11-02T00:00:00.000Z', date: '2026-11-02', subject: 'math' },
      { id: 'x', updatedAt: '2026-11-01T00:00:00.000Z', date: '2026-11-01', subject: 'xingce' },
    ]);
    const result = await listStoreWindow(db, 'trainings', WORKSPACE, query({ subject: 'xingce' }));
    expect(result.records.map((record) => record.id)).toEqual(['x']);
  });

  it('order=date 按记录业务日期排序，游标同样不重不漏', async () => {
    const rows = [
      { id: 'a', updatedAt: '2026-11-03T00:00:00.000Z', date: '2024-03-01' },
      { id: 'b', updatedAt: '2026-11-02T00:00:00.000Z', date: '2025-06-01' },
      { id: 'c', updatedAt: '2026-11-01T00:00:00.000Z', date: '2025-06-01' },
    ];
    const { db } = seedTrainings(rows);

    const first = await listStoreWindow(db, 'trainings', WORKSPACE, query({ order: 'date', limit: 1 }));
    // 同一天的两行按 id DESC 决胜（'c' > 'b'）
    expect(first.records.map((record) => record.id)).toEqual(['c']);
    expect(first.hasMore).toBe(true);

    const { ids } = await pageThrough(db, { order: 'date', limit: 1 });
    // 同一天的 b / c 都必须在（日期相等仍靠 id 决胜）
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('坏 JSON 行不会让带 JSON 条件的窗口查询整条报错', async () => {
    const seeded = seedTrainings([{ id: 'ok', updatedAt: '2026-11-02T00:00:00.000Z', date: '2026-11-02' }]);
    seeded.raw
      .prepare('INSERT INTO trainings (workspace, id, updated_at, data) VALUES (?, ?, ?, ?)')
      .run(WORKSPACE, 'bad', '2026-11-01T00:00:00.000Z', '{不是 JSON');
    const db = seeded.db;

    const result = await listStoreWindow(db, 'trainings', WORKSPACE, query({ dateFrom: '2026-01-01' }));
    // 坏行被 JSON 条件排除，好行照常返回
    expect(result.records.map((record) => record.id)).toEqual(['ok']);

    // order=date 时排序键也走 json_extract，同样不能炸
    const byDate = await listStoreWindow(db, 'trainings', WORKSPACE, query({ order: 'date' }));
    expect(byDate.records.map((record) => record.id)).toEqual(['ok', 'bad']);
  });
});

describe('学段隔离下推到 SQL', () => {
  it('学生端窗口页是「满页」的：学段过滤在 SQL 里完成，不会取 20 条筛掉一半', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: `mix-${index}`,
      updatedAt: `2026-11-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      date: '2026-11-01',
      // 交错的学段：一半 primary、一半 senior
      subject: index % 2 === 0 ? 'math' : 'physics',
      gradeLevel: index % 2 === 0 ? 'primary' : 'senior',
    }));
    const { db } = seedTrainings(rows);

    const first = await listStoreWindow(db, 'trainings', WORKSPACE, query({ limit: 3 }), 'primary');
    expect(first.records).toHaveLength(3);
    expect(first.records.every((record) => record.gradeLevel === 'primary')).toBe(true);
    expect(first.hasMore).toBe(true);

    // 翻完仍然只拿到本学段的 5 条
    const ids: string[] = [];
    let cursor: { before?: string; beforeId?: string } = {};
    for (let page = 0; page < 20; page += 1) {
      const result = await listStoreWindow(db, 'trainings', WORKSPACE, query({ limit: 3, ...cursor }), 'primary');
      ids.push(...result.records.map((record) => record.id));
      if (!result.hasMore) break;
      cursor = { before: result.nextBefore, beforeId: result.nextBeforeId };
    }
    expect(ids).toHaveLength(5);
  });

  it('本学段不可能有可见行的表直接返回空页，不发查询', async () => {
    const seeded = createSqliteD1(CORE_SCHEMA);
    const result = await listStoreWindow(seeded.db, 'registrations', WORKSPACE, query({ limit: 5 }), 'primary');
    expect(result).toEqual({ records: [], hasMore: false });
    expect(seeded.sqls).toHaveLength(0);
  });
});

describe('facets 聚合', () => {
  it('只在首页返回，翻页不再重复计算', async () => {
    const { db } = seedTrainings([
      { id: 'a', updatedAt: '2026-11-02T00:00:00.000Z', date: '2026-11-02', subject: 'math' },
      { id: 'b', updatedAt: '2026-11-01T00:00:00.000Z', date: '2026-11-01', subject: 'physics' },
    ]);

    const first = await listStoreWindow(db, 'trainings', WORKSPACE, query({ limit: 1, facets: ['subject'] }));
    expect(first.facets?.subject).toEqual(['math', 'physics']);
    expect(first.hasMore).toBe(true);

    const second = await listStoreWindow(
      db,
      'trainings',
      WORKSPACE,
      query({ limit: 1, facets: ['subject'], before: first.nextBefore, beforeId: first.nextBeforeId }),
    );
    expect(second.facets).toBeUndefined();
  });
});

describe('参数解析', () => {
  const parse = (search: string) => parseWindowQuery(new URLSearchParams(search));

  it('默认 limit / order，且不把 since 混进窗口语义', () => {
    const result = parse('limit=20');
    expect(result.ok && result.query.limit).toBe(20);
    expect(result.ok && result.query.order).toBe('updated');
    expect(result.ok && result.query.since).toBeUndefined();
  });

  it('limit 非法值直接报错，而不是悄悄当成默认值', () => {
    expect(parse('limit=0').ok).toBe(false);
    expect(parse('limit=201').ok).toBe(false);
    expect(parse('limit=abc').ok).toBe(false);
  });

  it('before 必须是合法时间（order=updated）/ 合法日期（order=date）', () => {
    expect(parse('before=not-a-date').ok).toBe(false);
    expect(parse('order=date&before=2026-11-01').ok).toBe(true);
    expect(parse('order=date&before=2026-11-01T00:00:00Z').ok).toBe(false);
  });

  it('只有 beforeId 没有 before 无法比较，拒绝', () => {
    expect(parse('beforeId=t1').ok).toBe(false);
  });

  it('facets 只接受白名单字段', () => {
    expect(parse('facets=subject,module').ok).toBe(true);
    expect(parse('facets=data').ok).toBe(false);
  });

  it('since 归一化为 UTC ISO（老数据混用 +08:00）', () => {
    const result = parse('since=2026-11-16T18:00:00%2B08:00');
    expect(result.ok && result.query.since).toBe('2026-11-16T10:00:00.000Z');
  });

  it('客户端拼串不会带上多余参数（否则会把整表读误判成窗口读）', () => {
    expect(windowSearchParams({}).toString()).toBe('');
    expect(windowSearchParams({ limit: 20, order: 'updated' }).toString()).toBe('limit=20');
    expect(windowSearchParams({ limit: 20, order: 'date', before: '2026-11-01' }).toString()).toBe(
      'limit=20&order=date&before=2026-11-01',
    );
  });
});

describe('SQL 形状', () => {
  it('窗口查询带 LIMIT 且排序带 id 兜底', () => {
    const { sql, params } = buildWindowSql('trainings', query({ limit: 7 }), 'ws');
    expect(sql).toContain('LIMIT ?');
    expect(sql).toContain('ORDER BY updated_at DESC, id DESC');
    expect(params[params.length - 1]).toBe(8); // limit + 1
  });
});
