/**
 * 学习规划器
 * - 艾宾浩斯间隔复习(学段差异化 PRD §6)
 * - 阶段规划(基础/专项/冲刺/考前)
 * - 今日推荐(基于短板优先级、迁移矩阵、间隔到期)
 */
import { v4 as uuid } from 'uuid';
import type {
  AbilityGap,
  GradeLevel,
  SpacedReviewItem,
  StagePlan,
  Subject,
  TrainingRecord,
} from '../domain/types';
import { prioritizeGaps } from './analytics';
import { INFO_INSUFFICIENT } from '../domain/missingInfo';

export const SPACED_INTERVALS: Record<GradeLevel, number[]> = {
  primary: [1, 2, 4, 7],
  junior: [1, 3, 7, 14],
  senior: [1, 3, 7, 14, 30],
  adult: [1, 3, 7, 14, 30],
};

export function createSpacedReview(
  studentId: string | undefined,
  gradeLevel: GradeLevel,
  subject: Subject,
  abilityPath: string,
  intervals?: number[],
): SpacedReviewItem {
  const now = new Date();
  const chosen = intervals ?? SPACED_INTERVALS[gradeLevel];
  const first = new Date(now);
  first.setDate(first.getDate() + chosen[0]);
  return {
    id: uuid(),
    studentId,
    subject,
    abilityPath,
    gradeLevel,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    intervals: chosen,
    currentIndex: 0,
    nextDueDate: first.toISOString().slice(0, 10),
    completedDates: [],
    status: 'active',
  };
}

export function advanceSpacedReview(item: SpacedReviewItem, on: string = new Date().toISOString().slice(0, 10)): SpacedReviewItem {
  const nextIndex = item.currentIndex + 1;
  const completed = [...item.completedDates, on];
  if (nextIndex >= item.intervals.length) {
    return { ...item, currentIndex: nextIndex, completedDates: completed, status: 'graduated', updatedAt: new Date().toISOString() };
  }
  const next = new Date();
  next.setDate(next.getDate() + item.intervals[nextIndex]);
  return {
    ...item,
    currentIndex: nextIndex,
    completedDates: completed,
    nextDueDate: next.toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
}

export interface TodayRecommendation {
  kind: 'fix' | 'verify' | 'spaced' | 'suggest';
  subject: Subject;
  abilityPath: string;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
}

export function generateTodayRecommendations(
  gaps: AbilityGap[],
  dueSpacedReviews: SpacedReviewItem[],
  recentTrainings: TrainingRecord[],
): TodayRecommendation[] {
  const list: TodayRecommendation[] = [];

  for (const item of dueSpacedReviews) {
    list.push({
      kind: 'spaced',
      subject: item.subject,
      abilityPath: item.abilityPath,
      reason: `间隔复习 #${item.currentIndex + 1} 已到期 (${item.intervals[item.currentIndex]}天后回归)`,
      urgency: 'high',
    });
  }

  const priorityGaps = prioritizeGaps(gaps.filter((g) => g.status === 'unresolved')).slice(0, 3);
  for (const g of priorityGaps) {
    list.push({
      kind: 'fix',
      subject: g.subject,
      abilityPath: g.abilityPath,
      reason: `复现 ${g.occurrenceCount ?? INFO_INSUFFICIENT} 次 · ${g.severity === 'serious' ? '严重' : g.severity === 'medium' ? '中等' : '轻微'}`,
      urgency: g.severity === 'serious' ? 'high' : 'medium',
    });
  }

  const inProgress = gaps.filter((g) => g.status === 'in-progress').slice(0, 2);
  for (const g of inProgress) {
    list.push({
      kind: 'verify',
      subject: g.subject,
      abilityPath: g.abilityPath,
      reason: '修复中，建议进行陌生题验证',
      urgency: 'medium',
    });
  }

  if (recentTrainings.length === 0) {
    list.push({
      kind: 'suggest',
      subject: 'math',
      abilityPath: '通用/基线/建立能力基线',
      reason: '首次使用建议先做一次基线训练',
      urgency: 'medium',
    });
  }
  return list.slice(0, 6);
}

const DAY_MS = 86400000;

/** 按 YYYY-MM-DD 计算相差天数（b - a），只用日历日，不受时区影响 */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / DAY_MS);
}

