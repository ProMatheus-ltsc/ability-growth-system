import { describe, expect, it } from 'vitest';
import { aggregateBySubject, detectFeedbackLoops } from '../src/services/analytics';
import {
  normalizeStoreRecord,
  normalizeStoreRecords,
  normalizeSubjectiveAnswer,
  normalizeTrainingRecord,
} from '../src/services/recordNormalize';
import type { TrainingRecord } from '../src/domain/types';

type Loose<T> = Partial<Record<keyof T, unknown>>;

/** 早期版本写进库里的训练记录：没有 errorCategories，correctCount 也可能缺 */
function legacyTraining(overrides: Loose<TrainingRecord> = {}): TrainingRecord {
  return {
    id: 'legacy-1',
    date: '2025-01-05',
    gradeLevel: 'adult',
    subject: 'xingce',
    module: '资料分析',
    trainingType: 'module',
    totalQuestions: 20,
    errorCount: 5,
    createdAt: '2025-01-05T00:00:00.000Z',
    updatedAt: '2025-01-05T00:00:00.000Z',
    ...overrides,
  } as unknown as TrainingRecord;
}

/** 结构完整的现行记录 */
function currentTraining(overrides: Loose<TrainingRecord> = {}): TrainingRecord {
  return {
    id: 'current-1',
    date: '2026-11-01',
    gradeLevel: 'adult',
    subject: 'xingce',
    module: '资料分析',
    trainingType: 'module',
    totalQuestions: 20,
    correctCount: 15,
    errorCount: 5,
    errorCategories: ['concept'],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  } as TrainingRecord;
}

describe('历史训练记录缺 errorCategories 时的统计兜底', () => {
  it('aggregateBySubject 不再抛错（线上首页白屏的直接原因）', () => {
    const records = [legacyTraining(), currentTraining()];
    expect(() => aggregateBySubject(records)).not.toThrow();

    const stats = aggregateBySubject(records);
    expect(stats).toHaveLength(1);
    expect(stats[0].totalQuestions).toBe(40);
    expect(stats[0].totalErrors).toBe(10);
    // 只有结构完整的那条贡献错因
    expect(stats[0].errorHotspots).toEqual([{ category: 'concept', count: 1 }]);
  });

  it('全部记录都缺字段时错因热区为空数组，而不是崩溃', () => {
    const stats = aggregateBySubject([legacyTraining()]);
    expect(stats[0].errorHotspots).toEqual([]);
    expect(stats[0].correctRate).toBeCloseTo(0.75);
  });

  it('errorCategories 是脏值（非数组）时也不抛', () => {
    const dirty = legacyTraining({ errorCategories: 'concept' });
    expect(() => aggregateBySubject([dirty])).not.toThrow();
  });

  it('detectFeedbackLoops 同样安全', () => {
    expect(() => detectFeedbackLoops([legacyTraining()], [])).not.toThrow();
    expect(detectFeedbackLoops([legacyTraining()], [])).toEqual([]);
  });
});

describe('读侧归一化规则', () => {
  it('补齐 errorCategories 与缺失的 correctCount（按总题量-错题数推导）', () => {
    const normalized = normalizeTrainingRecord(legacyTraining() as unknown as Record<string, unknown>);
    expect(normalized.errorCategories).toEqual([]);
    expect(normalized.correctCount).toBe(15);
    expect(normalized.totalQuestions).toBe(20);
  });

  it('题量字段缺失时按 0 兜底，避免整科汇总变 NaN', () => {
    const broken = legacyTraining({ totalQuestions: undefined, errorCount: undefined });
    const normalized = normalizeTrainingRecord(broken as unknown as Record<string, unknown>);
    expect(normalized.totalQuestions).toBe(0);
    expect(normalized.errorCount).toBe(0);
    expect(normalized.correctCount).toBe(0);
  });

  it('结构完整的记录原样返回同一个对象（零拷贝）', () => {
    const record = currentTraining() as unknown as Record<string, unknown>;
    expect(normalizeTrainingRecord(record)).toBe(record);
  });

  it('不改动可选字段的 undefined 语义（answeredAt ?? createdAt 这类兜底仍生效）', () => {
    const record = currentTraining({ durationMinutes: undefined }) as unknown as Record<string, unknown>;
    const normalized = normalizeTrainingRecord(record);
    expect('durationMinutes' in normalized ? normalized.durationMinutes : undefined).toBeUndefined();
  });

  it('套卷分题的 errorCategories 一起补齐', () => {
    const paper = {
      id: 'paper-1',
      answeredAt: '2026-10-01',
      paperQuestions: [{ no: 1, content: '题干' }, { no: 2, content: '题干', errorCategories: ['logic'] }],
    };
    const normalized = normalizeSubjectiveAnswer(paper);
    expect(normalized.errorCategories).toEqual([]);
    expect((normalized.paperQuestions as { errorCategories: string[] }[])[0].errorCategories).toEqual([]);
    expect((normalized.paperQuestions as { errorCategories: string[] }[])[1].errorCategories).toEqual(['logic']);
  });

  it('normalizeStoreRecords 全合法时返回原数组，不制造新数组', () => {
    const list = [currentTraining(), currentTraining({ id: 'current-2' })];
    const out = normalizeStoreRecords('trainings', list);
    expect(out).toBe(list);
  });

  it('无规则的未知表与非法值原样返回', () => {
    const value = { id: 'x' };
    expect(normalizeStoreRecord('strategies', value)).toBe(value);
    expect(normalizeStoreRecord('trainings', null)).toBeNull();
    expect(normalizeStoreRecord('trainings', 'broken')).toBe('broken');
  });
});

