import { describe, expect, it } from 'vitest';
import { normalizeTimestamp, prepareSnapshotRecords, upsertSql } from '../functions/api/[[path]]';

const training = (overrides: Record<string, unknown> = {}) => ({
  id: 'train-1',
  date: '2026-11-01',
  subject: 'xingce',
  module: '资料分析',
  trainingType: 'daily',
  totalQuestions: 10,
  correctCount: 8,
  errorCount: 2,
  errorCategories: [],
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  ...overrides,
});

const trainingsOf = (snapshot: Record<string, unknown>) =>
  prepareSnapshotRecords(snapshot).find(([store]) => store === 'trainings')?.[1] ?? [];

/**
 * 备份恢复/快照导入此前直接用原始记录 upsert，绕过了学段归一化与写入边界，
 * 等于给跨学段脏数据开了一条后门。这里固定住导入侧的校验口径。
 */
describe('快照导入 · 学段归一化与写入边界', () => {
  it('公考训练缺 gradeLevel 时补成 adult', () => {
    const records = trainingsOf({ trainings: [training()] });
    expect(records).toHaveLength(1);
    expect(records[0].gradeLevel).toBe('adult');
  });

  it('K12 训练缺 gradeLevel 时拒绝整份快照（不猜学段）', () => {
    expect(() => prepareSnapshotRecords({ trainings: [training({ subject: 'math' })] })).toThrow(
      /学段/,
    );
  });

  it('学段与学科跨域时拒绝整份快照', () => {
    expect(() =>
      prepareSnapshotRecords({ trainings: [training({ subject: 'math', gradeLevel: 'adult' })] }),
    ).toThrow(/学段与学科不匹配/);
  });

  it('申论/面试不得通过导入写进训练记录', () => {
    expect(() =>
      prepareSnapshotRecords({
        trainings: [training({ subject: 'shenlun', gradeLevel: 'adult' })],
      }),
    ).toThrow(/申论|面试/);
  });

  it('缺 id 的脏行被丢弃，不影响其余记录', () => {
    const records = trainingsOf({ trainings: [training(), { subject: 'xingce' }] });
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('train-1');
  });
});

describe('D1 upsert · 多租户冲突键', () => {
  it('不再用 excluded.workspace 改写归属（跨账户抢行根因）', () => {
    const sql = upsertSql('abilities', false);
    expect(sql).toContain('ON CONFLICT DO UPDATE');
    expect(sql).not.toMatch(/workspace\s*=\s*excluded\.workspace/);
  });

  it('最后写入优先时按 julianday 比较，兼容 +08:00 与 Z', () => {
    expect(upsertSql('trainings', true)).toContain(
      'julianday(excluded.updated_at) >= julianday(trainings.updated_at)',
    );
  });
});

describe('时间戳归一化', () => {
  it('把带偏移的时间归一为 UTC Z 格式', () => {
    expect(normalizeTimestamp('2026-11-09T10:13:18+08:00')).toBe('2026-11-09T02:13:18.000Z');
    expect(normalizeTimestamp('2026-11-09T02:13:18.000Z')).toBe('2026-11-09T02:13:18.000Z');
  });

  it('空值与非法值返回 null，由调用方回退', () => {
    expect(normalizeTimestamp('')).toBeNull();
    expect(normalizeTimestamp('   ')).toBeNull();
    expect(normalizeTimestamp('not-a-date')).toBeNull();
    expect(normalizeTimestamp(undefined)).toBeNull();
  });
});
