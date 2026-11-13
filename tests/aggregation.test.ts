import { describe, expect, it } from 'vitest';
import { aggregateBySubject, selectAggregationRecords, selectModuleLevelRecords } from '../src/services/analytics';
import type { TrainingRecord } from '../src/domain/types';
import {
  fullAndModuleTrainings,
  legacyTrainings,
  moduleOnlyTrainings,
} from './fixtures/demoData';

describe('A1 整卷与模块去重聚合（演示数据）', () => {
  it('老记录（无 examId）原样保留', () => {
    expect(selectAggregationRecords(legacyTrainings)).toHaveLength(2);
  });

  it('同 examId 有整卷行时排除模块行，只保留整卷', () => {
    const selected = selectAggregationRecords(fullAndModuleTrainings);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('exam1-full');

    const stats = aggregateBySubject(fullAndModuleTrainings);
    expect(stats).toHaveLength(1);
    expect(stats[0].totalQuestions).toBe(30);
    expect(stats[0].totalErrors).toBe(12);
    // 不重复：不是 30+15+15
    expect(stats[0].totalQuestions).not.toBe(60);
  });

  it('同 examId 仅模块行时保留全部模块并累加', () => {
    const selected = selectAggregationRecords(moduleOnlyTrainings);
    expect(selected).toHaveLength(2);

    const stats = aggregateBySubject(moduleOnlyTrainings);
    expect(stats[0].totalQuestions).toBe(20);
    expect(stats[0].totalErrors).toBe(7);
  });

  it('scope=full 但无 examId 时按无 examId 处理（保留）', () => {
    const noExamFull: TrainingRecord = {
      ...legacyTrainings[0],
      id: 'full-no-exam',
      examId: undefined,
      scope: 'full',
    };
    const moduleNoExam: TrainingRecord = {
      ...legacyTrainings[1],
      id: 'module-no-exam',
      examId: undefined,
      scope: 'module',
    };
    expect(selectAggregationRecords([noExamFull, moduleNoExam])).toHaveLength(2);
  });
});

/**
 * 2026-11-13 线上双算修复：
 * - 粉笔标签拆分行（`-pt-`）是父模块行的再切分，必须按衍生行排除；
 * - 整卷 examId 带 `fenbi-exam-` 前缀、模块行只有数字 paperId，比较前要归一化。
 */
describe('标签拆分行与 examId 命名空间', () => {
  const base = fullAndModuleTrainings[0];

  it('标签拆分行不参与学科级与模块级聚合，父模块行保留', () => {
    const records = [
      { ...base, id: 'fenbi-md-42-mod-资料分析', examId: '42', aggregationRole: 'module_detail' as const, totalQuestions: 20, errorCount: 4 },
      { ...base, id: 'fenbi-md-42-pt-资料分析', examId: '42', aggregationRole: 'module_detail' as const, totalQuestions: 20, errorCount: 4 },
      { ...base, id: 'fenbi-md-42-pt-资料分析-增长率', examId: '42', aggregationRole: 'module_detail' as const, totalQuestions: 12, errorCount: 3 },
    ];
    expect(selectAggregationRecords(records).map((r) => r.id)).toEqual(['fenbi-md-42-mod-资料分析']);
    expect(selectModuleLevelRecords(records).map((r) => r.id)).toEqual(['fenbi-md-42-mod-资料分析']);
  });

  it('整卷 examId 带 fenbi-exam- 前缀时仍能与模块行配对', () => {
    const records = [
      { ...base, id: 'fenbi-exam-42', examId: 'fenbi-exam-42', aggregationRole: 'full_paper' as const, totalQuestions: 100, errorCount: 40 },
      { ...base, id: 'fenbi-md-42-mod-资料分析', examId: '42', aggregationRole: 'module_detail' as const, totalQuestions: 20, errorCount: 4 },
    ];
    expect(selectAggregationRecords(records).map((r) => r.id)).toEqual(['fenbi-exam-42']);
    expect(selectModuleLevelRecords(records).map((r) => r.id)).toEqual(['fenbi-md-42-mod-资料分析']);
  });
});
