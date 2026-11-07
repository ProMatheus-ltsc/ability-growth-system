/**
 * 学习素养服务 (PRD V5.8 §18A)
 *
 * 零新增测评: 五大维度的所有量化指标从现有场景数据派生
 *  - 元认知能力      ← 日复盘完成率 / 陌生题主动占比 / 错误复现率下降
 *  - 时间管理与规划  ← 今日工作台任务完成率 / 拖延占比 / 复习节点准时率
 *  - 信息检索处理    ← 训练记录订正字段填写率 / 错题关联率
 *  - 批判性思维      ← 存疑标记数 / 一题多解 / 判断类错误占比
 *  - 协作沟通        ← 讲解他人次数 / 小组任务角色 / 互助修复
 *
 * 学段分级(L1/L2/L3)基于 PRD §18A.4。
 */
import type {
  AbilityGap,
  GradeLevel,
  LiteracyDimension,
  LiteracyLevel,
  LiteracyMeasurement,
  ReviewRecord,
  TrainingRecord,
} from '../domain/types';

export interface LiteracyDimensionSummary {
  dimension: LiteracyDimension;
  level: LiteracyLevel;
  score: number;
  measurements: LiteracyMeasurement[];
}

/** 主入口: 从现有场景数据派生五维锚点 */
export function deriveLiteracyProfile(
  gradeLevel: GradeLevel,
  trainings: TrainingRecord[],
  reviews: ReviewRecord[],
  gaps: AbilityGap[],
): LiteracyDimensionSummary[] {
  return [
    deriveMetacognition(gradeLevel, trainings, reviews, gaps),
    deriveTimeManagement(gradeLevel, trainings, reviews),
    deriveInfoProcessing(gradeLevel, trainings, gaps),
    deriveCriticalThinking(gradeLevel, trainings, gaps),
    deriveCollaboration(gradeLevel, trainings, reviews),
  ];
}

// ==================== 元认知能力 ====================

function deriveMetacognition(
  _gradeLevel: GradeLevel,
  trainings: TrainingRecord[],
  reviews: ReviewRecord[],
  gaps: AbilityGap[],
): LiteracyDimensionSummary {
  const measurements: LiteracyMeasurement[] = [];

  // 日复盘完成率(过去 8 周)
  const now = Date.now();
  const eightWeeksAgo = now - 8 * 7 * 86400000;
  const dailyReviews = reviews.filter(
    (r) => r.level === 'day' && new Date(r.date).getTime() >= eightWeeksAgo,
  );
  const rate = Math.min(1, dailyReviews.length / (8 * 7));
  measurements.push({
    dimension: 'metacognition',
    indicator: '日复盘完成率(8 周)',
    value: +(rate * 100).toFixed(1),
    level: rate >= 0.9 ? 'L3' : rate >= 0.8 ? 'L2' : rate >= 0.6 ? 'L1' : 'L1',
    evidence: `过去 8 周共 ${dailyReviews.length} 次日复盘`,
    measuredAt: new Date().toISOString(),
  });

  // 陌生题主动训练占比
  const totalTraining = trainings.length;
  const unfamiliar = trainings.filter((t) => t.isUnfamiliar).length;
  const unfamiliarRate = totalTraining === 0 ? 0 : unfamiliar / totalTraining;
  measurements.push({
    dimension: 'metacognition',
    indicator: '陌生题主动训练占比',
    value: +(unfamiliarRate * 100).toFixed(1),
    level: unfamiliarRate >= 0.3 ? 'L3' : unfamiliarRate >= 0.15 ? 'L2' : 'L1',
    evidence: `${unfamiliar}/${totalTraining} 次训练为陌生题`,
    measuredAt: new Date().toISOString(),
  });

  // 错误修复率(gaps status verified 占比)
  const totalGaps = gaps.length;
  const verified = gaps.filter((g) => g.status === 'verified').length;
  const fixRate = totalGaps === 0 ? 0 : verified / totalGaps;
  measurements.push({
    dimension: 'metacognition',
    indicator: '能力缺口验证率',
    value: +(fixRate * 100).toFixed(1),
    level: fixRate >= 0.6 ? 'L3' : fixRate >= 0.3 ? 'L2' : 'L1',
    evidence: `${verified}/${totalGaps} 缺口已验证修复`,
    measuredAt: new Date().toISOString(),
  });

  return aggregateSummary('metacognition', measurements);
}

