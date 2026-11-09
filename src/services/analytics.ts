/**
 * 能力分析引擎
 * P0: 学科聚合 / 错误复现 / 雷达 / 增长曲线 / 短板优先级
 * P1: 瓶颈识别 / 训练收益 / 阶段报告 / 预警
 * P2: 能力关联分析 / 边际收益 / 恶性反馈回路 / 杠杆点
 */
import { v4 as uuid } from 'uuid';
import type {
  AbilityGap,
  AbilitySnapshot,
  AbilityRadarSlice,
  ErrorCategory,
  ExamRegistration,
  GapStatusHistoryItem,
  GradeLevel,
  LabelStat,
  MasteryLevel,
  StudentProfile,
  Subject,
  SubjectiveAnswer,
  TrainingRecord,
  TrainingType,
  WarningItem,
  WarningLevel,
} from '../domain/types';
import { scoreToLevel, TRAINING_TYPE_LABEL } from '../domain/types';
import { getRadarDimensions } from '../domain/abilityTags';
import { normalizeModule, pathBelongsToModule } from '../domain/moduleNormalize';
import { isStandardMinutesInferred } from '../domain/paperStructure';

/**
 * ============ 口径统一（唯一来源，2026-11-09 用户验收缺陷 #4/#5/#6） ============
 *
 * 1) 掌握度：全站只有「学科掌握度」一套算法 ——
 *    0.7 × 陌生题正确率 + 0.3 × 整体正确率；无陌生题样本时退化为整体正确率。
 *    模块层记录没有稳定的陌生题样本，因此模块不复用该加权公式，UI 统一命名为「模块正确率」，
 *    避免同叫「掌握度」却不同算法。
 * 2) 目标分：全站只读报名表的目标分（见 resolveTargetPlan），优先按科目取
 *    `subjectPlans[subject]`，老记录回退到顶层 `targetScore`；不再使用写死的 80 / 85 / 95 目标线。
 * 3) 时间窗口：全站共用 `TimeWindow`（src/services/timeWindow.ts），指标标题自动带窗口。
 */
export function computeMasteryScore(
  correctRate: number,
  unfamiliarCorrectRate: number | null,
): number {
  return Math.round(
    unfamiliarCorrectRate === null
      ? correctRate * 100
      : (unfamiliarCorrectRate * 0.7 + correctRate * 0.3) * 100,
  );
}

/**
 * 一组记录的统一掌握度（0-100）。
 * 与 `aggregateBySubject` 完全同一公式：先汇总题数/错误/陌生题样本，再套 `computeMasteryScore`。
 * 供 ROI、退步检测等「按时间段比较」的场景使用，避免与学科掌握度出现两套口径。
 */
export function pooledMasteryScore(records: TrainingRecord[]): number {
  const q = records.reduce((s, r) => s + r.totalQuestions, 0);
  const err = records.reduce((s, r) => s + r.errorCount, 0);
  const correctRate = q === 0 ? 0 : (q - err) / q;
  const unfamiliar = records.filter((r) => r.isUnfamiliar);
  const uq = unfamiliar.reduce((s, r) => s + r.totalQuestions, 0);
  const uerr = unfamiliar.reduce((s, r) => s + r.errorCount, 0);
  return computeMasteryScore(correctRate, uq === 0 ? null : (uq - uerr) / uq);
}

export interface SubjectStats {
  subject: Subject;
  totalQuestions: number;
  totalErrors: number;
  totalDurationMinutes: number;
  correctRate: number;
  /** 陌生题正确率;仅当存在陌生题记录时有效,否则为 null */
  unfamiliarCorrectRate: number | null;
  /** 陌生题样本数,便于 UI 展示"暂无陌生题数据" */
  unfamiliarSampleSize: number;
  masteryScore: number;
  level: MasteryLevel;
  errorHotspots: Array<{ category: ErrorCategory; count: number }>;
}

