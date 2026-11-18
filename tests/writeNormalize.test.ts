import { describe, expect, it } from 'vitest';
import { upsertStatements } from '../functions/api/[[path]]';
import type { StoreName } from '../src/services/snapshot';

/**
 * 写入边界归一化（2026-11-18）
 *
 * 历史脏数据的三个成因里，「写入不校验结构」是最根本的那个：
 * - 表只有 `workspace / id / updated_at / data(JSON)`，结构完全由写入方决定；
 * - PUT 只检查 `typeof body === 'object'`，其余交给 TypeScript（编译期承诺，运行期不存在）；
 * - 字段是逐版长出来的，老记录不会因为接口里多了一行就自动带上新键。
 *
 * 现在 `upsertStatements` 在落库前调用与读侧同一份 `recordNormalize`：
 * 缺的必填字段补齐、类型不对的纠正，正常记录原样写回。
 */

/** 只捕获 bind 参数的假 D1：够用就行，重点看落库的 JSON 长什么样 */
function fakeDb(writes: unknown[][]) {
  const db = {
    prepare: () => ({
      bind: (...args: unknown[]) => {
        writes.push(args);
        return { run: async () => ({ success: true }), args };
      },
    }),
  };
  return db as unknown as D1Database;
}

const storedJson = (writes: unknown[][], index = 0) => JSON.parse(writes[index][3] as string) as Record<string, unknown>;

describe('写入边界 · 落库前补齐结构', () => {
  it('空壳记录（只有 id）写入也会补齐必填字段', () => {
    const writes: unknown[][] = [];
    const db = fakeDb(writes);

    upsertStatements(db, 'pdcaProblems' as StoreName, 'ws', [{ id: 'p1' }], false);

    const data = storedJson(writes);
    expect(data.rootCauses).toEqual([]);
    expect(data.countermeasures).toEqual([]);
    expect(data.checkEntries).toEqual([]);
    expect(data.cycleHistory).toEqual([]);
    expect(data.title).toBe('');
    expect(data.currentStage).toBe('');
  });

  it('trainings 缺错因数组与题量时按读侧同一规则补齐（正确数由题量推导）', () => {
    const writes: unknown[][] = [];
    const db = fakeDb(writes);

    upsertStatements(
      db,
      'trainings' as StoreName,
      'ws',
      [{ id: 't1', subject: 'xingce', totalQuestions: 10, errorCount: 3 }],
      false,
    );

    const data = storedJson(writes);
    expect(data.errorCategories).toEqual([]);
    expect(data.correctCount).toBe(7);
    expect(data.date).toBe('');
  });

  it('嵌套的分题也补 errorCategories，避免摊平后二次崩溃', () => {
    const writes: unknown[][] = [];
    const db = fakeDb(writes);

    upsertStatements(
      db,
      'subjectiveAnswers' as StoreName,
      'ws',
      [{ id: 'sa1', paperQuestions: [{ id: 'q1' }, { id: 'q2', errorCategories: ['粗心'] }] }],
      false,
    );

    const data = storedJson(writes) as { paperQuestions: Array<Record<string, unknown>> };
    expect(data.paperQuestions[0].errorCategories).toEqual([]);
    expect(data.paperQuestions[1].errorCategories).toEqual(['粗心']);
  });

  it('结构完整的记录原样落库（不额外加字段、不改值）', () => {
    const writes: unknown[][] = [];
    const db = fakeDb(writes);

    const complete = {
      id: 'g1',
      abilityPath: '行测/资料分析',
      subject: 'xingce',
      status: 'active',
      errorCategory: '',
      occurrenceCount: 2,
      sourceRecordIds: [],
      statusHistory: [],
    };
    upsertStatements(db, 'gaps' as StoreName, 'ws', [complete], false);

    expect(storedJson(writes)).toEqual(complete);
  });
});