// ==================== 时间管理与自主规划 ====================

function deriveTimeManagement(
  _gradeLevel: GradeLevel,
  trainings: TrainingRecord[],
  reviews: ReviewRecord[],
): LiteracyDimensionSummary {
  const measurements: LiteracyMeasurement[] = [];

  // 训练频次(近 4 周)
  const fourWeeksAgo = Date.now() - 4 * 7 * 86400000;
  const recentTrainings = trainings.filter((t) => new Date(t.date).getTime() >= fourWeeksAgo);
  const days = new Set(recentTrainings.map((t) => t.date)).size;
  const frequency = days / 28;
  measurements.push({
    dimension: 'time-management',
    indicator: '训练日频度(近 4 周)',
    value: +(frequency * 100).toFixed(1),
    level: frequency >= 0.7 ? 'L3' : frequency >= 0.5 ? 'L2' : 'L1',
    evidence: `28 天中 ${days} 天有训练记录`,
    measuredAt: new Date().toISOString(),
  });

  // 周复盘完成率
  const weekReviews = reviews.filter((r) => r.level === 'week');
  const weekRate = Math.min(1, weekReviews.length / 4);
  measurements.push({
    dimension: 'time-management',
    indicator: '周复盘完成率(近 4 周)',
    value: +(weekRate * 100).toFixed(1),
    level: weekRate >= 0.75 ? 'L3' : weekRate >= 0.5 ? 'L2' : 'L1',
    evidence: `近 4 周完成 ${weekReviews.length} 次周复盘`,
    measuredAt: new Date().toISOString(),
  });

  return aggregateSummary('time-management', measurements);
}

// ==================== 信息检索与处理 ====================

function deriveInfoProcessing(
  _gradeLevel: GradeLevel,
  trainings: TrainingRecord[],
  gaps: AbilityGap[],
): LiteracyDimensionSummary {
  const measurements: LiteracyMeasurement[] = [];

  // 带备注的训练记录占比(视为订正溯源)
  const withNote = trainings.filter((t) => t.note && t.note.trim().length > 0).length;
  const total = trainings.length;
  const noteRate = total === 0 ? 0 : withNote / total;
  measurements.push({
    dimension: 'info-processing',
    indicator: '带备注/订正说明的训练比例',
    value: +(noteRate * 100).toFixed(1),
    level: noteRate >= 0.6 ? 'L3' : noteRate >= 0.3 ? 'L2' : 'L1',
    evidence: `${withNote}/${total} 次训练带备注说明`,
    measuredAt: new Date().toISOString(),
  });

  // 平均能力缺口关联训练记录数
  const totalGaps = gaps.length;
  const linked = gaps.filter((g) => g.sourceRecordIds && g.sourceRecordIds.length > 0).length;
  const linkRate = totalGaps === 0 ? 0 : linked / totalGaps;
  measurements.push({
    dimension: 'info-processing',
    indicator: '能力缺口关联训练记录率',
    value: +(linkRate * 100).toFixed(1),
    level: linkRate >= 0.5 ? 'L3' : linkRate >= 0.25 ? 'L2' : 'L1',
    evidence: `${linked}/${totalGaps} 缺口关联到具体训练`,
    measuredAt: new Date().toISOString(),
  });

  return aggregateSummary('info-processing', measurements);
}

// ==================== 批判性思维 ====================

