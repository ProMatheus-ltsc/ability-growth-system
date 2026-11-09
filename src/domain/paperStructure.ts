/**
 * 公考卷面结构字段的数据契约（单一权威）
 *
 * 背景：云端 D1 的训练/模考记录正在补 `examId`、`scope`、`paperType`、`paperYear`、
 * `fullMark`、`score`、`standardMinutes`、`questionType`、`sourceId`、`exerciseId`。
 * 历史记录大量为空，推断值（如按考纲推算的 `standardMinutes`）会显式标注。
 *
 * 契约原则（本轮定为全仓唯一口径，前端/数据侧都从这里取，不再各自定义）：
 * 1. 缺失即 undefined，不写键、不补 0、不补满分；读取端不得把 undefined 归一成 0。
 * 2. 真实数据可能存在不规范写法（大小写、同义写法），因此写入前必须经过本模块的归一化函数；
 *    无法识别但有值的写法归为 `unknown`（界面显示「未标注」），而不是丢弃。
 * 3. 关联只用结构化键 `examId` / `sourceId` / `exerciseId` 精确匹配，**禁止按卷名模糊匹配**。
 * 4. `scope` 决定聚合口径：`full` 为整卷权威，`module` 为模块明细，`single` 为单条；
 *    有 `examId` 但缺 `scope` 时按 `module` 处理（与 A1 去重规则一致）。
 * 5. 推断标记优先读结构化布尔字段 `standardMinutesInferred`；历史记录缺该字段时，
 *    退回 `note` 文本含「推断」的判定（兼容路径，未来可移除）。
 *
 * 说明：本轮不改表结构、不跑迁移、不写线上 D1；类型只存在于 `data` JSON。
 */
import type { PaperType, PaperTypeRecord, TrainingRecord, TrainingScope } from './types';

/** `unknown` 保留位：字段有值但写法无法识别（含历史中文写法被转成无法匹配的值） */
export const PAPER_TYPE_KNOWN = ['national', 'provincial', 'public-institution', 'military-transfer'] as const;

export const TRAINING_SCOPE_VALUES: readonly TrainingScope[] = ['full', 'module', 'single'];

/** 卷型同义写法映射（真实数据若出现新写法，只在这里加一行） */
const PAPER_TYPE_ALIASES: Record<string, PaperTypeRecord> = {
  national: 'national',
  国考: 'national',
  国家: 'national',
  国家公务员: 'national',
  guokao: 'national',
  provincial: 'provincial',
  省考: 'provincial',
  联考: 'provincial',
  省公务员: 'provincial',
  shengkao: 'provincial',
  'public-institution': 'public-institution',
  'public_institution': 'public-institution',
  publicinstitution: 'public-institution',
  'public_inst': 'public-institution',
  publicinst: 'public-institution',
  'public-inst': 'public-institution',
  institution: 'public-institution',
  事业单位: 'public-institution',
  事业编: 'public-institution',
  'military-transfer': 'military-transfer',
  'military_transfer': 'military-transfer',
  militarytransfer: 'military-transfer',
  military: 'military-transfer',
  军转: 'military-transfer',
  军转干: 'military-transfer',
};

/**
 * 归一化卷型：空值 → undefined（不写键）；无法识别但有值 → 'unknown'（保留为「未标注」）。
 */
export function normalizePaperType(raw: unknown): PaperTypeRecord | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'string') return 'unknown';
  const key = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (key === '') return undefined;
  return PAPER_TYPE_ALIASES[key] ?? PAPER_TYPE_ALIASES[raw.trim()] ?? 'unknown';
}

/** 归一化年份：仅接受 1900-2100 的整数；非整数/越界一律视为缺失（不截断、不四舍五入） */
export function normalizePaperYear(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  if (!Number.isInteger(raw) || raw < 1900 || raw > 2100) return undefined;
  return raw;
}

/**
 * 归一化粒度：显式 full/module/single 优先；
 * 有 examId 但缺 scope → module（与 A1 去重「有整卷行以整卷为准」配套）；
 * 无 examId 且无 scope → undefined（老记录保持未标注）。
 */
export function normalizeTrainingScope(raw: unknown, examId?: string): TrainingScope | undefined {
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase();
    if (key === 'full' || key === 'module' || key === 'single') return key;
    if (key === '整卷') return 'full';
    if (key === '模块') return 'module';
    if (key === '单条' || key === '单项') return 'single';
  }
  return examId ? 'module' : undefined;
}

/** 归一化正数（满分 / 标准用时必须 > 0）；无效值视为缺失，不补 0 */
export function normalizePositiveNumber(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined;
  return raw;
}

/** 归一化非负数（得分可为 0）；无效值视为缺失 */
export function normalizeNonNegativeNumber(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return undefined;
  return raw;
}

