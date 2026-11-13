/**
 * 训练记录语义层（Option A：单表内的作答树）
 *
 * 一条 TrainingRecord 不再靠 `scope` / `aggregationRole` / id 字符串约定互相压制，
 * 而是显式声明自己在一次作答中的角色：
 *
 * - `exam`     整卷根节点，depth = 0，题量是该次作答的权威总量；
 * - `module`   整卷下的模块分段，depth = 1；
 * - `label`    模块下的标签分段，depth ≥ 2；
 * - `practice` 独立练习（无整卷树），depth = 0；
 * - `review`   错题复盘（无整卷树），depth = 0；
 * - `summary`  跨日期聚合行，任何求和都排除。
 *
 * `attemptId` 把同一次作答的记录串成一棵树；未来拆 attempts / segments 表时，
 * 它直接成为 attempts.id。`examRef` 指向试卷实体（`exam-fenbi-exam-{paperId}`），
 * 同一张卷的不同作答可以有相同 examRef、不同 attemptId，不会被互相压制。
 *
 * 可加层规则（analytics 唯一口径）：
 * - 学科题量：同一棵树优先整卷 → 否则模块 → 否则独立记录；`label` 永不相加
 *   （粉笔标签是多标签再切分，实测一张 130 题卷的标签题量和为 330，直接加会虚增）。
 * - 模块统计：同一棵树优先模块 → 否则整卷；`label` 不参与模块题量。
 */
import type { TrainingKind, TrainingRecord, TrainingType } from './types';

/** 兼容老记录的字符串约定；新写入与迁移必须显式写 `kind` */
export function legacyKindFallback(record: TrainingRecord): TrainingKind {
  if (record.aggregationRole === 'derived') return 'summary';
  if ((record.id ?? '').includes('-pt-')) return 'label';
  if ((record.id ?? '').includes('-mod-')) return 'module';
  const type = record.trainingType as string;
  if (type === 'review' || type === 'wrong_review') return 'review';
  if (isPseudoModule(record.module) && isPracticeNote(record.note)) return 'practice';
  if (record.aggregationRole === 'full_paper') return 'exam';
  if (record.aggregationRole === 'module_detail') return 'module';
  if (record.scope === 'full') return 'exam';
  if (record.scope === 'module') return 'module';
  if (isPseudoModule(record.module)) return 'exam';
  return 'practice';
}

export function resolveTrainingKind(record: TrainingRecord): TrainingKind {
  return record.kind ?? legacyKindFallback(record);
}

/** 伪模块：整卷/错题复盘是卷型或训练类型，不是考点模块 */
export function isPseudoModule(module: string | undefined): boolean {
  const value = (module ?? '').trim();
  return value === '整卷' || value === '行测整卷' || value.startsWith('错题复盘');
}

/** 粉笔同步里被写成 `行测整卷` 的专项练练习，不能当整卷 */
export function isPracticeNote(note: string | undefined): boolean {
  return /专项智能练习|举一反三|快速智能练习/.test(note ?? '');
}

/**
 * 试卷引用归一化：
 * - `4291593113` / `fenbi-exam-4291593113` / `exam-fenbi-exam-4291593113`
 *   → `exam-fenbi-exam-4291593113`；
 * - 非 paperId 的历史值原样保留，不臆造引用。
 */
export function normalizeExamRef(raw: string | null | undefined): string | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  const bare = value.startsWith('exam-fenbi-exam-')
    ? value.slice('exam-fenbi-exam-'.length)
    : value.startsWith('fenbi-exam-')
      ? value.slice('fenbi-exam-'.length)
      : value;
  return /^\d+$/.test(bare) ? `exam-fenbi-exam-${bare}` : value;
}

export function resolveExamRef(
  record: Pick<TrainingRecord, 'examRef' | 'examId'>,
): string | undefined {
  return normalizeExamRef(record.examRef ?? record.examId);
}

/** 作答树聚合键；独立记录各自成组 */
export function resolveAttemptId(record: TrainingRecord): string {
  if (record.attemptId) return record.attemptId;
  const examRef = resolveExamRef(record);
  if (examRef) return `attempt:${examRef}`;
  return `record:${record.id}`;
}

function defaultDepth(record: TrainingRecord, kind: TrainingKind): number {
  if (kind === 'module') return 1;
  if (kind === 'label') {
    const path = (record.modulePath ?? '').trim();
    const slashes = path ? path.split('/').length - 1 : 0;
    return slashes >= 2 ? slashes : 2;
  }
  return 0;
}

