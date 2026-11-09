import { describe, expect, it } from 'vitest';
import {
  inspectTrainingRecord,
  isStandardMinutesInferred,
  normalizePaperType,
  normalizePaperYear,
  normalizePositiveNumber,
  normalizeQuestionType,
  normalizeTrainingScope,
} from '../src/domain/paperStructure';
import { PAPER_TYPE_LABEL } from '../src/domain/types';

/**
 * 数据契约层回归：归一化、缺失处理、推断标记兼容路径、契约检查。
 * 说明：真实取值分布由 `npm run check:contract <export.json>` 在数据导出上跑，不在单测里伪造数据分布。
 */
describe('数据契约 · 卷面字段归一化', () => {
  it('卷型：规范值原样、同义写法归一、无法识别归 unknown、空值不写键', () => {
    expect(normalizePaperType('national')).toBe('national');
    expect(normalizePaperType('省考')).toBe('provincial');
    expect(normalizePaperType(' Public_Inst ')).toBe('public-institution');
    expect(normalizePaperType('军转干')).toBe('military-transfer');
    expect(normalizePaperType('某某联考卷')).toBe('unknown');
    expect(normalizePaperType('')).toBeUndefined();
    expect(normalizePaperType(undefined)).toBeUndefined();
    // unknown 在标签表里有对应文案，不会渲染成空白
    expect(PAPER_TYPE_LABEL.unknown).toBe('未标注');
  });

  it('年份只接受 1900-2100 的整数，其余视为缺失而不做截断', () => {
    expect(normalizePaperYear(2025)).toBe(2025);
    expect(normalizePaperYear(2025.5)).toBeUndefined();
    expect(normalizePaperYear(1899)).toBeUndefined();
    expect(normalizePaperYear('2025' as unknown)).toBeUndefined();
  });

  it('粒度：显式值优先；有 examId 缺 scope 按 module；两者皆无则保持未标注', () => {
    expect(normalizeTrainingScope('full')).toBe('full');
    expect(normalizeTrainingScope('整卷')).toBe('full');
    expect(normalizeTrainingScope(undefined, 'exam-1')).toBe('module');
    expect(normalizeTrainingScope(undefined, undefined)).toBeUndefined();
  });

  it('满分/标准用时必须 > 0，题型为空不写键', () => {
    expect(normalizePositiveNumber(100)).toBe(100);
    expect(normalizePositiveNumber(0)).toBeUndefined();
    expect(normalizePositiveNumber(-5)).toBeUndefined();
    expect(normalizeQuestionType('  数量关系  ')).toBe('数量关系');
    expect(normalizeQuestionType('   ')).toBeUndefined();
  });
});

describe('数据契约 · 推断标记兼容路径', () => {
  it('结构化标记优先于 note 文本', () => {
    expect(isStandardMinutesInferred({ standardMinutesInferred: true })).toBe(true);
    expect(isStandardMinutesInferred({ standardMinutesInferred: false, note: 'standardMinutes 按考纲推断' })).toBe(false);
  });

  it('历史记录缺结构化标记时回退 note 文本判定', () => {
    expect(isStandardMinutesInferred({ note: 'standardMinutes 按考纲推断' })).toBe(true);
    expect(isStandardMinutesInferred({ note: '正常记录' })).toBe(false);
    expect(isStandardMinutesInferred({})).toBe(false);
  });
});

describe('数据契约 · 记录检查只诊断不改写', () => {
  const base = {
    id: 't1',
    date: '2026-11-07',
    subject: 'math',
    module: '资料分析/计算',
    totalQuestions: 20,
    correctCount: 15,
    errorCount: 5,
  };

  it('合规记录无问题', () => {
    expect(
      inspectTrainingRecord({
        ...base,
        paperType: 'provincial',
        paperYear: 2025,
        fullMark: 100,
        score: 72,
        standardMinutes: 120,
        questionType: '数量关系',
        examId: 'exam-1',
        scope: 'module',
      }),
    ).toEqual([]);
  });

  it('缺失可选字段不报错（老记录兼容）', () => {
    expect(inspectTrainingRecord(base)).toEqual([]);
  });

  it('报出越界/无法识别/关联键为空的字段，并给出建议值', () => {
    const issues = inspectTrainingRecord({
      ...base,
      paperType: '未知卷型',
      paperYear: 2101,
      fullMark: 100,
      score: 120,
      standardMinutes: -1,
      examId: '   ',
      standardMinutesInferred: 'yes',
    });
    const fields = issues.map((i) => i.field);
    expect(fields).toContain('paperType');
    expect(fields).toContain('paperYear');
    expect(fields).toContain('score'); // 120 > 满分 100
    expect(inspectTrainingRecord({ ...base, fullMark: 0 }).map((i) => i.field)).toContain('fullMark');
    expect(fields).toContain('standardMinutes');
    expect(fields).toContain('examId');
    expect(fields).toContain('standardMinutesInferred');
    expect(issues.find((i) => i.field === 'paperType')?.suggestion).toContain('unknown');
  });

  it('必填计数缺失时报错', () => {
    const issues = inspectTrainingRecord({ id: 'x', date: '2026-11-07', subject: 'math', module: '资料分析' });
    expect(issues.map((i) => i.field)).toEqual(expect.arrayContaining(['totalQuestions', 'correctCount', 'errorCount']));
  });
});
