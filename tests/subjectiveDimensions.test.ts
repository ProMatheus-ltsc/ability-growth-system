import { describe, expect, it } from 'vitest';
import {
  buildSubjectiveByType,
  buildSubjectiveComposition,
  buildSubjectiveDimensions,
  buildSubjectiveMastery,
  buildSubjectiveQuestionHistory,
} from '../src/services/analytics';
import {
  subjectiveAnswers,
  subjectiveWithoutDimensions,
} from './fixtures/demoData';
import type { SubjectiveAnswer } from '../src/domain/types';
import { makeQuestionKey } from '../src/domain/subjectiveQuestion';

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

describe('申论题型 key、自动版本链与按题型聚合', () => {
  it('questionKey 由学科 + 来源 + 年份 + 题号构成，缺来源或题号返回 null', () => {
    expect(makeQuestionKey({ subject: 'shenlun', paperSource: '2023 国考副省级', paperYear: '2023', questionNo: '1' })).toBe(
      'shenlun|2023 国考副省级|2023|1',
    );
    expect(makeQuestionKey({ subject: 'shenlun', paperSource: ' ', questionNo: '1' })).toBeNull();
    expect(makeQuestionKey({ subject: 'shenlun', paperSource: '某卷' })).toBeNull();
  });

  it('同一 key 的两次作答按 answeredAt 自动排成版本，老记录不进入链路', () => {
    const key = makeQuestionKey({ subject: 'shenlun', paperSource: '2023 国考副省级', questionNo: '1' })!;
    const first = baseAnswer({ id: 'a1', questionKey: key, questionType: '归纳概括', answeredAt: '2026-11-01T10:00:00.000Z', dimensionScores: { points: 60 } });
    const second = baseAnswer({ id: 'a2', questionKey: key, questionType: '归纳概括', answeredAt: '2026-11-08T10:00:00.000Z', dimensionScores: { points: 80 } });
    const legacy = baseAnswer({ id: 'old', answeredAt: '2026-10-01T10:00:00.000Z' });
    const history = buildSubjectiveQuestionHistory([second, legacy, first]);
    expect(history).toHaveLength(1);
    expect(history[0].attempts).toBe(2);
    expect(history[0].entries.map((e) => e.recordId)).toEqual(['a1', 'a2']);
  });

  it('套卷按题拆题型聚合，未分类不计入', () => {
    const paper = baseAnswer({
      id: 'p1',
      mode: 'paper',
      paperSource: '2023 国考副省级',
      paperYear: '2023',
      dimensionScores: { points: 70, structure: 70, language: 70, logic: 70 },
      paperQuestions: [
        { no: '1', questionType: '归纳概括', score: 12, fullMark: 20 },
        { no: '2', questionType: '综合分析', score: 8, fullMark: 20 },
        { no: '3' }, // 老套卷缺题型 → 未分类
      ],
    });
    const stats = buildSubjectiveByType([paper]);
    expect(stats.map((s) => s.questionType)).toEqual(['归纳概括', '综合分析']);
    expect(stats[0].attempts).toBe(1);
    expect(stats[0].avgScoreRate).toBe(60);
    expect(stats[0].paperQuestionCount).toBe(1);
    // 四维继承整卷
    expect(stats[0].avgDims.points).toBe(70);
  });
});
