import { describe, expect, it } from 'vitest';
import {
  aggregateBySubject,
  buildModuleStats,
  deriveExamModuleBreakdown,
  findExamTrainings,
  selectAggregationRecords,
  selectModuleLevelRecords,
} from '../src/services/analytics';
import {
  dedupeTrainingRecordsByIdempotencyKey,
  normalizeExamRef,
  resolveAttemptId,
  resolveTrainingKind,
  trainingIdempotencyKey,
  withTrainingSemantics,
} from '../src/domain/trainingSemantics';
import type { TrainingRecord } from '../src/domain/types';

const base: TrainingRecord = {
  id: 'base',
  date: '2026-11-01',
  gradeLevel: 'adult',
  subject: 'xingce',
  module: '资料分析',
  trainingType: 'topic',
  totalQuestions: 10,
  correctCount: 7,
  errorCount: 3,
  errorCategories: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('examRef 归一化', () => {
  it('把数字 paperId、fenbi-exam- 前缀统一成 exam-fenbi-exam- 形式', () => {
    expect(normalizeExamRef('4291593113')).toBe('exam-fenbi-exam-4291593113');
    expect(normalizeExamRef('fenbi-exam-4291593113')).toBe('exam-fenbi-exam-4291593113');
    expect(normalizeExamRef('exam-fenbi-exam-4291593113')).toBe('exam-fenbi-exam-4291593113');
    expect(normalizeExamRef('  4291593113  ')).toBe('exam-fenbi-exam-4291593113');
  });

  it('非 paperId 的值原样返回，不臆造引用', () => {
    expect(normalizeExamRef('fenbi-exam-2025-12-04-h4abcdc9b-0')).toBe(
      'fenbi-exam-2025-12-04-h4abcdc9b-0',
    );
    expect(normalizeExamRef('')).toBeUndefined();
    expect(normalizeExamRef(undefined)).toBeUndefined();
  });
});

describe('结构角色解析：新字段优先，老字段只做兼容降级', () => {
  it('显式 kind 覆盖任何历史标记', () => {
    expect(
      resolveTrainingKind({ ...base, kind: 'label', aggregationRole: 'full_paper' }),
    ).toBe('label');
  });

  it('跨日期聚合行是 summary，不参与求和', () => {
    expect(
      resolveTrainingKind({ ...base, id: 'fenbi-topic-1', aggregationRole: 'derived' }),
    ).toBe('summary');
  });

  it('标签行与模块行按结构角色识别', () => {
    expect(resolveTrainingKind({ ...base, id: 'fenbi-md-42-pt-资料分析-增长率' })).toBe('label');
    expect(resolveTrainingKind({ ...base, id: 'fenbi-md-42-mod-资料分析' })).toBe('module');
  });

  it('错题复盘是 review，即使写入方错标成 module_detail', () => {
    expect(
      resolveTrainingKind({
        ...base,
        id: 'train-2026-11-11-review',
        trainingType: 'review',
        aggregationRole: 'module_detail',
        scope: 'module',
      }),
    ).toBe('review');
    expect(
      resolveTrainingKind({ ...base, trainingType: 'wrong_review' as never }),
    ).toBe('review');
  });

  it('行测整卷里的专项智能练习是 practice，不是整卷', () => {
    const practice = {
      ...base,
      module: '行测整卷',
      trainingType: 'exam' as const,
      note: '粉笔同步｜专项智能练习（言语理解与表达）',
      aggregationRole: 'module_detail' as const,
    };
    expect(resolveTrainingKind(practice)).toBe('practice');
    expect(
      resolveTrainingKind({ ...practice, note: '粉笔同步｜举一反三强化练习', aggregationRole: 'full_paper' }),
    ).toBe('practice');
  });

  it('真正的整卷行是 exam', () => {
    expect(
      resolveTrainingKind({
        ...base,
        module: '行测整卷',
        trainingType: 'exam',
        note: '粉笔同步｜广东公务员录用考试《行测》',
        aggregationRole: 'full_paper',
      }),
    ).toBe('exam');
  });

  it('老记录缺 kind 时按 scope 降级，未知记录按 practice', () => {
    expect(resolveTrainingKind({ ...base, scope: 'full' })).toBe('exam');
    expect(resolveTrainingKind({ ...base, scope: 'module' })).toBe('module');
    expect(resolveTrainingKind(base)).toBe('practice');
  });
});

describe('作答树聚合键', () => {
  it('同一份粉笔卷的整卷、模块、标签共享 attemptId', () => {
    const full = { ...base, id: 'fenbi-exam-42', examId: 'fenbi-exam-42' };
    const mod = { ...base, id: 'fenbi-md-42-mod-资料分析', examId: '42' };
    const label = { ...base, id: 'fenbi-md-42-pt-资料分析-增长率', examId: '42' };
    expect(resolveAttemptId(full)).toBe('attempt:exam-fenbi-exam-42');
    expect(resolveAttemptId(mod)).toBe(resolveAttemptId(full));
    expect(resolveAttemptId(label)).toBe(resolveAttemptId(full));
  });

  it('无试卷引用的独立记录各自成组', () => {
    const a = { ...base, id: 'train-a' };
    const b = { ...base, id: 'train-b' };
    expect(resolveAttemptId(a)).not.toBe(resolveAttemptId(b));
  });
});

describe('学科聚合：按作答树选唯一可加层', () => {
  it('同一棵树有整卷时只计整卷，模块与标签不重复计入', () => {
    const records: TrainingRecord[] = [
      { ...base, id: 'fenbi-exam-42', examId: 'fenbi-exam-42', aggregationRole: 'full_paper', module: '行测整卷', trainingType: 'exam', totalQuestions: 100, errorCount: 40, correctCount: 60 },
      { ...base, id: 'fenbi-md-42-mod-资料分析', examId: '42', aggregationRole: 'module_detail', totalQuestions: 20, errorCount: 4 },
      { ...base, id: 'fenbi-md-42-pt-资料分析', examId: '42', aggregationRole: 'module_detail', totalQuestions: 20, errorCount: 4 },
    ];
    expect(selectAggregationRecords(records).map((r) => r.id)).toEqual(['fenbi-exam-42']);
    const stats = aggregateBySubject(records);
    expect(stats[0].totalQuestions).toBe(100);
  });

  it('同一棵树只有模块时按模块求和', () => {
    const records: TrainingRecord[] = [
      { ...base, id: 'fenbi-md-42-mod-资料分析', examId: '42', aggregationRole: 'module_detail', totalQuestions: 20, errorCount: 4 },
      { ...base, id: 'fenbi-md-42-mod-判断推理', examId: '42', aggregationRole: 'module_detail', module: '判断推理', totalQuestions: 30, errorCount: 6 },
    ];
    expect(selectAggregationRecords(records)).toHaveLength(2);
    expect(aggregateBySubject(records)[0].totalQuestions).toBe(50);
  });

  it('标签行永远不进入题量求和，即使标签和大干模块', () => {
    const records: TrainingRecord[] = [
      { ...base, id: 'fenbi-md-42-mod-资料分析', examId: '42', aggregationRole: 'module_detail', totalQuestions: 20, errorCount: 4 },
      { ...base, id: 'fenbi-md-42-pt-资料分析-增长率', examId: '42', aggregationRole: 'module_detail', totalQuestions: 30, errorCount: 6 },
      { ...base, id: 'fenbi-md-42-pt-资料分析-比重', examId: '42', aggregationRole: 'module_detail', totalQuestions: 40, errorCount: 8 },
    ];
    expect(selectAggregationRecords(records).map((r) => r.id)).toEqual(['fenbi-md-42-mod-资料分析']);
    expect(aggregateBySubject(records)[0].totalQuestions).toBe(20);
  });

  it('同一张卷的不同作答（不同 attemptId）互不压制', () => {
    const records: TrainingRecord[] = [
      { ...base, id: 'attempt-a-exam', attemptId: 'attempt:a', kind: 'exam', examRef: 'exam-fenbi-exam-42', totalQuestions: 100, errorCount: 40, correctCount: 60 },
      { ...base, id: 'attempt-b-mod', attemptId: 'attempt:b', kind: 'module', examRef: 'exam-fenbi-exam-42', totalQuestions: 30, errorCount: 9, correctCount: 21 },
    ];
    expect(selectAggregationRecords(records)).toHaveLength(2);
    expect(aggregateBySubject(records)[0].totalQuestions).toBe(130);
  });

  it('重复导入行仍然排除', () => {
    const records: TrainingRecord[] = [
      { ...base, id: 'keep', totalQuestions: 10, errorCount: 2, correctCount: 8 },
      { ...base, id: 'dup', validity: 'duplicate', totalQuestions: 99, errorCount: 99, correctCount: 0 },
    ];
    expect(selectAggregationRecords(records).map((r) => r.id)).toEqual(['keep']);
  });

  it('行测整卷专项练习计入学科总量，但不进模块统计', () => {
    const practice = {
      ...base,
      id: 'fenbi-exam-2025-10-10-hd926eb8c-10',
      module: '行测整卷',
      trainingType: 'exam' as const,
      note: '粉笔同步｜专项智能练习（简单加减计算）',
      aggregationRole: 'module_detail' as const,
      totalQuestions: 5,
      errorCount: 2,
      correctCount: 3,
    };
    expect(aggregateBySubject([practice])[0].totalQuestions).toBe(5);
    expect(buildModuleStats([practice])).toHaveLength(0);
    expect(deriveExamModuleBreakdown([practice], 'exam-fenbi-exam-1')).toBeNull();
  });
});

describe('模块聚合：模块优先，整卷兜底', () => {
  it('同一棵树有模块时用模块，没有模块时保留整卷', () => {
    const withModules: TrainingRecord[] = [
      { ...base, id: 'fenbi-exam-42', examId: 'fenbi-exam-42', aggregationRole: 'full_paper', module: '行测整卷', trainingType: 'exam', totalQuestions: 100, errorCount: 40, correctCount: 60 },
      { ...base, id: 'fenbi-md-42-mod-资料分析', examId: '42', aggregationRole: 'module_detail', totalQuestions: 20, errorCount: 4 },
    ];
    expect(selectModuleLevelRecords(withModules).map((r) => r.id)).toEqual(['fenbi-md-42-mod-资料分析']);

    const examOnly: TrainingRecord[] = [withModules[0]];
    expect(selectModuleLevelRecords(examOnly).map((r) => r.id)).toEqual(['fenbi-exam-42']);
  });
});

describe('测验页关联训练与模块诊断投影', () => {
  const examId = 'exam-fenbi-exam-42';
  const records: TrainingRecord[] = [
    { ...base, id: 'fenbi-exam-42', examId: 'fenbi-exam-42', aggregationRole: 'full_paper', module: '行测整卷', trainingType: 'exam', totalQuestions: 50, errorCount: 15, correctCount: 35 },
    { ...base, id: 'fenbi-md-42-mod-资料分析', examId: '42', aggregationRole: 'module_detail', totalQuestions: 20, errorCount: 4, correctCount: 16 },
    { ...base, id: 'fenbi-md-42-mod-判断推理', examId: '42', aggregationRole: 'module_detail', module: '判断推理', totalQuestions: 30, errorCount: 11, correctCount: 19 },
    { ...base, id: 'fenbi-md-42-pt-资料分析-增长率', examId: '42', aggregationRole: 'module_detail', totalQuestions: 999, errorCount: 999, correctCount: 0 },
    { ...base, id: 'other', examId: '99', totalQuestions: 10, errorCount: 1, correctCount: 9 },
  ];

  it('数字 examId 的模块行能关联到规范化后的测验 id', () => {
    expect(findExamTrainings(records, examId).map((r) => r.id)).toEqual([
      'fenbi-exam-42',
      'fenbi-md-42-mod-资料分析',
      'fenbi-md-42-mod-判断推理',
      'fenbi-md-42-pt-资料分析-增长率',
    ]);
  });

  it('模块诊断从模块行投影，标签行不进入投影', () => {
    const breakdown = deriveExamModuleBreakdown(records, examId);
    expect(breakdown).toEqual([
      { module: '资料分析', total: 20, errors: 4, score: 80, level: 'proficient' },
      { module: '判断推理', total: 30, errors: 11, score: 63.3, level: 'proficient' },
    ]);
  });

  it('没有模块行时返回 null，由调用方回退到已存快照', () => {
    expect(deriveExamModuleBreakdown([records[0]], examId)).toBeNull();
  });
});

describe('写入归一化', () => {
  it('补全 kind / attemptId / examRef，并归一化 trainingType', () => {
    const normalized = withTrainingSemantics({
      ...base,
      id: 'fenbi-exam-42',
      examId: 'fenbi-exam-42',
      module: '行测整卷',
      trainingType: 'exam',
      aggregationRole: 'full_paper',
      examRef: undefined,
    });
    expect(normalized.kind).toBe('exam');
    expect(normalized.examRef).toBe('exam-fenbi-exam-42');
    expect(normalized.attemptId).toBe('attempt:exam-fenbi-exam-42');
    expect(normalized.depth).toBe(0);
  });

  it('把 full_mock / wrong_review 归一成规范枚举', () => {
    expect(
      withTrainingSemantics({ ...base, trainingType: 'full_mock' as never }).trainingType,
    ).toBe('exam');
    expect(
      withTrainingSemantics({ ...base, trainingType: 'wrong_review' as never }).trainingType,
    ).toBe('review');
  });

  it('写侧把 examId 一并收敛成规范 examRef，历史三种写法落到同一个值', () => {
    for (const examId of ['42', 'fenbi-exam-42', 'exam-fenbi-exam-42']) {
      const normalized = withTrainingSemantics({ ...base, examId });
      expect(normalized.examRef).toBe('exam-fenbi-exam-42');
      expect(normalized.examId).toBe('exam-fenbi-exam-42');
    }
  });
});

describe('(source, sourceId, kind) 幂等键', () => {
  it('来源与外部 id 齐全时生成稳定键，kind 取解析后的结构角色', () => {
    expect(
      trainingIdempotencyKey({ ...base, source: 'fenbi', sourceId: 'fenbi-42' }),
    ).toBe('fenbi::fenbi-42::practice');
    expect(
      trainingIdempotencyKey({
        ...base,
        id: 'fenbi-md-42-pt-资料分析-增长率',
        source: 'fenbi',
        sourceId: 'fenbi-42-label',
        aggregationRole: 'module_detail',
      }),
    ).toBe('fenbi::fenbi-42-label::label');
  });

  it('缺 source 或 sourceId 时不做幂等归并', () => {
    expect(trainingIdempotencyKey({ ...base, source: 'fenbi' })).toBeNull();
    expect(trainingIdempotencyKey({ ...base, sourceId: 'fenbi-42' })).toBeNull();
  });

  it('同键只保留 updatedAt 最新的一条，其他记录原样保留', () => {
    const older: TrainingRecord = {
      ...base,
      id: 'old',
      source: 'fenbi',
      sourceId: 'dup',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const newer: TrainingRecord = {
      ...base,
      id: 'new',
      source: 'fenbi',
      sourceId: 'dup',
      totalQuestions: 20,
      updatedAt: '2026-11-02T00:00:00.000Z',
    };
    const manual: TrainingRecord = { ...base, id: 'manual', updatedAt: '2026-11-03T00:00:00.000Z' };
    expect(
      dedupeTrainingRecordsByIdempotencyKey([older, manual, newer]).map((r) => r.id),
    ).toEqual(['manual', 'new']);
  });
});
