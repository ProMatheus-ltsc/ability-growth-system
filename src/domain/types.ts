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

/** 学段可见学科矩阵 (PRD V5.8 §5)
 *  重要:成年人学段**不再**提供数学模块;公考行测的数量关系/资料分析
 *  已内置于行测能力体系(见 §13),无需单独配置数学学科。
 *  P2 语文/英语/化学/生物 通过设置扩展启用(K12 学段)。
 */
export const SUBJECT_MATRIX: Record<GradeLevel, Subject[]> = {
  primary: ['math', 'chinese', 'english'],
  junior: ['math', 'physics', 'chinese', 'english', 'chemistry', 'biology'],
  senior: ['math', 'physics', 'chinese', 'english', 'chemistry', 'biology'],
  adult: ['xingce', 'shenlun', 'mianshi'],
};

/** 已配备完整能力标签库(v1)的学科, 其余为扩展占位, 允许用户自建 */
export const FULLY_SUPPORTED_SUBJECTS: Subject[] = [
  'math',
  'physics',
  'xingce',
  'shenlun',
  'mianshi',
];

/** 学段模块可见性 (PRD V5.8 §5 · §18A · §30 · §31)
 *  用于新增的三个通用模块的门控:
 *  - 问题跟进(PDCA)     : 仅成年人
 *  - 职业选择(生涯测评) : 初中 / 高中 / 成年人
 *  - 学习素养(K12 通用) : 小学 / 初中 / 高中
 */
export const MODULE_VISIBILITY: Record<GradeLevel, {
  pdca: boolean;
  career: boolean;
  literacy: boolean;
  examRegistration: boolean;
}> = {
  primary: { pdca: false, career: false, literacy: true, examRegistration: false },
  junior:  { pdca: false, career: true,  literacy: true, examRegistration: false },
  senior:  { pdca: false, career: true,  literacy: true, examRegistration: false },
  adult:   { pdca: true,  career: true,  literacy: false, examRegistration: true  },
};

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

/** ============ PRD V5.8 · §30 问题跟进 (PDCA) ============ */

export type PDCAStage =
  | 'p1-define'
  | 'p2-root-cause'
  | 'p3-countermeasure'
  | 'd-execute'
  | 'c-check'
  | 'a-act';

export const PDCA_STAGE_LABEL: Record<PDCAStage, string> = {
  'p1-define': '问题定义 (P1)',
  'p2-root-cause': '根因分析 (P2)',
  'p3-countermeasure': '对策制定 (P3)',
  'd-execute': '执行 (D)',
  'c-check': '检查 (C)',
  'a-act': '修正 (A)',
};

export type PDCAProblemType = 'restore' | 'prevent' | 'pursue';

export const PDCA_PROBLEM_TYPE_LABEL: Record<PDCAProblemType, string> = {
  restore: '恢复原状型',
  prevent: '预防隐患型',
  pursue: '追求理想型',
};

export type LifeDomain = 'learning' | 'work' | 'life';

export const LIFE_DOMAIN_LABEL: Record<LifeDomain, string> = {
  learning: '个人学习',
  work: '工作项目',
  life: '生活事务',
};

export type PDCAActExit = 'archived' | 'next-cycle' | 'adjust-countermeasure';

/** V5.11 §30.3 P1 · 感性信号六法(默认 2 种 + 折叠 4 种) */
export type SensorySignalMethod =
  | 'most'       // 最字法(默认)
  | 'always'     // 总字法(默认)
  | 'instinct'   // 无意识第一反应
  | 'body'       // 身体信号
  | 'intuition'  // 直觉
  | 'dream';     // 梦境

export const SENSORY_SIGNAL_LABEL: Record<SensorySignalMethod, string> = {
  most: '最字法(最触动)',
  always: '总字法(挥之不去)',
  instinct: '无意识第一反应',
  body: '身体信号',
  intuition: '直觉',
  dream: '梦境线索',
};

