/**
 * 通用能力增长系统领域模型
 * 覆盖学段：小学 / 初中 / 高中 / 成年人(公考)
 * 覆盖学科：数学 / 物理 / 行测 / 申论 / 面试
 */

export type GradeLevel = 'primary' | 'junior' | 'senior' | 'adult';
/**
 * 学科枚举
 * P0 学科: math / physics / xingce / shenlun / mianshi
 * P2 扩展学科: chinese / english / chemistry / biology
 *   预留接口, 首版能力标签库尚未填充, 允许用户自建能力体系
 */
export type Subject =
  | 'math'
  | 'physics'
  | 'xingce'
  | 'shenlun'
  | 'mianshi'
  | 'chinese'
  | 'english'
  | 'chemistry'
  | 'biology';

export const GRADE_LEVEL_LABEL: Record<GradeLevel, string> = {
  primary: '小学',
  junior: '初中',
  senior: '高中',
  adult: '成年人/公考',
};

export const SUBJECT_LABEL: Record<Subject, string> = {
  math: '数学',
  physics: '物理',
  xingce: '行测',
  shenlun: '申论',
  mianshi: '面试',
  chinese: '语文',
  english: '英语',
  chemistry: '化学',
  biology: '生物',
};

/** 学段可见学科矩阵
 *  P0 学科基于 PRD 5.1 定义, P2 语文/英语/化学/生物 通过设置扩展启用
 */
export const SUBJECT_MATRIX: Record<GradeLevel, Subject[]> = {
  primary: ['math', 'chinese', 'english'],
  junior: ['math', 'physics', 'chinese', 'english', 'chemistry', 'biology'],
  senior: ['math', 'physics', 'chinese', 'english', 'chemistry', 'biology'],
  adult: ['math', 'xingce', 'shenlun', 'mianshi'],
};

/** 已配备完整能力标签库(v1)的学科, 其余为扩展占位, 允许用户自建 */
export const FULLY_SUPPORTED_SUBJECTS: Subject[] = [
  'math',
  'physics',
  'xingce',
  'shenlun',
  'mianshi',
];

/** 掌握等级 */
export type MasteryLevel = 'unmastered' | 'basic' | 'proficient' | 'expert';

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  unmastered: '未掌握',
  basic: '初步',
  proficient: '熟练',
  expert: '精通',
};

export function scoreToLevel(score: number): MasteryLevel {
  if (score >= 86) return 'expert';
  if (score >= 61) return 'proficient';
  if (score >= 26) return 'basic';
  return 'unmastered';
}

/** 通用训练类型 */
export type TrainingType =
  | 'daily'
  | 'topic'
  | 'review'
  | 'unfamiliar'
  | 'timed'
  | 'experiment'
  | 'exam';

export const TRAINING_TYPE_LABEL: Record<TrainingType, string> = {
  daily: '日常练习',
  topic: '专项训练',
  review: '错题复习',
  unfamiliar: '陌生题训练',
  timed: '限时训练',
  experiment: '实验记录',
  exam: '测验/模考',
};

/** 通用错误类型 */
export type ErrorCategory =
  | 'concept'
  | 'formula'
  | 'calc'
  | 'read'
  | 'model'
  | 'logic'
  | 'norm'
  | 'method'
  | 'time'
  | 'experiment'
  | 'direction'
  | 'not-know'
  | 'judge'
  | 'point'
  | 'accuracy'
  | 'structure'
  | 'argument'
  | 'language'
  | 'format'
  | 'wordcount';

export const ERROR_CATEGORY_LABEL: Record<ErrorCategory, string> = {
  concept: '概念错误',
  formula: '公式记忆错误',
  calc: '计算错误',
  read: '审题错误',
  model: '建模错误',
  logic: '逻辑推理错误',
  norm: '规范书写错误',
  method: '方法选择错误',
  time: '时间/策略错误',
  experiment: '实验操作错误',
  direction: '方向/正负号错误',
  'not-know': '不会',
  judge: '判断错误',
  point: '漏要点',
  accuracy: '表述不准确',
  structure: '逻辑结构问题',
  argument: '论证不足',
  language: '语言表达问题',
  format: '格式问题',
  wordcount: '字数控制问题',
};

