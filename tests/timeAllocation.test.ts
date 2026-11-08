import { describe, expect, it } from 'vitest';
import { buildTimeAllocation } from '../src/services/analytics';
import {
  durationOnlyTrainings,
  fullAndModuleTrainings,
  moduleOnlyTrainings,
  noStandardTrainings,
} from './fixtures/demoData';

describe('F-09 时间分配（演示数据）', () => {
  it('整卷+模块时只采用整卷用时，不重复累计', () => {
    const items = buildTimeAllocation(fullAndModuleTrainings);
    expect(items).toHaveLength(1);
    expect(items[0].module).toBe('整卷');
    expect(items[0].totalMinutes).toBe(60);
    expect(items[0].share).toBe(100);
    expect(items[0].sessionCount).toBe(1);
    expect(items[0].avgMinutesPerQuestion).toBe(2);
  });

  it('仅模块时按一级模块归并并计算占比', () => {
    const items = buildTimeAllocation(moduleOnlyTrainings);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.share === 50)).toBe(true);
    expect(items.reduce((s, i) => s + i.totalMinutes, 0)).toBe(40);
  });

  it('仅有用时无题量时仍统计用时，均值为 null', () => {
    const items = buildTimeAllocation(durationOnlyTrainings);
    expect(items[0].totalMinutes).toBe(30);
    expect(items[0].avgMinutesPerQuestion).toBeNull();
  });

  it('无有效用时返回空数组', () => {
    const noDuration = { ...noStandardTrainings[0], durationMinutes: undefined };
    expect(buildTimeAllocation([noDuration])).toEqual([]);
    expect(buildTimeAllocation([])).toEqual([]);
  });
});