function deriveCriticalThinking(
  _gradeLevel: GradeLevel,
  trainings: TrainingRecord[],
  gaps: AbilityGap[],
): LiteracyDimensionSummary {
  const measurements: LiteracyMeasurement[] = [];

  // 判断类错误占比趋势
  const judgeErrors = trainings.filter((t) => t.errorCategories.includes('judge')).length;
  const judgeRate = trainings.length === 0 ? 0 : judgeErrors / trainings.length;
  measurements.push({
    dimension: 'critical-thinking',
    indicator: '判断类错误占比(越低越好)',
    value: +(100 - judgeRate * 100).toFixed(1),
    level: judgeRate <= 0.1 ? 'L3' : judgeRate <= 0.25 ? 'L2' : 'L1',
    evidence: `${judgeErrors}/${trainings.length} 次训练出现判断类错误`,
    measuredAt: new Date().toISOString(),
  });

  // 错误多样性(表示对错误的多维度识别)
  const errorTypes = new Set<string>();
  trainings.forEach((t) => t.errorCategories.forEach((c) => errorTypes.add(c)));
  const diversity = Math.min(1, errorTypes.size / 10);
  measurements.push({
    dimension: 'critical-thinking',
    indicator: '错误类型识别多样性',
    value: +(diversity * 100).toFixed(1),
    level: diversity >= 0.6 ? 'L3' : diversity >= 0.3 ? 'L2' : 'L1',
    evidence: `识别 ${errorTypes.size} 种错误类型`,
    measuredAt: new Date().toISOString(),
  });

  // 已验证能力缺口占比(体现"质疑并修正")
  const verified = gaps.filter((g) => g.status === 'verified').length;
  const verifyRate = gaps.length === 0 ? 0 : verified / gaps.length;
  measurements.push({
    dimension: 'critical-thinking',
    indicator: '缺口经陌生题验证通过率',
    value: +(verifyRate * 100).toFixed(1),
    level: verifyRate >= 0.5 ? 'L3' : verifyRate >= 0.25 ? 'L2' : 'L1',
    evidence: `${verified}/${gaps.length} 缺口验证通过`,
    measuredAt: new Date().toISOString(),
  });

  return aggregateSummary('critical-thinking', measurements);
}

// ==================== 协作沟通 ====================

function deriveCollaboration(
  _gradeLevel: GradeLevel,
  trainings: TrainingRecord[],
  reviews: ReviewRecord[],
): LiteracyDimensionSummary {
  const measurements: LiteracyMeasurement[] = [];

  // 系统内暂不收集"讲题"等社交行为数据, 这里给出保守占位, 待教师端补录后升级
  const experimentTraining = trainings.filter((t) => t.trainingType === 'experiment').length;
  const collaborativeSignal = experimentTraining + reviews.filter((r) => r.did.includes('讲')).length;
  const rate = Math.min(1, collaborativeSignal / 5);
  measurements.push({
    dimension: 'collaboration',
    indicator: '协作/讲题行为信号(近期)',
    value: +(rate * 100).toFixed(1),
    level: rate >= 0.6 ? 'L3' : rate >= 0.3 ? 'L2' : 'L1',
    evidence: `识别到 ${collaborativeSignal} 次协作/讲题信号`,
    measuredAt: new Date().toISOString(),
  });

  return aggregateSummary('collaboration', measurements);
}

// ==================== 汇总 ====================

function aggregateSummary(dimension: LiteracyDimension, measurements: LiteracyMeasurement[]): LiteracyDimensionSummary {
  const avg = measurements.length === 0 ? 0 : measurements.reduce((s, m) => s + m.value, 0) / measurements.length;
  const level: LiteracyLevel = avg >= 75 ? 'L3' : avg >= 50 ? 'L2' : 'L1';
  return { dimension, level, score: +avg.toFixed(1), measurements };
}

// ==================== V5.8 深化补齐 ====================

import type { CollaborationEvent, StudentProfile } from '../domain/types';
import { getAllRecords, putRecord } from './localDB';
import { v4 as uuid } from 'uuid';

/** §18A.3 讲题/协作行为专项录入 */
export async function recordCollaborationEvent(
  input: Omit<CollaborationEvent, 'id' | 'createdAt'>,
): Promise<CollaborationEvent> {
  const record: CollaborationEvent = { id: uuid(), createdAt: new Date().toISOString(), ...input };
  await putRecord('collaborationEvents', record);
  return record;
}

