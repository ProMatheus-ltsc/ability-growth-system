import { describe, expect, it } from 'vitest';
import { collectExamTargets } from '../src/services/planner';
import type { ExamRegistration } from '../src/domain/types';

function reg(partial: Partial<ExamRegistration>): ExamRegistration {
  return {
    id: 'r1',
    postName: '国考',
    examType: 'national',
    examDate: '2026-11-29',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

describe('collectExamTargets · 时间线/日历共用考试节点口径', () => {
  it('按分科计划收集并按日期升序，标签带科目', () => {
    const targets = collectExamTargets([
      reg({
        subjectPlans: {
          xingce: { examDate: '2026-11-29' },
          shenlun: { examDate: '2026-11-29' },
        } as ExamRegistration['subjectPlans'],
      }),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual({ date: '2026-11-29', label: '国考 · 行测' });
  });

  it('多场考试按日期接续，from 传后一场起点时自动切换', () => {
    const regs = [
      reg({
        id: 'a',
        postName: '国考',
        subjectPlans: { xingce: { examDate: '2026-11-29' } } as ExamRegistration['subjectPlans'],
      }),
      reg({
        id: 'b',
        postName: '广东省考',
        examDate: '2026-12-06',
        subjectPlans: { xingce: { examDate: '2026-12-06' } } as ExamRegistration['subjectPlans'],
      }),
    ];
    expect(collectExamTargets(regs).map((t) => t.date)).toEqual(['2026-11-29', '2026-12-06']);
    expect(collectExamTargets(regs, '2026-11-30')).toEqual([{ date: '2026-12-06', label: '广东省考 · 行测' }]);
  });

  it('无分科计划时回退到顶层 examDate，同一天只保留一条', () => {
    const targets = collectExamTargets([
      reg({ id: 'a', examDate: '2026-12-06', postName: '广东省考' }),
      reg({ id: 'b', examDate: '2026-12-06', postName: '重复场次' }),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0].date).toBe('2026-12-06');
    expect(targets[0].label).toBe('广东省考');
  });
});