/** 训练记录 */
export interface TrainingRecord {
  id: string;
  studentId?: string;
  date: string;
  gradeLevel: GradeLevel;
  subject: Subject;
  module: string;
  trainingType: TrainingType;
  totalQuestions: number;
  correctCount: number;
  errorCount: number;
  durationMinutes?: number;
  errorCategories: ErrorCategory[];
  isUnfamiliar?: boolean;
  note?: string;
  taskId?: string;
  createdAt: string;
  updatedAt: string;
}

/** 能力缺口/问题 */
export interface AbilityGap {
  id: string;
  studentId?: string;
  subject: Subject;
  abilityPath: string;
  errorCategory: ErrorCategory;
  severity: 'light' | 'medium' | 'serious';
  status: 'unresolved' | 'in-progress' | 'verified';
  sourceRecordIds: string[];
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  suggestion?: string;
  createdAt: string;
  updatedAt: string;
}

/** 能力掌握度记录 - 按能力点单次快照 */
export interface AbilitySnapshot {
  id: string;
  studentId?: string;
  subject: Subject;
  abilityPath: string;
  score: number;
  level: MasteryLevel;
  confidence: number;
  source: 'training' | 'exam' | 'external_ai' | 'manual';
  sampleTotal?: number;
  sampleCorrect?: number;
  evidence?: string;
  evaluationTime: string;
  createdAt: string;
}

/** 学生档案(教师端) */
export interface StudentProfile {
  id: string;
  name: string;
  contact?: string;
  gradeLevel: GradeLevel;
  grade?: string;
  subjects: Subject[];
  stage?: 'foundation' | 'improve' | 'sprint' | 'maintain';
  goal?: string;
  group?: string;
  note?: string;
  examType?: 'national' | 'provincial' | 'selected' | 'public-inst' | 'military';
  examDate?: string;
  targetPost?: string;
  createdAt: string;
  updatedAt: string;
}

/** 日/周/月复盘记录 */
export type ReviewLevel = 'day' | 'week' | 'month';

export interface ReviewRecord {
  id: string;
  studentId?: string;
  level: ReviewLevel;
  date: string;
  did: string;
  issues: string;
  next: string;
  autoSummary?: {
    trainingCount: number;
    totalQuestions: number;
    errorCount: number;
    abilityDelta?: number;
  };
  createdAt: string;
  updatedAt: string;
}

