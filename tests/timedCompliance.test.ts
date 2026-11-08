import { describe, expect, it } from 'vitest';
import { isTimedMet, timedComplianceRate } from '../src/services/analytics';
import { noStandardTrainings, timedTrainings, weeklyTrainings } from './fixtures/demoData';

describe('F-05 限时达标（演示数据）', () => {
  it('单题用时不超过标准用时为达标', () => {
    expect(isTimedMet(timedTrainings[0])).toBe(true); // 35 <= 40
    expect(isTimedMet(timedTrainings[1])).toBe(false); // 45 > 40
    // 用时恰好等于标准视为达标
    expect(isTimedMet(weeklyTrainings[1])).toBe(true); // 60 <= 60
  });

  it('缺标准用时 / 用时 / 题量时返回 null', () => {
    expect(isTimedMet(noStandardTrainings[0])).toBeNull();
    expect(
      isTimedMet({ ...timedTrainings[0], durationMinutes: undefined }),
    ).toBeNull();
    expect(isTimedMet({ ...timedTrainings[0], totalQuestions: 0 })).toBeNull();
  });

  it('达标率只统计可判定记录', () => {
    const result = timedComplianceRate(timedTrainings);
    expect(result.sampleSize).toBe(2);
    expect(result.rate).toBe(50);
  });

  it('无时间基准时样本为 0、达标率为 null', () => {
    const result = timedComplianceRate(noStandardTrainings);
    expect(result.sampleSize).toBe(0);
    expect(result.rate).toBeNull();
  });
});
