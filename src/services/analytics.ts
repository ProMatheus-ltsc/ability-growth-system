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
  GradeLevel,
  MasteryLevel,
  StudentProfile,
  Subject,
  TrainingRecord,
  TrainingType,
  WarningItem,
  WarningLevel,
} from '../domain/types';
import { scoreToLevel, TRAINING_TYPE_LABEL } from '../domain/types';
import { getRadarDimensions } from '../domain/abilityTags';

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

export function aggregateBySubject(records: TrainingRecord[]): SubjectStats[] {
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
    const masteryScore = Math.round(
      unfamiliarCorrectRate === null
        ? correctRate * 100
        : (unfamiliarCorrectRate * 0.7 + correctRate * 0.3) * 100,
    );

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
): AbilityRadarSlice[] {
  const dims = getRadarDimensions(gradeLevel, subject);
  if (dims.length === 0) return [];

  const scoped = records.filter((r) => r.subject === subject);
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
      dim.modules.some((m) => a.abilityPath.includes(`/${m}/`)),
    );
    let score = 0;
    if (relatedSnapshots.length > 0) {
      score = Math.round(
        relatedSnapshots.reduce((s, a) => s + a.score, 0) / relatedSnapshots.length,
      );
    } else {
      const moduleRecs = scoped.filter((r) => dim.modules.includes(r.module));
      const q = moduleRecs.reduce((s, r) => s + r.totalQuestions, 0);
      const err = moduleRecs.reduce((s, r) => s + r.errorCount, 0);
      score = q === 0 ? 50 : Math.round(((q - err) / q) * 100);
    }
    return {
      key: dim.key,
      label: `${dim.label} · ${dim.weight}%`,
      weight: dim.weight,
      score,
      targetScore: 80,
    };
  });
}

export function buildGrowthSeries(records: TrainingRecord[], subject: Subject) {
  const scoped = records.filter((r) => r.subject === subject);
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
    const rate = (arr: TrainingRecord[]) => {
      const q = arr.reduce((s, r) => s + r.totalQuestions, 0);
      const err = arr.reduce((s, r) => s + r.errorCount, 0);
      return q === 0 ? 0 : ((q - err) / q) * 100;
    };
    const hours = list.reduce((s, r) => s + (r.durationMinutes ?? 0), 0) / 60;
    const delta = rate(late) - rate(early);
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

    // 能力退步检测: 近半月正确率 vs 之前半月
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const recent = scoped.filter((r) => new Date(r.date) >= twoWeeksAgo);
    const earlier = scoped.filter((r) => new Date(r.date) < twoWeeksAgo);
    if (recent.length > 3 && earlier.length > 3) {
      const rate = (arr: TrainingRecord[]) => {
        const q = arr.reduce((s, r) => s + r.totalQuestions, 0);
        const e = arr.reduce((s, r) => s + r.errorCount, 0);
        return q === 0 ? 0 : (q - e) / q;
      };
      if (rate(recent) - rate(earlier) < -0.05) {
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
 * - 若同学员+同学科+同模块+同错误类型已存在未验证缺口,则合并计数(occurrenceCount+1 · lastSeenAt 刷新)
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
    // 合并同类未验证缺口
    const existing = existingGaps.find(
      (g) =>
        g.studentId === record.studentId &&
        g.subject === record.subject &&
        g.abilityPath === abilityPath &&
        g.errorCategory === category &&
        g.status !== 'verified',
    );
    if (existing) {
      updated.push({
        ...existing,
        occurrenceCount: existing.occurrenceCount + 1,
        lastSeenAt: now,
        updatedAt: now,
        severity: severityMax(existing.severity, severity),
        sourceRecordIds: existing.sourceRecordIds.includes(record.id)
          ? existing.sourceRecordIds
          : [...existing.sourceRecordIds, record.id].slice(-20),
      });
    } else {
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
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return updated;
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
 * - source = 'training'(与 external_ai / exam / manual 区分)
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
