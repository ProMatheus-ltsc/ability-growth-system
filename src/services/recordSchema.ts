/**
 * 写入参数校验（前后端共用）
 *
 * ## 为什么需要它
 *
 * 表结构是 `(workspace, id, updated_at, data TEXT)`，`data` 完全 schemaless；
 * 后端此前只校验「业务口径」（申论不进 trainings、学段学科匹配），没有校验**参数形状**。
 * 于是 `{ "id": "x" }` 这种空壳、`errorCategories: "x"` 这种类型错、`id` 里带斜杠
 * 这种会拼坏 URL 的值，都能 200 入库，然后在渲染期炸掉。
 *
 * ## 拦什么、不拦什么（重要）
 *
 * 校验分两层，**只拒「非法」，不拒「残缺」**：
 *
 * | 层 | 判定 | 处理 |
 * |---|---|---|
 * | 形状/类型 | id 非法、字段类型错（数组给成字符串）、负数、超长、原形污染键 | **400 拒绝** |
 * | 完整性 | 老记录缺 `errorCategories` / `rootCauses` 等后加字段 | 放行，由 `recordNormalize` 补齐 |
 *
 * 第二层不能拒：库里已有大量历史残缺记录，拒收会让用户「改一个字段就保存失败」，
 * 等于用存量数据把所有老客户端锁死。而「新建」记录没有历史包袱，所以核心字段
 * （`core`）与枚举取值（`enum`）**只在新建时**强制，更新只查类型。
 *
 * 少数能从旧值救回来的情况做**收敛**而不是拒绝：`totalQuestions: "10"`（历史导入的
 * 字符串数字）转成 `10` —— 直接拒会卡住老记录编辑，直接忽略则会让统计把它当未知。
 *
 * 还有一条更新期保护：**已经存在的核心字段不允许被静默丢弃**。PUT 是整条覆盖，
 * 一个只会发 `{ id }` 的客户端能把记录清成空壳（脏数据的另一半来源）。所以更新时
 * 会拿库里那条记录比对：库里有 `date`、请求里没有 → 400；库里本来也没有 → 放行，
 * 这正是「老记录缺后加字段」的合法情形。
 */

type AnyRecord = Record<string, unknown> & { id: string };

/** 记录 id 上限；与 URL 单段长度、D1 主键索引都相容 */
export const MAX_RECORD_ID_LENGTH = 128;
/** 单条记录序列化上限；D1 单行本身另有上限，这里只挡明显异常的请求 */
export const MAX_RECORD_BYTES = 4 * 1024 * 1024;
/** 单个字符串字段上限（正文/备注类字段足够） */
export const MAX_TEXT_LENGTH = 20000;
/** 数组字段元素上限（训练错因、模块拆解这类都在几十量级） */
export const MAX_ARRAY_ITEMS = 5000;

const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/** 字段清单去重（COMMON_STRINGS 与个别 spec 会重复列出同一字段，避免重复报错） */
const uniq = (list?: readonly string[]): string[] => Array.from(new Set(list ?? []));

export interface RecordIssue {
  /** 出问题的字段；空字符串表示整条记录 */
  field: string;
  message: string;
}

