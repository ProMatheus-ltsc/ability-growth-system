import { describe, expect, it } from 'vitest';
import { daysBetween, describeStagePlan, generateDefaultStagePlan, stageCountForDays } from '../src/services/planner';

const TODAY = '2026-11-09';

function assertNoInvertedOrOverlapping(plans: ReturnType<typeof generateDefaultStagePlan>) {
  for (let i = 0; i < plans.length; i += 1) {
    expect(plans[i].startDate >= TODAY).toBe(true);
    expect(plans[i].startDate <= plans[i].endDate).toBe(true);
    if (i > 0) {
      expect(plans[i - 1].endDate < plans[i].startDate).toBe(true);
    }
  }
}

describe('阶段规划：按剩余天数动态决定段数与边界', () => {
  it('剩余 20 天只生成 1 段冲刺期，且边界不倒挂', () => {
    const plans = generateDefaultStagePlan('2026-11-29', undefined, TODAY);
    expect(plans).toHaveLength(1);
    expect(plans[0].stage).toBe('sprint');
    expect(plans[0].startDate).toBe('2026-11-09');
    expect(plans[0].endDate).toBe('2026-11-29');
    expect(plans[0].source).toBe('auto');
    assertNoInvertedOrOverlapping(plans);
  });

  it('五档天数分别生成 1 / 1 / 2 / 3 / 4 段', () => {
    expect(generateDefaultStagePlan('2026-11-12', undefined, TODAY)).toHaveLength(1); // 3 天
    expect(generateDefaultStagePlan('2026-11-29', undefined, TODAY)).toHaveLength(1); // 20 天
    expect(generateDefaultStagePlan('2026-12-09', undefined, TODAY)).toHaveLength(2); // 30 天
    expect(generateDefaultStagePlan('2027-01-08', undefined, TODAY)).toHaveLength(3); // 60 天
    expect(generateDefaultStagePlan('2027-03-09', undefined, TODAY)).toHaveLength(4); // 120 天
  });

  it('多段时首尾相接、无重叠且最后一段止于考试日', () => {
    for (const exam of ['2026-12-09', '2027-01-08', '2027-03-09']) {
      const plans = generateDefaultStagePlan(exam, undefined, TODAY);
      expect(plans[0].startDate).toBe(TODAY);
      expect(plans[plans.length - 1].endDate).toBe(exam);
      assertNoInvertedOrOverlapping(plans);
    }
  });

  it('考试日期已过或就是今天时不生成阶段', () => {
    expect(generateDefaultStagePlan('2026-11-01', undefined, TODAY)).toEqual([]);
    expect(generateDefaultStagePlan(TODAY, undefined, TODAY)).toEqual([]);
  });

  it('段数计算遵守 21 / 45 / 90 天分界', () => {
    expect(stageCountForDays(21)).toBe(1);
    expect(stageCountForDays(22)).toBe(2);
    expect(stageCountForDays(45)).toBe(2);
    expect(stageCountForDays(46)).toBe(3);
    expect(stageCountForDays(90)).toBe(3);
    expect(stageCountForDays(91)).toBe(4);
    expect(stageCountForDays(0)).toBe(0);
  });

  it('口径说明写清天数、段数与边界规则', () => {
    const note = describeStagePlan('2026-11-29', TODAY);
    expect(note).toContain('距考试 20 天');
    expect(note).toContain('1 段');
    expect(note).toContain('每段至少 5 天');
    expect(daysBetween('2026-11-09', '2026-11-29')).toBe(20);
  });
});
