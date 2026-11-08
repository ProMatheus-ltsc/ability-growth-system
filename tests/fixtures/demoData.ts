/**
 * 演示数据（非真实用户数据），覆盖 S5 新增分析口径所需的七类场景：
 * 1) 老记录无新字段；2) 同 examId 的整卷 + 模块；3) 仅模块；
 * 4) 两周数据；5) 无标准用时；6) 无 statusHistory 的老 gap；7) 四维部分为空。
 */
import type { AbilityGap, SubjectiveAnswer, TrainingRecord } from '../../src/domain/types';

const STUDENT = 'demo-student';
const CREATED = '2026-10-01T00:00:00.000Z';

function training(partial: Partial<TrainingRecord> & Pick<TrainingRecord, 'id' | 'date' | 'module'>): TrainingRecord {
  return {
    studentId: STUDENT,
    gradeLevel: 'adult',
    subject: 'xingce',
    trainingType: 'daily',
    totalQuestions: 10,
    correctCount: 8,
    errorCount: 2,
    durationMinutes: 20,
    errorCategories: ['calc'],
    createdAt: CREATED,
    updatedAt: CREATED,
    ...partial,
  };
}

/** 1) 老记录：无卷面结构 / scope / examId 等新字段 */
export const legacyTrainings: TrainingRecord[] = [
  training({ id: 'legacy-1', date: '2026-10-20', module: '资料分析/基本增长率', errorCount: 2, correctCount: 8 }),
  training({ id: 'legacy-2', date: '2026-10-22', module: '判断推理/图形推理', errorCount: 3, correctCount: 7 }),
];

/** 2) 同 examId：1 条整卷 + 2 条模块（整卷权威） */
export const fullAndModuleTrainings: TrainingRecord[] = [
  training({
    id: 'exam1-full',
    date: '2026-11-05',
    module: '整卷',
    trainingType: 'exam',
    totalQuestions: 30,
    correctCount: 18,
    errorCount: 12,
    durationMinutes: 60,
    examId: 'exam-1',
    scope: 'full',
    standardMinutes: 90,
  }),
  training({
    id: 'exam1-mod-1',
    date: '2026-11-05',
    module: '资料分析',
    trainingType: 'exam',
    totalQuestions: 15,
    correctCount: 9,
    errorCount: 6,
    durationMinutes: 25,
    examId: 'exam-1',
    scope: 'module',
  }),
  training({
    id: 'exam1-mod-2',
    date: '2026-11-05',
    module: '判断推理',
    trainingType: 'exam',
    totalQuestions: 15,
    correctCount: 9,
    errorCount: 6,
    durationMinutes: 35,
    examId: 'exam-1',
    scope: 'module',
  }),
];

/** 3) 仅模块：同一 examId 没有整卷行 */
export const moduleOnlyTrainings: TrainingRecord[] = [
  training({
    id: 'exam2-mod-1',
    date: '2026-11-06',
    module: '资料分析/基本增长率',
    trainingType: 'exam',
    totalQuestions: 10,
    correctCount: 7,
    errorCount: 3,
    examId: 'exam-2',
    scope: 'module',
  }),
  training({
    id: 'exam2-mod-2',
    date: '2026-11-06',
    module: '判断推理',
    trainingType: 'exam',
    totalQuestions: 10,
    correctCount: 6,
    errorCount: 4,
    examId: 'exam-2',
    scope: 'module',
  }),
];

/** 4) 两周：上周 6/10=60%，本周 15/20=75% */
export const weeklyTrainings: TrainingRecord[] = [
  training({
    id: 'week-prev-1',
    date: '2026-11-02',
    module: '资料分析',
    totalQuestions: 10,
    correctCount: 6,
    errorCount: 4,
    durationMinutes: 40,
    standardMinutes: 50,
  }),
  training({
    id: 'week-curr-1',
    date: '2026-11-09',
    module: '资料分析',
    totalQuestions: 20,
    correctCount: 15,
    errorCount: 5,
    durationMinutes: 60,
    standardMinutes: 60,
  }),
];

/** 仅一周数据 */
export const singleWeekTrainings: TrainingRecord[] = [
  training({
    id: 'single-week-1',
    date: '2026-11-09',
    module: '资料分析',
    totalQuestions: 10,
    correctCount: 8,
    errorCount: 2,
    durationMinutes: 30,
    standardMinutes: 40,
  }),
];

