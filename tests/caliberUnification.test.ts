import { describe, expect, it } from 'vitest';
import {
  buildGrowthSeries,
  buildModuleStats,
  buildRadarSlices,
  buildTimeAllocation,
  computeMasteryScore,
  selectAggregationRecords,
  selectModuleLevelRecords,
} from '../src/services/analytics';
import {
  DEFAULT_TIME_WINDOW,
  filterByWindow,
  TIME_WINDOW_LABEL,
  windowStartDate,
  withWindowLabel,
} from '../src/services/timeWindow';
import { fullAndModuleTrainings } from './fixtures/demoData';

/**
 * 验收缺陷 #4/#5/#6/#7 的口径统一回归：
 * - 掌握度只有一套加权公式；
 * - 时间窗口只有一套 TimeWindow，标题自动带窗口；
 * - 增长曲线 / 雷达 / 模块统计 / 时间分配使用统一的去重集合。
 */
describe('口径统一 · 掌握度 / 目标 / 时间窗口', () => {
  it('掌握度统一为 0.7×陌生题正确率 + 0.3×整体正确率', () => {
    expect(computeMasteryScore(0.8, 0.6)).toBe(66);
    expect(computeMasteryScore(0.8, null)).toBe(80);
  });

  it('时间窗口默认近 30 天，标题自动带窗口', () => {
    expect(DEFAULT_TIME_WINDOW).toBe('30d');
    expect(windowStartDate('30d', '2026-11-09')).toBe('2026-10-10');
    expect(windowStartDate('all', '2026-11-09')).toBeNull();
    expect(withWindowLabel('模块正确率', '7d')).toBe('模块正确率（近 7 天）');
    expect(TIME_WINDOW_LABEL.all).toBe('全部时间');
    const records = [{ date: '2026-11-01' }, { date: '2026-09-01' }];
    expect(filterByWindow(records, '30d', '2026-11-09')).toHaveLength(1);
    expect(filterByWindow(records, 'all', '2026-11-09')).toHaveLength(2);
  });

  it('雷达目标线只读传入的 targetScore，不再写死 80', () => {
    const base = fullAndModuleTrainings[0];
    const slices = buildRadarSlices(fullAndModuleTrainings, [], base.gradeLevel, base.subject, 72);
    expect(slices.length).toBeGreaterThan(0);
    expect(slices.every((s) => s.targetScore === 72)).toBe(true);
    const noTarget = buildRadarSlices(fullAndModuleTrainings, [], base.gradeLevel, base.subject);
    expect(noTarget.every((s) => s.targetScore === undefined)).toBe(true);
  });

  it('增长曲线使用学科级去重，整卷与模块不重复计入', () => {
    const base = fullAndModuleTrainings[0];
    const records = [
      { ...base, id: 'e-full', examId: 'e-x', scope: 'full' as const, totalQuestions: 100, correctCount: 50, errorCount: 50 },
      { ...base, id: 'e-m1', examId: 'e-x', scope: 'module' as const, module: '资料分析', totalQuestions: 10, correctCount: 9, errorCount: 1 },
      { ...base, id: 'e-m2', examId: 'e-x', scope: 'module' as const, module: '判断推理', totalQuestions: 10, correctCount: 9, errorCount: 1 },
    ];
    const series = buildGrowthSeries(records, base.subject);
    expect(series).toHaveLength(1);
    expect(series[0].score).toBe(50);
  });

  it('模块统计与时间分配保留模块明细，仅有整卷时保留整卷', () => {
    const withModules = selectModuleLevelRecords(fullAndModuleTrainings);
    expect(withModules.map((r) => r.scope).sort()).toEqual(['module', 'module']);
    expect(buildModuleStats(fullAndModuleTrainings)).toHaveLength(2);
    expect(buildTimeAllocation(fullAndModuleTrainings)).toHaveLength(2);

    const fullOnly = fullAndModuleTrainings.filter((t) => t.scope === 'full');
    expect(selectModuleLevelRecords(fullOnly)).toHaveLength(1);
    expect(buildTimeAllocation(fullOnly)[0].module).toBe('整卷');

    // 学科级去重仍保持「有整卷行以整卷为准」
    expect(selectAggregationRecords(fullAndModuleTrainings)).toHaveLength(1);
  });
});
