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
      reason: `复现 ${g.occurrenceCount} 次 · ${g.severity === 'serious' ? '严重' : g.severity === 'medium' ? '中等' : '轻微'}`,
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

/** 生成默认阶段规划 (公考典型 4 阶段) */
export function generateDefaultStagePlan(examDate: string, subject: Subject | undefined): StagePlan[] {
  const target = new Date(examDate);
  const foundationEnd = new Date(target);
  foundationEnd.setDate(foundationEnd.getDate() - 120);
  const topicEnd = new Date(target);
  topicEnd.setDate(topicEnd.getDate() - 60);
  const sprintEnd = new Date(target);
  sprintEnd.setDate(sprintEnd.getDate() - 30);
  const now = new Date().toISOString().slice(0, 10);

  const mk = (stage: StagePlan['stage'], startDate: string, endDate: string, focusModules: string[]): StagePlan => ({
    id: uuid(),
    subject,
    stage,
    startDate,
    endDate,
    focusModules,
    focusAbilities: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return [
    mk('foundation', now, foundationEnd.toISOString().slice(0, 10), ['各模块基础', '知识点梳理', '建立能力基线']),
    mk('topic', foundationEnd.toISOString().slice(0, 10), topicEnd.toISOString().slice(0, 10), ['专项攻克', '错题修复', '陌生题训练']),
    mk('sprint', topicEnd.toISOString().slice(0, 10), sprintEnd.toISOString().slice(0, 10), ['套卷限时', '全真模拟', '模考诊断']),
    mk('pre-exam', sprintEnd.toISOString().slice(0, 10), examDate, ['错题回顾', '高频考点', '心态调整']),
  ];
}
