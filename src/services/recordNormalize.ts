/**
 * 历史记录结构补齐（读侧）
 *
 * ## 设计原则（2026-11-18 修订：不伪造数据）
 *
 * 早期版本这里会给缺失的字段填默认值（`totalQuestions: 0` / `status: ''`）。
 * 那个做法能防白屏，但会把「没有记录」伪装成「值为 0 / 空字符串」，污染统计口径：
 * - `totalQuestions` 补 0 → 一条缺题量的记录照样进分母，把整科正确率拉低；
 *   项目既有的数据契约恰好相反（`tests/dataContract.test.ts`：缺失不当 0、不进加权分母）；
 * - `gaps.occurrenceCount` 补 0 → `weightSeverity × 0 = 0`，严重的缺口在排行里直接消失
 *   （新建缺口时它就是 1，缺失时的真值下界也是 1）；
 * - `status` / `stage` 补 '' → 会落进「其他」分组，和真正的「未分类」混在一起。
 *
 * 所以现在按字段语义分三种处理：
 *
 * 1. **数组字段 → 补 `[]`**：没有条目就是空集合，语义正确，而且能挡住
 *    `.map` / `.length` / `for…of` 这类裸调用（白屏的直接原因）。
 * 2. **有业务下界的计数 → 给真值**：`occurrenceCount: 1`、`currentIndex: 0`、
 *    `correctCount = totalQuestions - errorCount`（可验算，不是瞎猜）。
 * 3. **其余数字 / 文本 → 保持缺失**：由统计层过滤（不计入分母）、展示层显示「—」。
 *    不填 0、不填空串。
 *
 * 字段本身合法时原样返回同一个对象引用，正常记录零拷贝。
 */

type AnyRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is AnyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * 训练记录：补错因数组，缺失的正确数按「总题量 - 错题数」推导。
 *
 * 注意这里**不补** `totalQuestions` / `errorCount` / `date` / `subject`：
 * 这几个字段补 0 或空串会让「缺数据」混进统计与排序。缺题量的记录由
 * `analytics.ts` 的 `measurableTrainings()` 过滤掉，不参与正确率分母。
 *
 * `correctCount` 是唯一例外：它可以从另外两个字段验算出来，属于真值而非猜测；
 * 但两个输入缺任意一个时也不推导。
 */
export function normalizeTrainingRecord<T extends AnyRecord>(raw: T): T {
  const hasCategories = Array.isArray(raw.errorCategories);
  const canDeriveCorrect = isCount(raw.totalQuestions) && isCount(raw.errorCount);
  const correctMissing = !isCount(raw.correctCount);
  if (hasCategories && (!correctMissing || !canDeriveCorrect)) return raw;

  const next: AnyRecord = { ...raw };
  if (!hasCategories) next.errorCategories = [];
  if (correctMissing && canDeriveCorrect) {
    next.correctCount = Math.max(0, (raw.totalQuestions as number) - (raw.errorCount as number));
  }
  return next as T;
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
 * 声明式规则：只处理「缺失会导致裸调用崩溃」的数组，以及有明确业务下界的计数。
 *
 * 判定标准：类型里是必填数组（`T[]`），且代码里存在 `.map` / `.join` / `.length` /
 * `for…of` 这样不带守卫的调用。文本与普通数字不在此列 —— 它们缺失时该显示「未知」，
 * 而不是 0 或空串（见文件头的三种处理）。
 */
interface StoreFieldRules {
  /** 缺失即「空集合」，补 [] 语义正确 */
  array?: string[];
  /** 缺失时按业务下界给真值（不是 0），例如缺口至少出现过 1 次 */
  seedCount?: Record<string, number>;
  /** 嵌套对象字段：缺失时补 {}，避免 `record.routes.expertBias` 这类访问抛错 */
  object?: string[];
}

const STORE_RULES: Record<string, StoreFieldRules> = {
  // 阶段计划：focusModules/focusAbilities 缺一个，共享时间轴 useMemo 就炸 → 全站白屏
  stagePlans: { array: ['focusModules', 'focusAbilities'] },
  // 能力缺口：abilityPath 被 `split('/')` 直接调用（瓶颈文案、雷达）；
  // occurrenceCount 是缺口权重，缺失按 1 计（新建时就是 1，补 0 会让它从排行里消失）
  gaps: {
    array: ['sourceRecordIds', 'statusHistory'],
    seedCount: { occurrenceCount: 1 },
  },
  // 面试记录：problemTags 是历史兼容字段，新记录可能不写
  interviewRecords: { array: ['problemTags'] },
  // 周清单：entries 被 `.length` / `.every` 直接使用
  weeklyChecklists: { array: ['entries'] },
  // PDCA 自定义工具：appliesTo 被 `.map` 直接使用
  customTools: { array: ['appliesTo'] },
  // 职业报告：routes 是嵌套对象；其余数组被直接渲染
  careerReports: { array: ['survivors', 'vetoed', 'bottomLineNotes'], object: ['routes'] },
  // 间隔复习：intervals 被 `.length` 直接使用；currentIndex 未开始时确实是 0
  spacedReviews: { array: ['intervals', 'completedDates'], seedCount: { currentIndex: 0 } },
  // PDCA 问题：老记录没有后加的数组字段（详情页白屏的原因之一）
  pdcaProblems: { array: ['rootCauses', 'countermeasures', 'checkEntries', 'cycleHistory'] },
  // 自由练习/错题复盘：这些数组都被直接 `for…of` 渲染
  corrections: { array: ['problemTags', 'quickPhrases', 'relatedGapIds'] },
  // 学生档案：subjects 参与列表与筛选
  students: { array: ['subjects'] },
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
  for (const [field, seed] of Object.entries(rules.seedCount ?? {})) {
    if (!isCount(raw[field])) ensure(field, seed);
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
 * 其余表用声明式规则补齐「必填但历史/导入可能缺失」的数组字段。
 * 一个 `stagePlans.focusModules` 缺失就能让共享的时间轴 useMemo 抛错，
 * 进而拖垮整站的每一个路由 —— 数组必须兜住；数字与文本则保持缺失的诚实语义。
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