/**
 * 写入前补全语义字段。
 * 只做纯函数归一化，不查表推断父节点；`parentId` 由写入方按已有记录显式给出。
 */
export function withTrainingSemantics(record: TrainingRecord): TrainingRecord {
  const trainingType = normalizeTrainingType(record.trainingType);
  const kind = resolveTrainingKind({ ...record, trainingType });
  const examRef = resolveExamRef(record);
  const examId = examRef ?? record.examId;
  const attemptId =
    record.attemptId ?? (examRef ? `attempt:${examRef}` : `attempt:${record.id}`);
  const depth = record.depth ?? defaultDepth(record, kind);
  return { ...record, trainingType, kind, examId, examRef, attemptId, depth };
}

/**
 * 外部导入幂等键：同一来源的同一次外部作答（`source` + `sourceId` + 结构角色）
 * 只应存在一条记录。缺任一字段时返回 null，不做猜测归并。
 */
export function trainingIdempotencyKey(record: TrainingRecord): string | null {
  const source = trimmedString(record.source);
  const sourceId = trimmedString(record.sourceId);
  if (!source || !sourceId) return null;
  return `${source}::${sourceId}::${resolveTrainingKind(record)}`;
}

/** 外部导入数据不保证字段类型，非字符串一律视为缺失，避免 `.trim()` 抛错中断写入 */
function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function recordTimestampMs(record: TrainingRecord): number {
  const ms = Date.parse(record.updatedAt ?? '');
  return Number.isNaN(ms) ? 0 : ms;
}

export interface TrainingWritePlan {
  upserts: TrainingRecord[];
  deleteIds: string[];
}

/**
 * 跨请求幂等决策：把库里同键的旧行一起纳入比较，较新的 updatedAt 胜出。
 * 被替代的旧行必须删除，否则同一份外部作答会重复计入聚合。
 * `incoming` 应已按批内幂等键去重（同键重复到达时只接受第一条）。
 */
export function planTrainingWrite(
  incoming: readonly TrainingRecord[],
  existing: readonly TrainingRecord[],
): TrainingWritePlan {
  const existingByKey = new Map<string, TrainingRecord[]>();
  for (const record of existing) {
    const key = trainingIdempotencyKey(record);
    if (!key) continue;
    const list = existingByKey.get(key);
    if (list) list.push(record);
    else existingByKey.set(key, [record]);
  }

  const upserts: TrainingRecord[] = [];
  const deleteIds = new Set<string>();
  const seenIncomingKeys = new Set<string>();
  for (const record of incoming) {
    const key = trainingIdempotencyKey(record);
    if (!key) {
      upserts.push(record);
      continue;
    }
    if (seenIncomingKeys.has(key)) continue;
    seenIncomingKeys.add(key);
    const rivals = (existingByKey.get(key) ?? []).filter((rival) => rival.id !== record.id);
    const newestRivalMs = rivals.reduce(
      (latest, rival) => Math.max(latest, recordTimestampMs(rival)),
      Number.NEGATIVE_INFINITY,
    );
    // 与 upsertSql 的 `>=` 保持一致：同时间戳按后写入优先
    if (newestRivalMs > recordTimestampMs(record)) continue;
    for (const rival of rivals) deleteIds.add(rival.id);
    upserts.push(record);
  }
  return { upserts, deleteIds: [...deleteIds] };
}

/** 同幂等键只保留 updatedAt 最新一条（同位取靠后），无键记录原样保留 */
export function dedupeTrainingRecordsByIdempotencyKey(
  records: TrainingRecord[],
): TrainingRecord[] {
  const bestIndexByKey = new Map<string, { index: number; updatedAt: string }>();
  records.forEach((record, index) => {
    const key = trainingIdempotencyKey(record);
    if (!key) return;
    const updatedAt = record.updatedAt ?? '';
    const best = bestIndexByKey.get(key);
    if (!best || updatedAt >= best.updatedAt) bestIndexByKey.set(key, { index, updatedAt });
  });
  return records.filter((record, index) => {
    const key = trainingIdempotencyKey(record);
    return !key || bestIndexByKey.get(key)?.index === index;
  });
}

export function normalizeTrainingType(value: TrainingType | string): TrainingType {
  if (value === 'full_mock') return 'exam';
  if (value === 'wrong_review') return 'review';
  return value as TrainingType;
}
