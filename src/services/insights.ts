/**
 * P2 深度洞察引擎
 *
 * 覆盖 PRD §31 P2 需求:
 * - 智能训练策略推荐 (基于历史 ROI + 短板优先级)
 * - 训练收益预测 (线性外推 / 边际收益模型)
 * - 能力因果关系建模 (错误类型 → 能力短板 → 训练方式)
 * - 个性化训练策略模拟 (What-if 情景演算)
 * - 恶性反馈回路识别 (复用 analytics)
 * - 杠杆点识别 (基于迁移矩阵)
 */
import type {
  AbilityGap,
  ErrorCategory,
  Subject,
  TrainingRecord,
  TrainingType,
} from '../domain/types';
import { ERROR_CATEGORY_LABEL, SUBJECT_LABEL, TRAINING_TYPE_LABEL } from '../domain/types';
import { analyzeTrainingROI, prioritizeGaps } from './analytics';
import { ALL_TRANSFERS, findStrongTransferSources, TRANSFER_STRENGTH_LABEL } from '../domain/abilityTransfer';

// ============ 智能训练策略推荐 ============

export interface StrategyRecommendation {
  strategy: TrainingType | 'transfer' | 'break-loop' | 'spaced-review';
  label: string;
  weight: number;
  reason: string;
  actionable: string;
}

export function recommendStrategies(records: TrainingRecord[], gaps: AbilityGap[]): StrategyRecommendation[] {
  const recs: StrategyRecommendation[] = [];
  const roi = analyzeTrainingROI(records);
  const topRoi = roi[0];

  if (topRoi && topRoi.perHour > 0) {
    recs.push({
      strategy: topRoi.trainingType,
      label: `优先延续${topRoi.label}`,
      weight: Math.round(topRoi.perHour * 10 + 60),
      reason: `${topRoi.label}的单位时间能力增量最高 (+${topRoi.perHour}% / 小时, 共 ${topRoi.sampleSize} 次数据支持)`,
      actionable: `建议本周继续保持每次 30-45 分钟的${topRoi.label}训练, 优先安排在高效时段`,
    });
  }

  const priorityGaps = prioritizeGaps(gaps.filter((g) => g.status === 'unresolved'));
  const seriousGap = priorityGaps.find((g) => g.severity === 'serious');
  if (seriousGap) {
    const point = seriousGap.abilityPath.split('/').slice(-1)[0];
    recs.push({
      strategy: 'break-loop',
      label: `攻克严重短板: ${point}`,
      weight: 95,
      reason: `复现 ${seriousGap.occurrenceCount} 次且状态为严重, 属于影响整体能力的关键瓶颈`,
      actionable: `采用错题修复 + 陌生题验证组合, 3 天内做完 10 道相关题目并复盘`,
    });
  }

  const badRoi = roi.find((r) => r.hours >= 3 && r.perHour < 0.5);
  if (badRoi) {
    recs.push({
      strategy: badRoi.trainingType,
      label: `降低${badRoi.label}投入`,
      weight: 40,
      reason: `${badRoi.label}投入 ${badRoi.hours} 小时但能力增量仅 ${badRoi.abilityDelta}%, 边际收益已明显递减`,
      actionable: '将该训练时间转移到 ROI 更高的训练方式',
    });
  }

  // 基于短板寻找强迁移源头
  for (const g of priorityGaps.slice(0, 3)) {
    const point = g.abilityPath.split('/').slice(-1)[0];
    const sources = findStrongTransferSources(point);
    if (sources.length > 0) {
      recs.push({
        strategy: 'transfer',
        label: `通过迁移源头强化 ${point}`,
        weight: 75,
        reason: `${point} 存在 ${sources.length} 个强迁移源头, 训练源头可同时带动多个关联能力`,
        actionable: `优先训练: ${sources.slice(0, 2).map((s) => s.from).join(' / ')}`,
      });
    }
  }

  // 未训练建议
  if (records.length === 0) {
    recs.push({
      strategy: 'break-loop',
      label: '建立能力基线',
      weight: 100,
      reason: '尚无训练数据, 无法诊断能力瓶颈',
      actionable: '按学科各做一次 15 题的基线训练, 建立能力起点',
    });
  }

  return recs.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

// ============ 训练收益预测 ============

export interface GrowthForecast {
  subject: Subject;
  currentMastery: number;
  weeklyGrowthRate: number;
  weeksToTarget: Record<'proficient' | 'expert', number | null>;
  forecast4Weeks: number;
  forecast12Weeks: number;
}

export function forecastGrowth(records: TrainingRecord[], subject: Subject): GrowthForecast {
  const scoped = records.filter((r) => r.subject === subject).sort((a, b) => a.date.localeCompare(b.date));
  if (scoped.length < 2) {
    return {
      subject,
      currentMastery: 0,
      weeklyGrowthRate: 0,
      weeksToTarget: { proficient: null, expert: null },
      forecast4Weeks: 0,
      forecast12Weeks: 0,
    };
  }

  // 按周聚合
  const byWeek = new Map<string, { q: number; e: number }>();
  for (const r of scoped) {
    const w = weekKey(r.date);
    const entry = byWeek.get(w) ?? { q: 0, e: 0 };
    entry.q += r.totalQuestions;
    entry.e += r.errorCount;
    byWeek.set(w, entry);
  }
  const weeks = Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => (v.q === 0 ? 0 : Math.round(((v.q - v.e) / v.q) * 100)));

  if (weeks.length < 2) {
    return {
      subject,
      currentMastery: weeks[0] ?? 0,
      weeklyGrowthRate: 0,
      weeksToTarget: { proficient: null, expert: null },
      forecast4Weeks: weeks[0] ?? 0,
      forecast12Weeks: weeks[0] ?? 0,
    };
  }

  // 线性回归斜率(周维度)
  const n = weeks.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = weeks.reduce((a, b) => a + b, 0);
  const sumXY = weeks.reduce((acc, y, i) => acc + i * y, 0);
  const sumX2 = weeks.reduce((acc, _, i) => acc + i * i, 0);
  const slope = (n * sumXY - sumX * sumY) / Math.max(1, n * sumX2 - sumX * sumX);
  const current = weeks[weeks.length - 1];

  const weeksToTarget = (target: number): number | null => {
    if (current >= target) return 0;
    if (slope <= 0) return null;
    return Math.ceil((target - current) / slope);
  };

  return {
    subject,
    currentMastery: current,
    weeklyGrowthRate: +slope.toFixed(2),
    weeksToTarget: {
      proficient: weeksToTarget(85),
      expert: weeksToTarget(95),
    },
    forecast4Weeks: Math.min(100, Math.max(0, Math.round(current + slope * 4))),
    forecast12Weeks: Math.min(100, Math.max(0, Math.round(current + slope * 12))),
  };
}

