/**
 * 公考域（adult / public-exam）
 *
 * 边界：
 * - 学科：行测、申论、面试；与 K12 学科集合不相交；
 * - 训练记录只接收客观题，申论 / 面试走「学科专项」的作答与面试记录；
 * - 只有 adult 学段可见本域模块（见 MODULE_VISIBILITY 派生）。
 */
import type { GradeLevel } from '../../domain/types';
import { PUBLIC_EXAM_SUBJECTS } from '../shared/scope';

export { PUBLIC_EXAM_SUBJECTS };

export const PUBLIC_EXAM_GRADE_LEVELS = ['adult'] as const satisfies readonly GradeLevel[];

/** 不允许写入训练记录（trainings）的主观题学科 */
export const TRAINING_EXCLUDED_SUBJECTS = ['shenlun', 'mianshi'] as const;

const EXCLUDED = new Set<string>(TRAINING_EXCLUDED_SUBJECTS);

export function isTrainingExcludedSubject(subject: unknown): boolean {
  return typeof subject === 'string' && EXCLUDED.has(subject);
}

export interface TrainingGuardResult {
  ok: boolean;
  /** 被拒记录的下标（bulk 用），单条时为 0 */
  rejectedIndexes: number[];
  /** 直接可返回给调用方的人话说明 */
  message: string;
}

const REJECT_MESSAGE =
  '训练记录只接收行测等客观题：申论请到「学科专项 → 申论作答」录入（单题/套卷），面试请到「学科专项 → 面试记录」录入';

/**
 * 校验待写入 trainings 的记录集合。
 * 只做学科口径拦截，不校验其它字段——其它字段的完整性由各自页面负责，
 * 这里加宽会把历史导入通道一起挡掉。
 */
export function guardTrainingRecords(
  records: ReadonlyArray<Record<string, unknown>>,
): TrainingGuardResult {
  const rejectedIndexes: number[] = [];
  records.forEach((record, index) => {
    if (record && typeof record === 'object' && isTrainingExcludedSubject(record.subject)) {
      rejectedIndexes.push(index);
    }
  });
  return { ok: rejectedIndexes.length === 0, rejectedIndexes, message: REJECT_MESSAGE };
}

/**
 * 训练记录可录入的学科：从学员已配置学科里剔除申论 / 面试。
 * UI 的学科下拉、筛选按钮都走这里，避免两边各写一份 filter 而漂移。
 */
export function selectTrainingEntrySubjects<T extends string>(subjects: readonly T[]): T[] {
  return subjects.filter((subject) => !EXCLUDED.has(subject));
}