export interface RecordValidation {
  ok: boolean;
  /** 收敛后的记录（数字字符串已转数字）；校验失败时为空对象 */
  record: AnyRecord;
  issues: RecordIssue[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * 记录 id 的合法性。
 *
 * 只挡「一定会出问题」的形状：
 * - 空 / 非字符串 / 超长 → D1 主键与 URL 段都要求非空短字符串；
 * - 含 `/` `?` `#` `%` 或空白 / 控制字符 → 拼进 `/api/stores/<store>/<id>` 会改变路由语义
 *   （`getRecord(store, '')` 曾因此被服务端当成列表，返回数组一路走到页面 state）；
 * - `*` 被删除墓碑占用（`STORE_RESET_TOMBSTONE`），记录 id 用它会和「整表重建」混淆。
 *
 * 中文等 Unicode 字符允许：历史 id 里有，且不影响路由。
 */
export function validateRecordId(value: unknown): string | null {
  if (typeof value !== 'string') return 'id 必须是字符串';
  const id = value;
  if (id.length === 0) return 'id 不能为空';
  if (id.length > MAX_RECORD_ID_LENGTH) return `id 超过 ${MAX_RECORD_ID_LENGTH} 个字符`;
  if (id === '*') return "id 不能为 '*'（保留给删除墓碑）";
  if (/[\s\u0000-\u001f\u007f]/.test(id)) return 'id 不能包含空白或控制字符';
  if (/[/?#%]/.test(id)) return 'id 不能包含 / ? # % 字符';
  return null;
}

/** 每个表要校验的字段。只列有明确契约的字段，其余透传（表是 schemaless 的，不做白名单） */
interface StoreSpec {
  /** 新建记录必须提供的核心字段（更新时不要求，避免锁死存量记录） */
  core?: string[];
  /** 非负有限数字 */
  numbers?: string[];
  /** 非负整数 */
  ints?: string[];
  /** 字符串 */
  strings?: string[];
  /** 字符串数组（元素必须是字符串） */
  stringArrays?: string[];
  /** 任意数组（嵌套对象结构由领域层自己保证） */
  arrays?: string[];
  /** 嵌套对象 */
  objects?: string[];
  /** 布尔 */
  booleans?: string[];
  /** 枚举取值；只在新建时校验，避免历史值被拒 */
  enum?: Record<string, readonly string[]>;
}

const COMMON_STRINGS = ['studentId', 'gradeLevel', 'note', 'createdAt', 'updatedAt'];

const STORE_SPECS: Record<string, StoreSpec> = {
  trainings: {
    core: ['date', 'subject'],
    numbers: ['durationMinutes', 'paperYear', 'fullMark', 'score', 'standardMinutes', 'depth'],
    ints: ['totalQuestions', 'correctCount', 'errorCount'],
    strings: [...COMMON_STRINGS, 'subject', 'date', 'module', 'modulePath', 'source', 'sourceId', 'kind'],
    stringArrays: ['errorCategories'],
    booleans: ['isUnfamiliar', 'standardMinutesInferred'],
    enum: { validity: ['valid', 'duplicate'] },
  },
  gaps: {
    core: ['subject', 'abilityPath'],
    ints: ['occurrenceCount', 'reopenedCount'],
    strings: [...COMMON_STRINGS, 'subject', 'abilityPath', 'errorCategory', 'severity', 'status'],
    stringArrays: ['sourceRecordIds'],
    arrays: ['statusHistory'],
    enum: {
      status: ['unresolved', 'in-progress', 'verified'],
      severity: ['light', 'medium', 'serious'],
    },
  },
  abilities: {
    core: ['subject', 'abilityPath'],
    numbers: ['score', 'confidence', 'sampleTotal', 'sampleCorrect'],
    strings: [...COMMON_STRINGS, 'subject', 'abilityPath', 'level', 'source', 'evaluationTime'],
  },
  students: {
    core: ['name'],
    strings: [...COMMON_STRINGS, 'name', 'contact', 'gradeLevel', 'grade', 'goal', 'group'],
    stringArrays: ['subjects'],
    enum: { stage: ['foundation', 'improve', 'sprint', 'maintain'] },
  },
  tasks: {
    core: ['subject', 'abilityPath', 'type'],
    strings: [...COMMON_STRINGS, 'subject', 'abilityPath', 'relatedGapId', 'type', 'status'],
    enum: {
      type: ['fix', 'verify'],
      status: ['pending', 'in-progress', 'done'],
    },
  },
  templates: {
    core: ['name'],
    ints: ['suggestedQuestions', 'timeLimitMinutes'],
    strings: [...COMMON_STRINGS, 'name', 'gradeLevel', 'subject', 'taskKind', 'moduleHint'],
    booleans: ['builtin'],
  },
  assignments: {
    core: ['title'],
    ints: ['totalQuestions', 'timeLimitMinutes'],
    strings: [...COMMON_STRINGS, 'title', 'gradeLevel', 'subject', 'taskKind', 'module', 'dueAt'],
    stringArrays: ['assigneeStudentIds'],
  },
  assignmentProgress: {
    core: ['assignmentId', 'studentId', 'status'],
    strings: [...COMMON_STRINGS, 'assignmentId', 'studentId', 'status', 'relatedTrainingId'],
    enum: { status: ['pending', 'in-progress', 'submitted', 'overdue'] },
  },
  exams: {
    core: ['date', 'subject'],
    numbers: ['durationMinutes', 'paperYear', 'fullMark', 'totalScore', 'standardMinutes'],
    ints: ['totalQuestions', 'totalErrors'],
    strings: [...COMMON_STRINGS, 'subject', 'date', 'scenario', 'diagnosis', 'sourceId'],
    arrays: ['moduleBreakdown'],
    stringArrays: ['mainProblems', 'generatedTaskIds'],
    booleans: ['standardMinutesInferred'],
  },
  corrections: {
    core: ['subject', 'date'],
    strings: [...COMMON_STRINGS, 'studentId', 'subject', 'scenario', 'date', 'suggestion'],
    stringArrays: ['problemTags', 'quickPhrases', 'relatedGapIds'],
    arrays: ['scoreDims'],
  },
  strategies: {
    core: ['strategyName', 'startDate'],
    numbers: ['effectivenessScore'],
    strings: [...COMMON_STRINGS, 'teacherLabel', 'strategyName', 'startDate', 'endDate', 'status'],
    stringArrays: ['targetStudentIds'],
    enum: { status: ['active', 'ended'] },
  },
  registrations: {
    core: ['postName'],
    ints: ['headcount'],
    strings: [...COMMON_STRINGS, 'postName', 'department', 'postLevel', 'educationLimit', 'examType'],
  },
  stagePlans: {
    core: ['stage', 'startDate', 'endDate'],
    strings: [...COMMON_STRINGS, 'subject', 'stage', 'startDate', 'endDate', 'weeklyGoal', 'source'],
    stringArrays: ['focusModules', 'focusAbilities'],
    enum: { stage: ['foundation', 'topic', 'sprint', 'pre-exam'] },
  },
  spacedReviews: {
    core: ['subject', 'abilityPath', 'nextDueDate'],
    ints: ['currentIndex'],
    strings: [...COMMON_STRINGS, 'subject', 'abilityPath', 'gradeLevel', 'nextDueDate', 'status'],
    arrays: ['intervals'],
    stringArrays: ['completedDates'],
    enum: { status: ['active', 'graduated'] },
  },
  pdcaProblems: {
    core: ['title', 'currentStage'],
    ints: ['currentCycle'],
    strings: [...COMMON_STRINGS, 'title', 'description', 'problemType', 'lifeDomain', 'currentStage', 'status'],
    arrays: ['rootCauses', 'countermeasures', 'checkEntries', 'cycleHistory'],
    stringArrays: ['archivedLessons'],
    enum: { status: ['active', 'archived'] },
  },
  careerAssessments: {
    core: ['gradeLevel'],
    strings: [...COMMON_STRINGS, 'version'],
    objects: ['values', 'ability', 'personality'],
  },
  careerReports: {
    core: ['assessmentId', 'generatedAt'],
    strings: [...COMMON_STRINGS, 'assessmentId', 'gradeLevel', 'generatedAt', 'quadrant'],
    arrays: ['survivors', 'vetoed'],
    stringArrays: ['bottomLineNotes'],
    objects: ['routes'],
  },
  subjectiveAnswers: {
    core: ['subject', 'date'],
    numbers: ['version', 'wordCount', 'durationMinutes', 'paperQuestionCount', 'paperFullMark', 'paperScore'],
    strings: [...COMMON_STRINGS, 'subject', 'scenario', 'date', 'content', 'questionType', 'paperTitle'],
    stringArrays: ['problemTags'],
    arrays: ['paperQuestions', 'scoreDims'],
    enum: { mode: ['single', 'paper'] },
  },
  interviewRecords: {
    core: ['date', 'questionType'],
    numbers: ['thinkingSec', 'answerSec'],
    strings: [...COMMON_STRINGS, 'date', 'questionType', 'answeredAt'],
    stringArrays: ['problemTags'],
    objects: ['selfScore', 'teacherScore'],
  },
  pdcaArtifacts: {
    core: ['problemId', 'toolId', 'stage'],
    strings: [...COMMON_STRINGS, 'problemId', 'toolId', 'toolName', 'stage', 'productType', 'link'],
  },
  customTools: {
    core: ['name', 'url'],
    strings: [...COMMON_STRINGS, 'name', 'url', 'embedType'],
    stringArrays: ['appliesTo'],
    enum: { embedType: ['iframe', 'link'] },
  },
  weeklyChecklists: {
    core: ['weekStart'],
    strings: [...COMMON_STRINGS, 'weekStart'],
    arrays: ['entries'],
  },
  collaborationEvents: {
    core: ['date', 'kind'],
    strings: [...COMMON_STRINGS, 'date', 'kind', 'subject', 'targetPeer', 'content'],
    booleans: ['passedVerification'],
    enum: { kind: ['explain', 'group-task', 'help-fix'] },
  },
  vetoOverrides: {
    core: ['reportId', 'candidateId'],
    strings: [...COMMON_STRINGS, 'reportId', 'candidateId', 'reason', 'confirmedAt'],
  },
  careerObservationPoints: {
    core: ['assessmentId'],
    strings: [...COMMON_STRINGS, 'assessmentId', 'triggeredAt'],
    arrays: ['layerConsistency', 'smallStepActions'],
  },
  careerRetestReflections: {
    core: ['assessmentId'],
    strings: [...COMMON_STRINGS, 'assessmentId', 'question1Answer', 'question2Answer'],
    stringArrays: ['question1Tags', 'question2Tags'],
  },
};

/** 原型污染键：即使 JSON.parse 不污染原型，展开/赋值时也不该让它们流动 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function checkDepth(value: unknown, depth = 0): boolean {
  if (depth > 24) return false;
  if (Array.isArray(value)) return value.every((item) => checkDepth(item, depth + 1));
  if (isPlainObject(value)) return Object.values(value).every((item) => checkDepth(item, depth + 1));
  return true;
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '数组';
  return typeof value;
}

/**
 * 校验并收敛一条待写入记录。
 *
 * @param store 表名
 * @param raw 请求里的原始记录
 * @param options.requireCore 是否强制核心字段与枚举（仅「新建」时为 true）
 */
export function validateRecordPayload(
  store: string,
  raw: unknown,
  options: { requireCore?: boolean; existing?: Record<string, unknown> } = {},
): RecordValidation {
  const issues: RecordIssue[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, record: {} as AnyRecord, issues: [{ field: '', message: `记录必须是对象，收到 ${typeName(raw)}` }] };
  }
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_KEYS.has(key)) issues.push({ field: key, message: '不允许的字段名（原型污染）' });
  }

  const idError = validateRecordId(raw.id);
  if (idError) issues.push({ field: 'id', message: idError });

  if (!checkDepth(raw)) issues.push({ field: '', message: '嵌套层级过深（上限 24 层）' });

  let encoded = '';
  try {
    encoded = JSON.stringify(raw);
  } catch {
    issues.push({ field: '', message: '记录无法序列化为 JSON（可能存在循环引用）' });
  }
  if (encoded.length > MAX_RECORD_BYTES) {
    issues.push({ field: '', message: `记录体积 ${encoded.length} 字节，超过单条上限 ${MAX_RECORD_BYTES} 字节` });
  }

  const spec = STORE_SPECS[store] ?? {};
  const record: Record<string, unknown> = { ...raw };

  // 历史导入的数据里存在字符串数字（`"10"`）：能无损转成数字就转，转不了留给类型校验报错
  for (const field of uniq(spec.numbers)) {
    const value = record[field];
    if (typeof value === 'string' && NUMERIC_TEXT.test(value.trim())) {
      record[field] = Number(value.trim());
    }
  }
  for (const field of uniq(spec.ints)) {
    const value = record[field];
    if (typeof value === 'string' && NUMERIC_TEXT.test(value.trim())) {
      record[field] = Number(value.trim());
    }
  }
  // 同理：历史数据里偶见 `"true"` / `"false"` 字符串布尔，能无损转就转
  for (const field of uniq(spec.booleans)) {
    const value = record[field];
    if (value === 'true') record[field] = true;
    else if (value === 'false') record[field] = false;
  }

  const missing = (value: unknown) => value === undefined || value === null;

  for (const field of uniq(spec.numbers)) {
    const value = record[field];
    if (missing(value)) continue;
    if (!isFiniteNumber(value)) {
      issues.push({ field, message: `${field} 必须是数字，收到 ${typeName(value)}` });
    } else if (value < 0) {
      issues.push({ field, message: `${field} 不能为负数（收到 ${value}）` });
    }
  }
  for (const field of uniq(spec.ints)) {
    const value = record[field];
    if (missing(value)) continue;
    if (!isFiniteNumber(value)) {
      issues.push({ field, message: `${field} 必须是数字，收到 ${typeName(value)}` });
    } else if (!Number.isInteger(value)) {
      issues.push({ field, message: `${field} 必须是整数（收到 ${value}）` });
    } else if (value < 0) {
      issues.push({ field, message: `${field} 不能为负数（收到 ${value}）` });
    }
  }
  for (const field of uniq(spec.strings)) {
    const value = record[field];
    if (missing(value)) continue;
    if (typeof value !== 'string') {
      issues.push({ field, message: `${field} 必须是字符串，收到 ${typeName(value)}` });
    } else if (value.length > MAX_TEXT_LENGTH) {
      issues.push({ field, message: `${field} 超过 ${MAX_TEXT_LENGTH} 个字符` });
    }
  }
  for (const field of uniq(spec.stringArrays)) {
    const value = record[field];
    if (missing(value)) continue;
    if (!Array.isArray(value)) {
      issues.push({ field, message: `${field} 必须是数组，收到 ${typeName(value)}` });
      continue;
    }
    if (value.length > MAX_ARRAY_ITEMS) {
      issues.push({ field, message: `${field} 元素过多（${value.length} 个，上限 ${MAX_ARRAY_ITEMS}）` });
      continue;
    }
    const badIndex = value.findIndex((item) => typeof item !== 'string');
    if (badIndex >= 0) {
      issues.push({ field, message: `${field}[${badIndex}] 必须是字符串，收到 ${typeName(value[badIndex])}` });
    }
  }
  for (const field of uniq(spec.arrays)) {
    const value = record[field];
    if (missing(value)) continue;
    if (!Array.isArray(value)) {
      issues.push({ field, message: `${field} 必须是数组，收到 ${typeName(value)}` });
    } else if (value.length > MAX_ARRAY_ITEMS) {
      issues.push({ field, message: `${field} 元素过多（${value.length} 个，上限 ${MAX_ARRAY_ITEMS}）` });
    }
  }
  for (const field of uniq(spec.objects)) {
    const value = record[field];
    if (missing(value)) continue;
    if (!isPlainObject(value)) {
      issues.push({ field, message: `${field} 必须是对象，收到 ${typeName(value)}` });
    }
  }
  for (const field of uniq(spec.booleans)) {
    const value = record[field];
    if (missing(value)) continue;
    if (typeof value !== 'boolean') {
      issues.push({ field, message: `${field} 必须是布尔值，收到 ${typeName(value)}` });
    }
  }

  // 核心字段与枚举只在新建时强制：存量记录普遍缺后加字段，更新时强制会把老记录锁死
  // 更新期保护：库里已有的核心字段必须在请求里出现，否则就是整条覆盖把它擦掉了
  if (options.existing) {
    for (const field of spec.core ?? []) {
      const previous = options.existing[field];
      const previousHasValue = !missing(previous) && !(typeof previous === 'string' && previous.trim() === '');
      if (!previousHasValue) continue;
      const next = record[field];
      const nextIsEmpty = missing(next) || (typeof next === 'string' && next.trim() === '');
      if (nextIsEmpty) {
        issues.push({
          field,
          message: `${field} 已有值，更新时不能丢掉（PUT 是整条覆盖，请带上原值）`,
        });
      }
    }
  }

  if (options.requireCore) {
    for (const field of spec.core ?? []) {
      const value = record[field];
      const empty = missing(value) || (typeof value === 'string' && value.trim() === '');
      if (empty) issues.push({ field, message: `新建记录缺少必填字段 ${field}` });
    }
    for (const [field, allowed] of Object.entries(spec.enum ?? {})) {
      const value = record[field];
      if (missing(value)) continue;
      if (typeof value !== 'string' || !allowed.includes(value)) {
        issues.push({ field, message: `${field} 取值必须是 ${allowed.join(' / ')} 之一（收到 ${String(value)}）` });
      }
    }
  }

  if (issues.length > 0) return { ok: false, record: {} as AnyRecord, issues };
  return { ok: true, record: record as AnyRecord, issues: [] };
}

/** 把校验问题拼成一句可读的错误信息（最多列 3 条，其余折叠） */
export function describeIssues(issues: RecordIssue[], limit = 3): string {
  const shown = issues.slice(0, limit).map((issue) => (issue.field ? `${issue.field}：${issue.message}` : issue.message));
  const rest = issues.length - shown.length;
  return rest > 0 ? `${shown.join('；')}；另有 ${rest} 处问题` : shown.join('；');
}

/**
 * 批量校验：任一条不合法就整体失败（部分写入会让客户端无法判断哪些生效）。
 * 错误信息带序号与 id，方便定位。
 */
export interface BatchValidationOptions {
  /** 返回库里已有的那条记录；undefined 表示不存在（按新建校验） */
  existingOf?: (id: string) => Record<string, unknown> | undefined;
  /**
   * 一律按「已存在」处理（快照 / 备份导入）。
   * 老备份本来就缺后加字段，逐条查库也查不出对应行，强制核心字段会直接拦死恢复流程。
   */
  assumeExisting?: boolean;
}

export function validateRecordBatch(
  store: string,
  records: unknown[],
  options: BatchValidationOptions = {},
): { ok: boolean; records: AnyRecord[]; message: string } {
  const valid: AnyRecord[] = [];
  const problems: string[] = [];
  records.forEach((raw, index) => {
    const id = isPlainObject(raw) && typeof raw.id === 'string' ? raw.id : '';
    const existing = options.assumeExisting ? {} : options.existingOf?.(id);
    const result = validateRecordPayload(store, raw, {
      requireCore: !existing,
      ...(existing ? { existing } : {}),
    });
    if (!result.ok) {
      problems.push(`第 ${index + 1} 条${id ? `（${id}）` : ''}：${describeIssues(result.issues, 2)}`);
      return;
    }
    valid.push(result.record);
  });
  if (problems.length > 0) {
    const shown = problems.slice(0, 5);
    const rest = problems.length - shown.length;
    return {
      ok: false,
      records: [],
      message: `${shown.join('；')}${rest > 0 ? `；另有 ${rest} 条不合法` : ''}`,
    };
  }
  return { ok: true, records: valid, message: '' };
}
