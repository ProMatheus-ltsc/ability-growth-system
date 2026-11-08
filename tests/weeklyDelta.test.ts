import { describe, expect, it } from 'vitest';
import { buildWeeklyDelta } from '../src/services/analytics';
import { singleWeekTrainings, weeklyTrainings } from './fixtures/demoData';

describe('F-04 周环比（演示数据）', () => {
  it('当前周为最近数据周，上一周为次近数据周', () => {
    const delta = buildWeeklyDelta(weeklyTrainings, 'xingce');
    expect(delta).not.toBeNull();
    expect(delta?.currentWeek).toBe('2026-11-09');
    expect(delta?.previousWeek).toBe('2026-11-02');
    expect(delta?.currentAcc).toBe(75);
    expect(delta?.previousAcc).toBe(60);
    expect(delta?.deltaCorrectRate).toBe(15);
    expect(delta?.deltaQuestions).toBe(10);
    expect(delta?.deltaDurationMinutes).toBe(20);
  });

  it('只有一周数据时上一周与差值为 null', () => {
    const delta = buildWeeklyDelta(singleWeekTrainings, 'xingce');
    expect(delta?.previousWeek).toBeNull();
    expect(delta?.deltaCorrectRate).toBeNull();
    expect(delta?.deltaQuestions).toBeNull();
    expect(delta?.deltaDurationMinutes).toBeNull();
  });

  it('无该学科数据返回 null', () => {
    expect(buildWeeklyDelta(weeklyTrainings, 'math')).toBeNull();
  });
});
