import { describe, expect, it } from 'vitest';
import {
  buildInterviewDimensionRadar,
  buildSubjectiveDimensionRadar,
  buildSubjectiveDimensions,
  interviewScorePercent,
} from '../src/services/analytics';
import type { InterviewRecord, SubjectiveAnswer } from '../src/domain/types';

/**
 * 能力中心的四维评分雷达。
 *
 * 用四维而不是题型当轴，核心约束是**与「四维评分汇总」卡同源**：
 * 同一批作答在两处必须给出同一组数字，否则用户会以为其中一处算错了。
 * 第二个约束是**缺失维度不补 0** —— 补 0 会在雷达上画出「这一维很弱」的假象。
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

describe('申论四维雷达', () => {
  it('轴是按「要点/结构/语言/逻辑」固定顺序，值与四维汇总卡完全一致', () => {
    const records = [
      answer({ id: 'a', dimensionScores: { points: 80, structure: 70, language: 60, logic: 90 } }),
      answer({ id: 'b', dimensionScores: { points: 70, structure: 75 } }),
    ];
    const summary = buildSubjectiveDimensions(records);
    const radar = buildSubjectiveDimensionRadar(records);

    expect(radar.slices.map((s) => s.label)).toEqual(['要点', '结构', '语言', '逻辑']);
    expect(radar.samples).toBe(2);
    // 逐轴对齐汇总卡：语言 60 只有一条，其余是两条均值
    expect(radar.slices.map((s) => s.score)).toEqual([
      summary.avg.points,
      summary.avg.structure,
      summary.avg.language,
      summary.avg.logic,
    ]);
    expect(radar.slices.find((s) => s.key === 'points')?.score).toBe(75);
    expect(radar.slices.find((s) => s.key === 'language')?.score).toBe(60);
  });

  it('缺失维度不画轴，也不补 0', () => {
    const radar = buildSubjectiveDimensionRadar([answer({ dimensionScores: { points: 80, logic: 60 } })]);
    expect(radar.slices.map((s) => s.key)).toEqual(['points', 'logic']);
    expect(radar.slices.map((s) => s.score)).toEqual([80, 60]);
  });

  it('一条四维评分都没有 → 空切片，样本 0（空态要能说清「没填评分」）', () => {
    const radar = buildSubjectiveDimensionRadar([
      answer({ id: 'a', mode: 'paper', paperScore: 45, paperFullMark: 60 }),
      answer({ id: 'b' }),
    ]);
    expect(radar.slices).toEqual([]);
    expect(radar.samples).toBe(0);
  });

  it('0 分是有效值，不能被当成缺失', () => {
    const radar = buildSubjectiveDimensionRadar([answer({ dimensionScores: { points: 0, structure: 50 } })]);
    expect(radar.slices.map((s) => s.score)).toEqual([0, 50]);
  });
});

describe('面试四维雷达', () => {
  it('自评/他评都在时取平均，再按 5 分制折算百分比', () => {
    const radar = buildInterviewDimensionRadar([
      interview({
        id: 'a',
        selfScore: { content: 4, structure: 3, expression: 4, fluency: 5 },
        teacherScore: { content: 2, structure: 3, expression: 2, fluency: 3 },
      }),
    ]);
    // content (4+2)/2=3 → 60；structure 3 → 60；expression 3 → 60；fluency 4 → 80
    expect(radar.slices.map((s) => s.label)).toEqual(['内容', '结构', '表达', '流畅']);
    expect(radar.slices.map((s) => s.score)).toEqual([60, 60, 60, 80]);
    expect(radar.samples).toBe(1);
  });

  it('综合得分仍是四维平均（雷达只是不把四维压成一个数）', () => {
    const record = interview({ selfScore: { content: 4, structure: 3, expression: 4, fluency: 5 } });
    const radar = buildInterviewDimensionRadar([record]);
    const mean = radar.slices.reduce((s, x) => s + x.score, 0) / radar.slices.length;
    expect(mean).toBeCloseTo(interviewScorePercent(record) as number, 1);
  });

  it('只有自评时用自评；0 分（未打分）不算有效评分', () => {
    const radar = buildInterviewDimensionRadar([
      interview({ id: 'a', selfScore: { content: 4, structure: 0, expression: 3, fluency: 0 } }),
      interview({ id: 'b', selfScore: { content: 2, structure: 5, expression: 3, fluency: 0 } }),
    ]);
    const byKey = new Map(radar.slices.map((s) => [s.key, s.score]));
    expect(byKey.get('content')).toBe(60); // (80 + 40) / 2
    expect(byKey.get('structure')).toBe(100); // 只有 b 的 5 分
    expect(byKey.get('expression')).toBe(60);
    expect(byKey.get('fluency')).toBeUndefined(); // 全是 0 → 不画轴
    expect(radar.samples).toBe(2);
  });

  it('没有任何评分 → 空切片', () => {
    const radar = buildInterviewDimensionRadar([
      interview({ selfScore: { content: 0, structure: 0, expression: 0, fluency: 0 } }),
    ]);
    expect(radar.slices).toEqual([]);
    expect(radar.samples).toBe(0);
  });
});
