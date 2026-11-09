import { describe, expect, it } from 'vitest';
import {
  computeTargetGap,
  isInferredStandardMinutes,
  isTimedMet,
  timedComplianceRate,
} from '../src/services/analytics';
import { timedTrainings } from './fixtures/demoData';

/**
 * 与数据侧对齐的数据契约（234 条历史记录大量新字段为空 / 部分为推断值）：
 * - 缺失不当 0、不当满分，不进入加权分母；
 * - note 标注「推断」的 standardMinutes 不与真实用时混算；
 * - 无有效样本时目标分差返回 null，而不是 0 分。
 */
describe('数据契约：缺失与推断值的处理', () => {
  it('note 标注「推断」的标准用时不计入限时达标', () => {
    const inferred = { ...timedTrainings[0], note: 'standardMinutes 按考纲推断' };
    expect(isInferredStandardMinutes(inferred)).toBe(true);
    expect(isTimedMet(inferred)).toBeNull();
    const result = timedComplianceRate([inferred, timedTrainings[1]]);
    expect(result.sampleSize).toBe(1);
    expect(result.inferredSamples).toBe(1);
    expect(result.rate).toBe(0);
  });

  it('无有效样本时目标分差返回 null，而不是 0 分', () => {
    const gap = computeTargetGap([], 80);
    expect(gap?.current).toBeNull();
    expect(gap?.gap).toBeNull();
    expect(gap?.reached).toBe(false);
    expect(gap?.sampleQuestions).toBe(0);
    expect(gap?.target).toBe(80);
  });
});