export function aggregateBySubject(rawRecords: TrainingRecord[]): SubjectStats[] {
  // A1 口径：同一 examId 有整卷行时以整卷为准，模块行不重复计入学科统计
  const records = selectAggregationRecords(rawRecords);
  const bySubject = new Map<Subject, TrainingRecord[]>();
  for (const r of records) {
    const list = bySubject.get(r.subject) ?? [];
    list.push(r);
    bySubject.set(r.subject, list);
  }
  const stats: SubjectStats[] = [];
  for (const [subject, list] of bySubject) {
    const totalQuestions = list.reduce((s, r) => s + r.totalQuestions, 0);
    const totalErrors = list.reduce((s, r) => s + r.errorCount, 0);
    const totalCorrect = totalQuestions - totalErrors;
    const totalDurationMinutes = list.reduce((s, r) => s + (r.durationMinutes ?? 0), 0);
    const correctRate = totalQuestions === 0 ? 0 : totalCorrect / totalQuestions;

    // V5.11 Bug #007 修复:陌生题正确率严格按 isUnfamiliar 标记的记录计算,
    // 若无陌生题样本则显式返回 null,UI 可显示"暂无陌生题数据",避免与整体正确率混淆。
    const unfamiliar = list.filter((r) => r.isUnfamiliar);
    const unfamiliarQ = unfamiliar.reduce((s, r) => s + r.totalQuestions, 0);
    const unfamiliarErr = unfamiliar.reduce((s, r) => s + r.errorCount, 0);
    const unfamiliarCorrectRate = unfamiliarQ === 0 ? null : (unfamiliarQ - unfamiliarErr) / unfamiliarQ;
    // 掌握度评分:陌生题占主导 (0.7),缺失时退化为整体正确率 (0.3 权重也归给整体)
    const masteryScore = computeMasteryScore(correctRate, unfamiliarCorrectRate);

    const errorCounter = new Map<ErrorCategory, number>();
    for (const r of list) {
      for (const cat of r.errorCategories) {
        errorCounter.set(cat, (errorCounter.get(cat) ?? 0) + 1);
      }
    }
    const errorHotspots = Array.from(errorCounter.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    stats.push({
      subject,
      totalQuestions,
      totalErrors,
      totalDurationMinutes,
      correctRate,
      unfamiliarCorrectRate,
      unfamiliarSampleSize: unfamiliarQ,
      masteryScore,
      level: scoreToLevel(masteryScore),
      errorHotspots,
    });
  }
  return stats;
}

/** ============ F-03 / A1 整卷与模块不重复聚合 ============ */

/**
 * 记录级「有效性与聚合角色」的唯一判定入口（2026-11-09 双算修复）。
 *
 * 三级过滤规则：
 * 1. `validity === 'duplicate'`：重复导入行，任何统计/计数/用时求和都排除；
 *    缺省时视为正常记录（历史数据没打标记不代表重复）。
 * 2. `aggregationRole === 'derived'`：跨日期 topic 聚合行，不参与任何聚合，
 *    否则会与原始行双算（该批 43 行带 1,813 题）。
 * 3. 同日期同科目优先取整卷：`full_paper` 压制同日同科目的 `module_detail`。
 */
export type ResolvedAggregationRole = 'full_paper' | 'module_detail' | 'derived' | 'standalone';

/**
 * 解析聚合角色。
 * 优先读显式 `aggregationRole`；历史记录缺该字段时按已有 `scope` 兼容映射
 * （full→full_paper、module→module_detail）；两者都缺失视为 `standalone`。
 *
 * 缺失字段的处理理由：既不默认整卷（会误压同日的模块明细），也不默认排除
 * （历史记录占多数且是真实训练，排除会凭空丢数据），而是作为独立记录原样参与聚合。
 */
export function resolveAggregationRole(record: TrainingRecord): ResolvedAggregationRole {
  if (record.aggregationRole === 'derived') return 'derived';
  if (record.aggregationRole === 'full_paper') return 'full_paper';
  if (record.aggregationRole === 'module_detail') return 'module_detail';
  if (record.scope === 'full') return 'full_paper';
  if (record.scope === 'module') return 'module_detail';
  return 'standalone';
}

/** 仅保留可参与统计的记录：排除重复导入行与跨日期聚合行 */
export function selectValidRecords(records: TrainingRecord[]): TrainingRecord[] {
  return records.filter(
    (r) => r.validity !== 'duplicate' && resolveAggregationRole(r) !== 'derived',
  );
}

const hasExamId = (r: TrainingRecord): string | null => (r.examId ? r.examId : null);

/**
 * 学科级聚合去重：
 * - 先剔除 `duplicate` 与 `derived`；
 * - 压制只在同一个 `examId` 内发生：该 examId 存在整卷行时排除它的模块明细；
 * - 不同 examId 之间互不影响；
 * - **没有 examId 的记录不做任何压制**，各自独立计入（历史数据 228 条无 examId，
 *   用日期+科目去压等于拿猜测当证据，会把「上午专项、晚上整卷」误判成同一次）；
 * - 缺 aggregationRole 的老记录按 scope 映射角色，但同样只在有 examId 时参与压制。
 */
export function selectAggregationRecords(records: TrainingRecord[]): TrainingRecord[] {
  const valid = selectValidRecords(records);
  const fullByExam = new Set<string>();
  for (const r of valid) {
    if (resolveAggregationRole(r) !== 'full_paper') continue;
    const examId = hasExamId(r);
    if (examId) fullByExam.add(examId);
  }
  return valid.filter((r) => {
    if (resolveAggregationRole(r) !== 'module_detail') return true;
    const examId = hasExamId(r);
    return !(examId && fullByExam.has(examId));
  });
}

/** ============ F-04 / A2 模块统计与周环比 ============ */

/**
 * 模块级去重（F-03 模块口径）：
 * - 先剔除 `duplicate` 与 `derived`；
 * - 压制只在同一个 `examId` 内发生：该 examId 存在模块明细时排除它的整卷行，保留模块明细；
 * - 只有整卷时保留整卷，避免整卷数据整体丢失；
 * - **没有 examId 的记录不做任何压制**，整卷与模块各自独立计入。
 * 时间分配、模块统计、雷达的模块兜底统一使用本函数。
 */
export function selectModuleLevelRecords(records: TrainingRecord[]): TrainingRecord[] {
  const valid = selectValidRecords(records);
  const modulesByExam = new Set<string>();
  for (const r of valid) {
    if (resolveAggregationRole(r) !== 'module_detail') continue;
    const examId = hasExamId(r);
    if (examId) modulesByExam.add(examId);
  }
  return valid.filter((r) => {
    if (resolveAggregationRole(r) !== 'full_paper') return true;
    const examId = hasExamId(r);
    return !(examId && modulesByExam.has(examId));
  });
}

export interface ModuleStatsItem {
  subject: Subject;
  module: string;
  totalQuestions: number;
  totalErrors: number;
  correctRate: number | null;
  masteryScore: number | null;
  totalDurationMinutes: number;
  avgMinutesPerQuestion: number | null;
  sampleCount: number;
  lastSeenAt: string | null;
}

/**
 * 模块级聚合：排除整卷行、保留模块行，按一级模块归并。
 * 无题量样本时 correctRate / masteryScore / avgMinutesPerQuestion 为 null（不补 0）。
 */
export function buildModuleStats(records: TrainingRecord[]): ModuleStatsItem[] {
  // 模块级口径（PRD F-03）：整卷与模块并存时排除整卷行、保留模块明细，
  // 不套用学科级 A1 去重，否则有整卷行时模块明细会整体消失。
  const moduleRecords = selectModuleLevelRecords(records);

  const groups = new Map<string, { subject: Subject; module: string; list: TrainingRecord[] }>();
  for (const r of moduleRecords) {
    const module = normalizeModule(r.module, r.subject, r.gradeLevel);
    if (!module) continue;
    const key = `${r.subject}::${module}`;
    const group = groups.get(key) ?? { subject: r.subject, module, list: [] };
    group.list.push(r);
    groups.set(key, group);
  }

  const stats: ModuleStatsItem[] = [];
  for (const { subject, module, list } of groups.values()) {
    const totalQuestions = list.reduce((s, r) => s + r.totalQuestions, 0);
    const totalErrors = list.reduce((s, r) => s + r.errorCount, 0);
    const totalDurationMinutes = list.reduce((s, r) => s + (r.durationMinutes ?? 0), 0);
    const correctRate =
      totalQuestions === 0 ? null : (totalQuestions - totalErrors) / totalQuestions;
    const masteryScore = correctRate === null ? null : Math.round(correctRate * 100);
    const avgMinutesPerQuestion =
      totalQuestions === 0 ? null : +(totalDurationMinutes / totalQuestions).toFixed(2);
    const lastSeenAt = list.reduce<string | null>(
      (latest, r) => (latest === null || r.date > latest ? r.date : latest),
      null,
    );
    stats.push({
      subject,
      module,
      totalQuestions,
      totalErrors,
      correctRate,
      masteryScore,
      totalDurationMinutes,
      avgMinutesPerQuestion,
      sampleCount: list.length,
      lastSeenAt,
    });
  }
  return stats;
}

/** ============ 题型标签聚合（labelStats） ============ */

export interface LabelStatNode {
  /** 完整前缀路径，例如 ['资料分析', '综合分析'] */
  path: string[];
  depth: number;
  /** 该前缀下全部叶子作答次数之和 */
  questionCount: number;
  /** 该前缀下去重题量之和 */
  uniqueQuestionCount: number;
  correctCount: number;
  /** 正确率 0–100，保留一位小数 */
  rate: number;
  /** 该前缀下并列最深标签的作答次数之和 */
  multiLabelCount: number;
  /** 叶子来源汇总：全部官方 / 全部推断 / 混合 */
  labelSource: 'official' | 'inferred' | 'mixed';
  officialLeaves: number;
  inferredLeaves: number;
  children: LabelStatNode[];
}

/**
 * 题型标签行的有效口径：剔除重复导入行与跨日期聚合行（与 trainings 同一规则）。
 * 缺省字段视为正常行，避免把历史聚合行整批丢掉。
 */
export function selectValidLabelStats(leaves: LabelStat[]): LabelStat[] {
  return leaves.filter((l) => l.validity !== 'duplicate' && l.aggregationRole !== 'derived');
}

/**
 * 把 `labelStats` 的叶子行按 `path` 前缀向上卷成树。
 * 叶子之间互斥（每题只记最深一级主标签），因此父节点题量等于子节点之和，不会重复计数。
 * 排序：正确率从低到高（与排名页一致），同分时样本大的在前。
 */
export function buildLabelStats(leaves: LabelStat[]): LabelStatNode[] {
  const keyOf = (path: string[]) => path.join(' > ');
  const nodes = new Map<string, LabelStatNode>();
  for (const leaf of leaves) {
    if (!leaf.path || leaf.path.length === 0) continue;
    for (let i = 1; i <= leaf.path.length; i += 1) {
      const path = leaf.path.slice(0, i);
      const key = keyOf(path);
      let node = nodes.get(key);
      if (!node) {
        node = {
          path,
          depth: i,
          questionCount: 0,
          uniqueQuestionCount: 0,
          correctCount: 0,
          rate: 0,
          multiLabelCount: 0,
          labelSource: leaf.labelSource,
          officialLeaves: 0,
          inferredLeaves: 0,
          children: [],
        };
        nodes.set(key, node);
      }
      node.questionCount += leaf.questionCount;
      node.uniqueQuestionCount += leaf.uniqueQuestionCount;
      node.correctCount += leaf.correctCount;
      node.multiLabelCount += leaf.multiLabelCount;
    }
    // 来源只在「叶子」层计数，父节点的来源由子叶子汇总得出
    const leafNode = nodes.get(keyOf(leaf.path));
    if (leafNode) {
      if (leaf.labelSource === 'official') leafNode.officialLeaves += 1;
      else leafNode.inferredLeaves += 1;
    }
  }

  for (const node of nodes.values()) {
    node.rate =
      node.questionCount === 0 ? 0 : Math.round((node.correctCount / node.questionCount) * 1000) / 10;
    const parentKey = keyOf(node.path.slice(0, -1));
    const parent = node.depth > 1 ? nodes.get(parentKey) : undefined;
    if (parent) parent.children.push(node);
  }

  // 自底向上汇总来源计数，再判定 official / inferred / mixed
  const resolveSource = (node: LabelStatNode): void => {
    for (const child of node.children) resolveSource(child);
    if (node.children.length > 0) {
      node.officialLeaves = node.children.reduce((s, c) => s + c.officialLeaves, 0);
      node.inferredLeaves = node.children.reduce((s, c) => s + c.inferredLeaves, 0);
    }
    if (node.inferredLeaves === 0) node.labelSource = 'official';
    else if (node.officialLeaves === 0) node.labelSource = 'inferred';
    else node.labelSource = 'mixed';
  };

  const sortTree = (list: LabelStatNode[]) => {
    list.sort((a, b) => a.rate - b.rate || b.questionCount - a.questionCount);
    for (const node of list) sortTree(node.children);
  };
  const roots = Array.from(nodes.values()).filter((n) => n.depth === 1);
  for (const root of roots) resolveSource(root);
  sortTree(roots);
  return roots;
}

export interface WeeklyDelta {
  currentWeek: string;
  previousWeek: string | null;
  currentAcc: number;
  previousAcc: number | null;
  /** 百分数：15 表示 +15 个百分点 */
  deltaCorrectRate: number | null;
  deltaQuestions: number | null;
  deltaDurationMinutes: number | null;
}

/** 周一 00:00 起算的本地周键（结果形如 2026-11-09） */
function mondayWeekKey(dateISO: string): string {
  // 按本地年月日构造，避免 new Date('YYYY-MM-DD') 被当作 UTC 解析导致跨时区整周偏移
  const [y0, m0, d0] = dateISO.slice(0, 10).split('-').map(Number);
  const d = new Date(y0, (m0 ?? 1) - 1, d0 ?? 1);
  if (Number.isNaN(d.getTime())) return dateISO.slice(0, 10);
  const day = d.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * 学科周环比：当前周 = 有数据的最近一周，上一周 = 次近一周。
 * 只有一周数据时 previousWeek / delta 相关字段为 null。
 */
export function buildWeeklyDelta(records: TrainingRecord[], subject: Subject): WeeklyDelta | null {
  const scoped = selectAggregationRecords(records).filter((r) => r.subject === subject);
  if (scoped.length === 0) return null;

  const buckets = new Map<string, TrainingRecord[]>();
  for (const r of scoped) {
    const key = mondayWeekKey(r.date);
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }
  const weeks = Array.from(buckets.keys()).sort().reverse();
  const currentWeek = weeks[0];
  const previousWeek = weeks[1] ?? null;

  const summarize = (list: TrainingRecord[]) => {
    const questions = list.reduce((s, r) => s + r.totalQuestions, 0);
    const errors = list.reduce((s, r) => s + r.errorCount, 0);
    const duration = list.reduce((s, r) => s + (r.durationMinutes ?? 0), 0);
    const acc = questions === 0 ? 0 : +(((questions - errors) / questions) * 100).toFixed(1);
    return { questions, duration, acc };
  };

  const current = summarize(buckets.get(currentWeek) ?? []);
  if (previousWeek === null) {
    return {
      currentWeek,
      previousWeek: null,
      currentAcc: current.acc,
      previousAcc: null,
      deltaCorrectRate: null,
      deltaQuestions: null,
      deltaDurationMinutes: null,
    };
  }
  const previous = summarize(buckets.get(previousWeek) ?? []);
  return {
    currentWeek,
    previousWeek,
    currentAcc: current.acc,
    previousAcc: previous.acc,
    deltaCorrectRate: +(current.acc - previous.acc).toFixed(1),
    deltaQuestions: current.questions - previous.questions,
    deltaDurationMinutes: current.duration - previous.duration,
  };
}

/** ============ F-05 / A3 限时达标 ============ */

/**
 * 推断标记判定统一委托给数据契约模块（src/domain/paperStructure.ts）：
 * 优先读结构化 `standardMinutesInferred`，历史记录缺该字段时回退 note 文本含「推断」。
 * 推断值不与真实用时混算，限时达标率只统计真实基准记录，推断记录单独计数。
 */
export function isInferredStandardMinutes(record: TrainingRecord): boolean {
  return isStandardMinutesInferred(record);
}

export function isTimedMet(record: TrainingRecord): boolean | null {
  if (record.standardMinutes === undefined || record.durationMinutes === undefined) return null;
  if (record.standardMinutes <= 0 || record.durationMinutes <= 0 || record.totalQuestions <= 0) return null;
  if (isInferredStandardMinutes(record)) return null;
  return record.durationMinutes <= record.standardMinutes;
}

export interface TimedCompliance {
  rate: number | null;
  /** 真实基准的有效样本数 */
  sampleSize: number;
  /** 被排除的推断基准记录数（不作为分母） */
  inferredSamples: number;
}

/** 仅统计可判定记录；推断基准与缺失基准都不进入分母，无样本时 rate=null */
export function timedComplianceRate(records: TrainingRecord[]): TimedCompliance {
  let met = 0;
  let sampleSize = 0;
  let inferredSamples = 0;
  for (const r of records) {
    if (isInferredStandardMinutes(r) && (r.standardMinutes ?? 0) > 0) {
      inferredSamples += 1;
      continue;
    }
    const result = isTimedMet(r);
    if (result === null) continue;
    sampleSize += 1;
    if (result) met += 1;
  }
  return {
    rate: sampleSize === 0 ? null : +((met / sampleSize) * 100).toFixed(1),
    sampleSize,
    inferredSamples,
  };
}

/** ============ F-08 / T1 目标分差 ============ */

export interface TargetGap {
  target: number;
  /** 无有效样本时为 null（不把缺失当 0 分展示） */
  current: number | null;
  gap: number | null;
  reached: boolean;
  /** 参与计算的有效题量（有效样本数） */
  sampleQuestions: number;
}

/**
 * 目标分为掌握度口径；targetScore 缺失或越界（<0 或 >100）返回 null。
 * current 为按题量加权的整体正确率；无有效样本时 current/gap 为 null，由 UI 显示「暂无样本」。
 */
export function computeTargetGap(stats: SubjectStats[], targetScore?: number): TargetGap | null {
  if (targetScore === undefined || targetScore === null) return null;
  if (!Number.isFinite(targetScore) || targetScore < 0 || targetScore > 100) return null;

  const totalQuestions = stats.reduce((s, item) => s + item.totalQuestions, 0);
  const totalCorrect = stats.reduce((s, item) => s + (item.totalQuestions - item.totalErrors), 0);
  if (totalQuestions === 0) {
    return { target: targetScore, current: null, gap: null, reached: false, sampleQuestions: 0 };
  }
  const current = Math.round((totalCorrect / totalQuestions) * 100);
  const gap = +(targetScore - current).toFixed(1);
  return { target: targetScore, current, gap, reached: gap <= 0, sampleQuestions: totalQuestions };
}

export interface TargetPlan {
  targetScore: number;
  examDate?: string;
}

function isValidTarget(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * 从考试报名中解析指定科目的目标分与考试时间（0-100，掌握度口径）：
 * 1) 有 `subjectPlans` 的新记录只认该科目，绝不跨科目回退；
 * 2) 无 `subjectPlans` 的老记录，顶层 `targetScore` 作为该科目的历史目标；
 * 优先取最近一场未来考试，其次取最近一次已设置目标的报名；
 * 只取当前学员的记录，避免多学员串号；无有效目标返回 undefined。
 */
export function resolveTargetPlan(
  registrations: ExamRegistration[],
  studentId: string | undefined,
  subject: Subject,
  today = new Date().toISOString().slice(0, 10),
): TargetPlan | undefined {
  const candidates: TargetPlan[] = [];
  for (const r of registrations) {
    if (studentId !== undefined && r.studentId !== studentId) continue;
    if (r.subjectPlans) {
      const plan = r.subjectPlans[subject];
      // 已分科记录：该科目没填目标分就不参与，避免用行测目标分去算申论
      if (!plan || !isValidTarget(plan.targetScore)) continue;
      candidates.push({ targetScore: plan.targetScore, examDate: plan.examDate ?? r.examDate });
    } else if (isValidTarget(r.targetScore)) {
      candidates.push({ targetScore: r.targetScore, examDate: r.examDate });
    }
  }
  if (candidates.length === 0) return undefined;
  const dateOf = (c: TargetPlan) => c.examDate ?? '';
  const upcoming = candidates.filter((c) => dateOf(c) >= today).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  if (upcoming.length > 0) return upcoming[0];
  return [...candidates].sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0];
}

