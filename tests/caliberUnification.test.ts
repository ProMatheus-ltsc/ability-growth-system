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

  it('雷达按归一化路径去重：同一能力只取最近快照，不因写法不同被平均', () => {
    const ability = {
      id: 'ab-1',
      subject: 'xingce' as const,
      gradeLevel: 'adult' as const,
      score: 80,
      level: 'proficient' as const,
      confidence: 1,
      source: 'manual' as const,
      createdAt: '2026-11-01T00:00:00Z',
    };
    const slices = buildRadarSlices(
      [],
      [
        { ...ability, abilityPath: 'xingce/言语理解', evaluationTime: '2026-11-01T00:00:00Z' },
        { ...ability, id: 'ab-2', abilityPath: 'xingce/言语理解与表达', score: 60, evaluationTime: '2026-11-10T00:00:00Z' },
      ],
      'adult',
      'xingce',
    );
    expect(slices.find((s) => s.key === 'language')?.score).toBe(60);
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

/**
 * 2026-11-09 双算修复：duplicate / derived / full_paper 三级过滤。
 * - duplicate（重复导入）与 derived（跨日期聚合）不进入任何聚合；
 * - 压制只在同一个 examId 内发生：同 examId 的 full_paper 与 module_detail 二选一；
 * - 不同 examId、没有 examId 的记录一律不压制，各自独立计入；
 * - 历史记录缺 aggregationRole 时按 scope 兼容映射，两者都缺失按独立记录保留。
 */
describe('双算过滤 · duplicate / derived / full_paper（仅同 examId 压制）', () => {
  const base = fullAndModuleTrainings[0];

  it('duplicate 行不参与学科级与模块级聚合', () => {
    const records = [
      { ...base, id: 'dup-1', validity: 'duplicate' as const, totalQuestions: 79, errorCount: 10 },
      { ...base, id: 'real-1', totalQuestions: 20, errorCount: 4 },
    ];
    const subjectLevel = selectAggregationRecords(records);
    const moduleLevel = selectModuleLevelRecords(records);
    expect(subjectLevel.map((r) => r.id)).toEqual(['real-1']);
    expect(moduleLevel.map((r) => r.id)).toEqual(['real-1']);
    expect(buildTimeAllocation(records).reduce((s, g) => s + g.totalMinutes, 0)).toBe(
      (base.durationMinutes ?? 0) === 0 ? 0 : base.durationMinutes,
    );
  });

  it('derived 聚合行不参与聚合与增长曲线（1,813 题的聚合行不能与原始行双算）', () => {
    const records = [
      { ...base, id: 'derived-1', aggregationRole: 'derived' as const, totalQuestions: 1813, correctCount: 0, errorCount: 1813 },
      { ...base, id: 'real-1', totalQuestions: 100, correctCount: 50, errorCount: 50 },
    ];
    expect(selectAggregationRecords(records)).toHaveLength(1);
    expect(selectModuleLevelRecords(records)).toHaveLength(1);
    const series = buildGrowthSeries(records, base.subject);
    expect(series).toHaveLength(1);
    expect(series[0].score).toBe(50);
  });

  it('同一 examId 内整卷压制模块（学科级），模块级则反选模块明细', () => {
    const records = [
      { ...base, id: 'full-1', examId: 'paper-1', aggregationRole: 'full_paper' as const, totalQuestions: 100, correctCount: 50, errorCount: 50 },
      { ...base, id: 'm-1', examId: 'paper-1', aggregationRole: 'module_detail' as const, totalQuestions: 20, correctCount: 18, errorCount: 2 },
    ];
    expect(selectAggregationRecords(records).map((r) => r.id)).toEqual(['full-1']);
    expect(selectModuleLevelRecords(records).map((r) => r.id)).toEqual(['m-1']);
  });

  it('同一天两个不同 examId（一个整卷一个模块）各自独立计入', () => {
    const records = [
      { ...base, id: 'full-a', examId: 'paper-a', aggregationRole: 'full_paper' as const, totalQuestions: 100, correctCount: 50, errorCount: 50 },
      { ...base, id: 'mod-b', examId: 'paper-b', aggregationRole: 'module_detail' as const, module: '资料分析', totalQuestions: 20, correctCount: 18, errorCount: 2 },
    ];
    expect(selectAggregationRecords(records).map((r) => r.id)).toEqual(['full-a', 'mod-b']);
    expect(selectModuleLevelRecords(records).map((r) => r.id)).toEqual(['full-a', 'mod-b']);
  });

  it('没有 examId 的整卷与模块不做任何压制（同日专项 + 整卷是两笔训练）', () => {
    const records = [
      { ...base, id: 'full-1', examId: undefined, aggregationRole: 'full_paper' as const, totalQuestions: 100, correctCount: 50, errorCount: 50 },
      { ...base, id: 'm-1', examId: undefined, aggregationRole: 'module_detail' as const, module: '资料分析', totalQuestions: 20, correctCount: 18, errorCount: 2 },
    ];
    expect(selectAggregationRecords(records).map((r) => r.id)).toEqual(['full-1', 'm-1']);
    expect(selectModuleLevelRecords(records).map((r) => r.id)).toEqual(['full-1', 'm-1']);
  });

  it('缺 aggregationRole 时按 scope 映射角色：无 examId 不压制，有 examId 才压制', () => {
    const legacyNoExam = [
      { ...base, id: 'legacy-full', examId: undefined, scope: 'full' as const, totalQuestions: 100, errorCount: 50 },
      { ...base, id: 'legacy-module', examId: undefined, scope: 'module' as const, module: '资料分析', totalQuestions: 20, errorCount: 2 },
      { ...base, id: 'standalone', examId: undefined, scope: 'single' as const, module: '言语理解', totalQuestions: 10, errorCount: 1 },
    ];
    expect(selectAggregationRecords(legacyNoExam)).toHaveLength(3);
    expect(selectModuleLevelRecords(legacyNoExam)).toHaveLength(3);

    const legacyWithExam = [
      { ...base, id: 'legacy-full', examId: 'paper-1', scope: 'full' as const, totalQuestions: 100, errorCount: 50 },
      { ...base, id: 'legacy-module', examId: 'paper-1', scope: 'module' as const, module: '资料分析', totalQuestions: 20, errorCount: 2 },
    ];
    expect(selectAggregationRecords(legacyWithExam).map((r) => r.id)).toEqual(['legacy-full']);
    expect(selectModuleLevelRecords(legacyWithExam).map((r) => r.id)).toEqual(['legacy-module']);
  });
});
