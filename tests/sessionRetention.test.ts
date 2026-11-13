import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { pruneSessionsForUser } from '../functions/api/[[path]]';

describe('会话保留', () => {
  it('每用户只保留最近 20 个会话', async () => {
    const calls: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            calls.push({ sql, args });
            return { run: async () => ({ success: true }) };
          },
        };
      },
    } as unknown as D1Database;

    await pruneSessionsForUser(db, 'usr_test');

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DELETE FROM sessions');
    expect(calls[0].sql).toContain('LIMIT ?');
    expect(calls[0].args).toEqual(['usr_test', 'usr_test', 20]);
  });
});
