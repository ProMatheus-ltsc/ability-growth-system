import { describe, expect, it } from 'vitest';
import {
  buildGrowthSeries,
  buildInterviewGrowthSeries,
  buildSubjectiveGrowthSeries,
  subjectiveAnswerScore,
} from '../src/services/analytics';
import type { InterviewRecord, SubjectiveAnswer, TrainingRecord } from '../src/domain/types';

/**
 * 申论 / 面试的分数曲线。
 *
 * 这两个学科按设计**不写 trainings**（`TRAINING_EXCLUDED_SUBJECTS`），
 * 所以「历史分数曲线 · 申论」此前一直空着——不是没数据，是取错了表。
 * 本文件锁住两件事：① 曲线数据源是作答记录；② 口径与掌握度一致（四维优先、套卷得分率兜底）。
 */

const answer = (patch: Partial<SubjectiveAnswer>): SubjectiveAnswer => ({
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

const interview = (patch: Partial<InterviewRecord>): InterviewRecord => ({
  id: patch.id ?? 'i1',
  date: '2026-11-09',
  questionType: '综合分析',
  thinkingSec: 30,
  answerSec: 180,
  selfScore: { content: 4, structure: 4, expression: 4, fluency: 4 },
  problemTags: [],
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
  ...patch,
});

describe('申论单条得分口径', () => {
  it('有四维 → 取有分维度的均值', () => {
    expect(subjectiveAnswerScore(answer({ dimensionScores: { points: 80, structure: 60 } }))).toBe(70);
  });

  it('无四维但有卷面分 → 套卷得分率', () => {
    expect(subjectiveAnswerScore(answer({ mode: 'paper', paperScore: 45, paperFullMark: 60 }))).toBe(75);
  });

  it('四维与卷面分同时存在时以四维为准', () => {
    expect(
      subjectiveAnswerScore(answer({ mode: 'paper', paperScore: 10, paperFullMark: 100, dimensionScores: { points: 90 } })),
    ).toBe(90);
  });

  it('两处都没有评分 → null（未知不当 0）', () => {
    expect(subjectiveAnswerScore(answer({}))).toBeNull();
    expect(subjectiveAnswerScore(answer({ mode: 'paper', paperScore: 10 }))).toBeNull();
  });
});

describe('申论得分曲线（作答记录）', () => {
  it('同周多条取均值，按周升序', () => {
    const series = buildSubjectiveGrowthSeries([
      answer({ id: 'a', date: '2026-11-02', dimensionScores: { points: 60, structure: 60, language: 60, logic: 60 } }),
      answer({ id: 'b', date: '2026-11-04', dimensionScores: { points: 80, structure: 80, language: 80, logic: 80 } }),
      answer({ id: 'c', date: '2026-10-26', dimensionScores: { points: 50 } }),
    ]);
    expect(series).toHaveLength(2);
    expect(series[0].score).toBe(50);
    expect(series[1].score).toBe(70); // (60 + 80) / 2
    expect(series[1].samples).toBe(2);
  });

  it('没有任何评分的作答不出点，不会把曲线拉成 0 分', () => {
    const series = buildSubjectiveGrowthSeries([
      answer({ id: 'a', date: '2026-11-02' }),
      answer({ id: 'b', date: '2026-11-03', dimensionScores: { points: 90 } }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].score).toBe(90);
    expect(series[0].samples).toBe(1);
  });

  it('同一道题的多版本只取最新一版，不按改稿次数重复计入', () => {
    const key = 'shenlun|2023 国考副省级|1';
    const series = buildSubjectiveGrowthSeries([
      answer({
        id: 'old',
        questionKey: key,
        version: 1,
        date: '2026-11-02',
        answeredAt: '2026-11-02T10:00:00.000Z',
        dimensionScores: { points: 50 },
      }),
      answer({
        id: 'new',
        questionKey: key,
        version: 2,
        date: '2026-11-03',
        answeredAt: '2026-11-09T10:00:00.000Z',
        dimensionScores: { points: 85 },
      }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].score).toBe(85);
    expect(series[0].samples).toBe(1);
  });

  it('回归：申论不进训练表，训练曲线该学科恒为空（这正是原空白卡片的成因）', () => {
    const trainings: TrainingRecord[] = [
      {
        id: 't1',
        subject: 'xingce',
        gradeLevel: 'adult',
        date: '2026-11-09',
        module: '言语理解',
        trainingType: 'topic',
        totalQuestions: 20,
        correctCount: 16,
        errorCount: 4,
        durationMinutes: 30,
        errorCategories: [],
        isUnfamiliar: false,
        createdAt: '2026-11-09T00:00:00.000Z',
        updatedAt: '2026-11-09T00:00:00.000Z',
      } as TrainingRecord,
    ];
    expect(buildGrowthSeries(trainings, 'shenlun')).toEqual([]);
    expect(buildGrowthSeries(trainings, 'xingce')).toHaveLength(1);
    // 同一批数据换成作答记录后，申论曲线才有数据
    expect(buildSubjectiveGrowthSeries([answer({ dimensionScores: { points: 70 } })])).toHaveLength(1);
  });
});

describe('面试综合得分曲线', () => {
  it('四维取平均后按 5 分制折算百分比', () => {
    const series = buildInterviewGrowthSeries([interview({ selfScore: { content: 4, structure: 4, expression: 4, fluency: 4 } })]);
    expect(series).toHaveLength(1);
    expect(series[0].score).toBe(80);
  });

  it('他评与自评都有时取平均', () => {
    const series = buildInterviewGrowthSeries([
      interview({
        selfScore: { content: 3, structure: 3, expression: 3, fluency: 3 },
        teacherScore: { content: 5, structure: 5, expression: 5, fluency: 5 },
      }),
    ]);
    expect(series[0].score).toBe(80); // (3 + 5) / 2 = 4 → 4/5 = 80%
  });

  it('完全没评分时不出点', () => {
    const series = buildInterviewGrowthSeries([
      interview({ selfScore: { content: 0, structure: 0, expression: 0, fluency: 0 } }),
    ]);
    expect(series).toEqual([]);
  });

  it('同一题的多版本只取最新', () => {
    const series = buildInterviewGrowthSeries([
      interview({
        id: 'old',
        questionKey: 'mianshi|k1',
        version: 1,
        date: '2026-11-02',
        answeredAt: '2026-11-02T10:00:00.000Z',
        selfScore: { content: 2, structure: 2, expression: 2, fluency: 2 },
      }),
      interview({
        id: 'new',
        questionKey: 'mianshi|k1',
        version: 2,
        date: '2026-11-03',
        answeredAt: '2026-11-10T10:00:00.000Z',
        selfScore: { content: 5, structure: 5, expression: 5, fluency: 5 },
      }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].score).toBe(100);
  });
});
