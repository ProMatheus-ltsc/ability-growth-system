/**
 * 测试用的最小 D1 适配器（底层是 Node 内置的 `node:sqlite`）。
 *
 * 为什么不用手写 fake：训练写入、幂等替换、墓碑这些逻辑**全在 SQL 里**
 * （`json_extract`、`ON CONFLICT DO UPDATE ... WHERE julianday(...)`、`IN (...)`）。
 * 手写 fake 只能断言「发出了哪条 SQL」，断言不了「删了哪一行、墓碑落没落库」——
 * 而这次要修的两个 P0 恰好都是「SQL 语句对了但漏了一句」的问题。
 * 用真 SQLite 跑一遍，等于把 wrangler 本地库的行为搬进单测。
 *
 * 只实现项目实际用到的 D1 子集：prepare/bind/run/all/first/batch。
 */
import { DatabaseSync } from 'node:sqlite';

interface D1ResultSet<T> {
  success: true;
  results: T[];
  meta: { changes: number; duration: number };
}

const isQuery = (sql: string): boolean => /^\s*(select|with|pragma)\b/i.test(sql);

/** D1 接受 boolean / undefined；sqlite 只接受 null / number / string / bigint */
function normalizeParam(value: unknown): null | number | string | bigint {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') return value;
  return JSON.stringify(value);
}

export interface SqliteD1 {
  db: D1Database;
  /** 直接操作底层库（建表、断言行数） */
  raw: DatabaseSync;
  /** 执行过的 SQL（按顺序），用于断言「确实打了墓碑」 */
  sqls: string[];
}

export function createSqliteD1(schema = ''): SqliteD1 {
  const raw = new DatabaseSync(':memory:');
  if (schema) raw.exec(schema);
  const sqls: string[] = [];

  const prepare = (sql: string) => {
    sqls.push(sql);
    let bound: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) {
        bound = args;
        return statement;
      },
      async run<T>(): Promise<D1ResultSet<T>> {
        if (isQuery(sql)) {
          // 服务端偶尔对 SELECT 调 run()（例如探活）：照常执行，返回空行集
          raw.prepare(sql).all(...bound.map(normalizeParam));
          return { success: true, results: [], meta: { changes: 0, duration: 0 } };
        }
        const info = raw.prepare(sql).run(...bound.map(normalizeParam));
        return {
          success: true,
          results: [] as T[],
          meta: { changes: Number(info.changes ?? 0), duration: 0 },
        };
      },
      async all<T>(): Promise<D1ResultSet<T>> {
        const rows = raw.prepare(sql).all(...bound.map(normalizeParam)) as T[];
        return { success: true, results: rows, meta: { changes: 0, duration: 0 } };
      },
      async first<T>(): Promise<T | null> {
        const row = raw.prepare(sql).get(...bound.map(normalizeParam)) as T | undefined;
        return row ?? null;
      },
    };
    return statement;
  };

  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      const out: D1ResultSet<unknown>[] = [];
      for (const statement of statements) out.push(await statement.run());
      return out;
    },
  };

  return { db: db as unknown as D1Database, raw, sqls };
}

/** 记录表 + 墓碑表的建表语句（与 migrations 保持一致的主键） */
export const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS trainings (
  workspace TEXT NOT NULL,
  id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (workspace, id)
);
CREATE TABLE IF NOT EXISTS store_deletions (
  workspace TEXT NOT NULL,
  store TEXT NOT NULL,
  id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (workspace, store, id)
);
`;
