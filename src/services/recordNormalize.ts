/**
 * 历史记录结构补全（读侧归一化）
 *
 * 背景：业务字段是一版一版加进来的（`errorCategories` / `paperQuestions` / `rootCauses` …），
 * 早期写进库里的记录里这些字段**压根不存在**。类型上它们被标成必填数组，
 * 运行时却是 `undefined`，于是渲染期 `record.errorCategories.length` 或
 * `for (const c of record.errorCategories)` 直接抛 `undefined is not an object`
 * → React 卸载整棵树 → 整页白屏，且控制台没有任何可读线索。
 *
 * 线上事故（2026-11-17）：首页 `/` 白屏，堆栈落在
 * `aggregateBySubject` 的错因热区统计 `for (const cat of r.errorCategories)`。
 * 同年 11 月的 PDCA 白屏（`rootCauses is not iterable`）是同一类问题。
 *
 * 设计原则：
 * - 只补「被当成数组/数字直接使用」的字段，绝不改动可选字段的 `undefined` 语义
 *   （很多地方用 `a ?? b` 兜底，把 undefined 改成 '' 会悄悄改变取值顺序）；
 * - 字段本身合法时原样返回同一个对象引用，正常记录零拷贝；
 * - 归一化放在读出口（localDB），所有页面与统计函数共享同一份兜底。
 */

type AnyRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is AnyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * 训练记录：补齐早期版本缺失的错因数组与题量字段。
 *
 * - `errorCategories` 必填数组 → 缺省 `[]`（首页热区、列表页错因徽标都直接 `.length`）
 * - `totalQuestions` / `errorCount` 参与 reduce 求和 → 缺失会让整科汇总变 NaN
 * - `correctCount` 缺失时用「总题量 - 错题数」推导，避免显示 0 正确
 * - `date` / `subject` 参与排序与分组 → 缺失至少不要抛异常
 */
export function normalizeTrainingRecord<T extends AnyRecord>(raw: T): T {
  const hasCategories = Array.isArray(raw.errorCategories);
  const hasCounts =
    typeof raw.totalQuestions === 'number' &&
    typeof raw.correctCount === 'number' &&
    typeof raw.errorCount === 'number';
  const hasText = typeof raw.date === 'string' && typeof raw.subject === 'string';
  if (hasCategories && hasCounts && hasText) return raw;

  const total = asCount(raw.totalQuestions);
  const errors = asCount(raw.errorCount);
  const correct =
    typeof raw.correctCount === 'number' && Number.isFinite(raw.correctCount)
      ? raw.correctCount
      : Math.max(0, total - errors);

  return {
    ...raw,
    date: asText(raw.date),
    subject: asText(raw.subject),
    totalQuestions: total,
    correctCount: correct,
    errorCount: errors,
    errorCategories: asArray(raw.errorCategories),
  } as T;
}

/** 套卷里的分题：老记录的 paperQuestions 元素可能缺 errorCategories */
function normalizePaperQuestion(question: unknown): unknown {
  if (!isPlainObject(question)) return question;
  if (Array.isArray(question.errorCategories)) return question;
  return { ...question, errorCategories: [] };
}

/**
 * 主观题作答：补齐整卷错因与套卷分题结构。
 *
 * `paperQuestions` 里的每条分题同样要补，否则 flattenSubjectiveQuestions
 * 摊平后渲染「错因」区块时会在分题上再次白屏。
 */
export function normalizeSubjectiveAnswer<T extends AnyRecord>(raw: T): T {
  const rawQuestions = raw.paperQuestions;
  const questionsValid =
    Array.isArray(rawQuestions) && rawQuestions.every((q) => !isPlainObject(q) || Array.isArray(q.errorCategories));
  if (Array.isArray(raw.errorCategories) && questionsValid) return raw;

  const questions = Array.isArray(rawQuestions) ? rawQuestions.map(normalizePaperQuestion) : [];
  return {
    ...raw,
    errorCategories: asArray(raw.errorCategories),
    paperQuestions: questions,
  } as T;
}

/**
 * 声明式字段补全规则：只覆盖「被当成必填直接使用」的字段。
 *
 * 判定标准：类型里是必填（`T[]` / `string` / `number`），且代码里存在
 * `.map` / `.join` / `.length` / `for…of` / `.split` / `.slice` 这样的裸调用。
 * 这类字段一旦缺失，渲染期就抛异常 → React 卸载整棵树 → 白屏。
 *
 * 这些表的历史记录来自早期版本或外部导入，服务端不校验必填字段，
 * 所以读侧必须自己兜住。可选字段（`xxx?:`）不在此列，它们已有 `??` 兜底，
 * 强行补默认值反而会改变 `a ?? b` 的取值顺序。
 */
