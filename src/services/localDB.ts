/**
 * 通用能力增长系统 - 数据访问层
 *
 * Cloudflare D1 是业务数据的唯一数据源，读写经 Pages 同域 /api（见 d1Client.ts）。
 * 浏览器 IndexedDB 仅保留设备级元数据（登录偏好、最近一次录入默认值等）。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { configureDB } from '@shared/core/services/db';
import type {
  TrainingRecord,
  AbilityGap,
  AbilitySnapshot,
  StudentProfile,
  ReviewRecord,
  FixTask,
  TaskTemplate,
  Assignment,
  AssignmentProgress,
  ExamRecord,
  Correction,
  TeachingStrategy,
  ExamRegistration,
  StagePlan,
  SpacedReviewItem,
} from '../domain/types';
import type { StoreName } from './snapshot';
import * as d1 from './d1Client';

export const APP_DB_PREFIX = 'ability-growth';
configureDB(APP_DB_PREFIX);

/** 数据库版本 - 每次新增 store 必须递增 */
const DB_VERSION = 2;

interface AGSchema extends DBSchema {
  trainings: {
    key: string;
    value: TrainingRecord;
    indexes: { studentId: string; subject: string; date: string; updatedAt: string };
  };
  gaps: {
    key: string;
    value: AbilityGap;
    indexes: { studentId: string; subject: string; status: string; updatedAt: string };
  };
  abilities: {
    key: string;
    value: AbilitySnapshot;
    indexes: { studentId: string; subject: string; abilityPath: string; evaluationTime: string };
  };
  students: {
    key: string;
    value: StudentProfile;
    indexes: { gradeLevel: string; updatedAt: string };
  };
  reviews: {
    key: string;
    value: ReviewRecord;
    indexes: { studentId: string; level: string; date: string };
  };
  tasks: {
    key: string;
    value: FixTask;
    indexes: { studentId: string; subject: string; status: string; updatedAt: string };
  };
  templates: {
    key: string;
    value: TaskTemplate;
    indexes: { subject: string; gradeLevel: string };
  };
  assignments: {
    key: string;
    value: Assignment;
    indexes: { dueAt: string; subject: string };
  };
  assignmentProgress: {
    key: string;
    value: AssignmentProgress;
    indexes: { assignmentId: string; studentId: string; status: string };
  };
  exams: {
    key: string;
    value: ExamRecord;
    indexes: { studentId: string; subject: string; date: string };
  };
  corrections: {
    key: string;
    value: Correction;
    indexes: { studentId: string; subject: string; date: string };
  };
  strategies: {
    key: string;
    value: TeachingStrategy;
    indexes: { status: string; startDate: string };
  };
  registrations: {
    key: string;
    value: ExamRegistration;
    indexes: { studentId: string; examDate: string };
  };
  stagePlans: {
    key: string;
    value: StagePlan;
    indexes: { studentId: string; subject: string };
  };
  spacedReviews: {
    key: string;
    value: SpacedReviewItem;
    indexes: { studentId: string; subject: string; nextDueDate: string; status: string };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

let currentAccountId: string | undefined;
let dbPromise: Promise<IDBPDatabase<AGSchema>> | undefined;

export function setBusinessAccount(accountId: string | undefined): void {
  currentAccountId = accountId;
  dbPromise = undefined;
}

export function getBusinessAccount(): string | undefined {
  return currentAccountId;
}

function db(): Promise<IDBPDatabase<AGSchema>> {
  if (!currentAccountId) {
    throw new Error('尚未初始化账户，业务数据库不可用');
  }
  if (!dbPromise) {
    const name = `${APP_DB_PREFIX}-app-${currentAccountId}`;
    dbPromise = openDB<AGSchema>(name, DB_VERSION, {
      upgrade(dbi, oldVersion) {
        if (oldVersion < 1) {
          const trainings = dbi.createObjectStore('trainings', { keyPath: 'id' });
          trainings.createIndex('studentId', 'studentId');
          trainings.createIndex('subject', 'subject');
          trainings.createIndex('date', 'date');
          trainings.createIndex('updatedAt', 'updatedAt');

          const gaps = dbi.createObjectStore('gaps', { keyPath: 'id' });
          gaps.createIndex('studentId', 'studentId');
          gaps.createIndex('subject', 'subject');
          gaps.createIndex('status', 'status');
          gaps.createIndex('updatedAt', 'updatedAt');

          const abilities = dbi.createObjectStore('abilities', { keyPath: 'id' });
          abilities.createIndex('studentId', 'studentId');
          abilities.createIndex('subject', 'subject');
          abilities.createIndex('abilityPath', 'abilityPath');
          abilities.createIndex('evaluationTime', 'evaluationTime');

          const students = dbi.createObjectStore('students', { keyPath: 'id' });
          students.createIndex('gradeLevel', 'gradeLevel');
          students.createIndex('updatedAt', 'updatedAt');

          const reviews = dbi.createObjectStore('reviews', { keyPath: 'id' });
          reviews.createIndex('studentId', 'studentId');
          reviews.createIndex('level', 'level');
          reviews.createIndex('date', 'date');

          const tasks = dbi.createObjectStore('tasks', { keyPath: 'id' });
          tasks.createIndex('studentId', 'studentId');
          tasks.createIndex('subject', 'subject');
          tasks.createIndex('status', 'status');
          tasks.createIndex('updatedAt', 'updatedAt');

          dbi.createObjectStore('meta', { keyPath: 'key' });
        }

        if (oldVersion < 2) {
          const templates = dbi.createObjectStore('templates', { keyPath: 'id' });
          templates.createIndex('subject', 'subject');
          templates.createIndex('gradeLevel', 'gradeLevel');

          const assignments = dbi.createObjectStore('assignments', { keyPath: 'id' });
          assignments.createIndex('dueAt', 'dueAt');
          assignments.createIndex('subject', 'subject');

          const progress = dbi.createObjectStore('assignmentProgress', { keyPath: 'id' });
          progress.createIndex('assignmentId', 'assignmentId');
          progress.createIndex('studentId', 'studentId');
          progress.createIndex('status', 'status');

          const exams = dbi.createObjectStore('exams', { keyPath: 'id' });
          exams.createIndex('studentId', 'studentId');
          exams.createIndex('subject', 'subject');
          exams.createIndex('date', 'date');

          const corrections = dbi.createObjectStore('corrections', { keyPath: 'id' });
          corrections.createIndex('studentId', 'studentId');
          corrections.createIndex('subject', 'subject');
          corrections.createIndex('date', 'date');

          const strategies = dbi.createObjectStore('strategies', { keyPath: 'id' });
          strategies.createIndex('status', 'status');
          strategies.createIndex('startDate', 'startDate');

          const regs = dbi.createObjectStore('registrations', { keyPath: 'id' });
          regs.createIndex('studentId', 'studentId');
          regs.createIndex('examDate', 'examDate');

          const stagePlans = dbi.createObjectStore('stagePlans', { keyPath: 'id' });
          stagePlans.createIndex('studentId', 'studentId');
          stagePlans.createIndex('subject', 'subject');

          const spacedReviews = dbi.createObjectStore('spacedReviews', { keyPath: 'id' });
          spacedReviews.createIndex('studentId', 'studentId');
          spacedReviews.createIndex('subject', 'subject');
          spacedReviews.createIndex('nextDueDate', 'nextDueDate');
          spacedReviews.createIndex('status', 'status');
        }
      },
    });
  }
  return dbPromise;
}

// ============ 通用 CRUD（D1 直连） ============

type StoreValue<S extends StoreName> = AGSchema[S]['value'];

export async function putRecord<S extends StoreName>(store: S, value: StoreValue<S>): Promise<void> {
  await d1.putRecord(store, value as StoreValue<S> & { id: string });
}

export async function getRecord<S extends StoreName>(store: S, id: string): Promise<StoreValue<S> | undefined> {
  return d1.getRecord<StoreValue<S>>(store, id);
}

export async function getAllRecords<S extends StoreName>(store: S): Promise<StoreValue<S>[]> {
  return d1.listRecords<StoreValue<S>>(store);
}

export async function deleteRecord<S extends StoreName>(store: S, id: string): Promise<void> {
  await d1.deleteRecord(store, id);
}

export async function bulkPut<S extends StoreName>(store: S, records: StoreValue<S>[]): Promise<void> {
  await d1.bulkPut(store, records as (StoreValue<S> & { id: string })[]);
}

// ============ 领域查询辅助 ============

export async function findTrainingsByStudent(studentId?: string): Promise<TrainingRecord[]> {
  const list = await getAllRecords('trainings');
  const scoped = studentId ? list.filter((r) => r.studentId === studentId) : list;
  return scoped.sort((a, b) => b.date.localeCompare(a.date));
}

export async function findTrainingsInRange(fromDate: string, toDate?: string): Promise<TrainingRecord[]> {
  const list = await getAllRecords('trainings');
  return list.filter((r) => r.date >= fromDate && (toDate ? r.date <= toDate : true));
}

export async function findGaps(studentId?: string, status?: AbilityGap['status']): Promise<AbilityGap[]> {
  const list = await getAllRecords('gaps');
  return list
    .filter((r) => (studentId ? r.studentId === studentId : true))
    .filter((r) => (status ? r.status === status : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findAbilities(studentId?: string, subject?: string): Promise<AbilitySnapshot[]> {
  const list = await getAllRecords('abilities');
  return list
    .filter((r) => (studentId ? r.studentId === studentId : true))
    .filter((r) => (subject ? r.subject === subject : true))
    .sort((a, b) => b.evaluationTime.localeCompare(a.evaluationTime));
}

export async function findReviews(level?: ReviewRecord['level'], studentId?: string): Promise<ReviewRecord[]> {
  const list = await getAllRecords('reviews');
  return list
    .filter((r) => (level ? r.level === level : true))
    .filter((r) => (studentId ? r.studentId === studentId : true))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function findTasks(studentId?: string, status?: FixTask['status']): Promise<FixTask[]> {
  const list = await getAllRecords('tasks');
  return list
    .filter((r) => (studentId ? r.studentId === studentId : true))
    .filter((r) => (status ? r.status === status : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findExams(studentId?: string, subject?: string): Promise<ExamRecord[]> {
  const list = await getAllRecords('exams');
  return list
    .filter((r) => (studentId ? r.studentId === studentId : true))
    .filter((r) => (subject ? r.subject === subject : true))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function findCorrections(studentId?: string): Promise<Correction[]> {
  const list = await getAllRecords('corrections');
  return list
    .filter((r) => (studentId ? r.studentId === studentId : true))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function findAssignmentsForStudent(studentId: string): Promise<{ assignment: Assignment; progress: AssignmentProgress | undefined }[]> {
  const assignments = await getAllRecords('assignments');
  const progressList = await getAllRecords('assignmentProgress');
  return assignments
    .filter((a) => a.assigneeStudentIds.includes(studentId))
    .map((a) => ({
      assignment: a,
      progress: progressList.find((p) => p.assignmentId === a.id && p.studentId === studentId),
    }))
    .sort((a, b) => a.assignment.dueAt.localeCompare(b.assignment.dueAt));
}

export async function findDueSpacedReviews(before: string): Promise<SpacedReviewItem[]> {
  const list = await getAllRecords('spacedReviews');
  return list.filter((r) => r.status === 'active' && r.nextDueDate <= before);
}

// ============ 元数据 ============

export async function getMeta<T>(key: string, defaultValue: T): Promise<T> {
  const dbi = await db();
  const row = await dbi.get('meta', key);
  return row ? (row.value as T) : defaultValue;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const dbi = await db();
  await dbi.put('meta', { key, value });
}

// ============ 云端业务数据清理 ============

export async function clearAllBusinessData(): Promise<void> {
  await d1.clearWorkspace();
}
