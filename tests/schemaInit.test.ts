import { describe, expect, it } from 'vitest';
import { ensureSchemaReady, schemaIsCurrent } from '../functions/api/[[path]]';

type FakeStatement = { sql: string };

const STORE_COLUMNS = ['workspace', 'id', 'updated_at', 'data'];
const USERS_COLUMNS = [
  'id',
  'username',
  'username_normalized',
  'password_hash',
  'created_at',
  'last_login_at',
  'role',
  'grade_level',
  'profile_initialized',
];
const SESSIONS_COLUMNS = ['id', 'user_id', 'token_hash', 'expires_at', 'created_at'];
const ATTEMPTS_COLUMNS = ['id', 'client_key', 'succeeded', 'created_at'];
const BACKUP_COLUMNS = ['id', 'account_id', 'created_at', 'data'];

function fakeDb(options: { current: boolean; batchError?: boolean }) {
  const writes: string[] = [];
  const batchCalls: string[][] = [];

  const db = {
    prepare(sql: string) {
      return {
        sql,
        bind() {
          return this;
        },
        async run() {
          writes.push(sql);
          return { success: true, results: [] };
        },
        async all() {
          return { success: true, results: [] };
        },
      };
    },
    async batch(statements: FakeStatement[]) {
      batchCalls.push(statements.map((statement) => statement.sql));
      if (options.batchError) throw new Error('D1_ERROR: batch unsupported');
      return statements.map((statement) => {
        if (!options.current) return { success: true, results: [] };
        const match = statement.sql.match(/PRAGMA table_info\((\w+)\)/);
        if (match) {
          const table = match[1];
          const columns =
            table === 'users'
              ? USERS_COLUMNS
              : table === 'sessions'
                ? SESSIONS_COLUMNS
                : table === 'auth_attempts'
                  ? ATTEMPTS_COLUMNS
                  : table === 'sync_backups'
                    ? BACKUP_COLUMNS
                    : STORE_COLUMNS;
          return { success: true, results: columns.map((name) => ({ name })) };
        }
        return {
          success: true,
          results: [{ name: 'idx_sessions_expires' }, { name: 'idx_auth_attempts_client_created' }],
        };
      });
    },
  };

  return { db: db as unknown as D1Database, writes, batchCalls };
}

describe('运行时建表 · 冷启动探活', () => {
  it('schema 齐全时只用一次批量探活，不执行任何建表语句', async () => {
    const { db, writes, batchCalls } = fakeDb({ current: true });

    await ensureSchemaReady(db);

    expect(batchCalls).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it('缺表或列时回退到完整建表流程', async () => {
    const { db, writes } = fakeDb({ current: false });

    expect(await schemaIsCurrent(db)).toBe(false);
    await ensureSchemaReady(db);

    expect(writes.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS users'))).toBe(true);
    expect(writes.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS trainings'))).toBe(true);
  });

  it('探活执行异常时仍能退回完整建表', async () => {
    const { db, writes } = fakeDb({ current: false, batchError: true });

    await ensureSchemaReady(db);

    expect(writes.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS trainings'))).toBe(true);
  });
});
