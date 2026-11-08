import { describe, expect, it } from 'vitest';
import { aggregateBySubject, computeTargetGap } from '../src/services/analytics';
import { targetGapTrainings } from './fixtures/demoData';

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
