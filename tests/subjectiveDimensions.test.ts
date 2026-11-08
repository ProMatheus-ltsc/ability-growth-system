import { describe, expect, it } from 'vitest';
import { buildSubjectiveDimensions } from '../src/services/analytics';
import {
  subjectiveAnswers,
  subjectiveWithoutDimensions,
} from './fixtures/demoData';

describe('F-07 申论四维汇总（演示数据）', () => {
  it('部分为空时按已填值求平均', () => {
    const summary = buildSubjectiveDimensions(subjectiveAnswers);
    expect(summary.samples).toBe(2);
    expect(summary.avg.points).toBe(85); // (80 + 90) / 2
    expect(summary.avg.structure).toBe(70);
    expect(summary.avg.language).toBe(60);
    expect(summary.avg.logic).toBe(50);
  });

  it('最弱维度为均值最低的维度', () => {
    const summary = buildSubjectiveDimensions(subjectiveAnswers);
    expect(summary.weakest).toBe('logic');
  });

  it('无四维数据的记录不参与统计', () => {
    const summary = buildSubjectiveDimensions(subjectiveWithoutDimensions);
    expect(summary.samples).toBe(0);
    expect(summary.weakest).toBeNull();
    expect(summary.avg.points).toBeNull();
  });

  it('空列表返回零样本', () => {
    const summary = buildSubjectiveDimensions([]);
    expect(summary.samples).toBe(0);
    expect(summary.weakest).toBeNull();
  });
});
