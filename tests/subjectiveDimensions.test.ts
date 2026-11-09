import { describe, expect, it } from 'vitest';
import {
  buildSubjectiveComposition,
  buildSubjectiveDimensions,
  buildSubjectiveMastery,
} from '../src/services/analytics';
import {
  subjectiveAnswers,
  subjectiveWithoutDimensions,
} from './fixtures/demoData';
import type { SubjectiveAnswer } from '../src/domain/types';

const baseAnswer = (patch: Partial<SubjectiveAnswer>): SubjectiveAnswer => ({
  id: patch.id ?? 'a1',
  subject: 'shenlun',
  scenario: '归纳概括',
  date: '2026-11-09',
  version: 1,
  content: '作答内容',
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
  ...patch,
});

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

  it('维度对象为空时不抬高样本数', () => {
    const emptyDimensions = subjectiveAnswers.map((r, i) =>
      i === 0 ? { ...r, dimensionScores: {} } : r,
    );
    const summary = buildSubjectiveDimensions(emptyDimensions);
    expect(summary.samples).toBe(1);
  });
});

describe('申论单题 / 套卷构成与掌握度口径', () => {
  const single = baseAnswer({ id: 's1', dimensionScores: { points: 80 }, durationMinutes: 20 });
  const paper = baseAnswer({
    id: 'p1',
    mode: 'paper',
    paperTitle: '2023 国考副省级',
    paperQuestionCount: 5,
    paperFullMark: 100,
    paperScore: 60,
  });
  const legacy = baseAnswer({ id: 'legacy' }); // 老记录无 mode 字段

  it('老记录缺省按单题计数，套卷按份计数', () => {
    const composition = buildSubjectiveComposition([single, paper, legacy]);
    expect(composition.singleCount).toBe(2);
    expect(composition.paperCount).toBe(1);
    expect(composition.singleRated).toBe(1);
    expect(composition.paperWithScore).toBe(1);
  });

  it('套卷同时有四维与得分时，掌握度以四维为准', () => {
    const ratedPaper = baseAnswer({
      id: 'p2',
      mode: 'paper',
      paperFullMark: 100,
      paperScore: 40,
      dimensionScores: { points: 90, structure: 80, language: 70, logic: 60 },
    });
    const mastery = buildSubjectiveMastery([ratedPaper], []);
    expect(mastery.source).toBe('rating');
    expect(mastery.score).toBe(75); // (90+80+70+60)/4
    expect(mastery.paperCount).toBe(1);
  });

  it('完全没有四维时，套卷用得分率兜底', () => {
    const paperOnly = baseAnswer({ id: 'p3', mode: 'paper', paperFullMark: 150, paperScore: 90 });
    const mastery = buildSubjectiveMastery([paperOnly], []);
    expect(mastery.source).toBe('paperScore');
    expect(mastery.score).toBe(60);
    expect(mastery.ratedCount).toBe(1);
  });

  it('既无四维也无得分且无训练记录时返回空样本', () => {
    const mastery = buildSubjectiveMastery([baseAnswer({ id: 'p4', mode: 'paper', paperTitle: '未评分套卷' })], []);
    expect(mastery.source).toBe('none');
    expect(mastery.score).toBeNull();
    expect(mastery.paperCount).toBe(1);
  });
});