/** 修复任务/验证任务 */
export interface FixTask {
  id: string;
  studentId?: string;
  subject: Subject;
  abilityPath: string;
  relatedGapId?: string;
  type: 'fix' | 'verify';
  status: 'pending' | 'in-progress' | 'done';
  suggestedAt: string;
  dueAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** 能力标签定义 (三级) */
export interface AbilityTag {
  path: string;
  subject: Subject;
  module: string;
  point: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  cycle: string;
  questionType?: string;
  gradeLevel?: GradeLevel;
}

export interface AbilityRadarSlice {
  key: string;
  label: string;
  weight: number;
  score: number;
  targetScore?: number;
}

/** ============ P1 扩展模型 ============ */

/** 教师批量任务模板 */
export interface TaskTemplate {
  id: string;
  name: string;
  gradeLevel: GradeLevel;
  subject: Subject;
  taskKind: 'topic' | 'review' | 'timed' | 'exam' | 'subjective' | 'interview' | 'experiment';
  suggestedQuestions: number;
  timeLimitMinutes?: number;
  moduleHint?: string;
  description?: string;
  builtin?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 任务下发 */
export interface Assignment {
  id: string;
  templateId?: string;
  title: string;
  gradeLevel: GradeLevel;
  subject: Subject;
  taskKind: string;
  module?: string;
  totalQuestions: number;
  timeLimitMinutes?: number;
  dueAt: string;
  assigneeStudentIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** 学生对某个任务的完成状态 */
export interface AssignmentProgress {
  id: string;
  assignmentId: string;
  studentId: string;
  status: 'pending' | 'in-progress' | 'submitted' | 'overdue';
  relatedTrainingId?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** 测验/模考诊断记录 */
export interface ExamRecord {
  id: string;
  studentId?: string;
  date: string;
  subject: Subject;
  scenario: string;
  totalQuestions: number;
  totalErrors: number;
  durationMinutes?: number;
  moduleBreakdown: Array<{
    module: string;
    total: number;
    errors: number;
    score: number;
    level: MasteryLevel;
  }>;
  mainProblems: string[];
  diagnosis: string;
  generatedTaskIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** 批改记录(教师端 - 主观题/理科解答/面试) */
export interface Correction {
  id: string;
  studentId: string;
  subject: Subject;
  scenario: string;
  date: string;
  originalContentRef?: string;
  problemTags: ErrorCategory[];
  quickPhrases: string[];
  suggestion: string;
  scoreDims?: Array<{ label: string; stars: number }>;
  relatedTrainingId?: string;
  relatedGapIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** 教师教学策略追踪 */
export interface TeachingStrategy {
  id: string;
  teacherLabel: string;
  targetStudentIds: string[];
  strategyName: string;
  description?: string;
  startDate: string;
  endDate?: string;
  status: 'active' | 'ended';
  metricsSnapshotBefore?: {
    avgMastery: number;
    unfamiliarCorrectRate: number;
  };
  metricsSnapshotAfter?: {
    avgMastery: number;
    unfamiliarCorrectRate: number;
  };
  effectivenessScore?: number;
  createdAt: string;
  updatedAt: string;
}

/** 公考报考信息 */
export interface ExamRegistration {
  id: string;
  studentId?: string;
  postName: string;
  department?: string;
  postLevel?: 'central' | 'province' | 'city' | 'county' | 'town';
  headcount?: number;
  educationLimit?: string;
  majorLimit?: string;
  applicantsHistory?: string;
  interviewLineHistory?: string;
  examType: 'national' | 'provincial' | 'selected' | 'public-inst' | 'military';
  examDate: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** 备考/学期阶段规划 */
export type PlanStage = 'foundation' | 'topic' | 'sprint' | 'pre-exam';

export interface StagePlan {
  id: string;
  studentId?: string;
  subject?: Subject;
  stage: PlanStage;
  startDate: string;
  endDate: string;
  focusModules: string[];
  focusAbilities: string[];
  weeklyGoal?: string;
  createdAt: string;
  updatedAt: string;
}

/** 间隔复习计划(艾宾浩斯类) */
export interface SpacedReviewItem {
  id: string;
  studentId?: string;
  subject: Subject;
  abilityPath: string;
  gradeLevel: GradeLevel;
  createdAt: string;
  updatedAt: string;
  intervals: number[];
  currentIndex: number;
  nextDueDate: string;
  completedDates: string[];
  status: 'active' | 'graduated';
}

/** 外部 AI 评估导入结果 */
export interface ExternalAIAssessment {
  meta: {
    student_id: string;
    grade_level: string;
    subject: Subject;
    scenario: string;
    evaluation_time: string;
    source: 'external_ai';
    ai_model?: string;
  };
  abilities: Array<{
    tag_path: string;
    mastery_score: number;
    mastery_level: MasteryLevel;
    confidence: number;
    evidence: string;
    sample_total?: number;
    sample_correct?: number;
  }>;
  issues: Array<{
    related_ability: string;
    issue_type: string;
    severity: 'light' | 'medium' | 'serious' | '轻微' | '中等' | '严重';
    frequency?: number;
    evidence: string;
    suggestion: string;
  }>;
  training_records?: Array<{
    subject: string;
    module: string;
    training_type: string;
    total_questions: number;
    correct_count: number;
    duration_minutes?: number;
    error_type_distribution?: Record<string, number>;
  }>;
  summary: {
    main_bottlenecks: string[];
    priority_fixes: string[];
    next_training_suggestions: string[];
  };
}

/** 预警级别 */
export type WarningLevel = 'high' | 'attention' | 'normal';

export interface WarningItem {
  studentId?: string;
  studentName: string;
  level: WarningLevel;
  reason: string;
  since?: string;
}
