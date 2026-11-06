/**
 * 云端快照结构：前端 D1 客户端与 Pages Functions 共用。
 * 业务表统一存储为 (workspace, id, updated_at, data) 四列。
 */
import type {
  AbilityGap,
  AbilitySnapshot,
  Assignment,
  AssignmentProgress,
  Correction,
  ExamRecord,
  ExamRegistration,
  FixTask,
  ReviewRecord,
  SpacedReviewItem,
  StagePlan,
  StudentProfile,
  TaskTemplate,
  TeachingStrategy,
  TrainingRecord,
} from '../domain/types';

export const STORE_NAMES = [
  'trainings',
  'gaps',
  'abilities',
  'students',
  'reviews',
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
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export interface ExportedSnapshot {
  version: string;
  exportedAt: string;
  trainings: TrainingRecord[];
  gaps: AbilityGap[];
  abilities: AbilitySnapshot[];
  students: StudentProfile[];
  reviews: ReviewRecord[];
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
}
