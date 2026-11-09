/**
 * 写入侧数据口径校验（前后端共用）
 *
 * 背景（2026-11-09）：申论统一到「学科专项 → 申论作答」、面试统一到「学科专项 → 面试记录」，
 * 训练记录只用于行测等客观题。但收敛只发生在 UI 层时，接口仍能写入申论 / 面试训练记录：
 * 一旦漏进来，学科掌握度会按「总题数-错题数」算出一个假的正确率，与申论四维口径打架。
 * 这里给出唯一判定入口，Pages Functions 在 PUT / bulk 时直接拒绝，UI 侧同一套规则提示。
 */

/** 不允许写入训练记录（trainings）的主观题学科 */
export const TRAINING_EXCLUDED_SUBJECTS = ['shenlun', 'mianshi'] as const;

const EXCLUDED = new Set<string>(TRAINING_EXCLUDED_SUBJECTS);

/** 该学科是否禁止写入训练记录 */
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
export function guardTrainingRecords(records: ReadonlyArray<Record<string, unknown>>): TrainingGuardResult {
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