export const SENSORY_SIGNAL_DEFAULT: SensorySignalMethod[] = ['most', 'always'];
export const SENSORY_SIGNAL_ADVANCED: SensorySignalMethod[] = ['instinct', 'body', 'intuition', 'dream'];

/** V5.11 §30.3 P1 · 信息分类(记述/评价/规范) */
export type InformationType = 'descriptive' | 'evaluative' | 'normative';

export const INFORMATION_TYPE_LABEL: Record<InformationType, string> = {
  descriptive: '记述信息(客观事实)',
  evaluative: '评价信息(主观判断)',
  normative: '规范信息(意见建议)',
};

export const INFORMATION_TYPE_ARGUMENT: Record<InformationType, string> = {
  descriptive: '因果关系与实证论证',
  evaluative: '评价条目与评价标准',
  normative: '行动原理论证',
};

/** V5.11 §30.3 P2 · MECE 结构与构建路径 */
export type MECEStructure = 'serial' | 'parallel';

export const MECE_STRUCTURE_LABEL: Record<MECEStructure, string> = {
  serial: '直列型(单一主因链)',
  parallel: '并列型(互斥子问题)',
};

export type MECEBuildPath = 'bottom-up' | 'top-down';

export const MECE_BUILD_PATH_LABEL: Record<MECEBuildPath, string> = {
  'bottom-up': '由下而上(结论法/摘要法)',
  'top-down': '由上而下(理由法/详述法)',
};

/** PDCA 根因条目 */
export interface PDCARootCause {
  id: string;
  content: string;
  impact: 'high' | 'medium' | 'low';
  /** V5.11 · 信息分类标注 */
  informationType?: InformationType;
  /** V5.11 · 评价标准(仅评价信息时启用) */
  evaluationCriterion?: string;
  createdAt: string;
}