// ============ 因果关系建模 ============

export interface CausalNode {
  id: string;
  label: string;
  kind: 'error' | 'ability' | 'training';
}

export interface CausalEdge {
  from: string;
  to: string;
  weight: number;
  label?: string;
}

export interface CausalGraph {
  nodes: CausalNode[];
  edges: CausalEdge[];
}

/** 构建三层因果图: 错误类型 → 能力短板 → 建议训练方式 */
export function buildCausalGraph(records: TrainingRecord[], gaps: AbilityGap[]): CausalGraph {
  const nodes: CausalNode[] = [];
  const edges: CausalEdge[] = [];
  const seen = new Set<string>();

  const add = (id: string, label: string, kind: CausalNode['kind']) => {
    if (seen.has(id)) return;
    nodes.push({ id, label, kind });
    seen.add(id);
  };

  const priorityGaps = prioritizeGaps(gaps.filter((g) => g.status !== 'verified')).slice(0, 6);

  for (const g of priorityGaps) {
    const abilityId = `ab:${g.abilityPath}`;
    add(abilityId, g.abilityPath.split('/').slice(-1)[0], 'ability');

    // 错误 → 能力
    const errorId = `er:${g.errorCategory}`;
    add(errorId, ERROR_CATEGORY_LABEL[g.errorCategory], 'error');
    edges.push({
      from: errorId,
      to: abilityId,
      weight: g.occurrenceCount,
      label: `${g.occurrenceCount} 次`,
    });

    // 能力 → 建议训练方式
    const trainingSuggestion: TrainingType = g.errorCategory === 'not-know' ? 'topic' : g.errorCategory === 'time' ? 'timed' : 'review';
    const trainingId = `tr:${trainingSuggestion}`;
    add(trainingId, TRAINING_TYPE_LABEL[trainingSuggestion], 'training');
    edges.push({ from: abilityId, to: trainingId, weight: 1 });
  }

  // 训练方式的历史相对权重
  const trainingWeight = new Map<TrainingType, number>();
  for (const r of records) {
    trainingWeight.set(r.trainingType, (trainingWeight.get(r.trainingType) ?? 0) + r.totalQuestions);
  }

  return { nodes, edges };
}

// ============ What-if 个性化模拟 ============

