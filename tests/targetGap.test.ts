import { describe, expect, it } from 'vitest';
import { aggregateBySubject, computeTargetGap, resolveTargetPlan } from '../src/services/analytics';
import { targetGapTrainings } from './fixtures/demoData';
import type { ExamRegistration } from '../src/domain/types';

const reg = (partial: Partial<ExamRegistration>): ExamRegistration => ({
  id: partial.id ?? 'reg-1',
  postName: partial.postName ?? '演示岗位',
  examType: partial.examType ?? 'national',
  examDate: partial.examDate ?? '2026-12-01',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...partial,
});

describe('F-08 目标分差（演示数据）', () => {
  const stats = aggregateBySubject(targetGapTrainings);

  it('按题量加权计算当前掌握度并给出分差', () => {
    const gap = computeTargetGap(stats, 80);
    expect(gap?.current).toBe(65);
    expect(gap?.gap).toBe(15);
    expect(gap?.reached).toBe(false);
  });

  it('已达标时分差为负且 reached=true', () => {
    const gap = computeTargetGap(stats, 60);
    expect(gap?.gap).toBe(-5);
    expect(gap?.reached).toBe(true);
  });

  it('目标分缺失或越界视为未设置', () => {
    expect(computeTargetGap(stats, undefined)).toBeNull();
    expect(computeTargetGap(stats, 120)).toBeNull();
    expect(computeTargetGap(stats, -1)).toBeNull();
    // 0 分是合法目标
    expect(computeTargetGap(stats, 0)?.gap).toBe(-65);
  });
});

describe('F-08 目标分来源解析', () => {
  it('优先取最近一场未来考试的目标分', () => {
    const registrations = [
      reg({ id: 'a', studentId: 's1', examDate: '2026-12-20', targetScore: 70 }),
      reg({ id: 'b', studentId: 's1', examDate: '2026-12-05', targetScore: 80 }),
      reg({ id: 'c', studentId: 's1', examDate: '2026-10-01', targetScore: 90 }),
    ];
    expect(resolveTargetPlan(registrations, 's1', 'xingce', '2026-11-09')?.targetScore).toBe(80);
  });

  it('无未来考试时取最近一次已设置目标的报名', () => {
    const registrations = [
      reg({ id: 'a', studentId: 's1', examDate: '2026-10-01', targetScore: 70 }),
      reg({ id: 'b', studentId: 's1', examDate: '2026-09-01', targetScore: 80 }),
    ];
    expect(resolveTargetPlan(registrations, 's1', 'xingce', '2026-11-09')?.targetScore).toBe(70);
  });

  it('按学员过滤并忽略越界目标分', () => {
    const registrations = [
      reg({ id: 'a', studentId: 's2', examDate: '2026-12-01', targetScore: 95 }),
      reg({ id: 'b', studentId: 's1', examDate: '2026-12-02', targetScore: 120 }),
      reg({ id: 'c', studentId: 's1', examDate: '2026-12-03', targetScore: 60 }),
    ];
    expect(resolveTargetPlan(registrations, 's1', 'xingce', '2026-11-09')?.targetScore).toBe(60);
  });

  it('新记录按科目取目标分，该科目没填不回退到其他科目', () => {
    const registrations = [
      reg({
        id: 'a',
        studentId: 's1',
        examDate: '2026-12-01',
        subjectPlans: {
          xingce: { targetScore: 80, examDate: '2026-12-01' },
          shenlun: { examDate: '2026-12-01' },
        },
      }),
    ];
    expect(resolveTargetPlan(registrations, 's1', 'xingce', '2026-11-09')?.targetScore).toBe(80);
    expect(resolveTargetPlan(registrations, 's1', 'shenlun', '2026-11-09')).toBeUndefined();
  });

  it('老记录顶层 targetScore 作为该科目历史目标回退', () => {
    const registrations = [reg({ id: 'old', studentId: 's1', examDate: '2026-12-01', targetScore: 70 })];
    expect(resolveTargetPlan(registrations, 's1', 'xingce', '2026-11-09')?.targetScore).toBe(70);
    expect(resolveTargetPlan(registrations, 's1', 'shenlun', '2026-11-09')?.targetScore).toBe(70);
  });

  it('各科目按自己的考试时间取最近一场', () => {
    const registrations = [
      reg({
        id: 'a',
        studentId: 's1',
        examDate: '2026-12-01',
        subjectPlans: {
          xingce: { targetScore: 80, examDate: '2026-12-05' },
          shenlun: { targetScore: 70, examDate: '2026-12-20' },
        },
      }),
      reg({
        id: 'b',
        studentId: 's1',
        examDate: '2026-12-01',
        subjectPlans: {
          xingce: { targetScore: 85, examDate: '2026-12-30' },
        },
      }),
    ];
    expect(resolveTargetPlan(registrations, 's1', 'xingce', '2026-11-09')?.targetScore).toBe(80);
    expect(resolveTargetPlan(registrations, 's1', 'shenlun', '2026-11-09')?.targetScore).toBe(70);
  });
});