/** 归一化题型自由文本：去空白、超长截断到 20 字；空串视为缺失 */
export function normalizeQuestionType(raw: unknown, maxLength = 20): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (text === '') return undefined;
  return text.slice(0, maxLength);
}

/**
 * 推断标记判定（兼容路径）：
 * - `standardMinutesInferred === true` → 推断；
 * - `standardMinutesInferred === false` → 明确为真实值（即使 note 含「推断」字样也不再视为推断）；
 * - 字段缺省 → 退回 `note` 文本含「推断」的历史判定。
 */
export function isStandardMinutesInferred(record: Pick<TrainingRecord, 'note' | 'standardMinutesInferred'>): boolean {
  if (record.standardMinutesInferred === true) return true;
  if (record.standardMinutesInferred === false) return false;
  return typeof record.note === 'string' && record.note.includes('推断');
}

/** 数据校准问题（只诊断，不修改记录） */
export interface ContractIssue {
  field: string;
  value: unknown;
  reason: string;
  /** 建议取值（仅提示，不自动改写） */
  suggestion?: string;
}

/**
 * 单条训练记录的契约检查：
 * 必填核心字段（id/date/subject/module/totalQuestions/correctCount/errorCount）缺失或类型错误即报错；
 * 可选卷面字段有值但类型/范围不合契约时报告，并给出归一化建议值。
 */
export function inspectTrainingRecord(record: Record<string, unknown>): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const push = (field: string, value: unknown, reason: string, suggestion?: string) =>
    issues.push({ field, value, reason, ...(suggestion ? { suggestion } : {}) });

  for (const field of ['id', 'date', 'subject', 'module']) {
    if (typeof record[field] !== 'string' || (record[field] as string).trim() === '') {
      push(field, record[field], '必填字段缺失或类型错误');
    }
  }
  for (const field of ['totalQuestions', 'correctCount', 'errorCount']) {
    const v = record[field];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) push(field, v, '必填计数缺失或为非负数以外的值');
  }

  if (record.paperType !== undefined) {
    const normalized = normalizePaperType(record.paperType);
    if (normalized === 'unknown') {
      push('paperType', record.paperType, '取值无法识别', "unknown（显示「未标注」）");
    }
  }
  if (record.paperYear !== undefined && normalizePaperYear(record.paperYear) === undefined) {
    push('paperYear', record.paperYear, '非 1900-2100 的整数', '缺省（不写键）');
  }
  if (record.scope !== undefined) {
    if (typeof record.scope !== 'string' || !/^(full|module|single|整卷|模块|单条|单项)$/i.test(record.scope.trim())) {
      push('scope', record.scope, '取值不在 full/module/single', '缺省（有 examId 时按下 module 处理）');
    }
  }
  if (record.examId !== undefined && (typeof record.examId !== 'string' || record.examId.trim() === '')) {
    push('examId', record.examId, '关联键必须为非空字符串（精确匹配）', '缺省');
  }
  if (record.sourceId !== undefined && (typeof record.sourceId !== 'string' || record.sourceId.trim() === '')) {
    push('sourceId', record.sourceId, '关联键必须为非空字符串', '缺省');
  }
  if (record.exerciseId !== undefined && (typeof record.exerciseId !== 'string' || record.exerciseId.trim() === '')) {
    push('exerciseId', record.exerciseId, '关联键必须为非空字符串', '缺省');
  }

  const fullMark = record.fullMark === undefined ? undefined : normalizePositiveNumber(record.fullMark);
  if (record.fullMark !== undefined && fullMark === undefined) push('fullMark', record.fullMark, '满分必须 > 0', '缺省');
  const score = record.score === undefined ? undefined : normalizeNonNegativeNumber(record.score);
  if (record.score !== undefined && score === undefined) push('score', record.score, '得分必须 ≥ 0', '缺省');
  if (score !== undefined && fullMark !== undefined && score > fullMark) {
    push('score', record.score, `得分大于满分 ${fullMark}`, `≤ ${fullMark}`);
  }

  if (record.standardMinutes !== undefined && normalizePositiveNumber(record.standardMinutes) === undefined) {
    push('standardMinutes', record.standardMinutes, '标准用时必须 > 0', '缺省（不参与限时达标）');
  }
  if (record.standardMinutesInferred !== undefined && typeof record.standardMinutesInferred !== 'boolean') {
    push('standardMinutesInferred', record.standardMinutesInferred, '推断标记必须为布尔值', '缺省（回退 note 文本判定）');
  }
  if (record.questionType !== undefined && normalizeQuestionType(record.questionType) === undefined) {
    push('questionType', record.questionType, '题型应为 1-20 字文本', '缺省');
  }
  return issues;
}