interface StoreFieldRules {
  array?: string[];
  text?: string[];
  count?: string[];
  /** 嵌套对象字段：缺失时补 {}，避免 `record.routes.expertBias` 这类访问抛错 */
  object?: string[];
}

const STORE_RULES: Record<string, StoreFieldRules> = {
  // 阶段计划：focusModules/focusAbilities 缺一个，共享时间轴 useMemo 就炸 → 全站白屏
  stagePlans: {
    array: ['focusModules', 'focusAbilities'],
    text: ['startDate', 'endDate', 'stage'],
  },
  // 能力缺口：abilityPath 被 `split('/')` 直接调用（瓶颈文案、雷达）
  gaps: {
    array: ['sourceRecordIds', 'statusHistory'],
    text: ['abilityPath', 'subject', 'status', 'errorCategory'],
    count: ['occurrenceCount'],
  },
  // 面试记录：problemTags 是历史兼容字段，新记录可能不写
  interviewRecords: {
    array: ['problemTags'],
    text: ['questionType', 'date'],
    count: ['thinkingSec', 'answerSec'],
  },
  // 周清单：entries 被 `.length` / `.every` 直接使用
  weeklyChecklists: {
    array: ['entries'],
    text: ['weekStart'],
  },
  // PDCA 自定义工具：appliesTo 被 `.map` 直接使用
  customTools: {
    array: ['appliesTo'],
    text: ['name', 'url', 'embedType'],
  },
  // 职业报告：generatedAt 被 `.slice(0,10)` 直接使用，routes 是嵌套对象
  careerReports: {
    array: ['survivors', 'vetoed', 'bottomLineNotes'],
    text: ['generatedAt', 'quadrant'],
    object: ['routes'],
  },
  // 间隔复习：intervals 被 `.length` 直接使用（时间线页列出复习进度）
  spacedReviews: {
    array: ['intervals', 'completedDates'],
    text: ['abilityPath', 'nextDueDate', 'status'],
    count: ['currentIndex'],
  },
  // PDCA 问题：老记录没有后加的数组字段（详情页白屏的原因之一），
  // pdca.ts 的 normalizeProblem 已处理，这里再兜一层给其它读者
  pdcaProblems: {
    array: ['rootCauses', 'countermeasures', 'checkEntries', 'cycleHistory'],
    text: ['title', 'currentStage'],
  },
  // 自由练习/错题复盘：problemTags / quickPhrases / relatedGapIds 都被直接渲染
  corrections: {
    array: ['problemTags', 'quickPhrases', 'relatedGapIds'],
    text: ['scenario', 'suggestion', 'date'],
  },
  // 学生档案：subjects 参与列表与筛选
  students: {
    array: ['subjects'],
    text: ['name'],
  },
  // 修复任务：abilityPath 参与展示与过滤
  tasks: {
    text: ['abilityPath', 'status', 'type'],
  },
  // 任务模板：name 用于下拉选项
  templates: {
    text: ['name'],
  },
};

/** 补齐规则里的字段；没有缺失时返回原对象 */
function applyFieldRules<T extends AnyRecord>(raw: T, rules: StoreFieldRules): T {
  let next = raw;
  const ensure = (field: string, value: unknown) => {
    next = { ...next, [field]: value } as T;
  };
  for (const field of rules.array ?? []) {
    if (!Array.isArray(raw[field])) ensure(field, []);
  }
  for (const field of rules.text ?? []) {
    if (typeof raw[field] !== 'string') ensure(field, '');
  }
  for (const field of rules.count ?? []) {
    const value = raw[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) ensure(field, 0);
  }
  for (const field of rules.object ?? []) {
    if (!isPlainObject(raw[field])) ensure(field, {});
  }
  return next;
}

/**
 * 按表分派归一化。
 *
 * 前两张表的结构变动最频繁（错因、套卷分题），单独做特化；
 * 其余表用声明式规则补齐「必填但历史/导入可能缺失」的字段。
 * 一个 `stagePlans.focusModules` 缺失就能让共享的时间轴 useMemo 抛错，
 * 进而拖垮整站的每一个路由 —— 所以这里宁可补默认值，也不要让读侧裸奔。
 */
export function normalizeStoreRecord(store: string, raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw;
  switch (store) {
    case 'trainings':
      return normalizeTrainingRecord(raw);
    case 'subjectiveAnswers':
      return normalizeSubjectiveAnswer(raw);
    default: {
      const rules = STORE_RULES[store];
      return rules ? applyFieldRules(raw, rules) : raw;
    }
  }
}

/**
 * 批量归一化：全部记录都合法时返回原数组，不制造新数组。
 */
export function normalizeStoreRecords<T>(store: string, list: T[]): T[] {
  let changed = false;
  const next = list.map((record) => {
    const normalized = normalizeStoreRecord(store, record) as T;
    if (normalized !== record) changed = true;
    return normalized;
  });
  return changed ? next : list;
}
