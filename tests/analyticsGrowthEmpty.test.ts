import { describe, expect, it } from 'vitest';
import { buildGrowthSeries } from '../src/services/analytics';
import { fullAndModuleTrainings } from './fixtures/demoData';

/**
 * 历史分数曲线（数据分析 · 概览）回归：
 * 无数据时必须返回空序列让页面走空态，而不是空白坐标或 NaN。
 */
describe('历史分数曲线：有数据 / 无数据都不出错', () => {
  it('没有任何训练记录时返回空序列', () => {
    expect(buildGrowthSeries([], 'xingce')).toEqual([]);
  });

  it('有数据时每周分值都是有限数字，不出现 NaN', () => {
    const base = fullAndModuleTrainings[0];
    const series = buildGrowthSeries([base], base.subject);
    expect(series.length).toBeGreaterThan(0);
    for (const point of series) {
      expect(Number.isFinite(point.score)).toBe(true);
      expect(Number.isFinite(point.unfamiliar)).toBe(true);
      expect(point.score).toBeGreaterThanOrEqual(0);
      expect(point.score).toBeLessThanOrEqual(100);
    }
  });

  it('题量为 0 的脏记录不会把曲线算成 NaN', () => {
    const base = fullAndModuleTrainings[0];
    const dirty = { ...base, id: 'e-empty', totalQuestions: 0, correctCount: 0, errorCount: 0 };
    const series = buildGrowthSeries([dirty], base.subject);
    expect(series.every((p) => Number.isFinite(p.score))).toBe(true);
  });
});