describe('其它表的必填字段补全（极简历史记录扫描发现的白屏点）', () => {
  it('stagePlans.focusModules 缺失会让共享时间轴 useMemo 崩溃 → 全站白屏', () => {
    const plan = { id: 'p1', stage: 'foundation', startDate: '2025-01-01', endDate: '2025-02-01' };
    const normalized = normalizeStoreRecord('stagePlans', plan) as Record<string, unknown>;
    expect(normalized.focusModules).toEqual([]);
    expect(normalized.focusAbilities).toEqual([]);
    // 原对象不被修改（归一化是纯函数）
    expect('focusModules' in plan).toBe(false);
    expect((normalized.focusModules as string[]).join('、')).toBe('');
  });

  it('gaps.abilityPath 缺失时 split 不再抛（瓶颈文案、雷达）', () => {
    const normalized = normalizeStoreRecord('gaps', { id: 'g1' }) as Record<string, unknown>;
    expect(normalized.abilityPath).toBe('');
    expect(() => (normalized.abilityPath as string).split('/').slice(-1)[0]).not.toThrow();
    expect(normalized.sourceRecordIds).toEqual([]);
    expect(normalized.occurrenceCount).toBe(0);
  });

  it('interviewRecords.problemTags / weeklyChecklists.entries / customTools.appliesTo 补齐', () => {
    expect((normalizeStoreRecord('interviewRecords', { id: 'i1' }) as Record<string, unknown>).problemTags).toEqual([]);
    expect((normalizeStoreRecord('weeklyChecklists', { id: 'w1' }) as Record<string, unknown>).entries).toEqual([]);
    expect((normalizeStoreRecord('customTools', { id: 't1' }) as Record<string, unknown>).appliesTo).toEqual([]);
  });

  it('careerReports.generatedAt 补齐后 slice 不抛', () => {
    const normalized = normalizeStoreRecord('careerReports', { id: 'r1' }) as Record<string, unknown>;
    expect(normalized.generatedAt).toBe('');
    expect(() => (normalized.generatedAt as string).slice(0, 10)).not.toThrow();
    expect(normalized.survivors).toEqual([]);
  });

  it('pdcaProblems 的数组字段在读出口也补齐（双保险）', () => {
    const normalized = normalizeStoreRecord('pdcaProblems', { id: 'p1' }) as Record<string, unknown>;
    expect(normalized.rootCauses).toEqual([]);
    expect(normalized.countermeasures).toEqual([]);
    expect(normalized.checkEntries).toEqual([]);
  });

  it('可选字段不会被塞默认值（保留 ?? 兜底语义）', () => {
    const normalized = normalizeStoreRecord('stagePlans', { id: 'p1', weeklyGoal: undefined }) as Record<string, unknown>;
    expect(normalized.weeklyGoal).toBeUndefined();
  });

  it('spacedReviews.intervals 与 careerReports.routes 补齐后不再崩', () => {
    const review = normalizeStoreRecord('spacedReviews', { id: 's1' }) as Record<string, unknown>;
    expect(review.intervals).toEqual([]);
    expect(review.currentIndex).toBe(0);
    expect((review.intervals as number[]).length).toBe(0);

    const report = normalizeStoreRecord('careerReports', { id: 'r1' }) as Record<string, unknown>;
    expect(() => (report.routes as Record<string, unknown>).expertBias).not.toThrow();
    expect((report.routes as Record<string, unknown>).expertBias).toBeUndefined();
  });
});
