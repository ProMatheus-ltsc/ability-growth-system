/**
 * 云端快照结构：前端 D1 客户端与 Pages Functions 共用。
 * 业务表统一存储为 (workspace, id, updated_at, data) 四列。
 */
import type {
  AbilityGap,
  AbilitySnapshot,
  Assignment,
  AssignmentProgress,
  CareerAssessment,
  CareerObservationPoint,
  CareerReport,
  CareerVetoOverride,
  CollaborationEvent,
  Correction,
  CustomPdcaTool,
  ExamRecord,
  ExamRegistration,
  FixTask,
  InterviewRecord,
  LabelStat,
  PDCAProblem,
  PdcaArtifact,
  RetestReflection,
  SpacedReviewItem,
  StagePlan,
  StudentProfile,
  SubjectiveAnswer,
  TaskTemplate,
  TeachingStrategy,
  TrainingRecord,
  WeeklyChecklist,
} from '../domain/types';

export const STORE_NAMES = [
  'trainings',
  'gaps',
  'abilities',
  'students',
  'tasks',
  'templates',
  'assignments',
  'assignmentProgress',
  'exams',
  'corrections',
  'strategies',
  'registrations',
  'stagePlans',
  'spacedReviews',
  'pdcaProblems',
  'careerAssessments',
  'careerReports',
  'subjectiveAnswers',
  'interviewRecords',
  'pdcaArtifacts',
  'customTools',
  'weeklyChecklists',
  'collaborationEvents',
  'vetoOverrides',
  'careerObservationPoints',
  'careerRetestReflections',
  'labelStats',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export interface ExportedSnapshot {
  version: string;
  exportedAt: string;
  trainings: TrainingRecord[];
  gaps: AbilityGap[];
  abilities: AbilitySnapshot[];
  students: StudentProfile[];
  tasks: FixTask[];
  templates: TaskTemplate[];
  assignments: Assignment[];
  assignmentProgress: AssignmentProgress[];
  exams: ExamRecord[];
  corrections: Correction[];
  strategies: TeachingStrategy[];
  registrations: ExamRegistration[];
  stagePlans: StagePlan[];
  spacedReviews: SpacedReviewItem[];
  pdcaProblems: PDCAProblem[];
  careerAssessments: CareerAssessment[];
  careerReports: CareerReport[];
  subjectiveAnswers: SubjectiveAnswer[];
  interviewRecords: InterviewRecord[];
  pdcaArtifacts: PdcaArtifact[];
  customTools: CustomPdcaTool[];
  weeklyChecklists: WeeklyChecklist[];
  collaborationEvents: CollaborationEvent[];
  vetoOverrides: CareerVetoOverride[];
  careerObservationPoints: CareerObservationPoint[];
  careerRetestReflections: RetestReflection[];
  labelStats: LabelStat[];
}
