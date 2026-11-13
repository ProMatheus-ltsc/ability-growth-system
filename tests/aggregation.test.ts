import { describe, expect, it } from 'vitest';
import {
  aggregateBySubject,
  resolveExamModuleBreakdown,
  selectAggregationRecords,
  selectModuleLevelRecords,
} from '../src/services/analytics';
import type { ExamModuleProjection } from '../src/services/analytics';
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

/**
 * 验收缺陷 P1-1：修复任务生成必须与页面展示同源。
 * 页面先按模块行投影、再回退快照；生成任务如果直接读 `exam.moduleBreakdown`，
 * 会在模块行已修正后仍按旧快照生成任务。
 */
describe('测验诊断投影：模块行优先，快照兜底', () => {
  const examId = 'exam-fenbi-exam-42';
  const base = fullAndModuleTrainings[0];
  const stored: ExamModuleProjection[] = [
    { module: '过期快照', total: 10, errors: 9, score: 10, level: 'unmastered' },
  ];

  it('有模块行时用模块行覆盖已存快照', () => {
    const records = [
      { ...base, id: 'fenbi-exam-42', examId: 'fenbi-exam-42', aggregationRole: 'full_paper' as const, totalQuestions: 100, errorCount: 40 },
      { ...base, id: 'fenbi-md-42-mod-资料分析', module: '资料分析', examId: '42', aggregationRole: 'module_detail' as const, totalQuestions: 20, errorCount: 4 },
    ];
    expect(resolveExamModuleBreakdown(records, examId, stored)).toEqual([
      { module: '资料分析', total: 20, errors: 4, score: 80, level: 'proficient' },
    ]);
  });

  it('没有模块行时回退已存快照', () => {
    expect(resolveExamModuleBreakdown([], examId, stored)).toEqual(stored);
  });

  it('既无模块行也无快照时返回空数组，页面可直接渲染', () => {
    expect(resolveExamModuleBreakdown([], examId)).toEqual([]);
    expect(resolveExamModuleBreakdown([], examId, undefined)).toEqual([]);
  });
});