/** ============ F-09 / V1 时间分配 ============ */
export interface TimeAllocationItem {
  module: string;
  totalMinutes: number;
  share: number;
  avgMinutesPerQuestion: number | null;
  sessionCount: number;
}

/**
 * 仅统计有效用时（durationMinutes > 0），按模块级口径去重（整卷与模块并存时保留模块明细）、
 * 按一级模块归并；share 以有效总时长为分母，空集合返回 []。
 * 注：此前后用了学科级去重，导致「有整卷行时模块时间明细消失」，已按验收缺陷 #7 修正。
 */
export function buildTimeAllocation(records: TrainingRecord[]): TimeAllocationItem[] {
  const timed = selectModuleLevelRecords(records).filter((r) => (r.durationMinutes ?? 0) > 0);

  const groups = new Map<string, { module: string; minutes: number; questions: number; sessions: number }>();
  for (const r of timed) {
    const module = normalizeModule(r.module, r.subject, r.gradeLevel);
    if (!module) continue;
    const group = groups.get(module) ?? { module, minutes: 0, questions: 0, sessions: 0 };
    group.minutes += r.durationMinutes ?? 0;
    group.questions += r.totalQuestions;
    group.sessions += 1;
    groups.set(module, group);
  }

  const totalMinutes = Array.from(groups.values()).reduce((s, g) => s + g.minutes, 0);
  if (totalMinutes === 0) return [];

  return Array.from(groups.values())
    .map((g) => ({
      module: g.module,
      totalMinutes: +g.minutes.toFixed(1),
      share: +((g.minutes / totalMinutes) * 100).toFixed(1),
      avgMinutesPerQuestion: g.questions === 0 ? null : +(g.minutes / g.questions).toFixed(2),
      sessionCount: g.sessions,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/** ============ F-07 / S1 申论四维 ============ */

export interface SubjectiveDimensionSummary {
  samples: number;
  avg: {
    points: number | null;
    structure: number | null;
    language: number | null;
    logic: number | null;
  };
  weakest: string | null;
}

const DIMENSION_KEYS = ['points', 'structure', 'language', 'logic'] as const;

/**
 * 只统计存在 dimensionScores 的作答；每维只对已填值求平均；
 * weakest 为均值最低的维度（键名），无样本时为 null。
 */
export function buildSubjectiveDimensions(records: SubjectiveAnswer[]): SubjectiveDimensionSummary {
  // 只有至少填了一个维度分的作答才计入样本，避免空对象抬高 samples
  const scoped = records.filter(
    (r) =>
      r.dimensionScores !== undefined &&
      DIMENSION_KEYS.some((key) => {
        const v = r.dimensionScores?.[key];
        return typeof v === 'number' && Number.isFinite(v);
      }),
  );
  const avg = { points: null as number | null, structure: null as number | null, language: null as number | null, logic: null as number | null };

  if (scoped.length === 0) return { samples: 0, avg, weakest: null };

  for (const key of DIMENSION_KEYS) {
    const values = scoped
      .map((r) => r.dimensionScores?.[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    avg[key] = values.length === 0 ? null : +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
  }

  const ranked = DIMENSION_KEYS.filter((k) => avg[k] !== null).sort((a, b) => (avg[a] as number) - (avg[b] as number));
  return { samples: scoped.length, avg, weakest: ranked[0] ?? null };
}

export interface SubjectiveMastery {
  /** 0-100 掌握度 */
  score: number | null;
  /** rating: 四维评分均值；training: 无任何维度分时退回训练记录；none: 两处都没有样本 */
  source: 'rating' | 'training' | 'none';
  /** 有维度分的作答数 */
  ratedCount: number;
  /** 该次作答没有维度分、退回训练记录的作答数（仅用于提示） */
  unratedCount: number;
  dims: SubjectiveDimensionSummary;
}

/**
 * 申论掌握度口径（2026-11-09 统一）：
 * 1. 优先用 `subjectiveAnswers` 的四维评分：取各维均值的平均数（有分的维度才参与）；
 * 2. 完全没有维度分时，退回该学科训练记录的掌握度（`aggregateBySubject` 同口径）；
 * 3. 两处都无样本时返回 null，由页面显示空态，不伪造数字。
 *
 * 注意：这里只读两个 store，不写入、不生成副本，也不改变训练记录统计。
 */
export function buildSubjectiveMastery(
  answers: SubjectiveAnswer[],
  trainings: TrainingRecord[],
): SubjectiveMastery {
  const dims = buildSubjectiveDimensions(answers);
  if (dims.samples > 0) {
    const values = DIMENSION_KEYS.map((k) => dims.avg[k]).filter((v): v is number => v !== null);
    const avg = values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
    return {
      score: avg === null ? null : Math.round(avg * 10) / 10,
      source: 'rating',
      ratedCount: dims.samples,
      unratedCount: answers.length - dims.samples,
      dims,
    };
  }
  const stats = aggregateBySubject(trainings).find((s) => s.subject === 'shenlun');
  return {
    score: stats ? stats.masteryScore : null,
    source: stats ? 'training' : 'none',
    ratedCount: 0,
    unratedCount: answers.length,
    dims,
  };
}

export function calcErrorRecurrence(
  records: TrainingRecord[],
  category: ErrorCategory,
  window: number = 20,
): number {
  const recent = records.slice(0, window);
  if (recent.length === 0) return 0;
  const hits = recent.filter((r) => r.errorCategories.includes(category)).length;
  return hits / recent.length;
}

export function buildRadarSlices(
  records: TrainingRecord[],
  abilities: AbilitySnapshot[],
  gradeLevel: GradeLevel,
  subject: Subject,
  targetScore?: number,
): AbilityRadarSlice[] {
  const dims = getRadarDimensions(gradeLevel, subject);
  if (dims.length === 0) return [];

  // 去重口径（验收缺陷 #7）：模块兜底统计前先剔除与模块行重复的整卷行，
  // 此前直接用原始记录导致整卷+模块被重复计入。
  const scoped = selectModuleLevelRecords(records).filter((r) => r.subject === subject);
  const abilityByPath = new Map<string, AbilitySnapshot>();
  for (const a of abilities) {
    if (a.subject !== subject) continue;
    const prev = abilityByPath.get(a.abilityPath);
    if (!prev || a.evaluationTime > prev.evaluationTime) {
      abilityByPath.set(a.abilityPath, a);
    }
  }

  return dims.map((dim) => {
    const relatedSnapshots = Array.from(abilityByPath.values()).filter((a) =>
      dim.modules.some((m) => pathBelongsToModule(a.abilityPath, m, subject, gradeLevel)),
    );
    let score = 0;
    if (relatedSnapshots.length > 0) {
      score = Math.round(
        relatedSnapshots.reduce((s, a) => s + a.score, 0) / relatedSnapshots.length,
      );
    } else {
      const moduleRecs = scoped.filter(
        (r) => dim.modules.some((m) => normalizeModule(r.module, subject, gradeLevel) === m),
      );
      const q = moduleRecs.reduce((s, r) => s + r.totalQuestions, 0);
      const err = moduleRecs.reduce((s, r) => s + r.errorCount, 0);
      score = q === 0 ? 50 : Math.round(((q - err) / q) * 100);
    }
    return {
      key: dim.key,
      label: `${dim.label} · ${dim.weight}%`,
      weight: dim.weight,
      score,
      // 目标线统一读报名 targetScore；未设置时不画目标线（不再写死 80）
      ...(targetScore !== undefined ? { targetScore } : {}),
    };
  });
}

export function buildGrowthSeries(records: TrainingRecord[], subject: Subject) {
  // 去重口径（验收缺陷 #7）：增长曲线此前用原始记录，整卷+模块重复计入；
  // 与学科统计统一走 A1 学科级去重。
  const scoped = selectAggregationRecords(records).filter((r) => r.subject === subject);
  const buckets = new Map<string, TrainingRecord[]>();
  for (const r of scoped) {
    const week = weekKey(r.date);
    const list = buckets.get(week) ?? [];
    list.push(r);
    buckets.set(week, list);
  }
  const raw = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, list]) => {
      const q = list.reduce((s, r) => s + r.totalQuestions, 0);
      const err = list.reduce((s, r) => s + r.errorCount, 0);
      const score = q === 0 ? 0 : Math.round(((q - err) / q) * 100);
      const unfamiliarList = list.filter((r) => r.isUnfamiliar);
      const uq = unfamiliarList.reduce((s, r) => s + r.totalQuestions, 0);
      const ue = unfamiliarList.reduce((s, r) => s + r.errorCount, 0);
      const unfamiliar = uq === 0 ? score : Math.round(((uq - ue) / uq) * 100);
      return { week, score, unfamiliar, samples: q };
    });
  // V5.11 §18 + §30.9(九段心法·涌现) · 涌现点标注
  // 需要有前置至少 5 周的样本, 且当前分数比前 5 周均值高 ≥ 12 分, 视为"非线性跃迁"
  return raw.map((pt, idx) => {
    if (idx < 5) return { ...pt, emergence: false as const };
    const prev = raw.slice(Math.max(0, idx - 5), idx);
    const enoughSamples = prev.every((p) => p.samples > 0) && pt.samples > 0;
    if (!enoughSamples) return { ...pt, emergence: false as const };
    const mean = prev.reduce((s, p) => s + p.score, 0) / prev.length;
    const jump = pt.score - mean;
    return { ...pt, emergence: jump >= 12, jumpDelta: jump };
  });
}

function weekKey(dateISO: string): string {
  const d = new Date(dateISO);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function prioritizeGaps(gaps: AbilityGap[]): AbilityGap[] {
  const weightSeverity = (s: AbilityGap['severity']) => (s === 'serious' ? 3 : s === 'medium' ? 2 : 1);
  return [...gaps].sort((a, b) => {
    const wa = weightSeverity(a.severity) * a.occurrenceCount;
    const wb = weightSeverity(b.severity) * b.occurrenceCount;
    return wb - wa;
  });
}

// ============ P1 分析 ============

/** 训练收益: 单位时间能力增量 (Northstar Metric) */
export interface TrainingROI {
  trainingType: TrainingType;
  label: string;
  hours: number;
  abilityDelta: number;
  perHour: number;
  sampleSize: number;
}

export function analyzeTrainingROI(records: TrainingRecord[]): TrainingROI[] {
  const byType = new Map<TrainingType, TrainingRecord[]>();
  for (const r of records) {
    const list = byType.get(r.trainingType) ?? [];
    list.push(r);
    byType.set(r.trainingType, list);
  }
  const rois: TrainingROI[] = [];
  for (const [type, list] of byType) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const half = Math.floor(sorted.length / 2);
    const early = sorted.slice(0, half);
    const late = sorted.slice(half);
    // 口径统一：早期/晚期都用统一掌握度（含陌生题加权），不再用原始正确率
    const hours = list.reduce((s, r) => s + (r.durationMinutes ?? 0), 0) / 60;
    const delta = pooledMasteryScore(late) - pooledMasteryScore(early);
    rois.push({
      trainingType: type,
      label: TRAINING_TYPE_LABEL[type],
      hours: +hours.toFixed(1),
      abilityDelta: +delta.toFixed(1),
      perHour: hours === 0 ? 0 : +(delta / hours).toFixed(2),
      sampleSize: list.length,
    });
  }
  return rois.sort((a, b) => b.perHour - a.perHour);
}

/** 阶段报告: 输入/产出/瓶颈/决策 */
export interface StageReport {
  fromDate: string;
  toDate: string;
  trainingsCount: number;
  totalQuestions: number;
  totalErrors: number;
  totalHours: number;
  masteryDelta: Record<Subject, number>;
  topBottlenecks: string[];
  errorRecurrence: Array<{ category: ErrorCategory; rate: number }>;
  suggestions: string[];
}

export function buildStageReport(records: TrainingRecord[], gaps: AbilityGap[], fromDate: string, toDate: string): StageReport {
  const scoped = records.filter((r) => r.date >= fromDate && r.date <= toDate);
  const totalQuestions = scoped.reduce((s, r) => s + r.totalQuestions, 0);
  const totalErrors = scoped.reduce((s, r) => s + r.errorCount, 0);
  const totalHours = +(scoped.reduce((s, r) => s + (r.durationMinutes ?? 0), 0) / 60).toFixed(1);

  const halfDate = new Date(new Date(fromDate).getTime() + (new Date(toDate).getTime() - new Date(fromDate).getTime()) / 2)
    .toISOString()
    .slice(0, 10);
  const early = scoped.filter((r) => r.date < halfDate);
  const late = scoped.filter((r) => r.date >= halfDate);

  const bySubject = (arr: TrainingRecord[], subject: Subject) => {
    const s = arr.filter((r) => r.subject === subject);
    const q = s.reduce((sum, r) => sum + r.totalQuestions, 0);
    const err = s.reduce((sum, r) => sum + r.errorCount, 0);
    return q === 0 ? null : Math.round(((q - err) / q) * 100);
  };

  const masteryDelta = {} as Record<Subject, number>;
  const subjects: Subject[] = ['math', 'physics', 'xingce', 'shenlun', 'mianshi'];
  for (const s of subjects) {
    const e = bySubject(early, s);
    const l = bySubject(late, s);
    if (e !== null && l !== null) masteryDelta[s] = l - e;
  }

  const errorMap = new Map<ErrorCategory, number>();
  for (const r of scoped) {
    for (const c of r.errorCategories) errorMap.set(c, (errorMap.get(c) ?? 0) + 1);
  }
  const errorRecurrence = Array.from(errorMap.entries())
    .map(([category, count]) => ({ category, rate: scoped.length === 0 ? 0 : +(count / scoped.length).toFixed(2) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  const topBottlenecks = prioritizeGaps(gaps.filter((g) => g.status !== 'verified'))
    .slice(0, 3)
    .map((g) => g.abilityPath.split('/').slice(-1)[0]);

  const suggestions: string[] = [];
  if (totalHours < 5) suggestions.push('本阶段训练投入不足 5 小时，建议提高训练频次');
  if (topBottlenecks.length > 0) suggestions.push(`优先修复能力短板: ${topBottlenecks.join('、')}`);
  if (Object.values(masteryDelta).some((d) => d < -3)) suggestions.push('部分学科掌握度下降，建议回归错题复习');
  if (errorRecurrence[0] && errorRecurrence[0].rate > 0.3) suggestions.push(`错误复现率偏高: ${errorRecurrence[0].category}, 建议专项训练`);

  return {
    fromDate,
    toDate,
    trainingsCount: scoped.length,
    totalQuestions,
    totalErrors,
    totalHours,
    masteryDelta,
    topBottlenecks,
    errorRecurrence,
    suggestions,
  };
}

/** 预警系统 (PRD §10.7) */
export function computeWarnings(
  students: StudentProfile[] | null,
  records: TrainingRecord[],
  gaps: AbilityGap[],
): WarningItem[] {
  const warnings: WarningItem[] = [];
  const today = new Date();
  const daySince = (from: Date) => Math.floor((today.getTime() - from.getTime()) / 86400000);

  const evaluate = (studentId?: string, name?: string, gradeLevel?: GradeLevel) => {
    const scoped = records.filter((r) => (studentId ? r.studentId === studentId : true));
    const scopedGaps = gaps.filter((g) => (studentId ? g.studentId === studentId : true));
    if (scoped.length === 0) {
      warnings.push({ studentId, studentName: name ?? '本人', level: 'attention', reason: '暂无训练记录' });
      return;
    }
    const lastDate = scoped[0]?.date ?? '';
    const gap = lastDate ? daySince(new Date(lastDate)) : 999;
    const threshold =
      gradeLevel === 'primary' ? 3 : gradeLevel === 'junior' ? 5 : gradeLevel === 'senior' ? 7 : 14;
    let level: WarningLevel = 'normal';
    let reason = '稳步进步中';
    if (gap >= threshold * 2) {
      level = 'high';
      reason = `已 ${gap} 天未训练 (阈值 ${threshold} 天)`;
    } else if (gap >= threshold) {
      level = 'attention';
      reason = `已 ${gap} 天未训练`;
    }

    const unresolved = scopedGaps.filter((g) => g.status === 'unresolved');
    if (unresolved.length >= 5 && level !== 'high') {
      level = 'attention';
      reason += ` · 累计 ${unresolved.length} 个未修复能力缺口`;
    }

    // 能力退步检测: 近半月 vs 之前半月的统一掌握度（与学科掌握度同口径，阈值 5 分）
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const recent = scoped.filter((r) => new Date(r.date) >= twoWeeksAgo);
    const earlier = scoped.filter((r) => new Date(r.date) < twoWeeksAgo);
    if (recent.length > 3 && earlier.length > 3) {
      if (pooledMasteryScore(recent) - pooledMasteryScore(earlier) < -5) {
        level = 'high';
        reason = '近两周能力有退步趋势';
      }
    }

    warnings.push({ studentId, studentName: name ?? '本人', level, reason, since: lastDate });
  };

  if (students && students.length > 0) {
    for (const s of students) evaluate(s.id, s.name, s.gradeLevel);
  } else {
    evaluate();
  }
  return warnings;
}

// ============ P2 深度分析 ============

/** 边际收益: 累计小时 vs 掌握度增量 */
export interface MarginalYield {
  subject: Subject;
  points: Array<{ cumulativeHours: number; mastery: number; delta: number }>;
  diminishingReturnHour?: number;
}

export function analyzeMarginalYield(records: TrainingRecord[], subject: Subject): MarginalYield {
  const sorted = records.filter((r) => r.subject === subject).sort((a, b) => a.date.localeCompare(b.date));
  let cumH = 0;
  let cumQ = 0;
  let cumE = 0;
  const points: MarginalYield['points'] = [];
  let prev = 0;
  for (const r of sorted) {
    cumH += (r.durationMinutes ?? 0) / 60;
    cumQ += r.totalQuestions;
    cumE += r.errorCount;
    const mastery = cumQ === 0 ? 0 : Math.round(((cumQ - cumE) / cumQ) * 100);
    points.push({ cumulativeHours: +cumH.toFixed(1), mastery, delta: mastery - prev });
    prev = mastery;
  }
  // 边际递减点：滑动窗口斜率显著变小
  let diminishingReturnHour: number | undefined;
  for (let i = 5; i < points.length - 2; i++) {
    const before = (points[i].mastery - points[i - 5].mastery) / (points[i].cumulativeHours - points[i - 5].cumulativeHours || 1);
    const after = (points[i + 2].mastery - points[i].mastery) / (points[i + 2].cumulativeHours - points[i].cumulativeHours || 1);
    if (before > 1 && after < before * 0.3) {
      diminishingReturnHour = points[i].cumulativeHours;
      break;
    }
  }
  return { subject, points, diminishingReturnHour };
}

/** 恶性反馈回路识别: 错误持续复现且无修复动作 */
export interface FeedbackLoop {
  category: ErrorCategory;
  weeks: number;
  recurrenceRate: number;
  attemptedFixes: number;
}

export function detectFeedbackLoops(records: TrainingRecord[], gaps: AbilityGap[]): FeedbackLoop[] {
  const now = Date.now();
  const eightWeeksAgo = now - 8 * 7 * 86400000;
  const errorMap = new Map<ErrorCategory, { weeks: Set<string>; count: number }>();
  for (const r of records) {
    if (new Date(r.date).getTime() < eightWeeksAgo) continue;
    for (const c of r.errorCategories) {
      const entry = errorMap.get(c) ?? { weeks: new Set(), count: 0 };
      entry.weeks.add(weekKey(r.date));
      entry.count += 1;
      errorMap.set(c, entry);
    }
  }

  const loops: FeedbackLoop[] = [];
  for (const [category, entry] of errorMap) {
    if (entry.weeks.size < 4) continue;
    const attemptedFixes = gaps.filter((g) => g.errorCategory === category && (g.status === 'in-progress' || g.status === 'verified')).length;
    loops.push({
      category,
      weeks: entry.weeks.size,
      recurrenceRate: +(entry.count / Math.max(1, records.length)).toFixed(2),
      attemptedFixes,
    });
  }
  return loops.sort((a, b) => b.recurrenceRate - a.recurrenceRate);
}

/** 杠杆点识别: 修复该能力可带动多个关联能力 (基于迁移矩阵) */
export interface Leverage {
  ability: string;
  masteryScore: number;
  transferReach: number;
  score: number;
}

/** 能力增长速率(斜率) */
export function computeGrowthRate(series: Array<{ week: string; score: number }>): number {
  if (series.length < 2) return 0;
  const first = series[0].score;
  const last = series[series.length - 1].score;
  return +((last - first) / series.length).toFixed(2);
}

// ============ V5.11 Bug #005 修复 · 错题自动归集为能力缺口 ============
// ============ V5.11 Bug #009 修复 · 训练完成后自动生成能力快照 ============

/**
 * 从单条训练记录派生能力缺口(gap) - 打通"训练→反馈→修复"P0 核心闭环
 *
 * 归集规则:
 * - 错题数 ≥ 3 或 错题率 ≥ 40% → 归为缺口
 * - 严重度分档:错题率 ≥ 70% serious / ≥ 40% medium / 其它 light
 * - 已验证缺口同 key 再次出现 → 复用 id、置 in-progress、occurrenceCount+1、reopenedCount+1、追加 reappeared 历史
 * - 未验证缺口同 key → 合并计数并追加 merged 历史；新建缺口带 created 历史
 * - 每个 errorCategory 派生一条缺口;若训练未打错误标签,则用默认 concept 兜底
 */
export function deriveGapsFromTraining(
  record: TrainingRecord,
  existingGaps: AbilityGap[],
): AbilityGap[] {
  const errorRate = record.totalQuestions === 0 ? 0 : record.errorCount / record.totalQuestions;
  // 阈值:错题 <3 且错误率 <40% 不派生 gap
  if (record.errorCount < 3 && errorRate < 0.4) return [];

  const now = new Date().toISOString();
  const severity: AbilityGap['severity'] =
    errorRate >= 0.7 ? 'serious' : errorRate >= 0.4 ? 'medium' : 'light';

  // 若无错误类型标签,使用默认 concept 兜底(避免"训练录入错题但未选错因"场景漏归集)
  const categories: ErrorCategory[] = record.errorCategories.length > 0 ? record.errorCategories : ['concept'];
  const abilityPath = `${record.subject}/${record.module}`;

  const updated: AbilityGap[] = [];
  for (const category of categories) {
    // 同学生 + 同能力路径 + 同错误类型的缺口（不再限定未验证，已验证也参与重开）
    const existing = existingGaps.find(
      (g) =>
        g.studentId === record.studentId &&
        g.subject === record.subject &&
        g.abilityPath === abilityPath &&
        g.errorCategory === category,
    );

    if (!existing) {
      updated.push({
        id: uuid(),
        studentId: record.studentId,
        subject: record.subject,
        abilityPath,
        errorCategory: category,
        severity,
        status: 'unresolved',
        sourceRecordIds: [record.id],
        occurrenceCount: 1,
        reopenedCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
        statusHistory: [{ status: 'unresolved', at: now, source: 'auto', reason: 'created', recordId: record.id }],
      });
      continue;
    }

    // 同一训练重复处理：不再追加计数与历史，避免重复写入
    if (existing.sourceRecordIds.includes(record.id)) continue;

    const seenRecordIds = [...existing.sourceRecordIds, record.id].slice(-20);

    if (existing.status === 'verified') {
      // 已验证缺口再次出现 → 复用 id 并重开为 in-progress（清空 verifiedAt，避免脏态）
      const { verifiedAt: _staleVerifiedAt, ...reopened } = existing;
      updated.push({
        ...reopened,
        status: 'in-progress',
        occurrenceCount: existing.occurrenceCount + 1,
        reopenedCount: (existing.reopenedCount ?? 0) + 1,
        lastSeenAt: now,
        updatedAt: now,
        severity: severityMax(existing.severity, severity),
        sourceRecordIds: seenRecordIds,
        statusHistory: appendStatusHistory(existing.statusHistory, {
          status: 'in-progress',
          at: now,
          source: 'auto',
          reason: 'reappeared',
          recordId: record.id,
          from: 'verified',
        }),
      });
    } else {
      // 未验证缺口合并计数
      updated.push({
        ...existing,
        occurrenceCount: existing.occurrenceCount + 1,
        lastSeenAt: now,
        updatedAt: now,
        severity: severityMax(existing.severity, severity),
        sourceRecordIds: seenRecordIds,
        statusHistory: appendStatusHistory(existing.statusHistory, {
          status: existing.status,
          at: now,
          source: 'auto',
          reason: 'merged',
          recordId: record.id,
        }),
      });
    }
  }
  return updated;
}

/** 追加历史项；同一时刻（at）同等状态的重复触发不重复追加 */
function appendStatusHistory(
  history: GapStatusHistoryItem[] | undefined,
  item: GapStatusHistoryItem,
): GapStatusHistoryItem[] {
  const list = history ?? [];
  // 同一记录重复触发（同 recordId）或同一时刻同状态同原因不重复追加
  const duplicated = list.some(
    (h) =>
      (item.recordId !== undefined && h.recordId === item.recordId) ||
      (h.at === item.at && h.status === item.status && h.reason === item.reason),
  );
  return duplicated ? list : [...list, item];
}

function severityMax(a: AbilityGap['severity'], b: AbilityGap['severity']): AbilityGap['severity'] {
  const rank = { light: 1, medium: 2, serious: 3 } as const;
  return rank[a] >= rank[b] ? a : b;
}

/**
 * V5.11 Bug #009 修复 · 从训练记录派生能力快照(建立基线 + 增长追踪)
 *
 * 快照规则:
 * - 学科 × 模块 一级快照:每次训练后即写入,evaluationTime = record.date
 * - 分档:陌生题正确率 ≥ 85% 精通 · 61-85% 熟练 · 26-60% 初步 · 0-25% 未掌握
 * - 置信度: 陌生题样本 ≥ 5 → 0.9 / 1-4 → 0.6 / 0 → 0.4
 * - source = 'training'(与 exam / manual 区分)
 */
export function deriveSnapshotFromTraining(record: TrainingRecord): AbilitySnapshot {
  const correctRate = record.totalQuestions === 0 ? 0 : (record.totalQuestions - record.errorCount) / record.totalQuestions;
  const score = Math.round(correctRate * 100);
  const level = scoreToLevel(score);
  const confidence = record.isUnfamiliar
    ? (record.totalQuestions >= 5 ? 0.9 : 0.6)
    : 0.4;
  return {
    id: uuid(),
    studentId: record.studentId,
    subject: record.subject,
    abilityPath: `${record.subject}/${record.module}`,
    score,
    level,
    confidence,
    source: 'training',
    sampleTotal: record.totalQuestions,
    sampleCorrect: record.totalQuestions - record.errorCount,
    evidence: `${TRAINING_TYPE_LABEL[record.trainingType]} · ${record.date} · ${record.totalQuestions}题错${record.errorCount}`,
    evaluationTime: record.date + 'T' + (new Date().toISOString().split('T')[1] ?? '00:00:00.000Z'),
    createdAt: new Date().toISOString(),
  };
}

// ============ V5.11 Bug #028 修复 · 预警 5 类具体规则 ============
// 长期未训练(已有) · 能力停滞 · 能力退步 · 错误恶化 · 心理状态(累计未修复缺口)

export interface WarningRule {
  key: 'no-training' | 'stagnation' | 'regression' | 'error-worsen' | 'mental';
  label: string;
}

export const WARNING_RULES: WarningRule[] = [
  { key: 'no-training', label: '长期未训练' },
  { key: 'stagnation', label: '能力停滞' },
  { key: 'regression', label: '能力退步' },
  { key: 'error-worsen', label: '错误恶化' },
  { key: 'mental', label: '心理状态偏差' },
];