/** 5) 无标准用时的记录（达标判定应为 null） */
export const noStandardTrainings: TrainingRecord[] = [
  training({ id: 'no-standard-1', date: '2026-11-09', module: '资料分析', durationMinutes: 30 }),
];

/** 达标 / 超时各一条（标准 10 题 40 分） */
export const timedTrainings: TrainingRecord[] = [
  training({
    id: 'timed-met',
    date: '2026-11-09',
    module: '资料分析',
    totalQuestions: 10,
    durationMinutes: 35,
    standardMinutes: 40,
  }),
  training({
    id: 'timed-over',
    date: '2026-11-09',
    module: '资料分析',
    totalQuestions: 10,
    durationMinutes: 45,
    standardMinutes: 40,
  }),
];

/** 目标分差用：40 题错 14 → 正确率 65% */
export const targetGapTrainings: TrainingRecord[] = [
  training({
    id: 'target-1',
    date: '2026-11-09',
    module: '资料分析',
    totalQuestions: 20,
    correctCount: 13,
    errorCount: 7,
  }),
  training({
    id: 'target-2',
    date: '2026-11-09',
    module: '判断推理',
    totalQuestions: 20,
    correctCount: 13,
    errorCount: 7,
  }),
];

/** 无样本样本量（仅用时）模块，用于掌握度 null 的验证 */
export const durationOnlyTrainings: TrainingRecord[] = [
  training({
    id: 'duration-only-1',
    date: '2026-11-09',
    module: '资料分析',
    totalQuestions: 0,
    correctCount: 0,
    errorCount: 0,
    durationMinutes: 30,
  }),
];

/** 6) 无 statusHistory 的老 gap（已验证） */
export const legacyVerifiedGap: AbilityGap = {
  id: 'gap-legacy-verified',
  studentId: STUDENT,
  subject: 'xingce',
  abilityPath: 'xingce/资料分析/基本增长率',
  errorCategory: 'calc',
  severity: 'medium',
  status: 'verified',
  sourceRecordIds: ['legacy-1'],
  occurrenceCount: 1,
  firstSeenAt: '2026-10-20T00:00:00.000Z',
  lastSeenAt: '2026-10-20T00:00:00.000Z',
  createdAt: CREATED,
  updatedAt: CREATED,
};

/** 与老 gap 同 key 的训练（再次出现） */
export const reopenTraining: TrainingRecord = training({
  id: 'reopen-1',
  date: '2026-11-09',
  module: '资料分析/基本增长率',
  totalQuestions: 10,
  correctCount: 5,
  errorCount: 5,
});

/** 与老 gap 同 key 的未验证训练（合并） */
export const mergeTraining: TrainingRecord = training({
  id: 'merge-1',
  date: '2026-11-10',
  module: '资料分析/基本增长率',
  totalQuestions: 10,
  correctCount: 6,
  errorCount: 4,
});

/** 7) 四维部分为空（演示数据） */
export const subjectiveAnswers: SubjectiveAnswer[] = [
  {
    id: 'subj-1',
    studentId: STUDENT,
    subject: 'shenlun',
    scenario: '归纳概括',
    date: '2026-11-01',
    version: 1,
    content: '演示作答内容一',
    dimensionScores: { points: 80, structure: 70, language: 60 },
    createdAt: CREATED,
    updatedAt: CREATED,
  },
  {
    id: 'subj-2',
    studentId: STUDENT,
    subject: 'shenlun',
    scenario: '归纳概括',
    date: '2026-11-02',
    version: 1,
    content: '演示作答内容二',
    dimensionScores: { points: 90, logic: 50 },
    createdAt: CREATED,
    updatedAt: CREATED,
  },
];

/** 完全无四维的老作答 */
export const subjectiveWithoutDimensions: SubjectiveAnswer[] = [
  {
    id: 'subj-legacy',
    studentId: STUDENT,
    subject: 'shenlun',
    scenario: '归纳概括',
    date: '2026-10-01',
    version: 1,
    content: '演示老作答',
    createdAt: CREATED,
    updatedAt: CREATED,
  },
];