/** PDCA 对策条目 (5W1H) */
export interface PDCACountermeasure {
  id: string;
  content: string;
  rationale?: string;
  rootCauseId?: string;
  who?: string;
  when?: string;
  where?: string;
  how?: string;
  scheduledDate?: string;
  status: 'pending' | 'in-progress' | 'done' | 'invalidated';
  completedAt?: string;
  note?: string;
  /** V5.11 · 疯帽匠时间(15% 无约束探索,不计入进度) */
  isMadHatter?: boolean;
  /** V5.11 · 亲手完成最小动作(应对"不愿把手弄脏"型问题) */
  hasHandsOnMinimalAction?: boolean;
  /** V5.11 · ACE A-Anticipate: SWOT 预判 */
  swot?: {
    strengths?: string;
    weaknesses?: string;
    opportunities?: string;
    threats?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** PDCA 检查记录 (ORID) */
export interface PDCACheckEntry {
  id: string;
  countermeasureId?: string;
  expected: string;
  actual: string;
  gapNote: string;
  emotionTag?: string;
  factAnalysis?: string;
  nextAction?: string;
  /** V5.11 · ACE C-Connect: 跨模块引用 */
  crossRefs?: Array<{
    module: 'timeline' | 'analytics' | 'review';
    refId: string;
    note?: string;
  }>;
  createdAt: string;
}

/** V5.11 §30.9 · 闭环阻碍类型 */
export type ClosureObstacleType =
  | 'multi-party'      // 依赖外部多方协作
  | 'org-endpoint'     // 超大组织的执行末端
  | 'hands-off'        // 不愿把手弄脏
  | 'perfectionism';   // 完美主义与拖延

export const CLOSURE_OBSTACLE_LABEL: Record<ClosureObstacleType, string> = {
  'multi-party': '多方协作依赖型',
  'org-endpoint': '组织末端受限型',
  'hands-off': '不愿把手弄脏型',
  perfectionism: '完美主义拖延型',
};

/** 问题跟进主实体 */
export interface PDCAProblem {
  id: string;
  studentId?: string;
  title: string;
  description: string;
  problemType: PDCAProblemType;
  lifeDomain: LifeDomain;
  targetState: string;
  successCriteria: string;
  expectedDueAt?: string;
  currentStage: PDCAStage;
  currentCycle: number;
  status: 'active' | 'archived';
  stageEnteredAt: string;
  rootCauses: PDCARootCause[];
  countermeasures: PDCACountermeasure[];
  checkEntries: PDCACheckEntry[];
  archivedLessons?: string[];
  cycleHistory?: Array<{
    cycle: number;
    startedAt: string;
    endedAt: string;
    exit: PDCAActExit;
    gapNote?: string;
  }>;
  /** V5.11 · 使用的感性信号方法 */
  sensorySignals?: SensorySignalMethod[];
  /** V5.11 · MECE 结构选择 */
  meceStructure?: MECEStructure;
  /** V5.11 · MECE 构建路径 */
  meceBuildPath?: MECEBuildPath;
  /** V5.11 · 闭环阻碍标注 */
  closureObstacle?: ClosureObstacleType;
  /** V5.11 · 部分解决连续轮次(用于 ACE E-Evolve 变异触发) */
  partialSolvedStreak?: number;
  createdAt: string;
  updatedAt: string;
}

/** ============ PRD V5.8 · §31 职业选择 ============ */

/** 五层价值观维度 */
export type ValueDimension =
  | 'achievement'   // 成就/能力/收入
  | 'growth'        // 成长/清晰感
  | 'safety'        // 安全/健康边界
  | 'relationship'  // 关系/陪伴
  | 'freedom';      // 自由

export const VALUE_DIMENSION_LABEL: Record<ValueDimension, string> = {
  achievement: '成就 & 能力 & 收入',
  growth: '成长 & 清晰感',
  safety: '安全边界 & 健康',
  relationship: '关系 & 陪伴',
  freedom: '自由度',
};

/** 底线价值 (§31.3) */
export type BottomLine =
  | 'health'
  | 'safety-boundary'
  | 'relationship'
  | 'authenticity'
  | 'dignity';

export const BOTTOM_LINE_LABEL: Record<BottomLine, string> = {
  health: '健康',
  'safety-boundary': '安全边界',
  relationship: '关系与陪伴',
  authenticity: '内在真实性',
  dignity: '尊严',
};

/** 价值代价标签 (§31.6) */
export type ValueCostTag =
  | 'health-cost'
  | 'unstable-life'
  | 'sacrifice-relation'
  | 'authenticity-cost'
  | 'dignity-cost'
  | 'none';

export const VALUE_COST_LABEL: Record<ValueCostTag, string> = {
  'health-cost': '健康透支型',
  'unstable-life': '生存不稳型',
  'sacrifice-relation': '关系牺牲型',
  'authenticity-cost': '违背真实型',
  'dignity-cost': '尊严损耗型',
  none: '无明显代价',
};

/** MBTI 四维度 */
export type MBTIAxis = 'EI' | 'SN' | 'TF' | 'JP';

export interface MBTIScore {
  E: number; I: number;
  S: number; N: number;
  T: number; F: number;
  J: number; P: number;
  type: string;
}

/** 能力八维 (§31.4) */
export type AbilityEightDim =
  | 'structure' | 'metacognition' | 'endurance'
  | 'expression' | 'logic-tool' | 'probability'
  | 'emotion-shield' | 'cross-domain';

export const ABILITY_EIGHT_LABEL: Record<AbilityEightDim, string> = {
  structure: '结构化与模式识别',
  metacognition: '元认知',
  endurance: '积累型耐力',
  expression: '表达传授',
  'logic-tool': '逻辑工具',
  probability: '概率风控',
  'emotion-shield': '情绪隔离',
  'cross-domain': '跨界整合',
};

/** 兴趣×能力四象限 */
export type CareerQuadrant = 'advantage' | 'invest' | 'backup' | 'avoid';

export const CAREER_QUADRANT_LABEL: Record<CareerQuadrant, string> = {
  advantage: '优势区',
  invest: '培养区',
  backup: '备选区',
  avoid: '避坑区',
};

/** V5.11 §31.2 · 作答可信度评分 */
export interface AnswerCredibilityScore {
  /** 总分 0-100 */
  totalScore: number;
  /** 干扰项匹配率(40%) */
  lieScaleMatch: number;
  /** 维度内一致性(30%) */
  consistencyScore: number;
  /** 作答时间合理性(20%) */
  timingScore: number;
  /** 极端选项分布(10%) */
  extremeDistScore: number;
  /** 是否低置信度触发重测提示(<70) */
  requiresRetest: boolean;
  /** 低置信度维度清单(维度级降级) */
  lowConfidenceDimensions?: string[];
}

/** V5.11 §31.2 · 干扰项作答记录 */
export interface LieScaleResponse {
  itemId: string;
  section: 'values' | 'personality' | 'ability';
  originalDimension: string;
  reverseKey: string;
  answer: string | number;
  isReverseConsistent: boolean;
  responseTimeMs?: number;
}

/** V5.11 §31.3 · 价值澄清五步进度 */
export type ValueClarificationStep =
  | 'free-choice'      // ①自由选择
  | 'full-consider'    // ②充分考虑
  | 'cherish-share'    // ③珍视并公开
  | 'take-action'      // ④付诸行动
  | 'lifestyle';       // ⑤成为生活方式

export const VALUE_CLARIFICATION_STEP_LABEL: Record<ValueClarificationStep, string> = {
  'free-choice': '①自由选择',
  'full-consider': '②充分考虑',
  'cherish-share': '③珍视并公开',
  'take-action': '④付诸行动',
  lifestyle: '⑤成为生活方式',
};

/** V5.11 §31.3 · 3 个月轻量观察点 */
export interface CareerObservationPoint {
  id: string;
  assessmentId: string;
  studentId?: string;
  triggeredAt: string;
  layerConsistency: Array<{ layer: ValueDimension; consistent: boolean; note?: string }>;
  smallStepActions: Array<{
    id: string;
    valueDim: ValueDimension;
    action: string;
    status: 'pending' | 'done' | 'skipped';
    completedAt?: string;
  }>;
  createdAt: string;
}

/** V5.11 §31.3 · 事后反思 2 问(重测前置) */
export interface RetestReflection {
  id: string;
  assessmentId: string;
  studentId?: string;
  question1Answer: string; // 最放不下的顾虑
  question1Tags: string[];
  question2Answer: string; // 至今不后悔的选择
  question2Tags: string[];
  createdAt: string;
}

/** 职业测评单次结果 (一体化保存) */
export interface CareerAssessment {
  id: string;
  studentId?: string;
  gradeLevel: GradeLevel;
  version: '1.0' | '2.0';
  values: {
    ranked: ValueDimension[];
    bottomLines: BottomLine[];
    highlightTags: string[];
    achievementMotives?: string[];
    /** V5.11 · 目标 vs 价值观辨别标注 */
    goalItems?: string[];
    /** V5.11 · 一句话价值观说明书 */
    valueStatement?: string;
    /** V5.11 · 未来蓝图(选填,九段心法·愿景) */
    futureVision?: string;
    /** V5.11 §31.3 · 投射题作答记录(敬佩/终点/情绪反应) */
    projectionInsights?: Array<{
      questionId: string;
      selectedOptions: string[];
      tags: string[];
    }>;
    /** V5.11 §31.3 · 他评校准卡录入结果 */
    externalFeedback?: Array<{
      questionId: string;
      answer: string;
      tags: string[];
    }>;
  };
  ability: {
    scores: Record<AbilityEightDim, number>;
    selfOnly: AbilityEightDim[];
    calibratedFromSystem: AbilityEightDim[];
  };
  personality: MBTIScore;
  /** V5.11 · 作答可信度评分 */
  credibilityScore?: AnswerCredibilityScore;
  /** V5.11 · 干扰项作答记录 */
  lieScaleResponses?: LieScaleResponse[];
  /** V5.11 · 五步澄清当前所处步骤 */
  clarificationStep?: ValueClarificationStep;
  /** V5.11 · 作答开始时间/结束时间(用于计算时长合理性) */
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** V5.11 §31.6 · 组织文化特征标签 */
export type OrgCultureTag =
  | 'hierarchical'    // 等级分明
  | 'flat'            // 扁平开放
  | 'result-driven'   // 结果导向
  | 'process-driven'  // 过程导向
  | 'high-competition' // 高强度竞争
  | 'slow-stable'     // 慢节奏稳定
  | 'obedience'       // 强调服从
  | 'question-encouraged'; // 鼓励质疑

export const ORG_CULTURE_LABEL: Record<OrgCultureTag, string> = {
  hierarchical: '等级分明',
  flat: '扁平开放',
  'result-driven': '结果导向',
  'process-driven': '过程导向',
  'high-competition': '高强度竞争',
  'slow-stable': '慢节奏稳定',
  obedience: '强调服从',
  'question-encouraged': '鼓励质疑',
};

/** 职业候选(既可来源于本地库,也可来源于外部 AI) */
export interface CareerCandidate {
  id: string;
  source: 'builtin' | 'external_ai';
  industry: string;
  profession: string;
  position: string;
  quadrant: CareerQuadrant;
  valueCostTags: ValueCostTag[];
  vetoReason?: string;
  planB?: string;
  planC?: string;
  reasoning?: {
    personality?: string;
    ability?: string;
    value?: string;
    interest?: string;
  };
  aiConfidence?: number;
  /** V5.11 §31.6 · 组织文化特征(定性提示,不参与打分) */
  cultureTags?: OrgCultureTag[];
  /** V5.11 · 文化摩擦提示(用户价值观 vs 该职业典型文化) */
  cultureFrictionNotes?: string[];
}

/** V5.11 §31.6 · 三叉戟职业发展结构(仅成年人) */
export interface TridentStructure {
  /** 主线深耕 - 三定输出的核心方向 */
  mainline: {
    profession: string;
    phase: 'foundation' | 'asset' | 'leverage';
    phaseLabel: string;
    timeRange: string;
  };
  /** 副线试错 - 低成本验证的兴趣延伸(最多 2 条) */
  sidelines: Array<{
    id: string;
    profession: string;
    problemId?: string; // 关联到 §30 跟进问题
    testCycle: string;
    status: 'exploring' | 'validated' | 'archived';
  }>;
  /** 资产底盘 */
  assetBase: {
    skillAssets: string[];      // 能力资产
    methodAssets: string[];     // 方法论资产
    workDataAssets: string[];   // 作品与数据资产
    targetYears: string;
  };
}

/** 职业定位报告 */
export interface CareerReport {
  id: string;
  assessmentId: string;
  studentId?: string;
  gradeLevel: GradeLevel;
  generatedAt: string;
  quadrant: CareerQuadrant;
  survivors: CareerCandidate[];
  vetoed: CareerCandidate[];
  routes: {
    expertBias: number;
    managementBias: number;
    dominant: 'expert' | 'management' | 'balanced';
  };
  bottomLineNotes: string[];
  /** V5.11 · 三叉戟结构(仅成年人) */
  trident?: TridentStructure;
  /** V5.11 · 是否已生成 3 个月观察点提醒 */
  observationDueAt?: string;
  createdAt: string;
}

/** ============ PRD V5.8 · §18A 学习素养 ============ */

export type LiteracyDimension =
  | 'metacognition'
  | 'time-management'
  | 'info-processing'
  | 'critical-thinking'
  | 'collaboration';

export const LITERACY_DIMENSION_LABEL: Record<LiteracyDimension, string> = {
  metacognition: '元认知能力',
  'time-management': '时间管理与自主规划',
  'info-processing': '信息检索与处理',
  'critical-thinking': '批判性思维',
  collaboration: '协作沟通',
};

export type LiteracyLevel = 'L1' | 'L2' | 'L3';

/** 单次自动量化的行为锚点采样 (由现有场景数据派生, 不新增测评) */
export interface LiteracyMeasurement {
  dimension: LiteracyDimension;
  indicator: string;
  value: number;
  level: LiteracyLevel;
  evidence: string;
  measuredAt: string;
}

/** ============ V5.8 全量补齐:新增实体 ============ */

/** §14.4 申论答案版本管理 - 保存原始答案 → 修订 → 二次修订 */
export interface SubjectiveAnswer {
  id: string;
  studentId?: string;
  subject: Extract<Subject, 'shenlun' | 'mianshi'>;
  scenario: string;
  date: string;
  parentId?: string;
  version: number;
  content: string;
  wordCount?: number;
  durationMinutes?: number;
  problemTags?: ErrorCategory[];
  teacherFeedback?: string;
  scoreDims?: Array<{ label: string; stars: number }>;
  createdAt: string;
  updatedAt: string;
}

/** §15.1 面试专项训练记录 - 音视频与思考/答题时间 */
export interface InterviewRecord {
  id: string;
  studentId?: string;
  date: string;
  questionType: string;
  thinkingSec: number;
  answerSec: number;
  selfScore: {
    content: number;
    structure: number;
    expression: number;
    fluency: number;
  };
  teacherScore?: {
    content: number;
    structure: number;
    expression: number;
    fluency: number;
    note?: string;
  };
  audioDataUrl?: string;
  videoDataUrl?: string;
  problemTags: ErrorCategory[];
  createdAt: string;
  updatedAt: string;
}

/** §30.5 PDCA 内嵌工具产出物归档 */
export interface PdcaArtifact {
  id: string;
  problemId: string;
  toolId: string;
  toolName: string;
  stage: PDCAStage;
  productType: 'causal-graph' | 'decision-log' | 'screenshot' | 'other';
  link?: string;
  screenshotDataUrl?: string;
  note?: string;
  createdAt: string;
}

/** §30.5 自定义外部工具注册 */
export interface CustomPdcaTool {
  id: string;
  name: string;
  url: string;
  appliesTo: PDCAStage[];
  embedType: 'iframe' | 'link';
  createdAt: string;
  updatedAt: string;
}

/** §30.2 循环衔接触发器 - 每周检查清单 */
export interface WeeklyChecklist {
  id: string;
  weekStart: string;
  entries: Array<{
    problemId: string;
    problemTitle: string;
    stage: PDCAStage;
    filled: boolean;
    filledAt?: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

/** §18A.3 讲题/协作行为专项记录 */
export interface CollaborationEvent {
  id: string;
  studentId?: string;
  date: string;
  kind: 'explain' | 'group-task' | 'help-fix';
  subject?: Subject;
  targetPeer?: string;
  content: string;
  passedVerification?: boolean;
  createdAt: string;
}

/** §31.6 一票否决解除记录 */
export interface CareerVetoOverride {
  id: string;
  reportId: string;
  candidateId: string;
  reason: string;
  confirmedAt: string;
}

/** §31.9 教师端班级生涯测评汇总(匿名) */
export interface CareerClassStat {
  gradeLevel: GradeLevel;
  totalCount: number;
  mbtiDist: Record<string, number>;
  quadrantDist: Record<CareerQuadrant, number>;
  bottomLineDist: Record<BottomLine, number>;
}

/** §27 AI 报考信息解析结果 */
export interface AiJobParseResult {
  meta: { source: string; parsedAt: string; aiModel?: string };
  candidates: Array<{
    postName: string;
    department?: string;
    postLevel?: 'central' | 'province' | 'city' | 'county' | 'town';
    headcount?: number;
    educationLimit?: string;
    majorLimit?: string;
    politicalRequirement?: string;
    otherLimit?: string;
    hardFilterPassed: boolean;
    filterFailReasons?: string[];
  }>;
}

/** §27 时政热点素材条目(按月, 按三科映射) */
export interface PoliticsHotspot {
  id: string;
  yearMonth: string;
  title: string;
  summary: string;
  mappedToXingce?: string;
  mappedToShenlun?: string;
  mappedToMianshi?: string;
  source?: string;
  aiModel?: string;
  createdAt: string;
}