function dateAt(base: string, offsetDays: number): string {
  const d = new Date(`${base}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const STAGE_FOCUS: Record<StagePlan['stage'], string[]> = {
  foundation: ['各模块基础', '知识点梳理', '建立能力基线'],
  topic: ['专项攻克', '错题修复', '陌生题训练'],
  sprint: ['套卷限时', '全真模拟', '模考诊断'],
  'pre-exam': ['错题回顾', '高频考点', '心态调整'],
};

/** 阶段保留顺序：段数少时按「冲刺优先」组合，考前期只在 >90 天的 4 段方案里出现 */
const STAGE_ORDER: StagePlan['stage'][] = ['foundation', 'topic', 'sprint', 'pre-exam'];
const STAGE_SETS: Record<number, StagePlan['stage'][]> = {
  1: ['sprint'],
  2: ['topic', 'sprint'],
  3: ['foundation', 'topic', 'sprint'],
  4: STAGE_ORDER,
};

/** 距考试天数 → 阶段段数（不足 5 天/段时继续合并） */
export function stageCountForDays(days: number): number {
  if (days <= 0) return 0;
  const tier = days <= 21 ? 1 : days <= 45 ? 2 : days <= 90 ? 3 : 4;
  return Math.max(1, Math.min(tier, Math.floor(days / 5)));
}

/**
 * 生成默认阶段规划：段数与边界由剩余天数动态决定。
 * - 剩余 ≤21 天 1 段、22–45 天 2 段、46–90 天 3 段、>90 天 4 段
 * - 每段至少 5 天，不足则合并
 * - 起点固定为今天，最后一段终点为考试日，禁止出现「起 > 止」
 */
export function generateDefaultStagePlan(
  examDate: string,
  subject: Subject | undefined,
  today: string = new Date().toISOString().slice(0, 10),
): StagePlan[] {
  const days = daysBetween(today, examDate);
  const count = stageCountForDays(days);
  if (count === 0 || !Number.isFinite(days)) return [];

  const stages = STAGE_SETS[count] ?? STAGE_ORDER;
  const now = new Date().toISOString();
  const plans: StagePlan[] = [];

  // 先算出内部分界点，再按「上一段止于分界前一天、下一段从分界当天起」切分，保证连续无空档
  const boundaries = Array.from({ length: count - 1 }, (_, i) => Math.round((days * (i + 1)) / count));

  for (let i = 0; i < count; i += 1) {
    const startOffset = i === 0 ? 0 : boundaries[i - 1];
    const startDate = dateAt(today, startOffset);
    const endDate = i === count - 1 ? examDate : dateAt(today, Math.max(startOffset, boundaries[i] - 1));
    plans.push({
      id: uuid(),
      subject,
      stage: stages[i],
      startDate,
      endDate,
      focusModules: STAGE_FOCUS[stages[i]],
      focusAbilities: [],
      source: 'auto',
      createdAt: now,
      updatedAt: now,
    });
  }
  return plans;
}

/** 生成口径说明（一行，给页面展示“为什么是这几段”） */
export function describeStagePlan(examDate: string, today: string = new Date().toISOString().slice(0, 10)): string {
  const days = daysBetween(today, examDate);
  if (!Number.isFinite(days) || days <= 0) return '考试日期已过或就是今天，无需生成阶段。';
  const count = stageCountForDays(days);
  const tier =
    days <= 21 ? '剩余 ≤21 天，只保留冲刺 1 段' : days <= 45 ? '剩余 22–45 天，保留 2 段' : days <= 90 ? '剩余 46–90 天，保留 3 段' : '剩余 >90 天，保留 4 段';
  return `距考试 ${days} 天 → ${tier}（共 ${count} 段）；边界按剩余天数等分，每段至少 5 天，全部从今天起算、最后一段止于考试日。`;
}