export interface SimulationInput {
  hoursPerWeek: number;
  weeks: number;
  focusRatio: {
    topic: number;
    review: number;
    unfamiliar: number;
    timed: number;
  };
}

export interface SimulationResult {
  input: SimulationInput;
  currentMastery: number;
  finalMastery: number;
  trajectory: Array<{ week: number; mastery: number }>;
  notes: string[];
}

/** 基于历史 ROI 推演 What-if 情景 */
export function simulateStrategy(records: TrainingRecord[], subject: Subject, input: SimulationInput): SimulationResult {
  const scoped = records.filter((r) => r.subject === subject);
  const forecast = forecastGrowth(records, subject);

  const roi = analyzeTrainingROI(scoped);
  const perHour = (type: TrainingType): number => {
    const found = roi.find((r) => r.trainingType === type);
    return found?.perHour ?? 0.5; // 默认每小时 0.5%
  };

  const ratioSum = input.focusRatio.topic + input.focusRatio.review + input.focusRatio.unfamiliar + input.focusRatio.timed;
  const norm = ratioSum === 0 ? 1 : ratioSum;

  const weightedPerHour =
    (perHour('topic') * input.focusRatio.topic +
      perHour('review') * input.focusRatio.review +
      perHour('unfamiliar') * input.focusRatio.unfamiliar +
      perHour('timed') * input.focusRatio.timed) /
    norm;

  const trajectory: SimulationResult['trajectory'] = [];
  let m = forecast.currentMastery;
  for (let w = 1; w <= input.weeks; w++) {
    // 边际递减: 越接近满分, 增益越小
    const decayFactor = Math.max(0.15, (100 - m) / 100);
    m = Math.min(100, m + weightedPerHour * input.hoursPerWeek * decayFactor);
    trajectory.push({ week: w, mastery: +m.toFixed(1) });
  }

  const notes: string[] = [];
  if (weightedPerHour <= 0) notes.push('历史数据不足以支撑该模拟, 结果为默认基线值');
  if (input.hoursPerWeek < 3) notes.push('每周投入不足 3 小时, 边际收益偏低');
  if (m >= 95) notes.push('预计将进入精通区间, 建议调整重心到其他学科');
  if (m - forecast.currentMastery < 5 && input.weeks >= 8) notes.push('长期投入下增长仍缓慢, 可能触及能力天花板, 考虑改变训练结构');

  return {
    input,
    currentMastery: forecast.currentMastery,
    finalMastery: +m.toFixed(1),
    trajectory,
    notes,
  };
}

// ============ 迁移杠杆点分析(增强) ============

export interface Leverage {
  ability: string;
  subject: Subject;
  score: number;
  urgency: number;
  transfers: Array<{ target: string; strength: string }>;
  totalReach: number;
}

export function findLeveragePoints(gaps: AbilityGap[]): Leverage[] {
  const priority = prioritizeGaps(gaps.filter((g) => g.status !== 'verified')).slice(0, 10);
  const leverages: Leverage[] = [];
  for (const g of priority) {
    const point = g.abilityPath.split('/').slice(-1)[0];
    const outs = ALL_TRANSFERS.filter((e) => e.from.includes(point) && (e.strength === 'strong' || e.strength === 'medium'));
    if (outs.length === 0) continue;
    const totalReach = outs.reduce((s, e) => s + (e.strength === 'strong' ? 2 : 1), 0);
    leverages.push({
      ability: point,
      subject: g.subject,
      score: g.occurrenceCount * 5 + totalReach * 10,
      urgency: g.severity === 'serious' ? 3 : g.severity === 'medium' ? 2 : 1,
      transfers: outs.slice(0, 4).map((o) => ({ target: o.to, strength: TRANSFER_STRENGTH_LABEL[o.strength] })),
      totalReach,
    });
  }
  return leverages.sort((a, b) => b.score - a.score);
}

// ============ 学科聚合帮助 ============

export interface CrossSubjectSummary {
  subject: Subject;
  label: string;
  currentMastery: number;
  forecast4w: number;
  weeklyRate: number;
}

export function aggregateSubjectForecasts(records: TrainingRecord[], subjects: Subject[]): CrossSubjectSummary[] {
  return subjects.map((s) => {
    const f = forecastGrowth(records, s);
    return {
      subject: s,
      label: SUBJECT_LABEL[s],
      currentMastery: f.currentMastery,
      forecast4w: f.forecast4Weeks,
      weeklyRate: f.weeklyGrowthRate,
    };
  });
}

// ============ 工具函数 ============

function weekKey(dateISO: string): string {
  const d = new Date(dateISO);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