export async function listCollaborationEvents(studentId?: string): Promise<CollaborationEvent[]> {
  const all = await getAllRecords('collaborationEvents');
  return all
    .filter((r) => (studentId ? r.studentId === studentId : true))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** §18A.5 学期素养成长报告 - 汇总一段时间的五维行为证据链 */
export interface LiteracyTermReport {
  studentId?: string;
  termLabel: string;
  fromDate: string;
  toDate: string;
  dimensions: LiteracyDimensionSummary[];
  collaborationHighlights: string[];
  deltaVsPrevious?: Record<LiteracyDimension, number>;
}

export function buildTermReport(
  gradeLevel: import('../domain/types').GradeLevel,
  trainings: import('../domain/types').TrainingRecord[],
  reviews: import('../domain/types').ReviewRecord[],
  gaps: import('../domain/types').AbilityGap[],
  collabEvents: CollaborationEvent[],
  fromDate: string,
  toDate: string,
): LiteracyTermReport {
  const scoped = {
    trainings: trainings.filter((t) => t.date >= fromDate && t.date <= toDate),
    reviews: reviews.filter((r) => r.date >= fromDate && r.date <= toDate),
    gaps: gaps.filter((g) => g.updatedAt.slice(0, 10) >= fromDate && g.updatedAt.slice(0, 10) <= toDate),
  };
  const dimensions = deriveLiteracyProfile(gradeLevel, scoped.trainings, scoped.reviews, scoped.gaps);
  const collaborationHighlights = collabEvents
    .filter((e) => e.date >= fromDate && e.date <= toDate)
    .slice(0, 5)
    .map((e) => `${e.date} · ${e.kind === 'explain' ? '讲题' : e.kind === 'group-task' ? '小组任务' : '互助修复'} · ${e.content}`);

  return {
    termLabel: `${fromDate.slice(0, 7)} 至 ${toDate.slice(0, 7)}`,
    fromDate,
    toDate,
    dimensions,
    collaborationHighlights,
  };
}

/** §18A.5 教师端班级学习素养分布 */
export interface LiteracyClassStat {
  gradeLevel: import('../domain/types').GradeLevel;
  studentCount: number;
  dimensionAverages: Record<LiteracyDimension, number>;
}

export async function summarizeClassLiteracy(students: StudentProfile[]): Promise<LiteracyClassStat[]> {
  const byGrade = new Map<string, StudentProfile[]>();
  for (const s of students) {
    const arr = byGrade.get(s.gradeLevel) ?? [];
    arr.push(s);
    byGrade.set(s.gradeLevel, arr);
  }
  const out: LiteracyClassStat[] = [];
  for (const [grade, list] of byGrade) {
    if (grade === 'adult') continue;
    const perDim: Record<LiteracyDimension, number[]> = {
      metacognition: [], 'time-management': [], 'info-processing': [], 'critical-thinking': [], collaboration: [],
    };
    const allTrainings = await getAllRecords('trainings');
    const allReviews = await getAllRecords('reviews');
    const allGaps = await getAllRecords('gaps');
    for (const s of list) {
      const t = allTrainings.filter((r) => r.studentId === s.id);
      const r = allReviews.filter((x) => x.studentId === s.id);
      const g = allGaps.filter((x) => x.studentId === s.id);
      const profile = deriveLiteracyProfile(s.gradeLevel, t, r, g);
      for (const p of profile) perDim[p.dimension].push(p.score);
    }
    const avg: Record<LiteracyDimension, number> = {} as Record<LiteracyDimension, number>;
    for (const key of Object.keys(perDim) as LiteracyDimension[]) {
      const arr = perDim[key];
      avg[key] = arr.length === 0 ? 0 : +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1);
    }
    out.push({ gradeLevel: grade as import('../domain/types').GradeLevel, studentCount: list.length, dimensionAverages: avg });
  }
  return out;
}

/**
 * §18A.5 与职业选择联动 - 从素养派生能力校准值
 * V5.12 · 只保留强因果映射;弱语义映射(time→endurance / critical→probability / collab→expression)已删除
 */
export function literacyToAbilityCalibration(
  profile: LiteracyDimensionSummary[],
): Partial<Record<import('../domain/types').AbilityEightDim, number>> {
  const map: Partial<Record<LiteracyDimension, import('../domain/types').AbilityEightDim>> = {
    metacognition: 'metacognition',
    'info-processing': 'structure',
  };
  const out: Partial<Record<import('../domain/types').AbilityEightDim, number>> = {};
  for (const p of profile) {
    const target = map[p.dimension];
    // 无 measurements 时 aggregateSummary 返回 score=0,视为无数据,跳过
    if (target && p.measurements.length > 0 && p.score > 0) out[target] = p.score;
  }
  return out;
}
