import { describe, expect, it } from 'vitest';
import { buildTimeAllocation } from '../src/services/analytics';
import {
  durationOnlyTrainings,
  fullAndModuleTrainings,
  moduleOnlyTrainings,
  noStandardTrainings,
} from './fixtures/demoData';

describe('F-09 时间分配（演示数据）', () => {
  // 口径变更（验收缺陷 #7）：整卷与模块并存时必须保留模块时间明细，
  // 此前走学科级去重只留整卷行，导致「模块时间分配」明细消失。
  it('整卷+模块时保留模块明细，整卷行不重复计时', () => {
    const items = buildTimeAllocation(fullAndModuleTrainings);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.module).sort()).toEqual(['判断推理', '资料分析']);
    expect(items.reduce((s, i) => s + i.totalMinutes, 0)).toBe(60);
    expect(items.every((i) => i.sessionCount === 1)).toBe(true);
  });

  it('只有整卷行（未双写模块）时保留整卷用时', () => {
    const fullOnly = fullAndModuleTrainings.filter((t) => t.scope === 'full');
    const items = buildTimeAllocation(fullOnly);
    expect(items).toHaveLength(1);
    expect(items[0].module).toBe('整卷');
    expect(items[0].totalMinutes).toBe(60);
    expect(items[0].share).toBe(100);
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
