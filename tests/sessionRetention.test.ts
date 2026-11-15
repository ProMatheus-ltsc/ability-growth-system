import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  createSession,
  pruneSessionsForUser,
  type D1Like,
} from '@shared/core/server/authDb';
import { generateSessionToken } from '@shared/core/server/authCore';

/** 把 node:sqlite 适配成共享包的 D1Like 接口 */
function createD1(db: DatabaseSync): D1Like {
  return {
    prepare(query: string) {
      const statement = db.prepare(query);
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              statement.run(...(values as never[]));
              return { success: true };
            },
            async first<T>() {
              return (statement.get(...(values as never[])) as T | undefined) ?? null;
            },
            async all<T>() {
              return { results: statement.all(...(values as never[])) as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Like;
}

function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  return db;
}

describe('会话保留', () => {
  it('每用户只保留最近 20 个会话', async () => {
    const db = createDb();
    const d1 = createD1(db);
    await d1
      .prepare(
        'INSERT INTO users (id,username,username_normalized,password_hash,created_at,last_login_at) VALUES (?,?,?,?,?,?)',
      )
      .bind('usr_test', 'tester', 'tester', 'hash', new Date().toISOString(), new Date().toISOString())
      .run();

    // 建 25 个会话（created_at 递增）
    for (let index = 0; index < 25; index += 1) {
      await d1
        .prepare(
          'INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)',
        )
        .bind(
          `ses_${index}`,
          'usr_test',
          `hash_${index}`,
          new Date(Date.now() + 86_400_000).toISOString(),
          new Date(Date.now() + index * 1000).toISOString(),
        )
        .run();
    }

    await pruneSessionsForUser(d1, 'usr_test', 20);

    const remaining = await d1
      .prepare('SELECT id FROM sessions WHERE user_id = ?')
      .bind('usr_test')
      .all<{ id: string }>();
    expect(remaining.results).toHaveLength(20);
    // 保留的是最新的 20 个（ses_5 ~ ses_24）
    const ids = remaining.results.map((row) => row.id).sort();
    expect(ids).not.toContain('ses_0');
    expect(ids).not.toContain('ses_4');
    expect(ids).toContain('ses_24');
  });

  it('创建会话后库里只存 token 的哈希', async () => {
    const db = createDb();
    const d1 = createD1(db);
    await d1
      .prepare(
        'INSERT INTO users (id,username,username_normalized,password_hash,created_at,last_login_at) VALUES (?,?,?,?,?,?)',
      )
      .bind('usr_1', 'tester', 'tester', 'hash', new Date().toISOString(), new Date().toISOString())
      .run();

    const token = generateSessionToken();
    await createSession(d1, 'usr_1', token);

    const row = await d1
      .prepare('SELECT token_hash FROM sessions WHERE user_id = ?')
      .bind('usr_1')
      .first<{ token_hash: string }>();
    expect(row?.token_hash).not.toBe(token);
    expect(row?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
