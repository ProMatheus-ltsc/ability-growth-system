import { describe, expect, it } from 'vitest';
import { aggregateBySubject, selectAggregationRecords } from '../src/services/analytics';
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
