/**
 * 通用能力增长系统 - IndexedDB 本地存储层
 *
 * 采用 Local-First 架构：所有业务数据实时写入 IndexedDB；
 * Cloudflare D1 仅作为远程备份/同步目标(见 src/services/remoteSync.ts)。
 *
 * 领域实体独立分库(11 张 store + meta)，便于按维度查询与增量同步。
 * 复用 @shared/core 的账户 meta 数据库(shared-core 的 db.ts)，
 * 通过 configureDB() 保持数据库前缀一致。
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
  PDCAProblem,
  CareerAssessment,
  CareerReport,
  SubjectiveAnswer,
  InterviewRecord,
  PdcaArtifact,
  CustomPdcaTool,
  WeeklyChecklist,
  CollaborationEvent,
  CareerVetoOverride,
  PoliticsHotspot,
  CareerObservationPoint,
  RetestReflection,
  CareerAiImport,
} from '../domain/types';

export const APP_DB_PREFIX = 'ability-growth';
configureDB(APP_DB_PREFIX);

/** 数据库版本 - 每次新增 store 必须递增
 *  v1: P0 六大 store
 *  v2: P1 教师端 + 阶段/间隔复习/报考 (9 张)
 *  v3: PRD V5.8 - PDCA / 职业测评 / 职业报告 (3 张)
 *  v4: V5.8 全量补齐 - 申论版本/面试专项/PDCA工具产出/自定义工具/周检查/协作行为/否决解除/时政素材 (8 张)
 *  v5: V5.11 作答质量保障版 - 3 个月观察点 + 事后反思 2 问 (2 张)
 *  v6: V5.11 · AI 拓展候选导入记录(每次导入独立存档) (1 张)
 */
const DB_VERSION = 6;

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
  pdcaProblems: {
    key: string;
    value: PDCAProblem;
    indexes: { studentId: string; currentStage: string; status: string; updatedAt: string };
  };
  careerAssessments: {
    key: string;
    value: CareerAssessment;
    indexes: { studentId: string; gradeLevel: string; updatedAt: string };
  };
  careerReports: {
    key: string;
    value: CareerReport;
    indexes: { studentId: string; assessmentId: string; generatedAt: string };
  };
  subjectiveAnswers: {
    key: string;
    value: SubjectiveAnswer;
    indexes: { studentId: string; subject: string; date: string; parentId: string };
  };
  interviewRecords: {
    key: string;
    value: InterviewRecord;
    indexes: { studentId: string; date: string };
  };
  pdcaArtifacts: {
    key: string;
    value: PdcaArtifact;
    indexes: { problemId: string; stage: string; createdAt: string };
  };
  customTools: {
    key: string;
    value: CustomPdcaTool;
    indexes: { name: string; updatedAt: string };
  };
  weeklyChecklists: {
    key: string;
    value: WeeklyChecklist;
    indexes: { weekStart: string };
  };
  collaborationEvents: {
    key: string;
    value: CollaborationEvent;
    indexes: { studentId: string; date: string; kind: string };
  };
  vetoOverrides: {
    key: string;
    value: CareerVetoOverride;
    indexes: { reportId: string; candidateId: string };
  };
  politicsHotspots: {
    key: string;
    value: PoliticsHotspot;
    indexes: { yearMonth: string; createdAt: string };
  };
  careerObservationPoints: {
    key: string;
    value: CareerObservationPoint;
    indexes: { studentId: string; assessmentId: string; triggeredAt: string };
  };
  careerRetestReflections: {
    key: string;
    value: RetestReflection;
    indexes: { studentId: string; assessmentId: string; createdAt: string };
  };
  careerAiImports: {
    key: string;
    value: CareerAiImport;
    indexes: { studentId: string; reportId: string; assessmentId: string; importedAt: string };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

export type StoreName =
  | 'trainings'
  | 'gaps'
  | 'abilities'
  | 'students'
  | 'reviews'
  | 'tasks'
  | 'templates'
  | 'assignments'
  | 'assignmentProgress'
  | 'exams'
  | 'corrections'
  | 'strategies'
  | 'registrations'
  | 'stagePlans'
  | 'spacedReviews'
  | 'pdcaProblems'
  | 'careerAssessments'
  | 'careerReports'
  | 'subjectiveAnswers'
  | 'interviewRecords'
  | 'pdcaArtifacts'
  | 'customTools'
  | 'weeklyChecklists'
  | 'collaborationEvents'
  | 'vetoOverrides'
  | 'politicsHotspots'
  | 'careerObservationPoints'
  | 'careerRetestReflections'
  | 'careerAiImports';

const SYNCED_STORES: StoreName[] = [
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
  'politicsHotspots',
  'careerObservationPoints',
  'careerRetestReflections',
  'careerAiImports',
];

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

        if (oldVersion < 3) {
          const pdca = dbi.createObjectStore('pdcaProblems', { keyPath: 'id' });
          pdca.createIndex('studentId', 'studentId');
          pdca.createIndex('currentStage', 'currentStage');
          pdca.createIndex('status', 'status');
          pdca.createIndex('updatedAt', 'updatedAt');

          const assess = dbi.createObjectStore('careerAssessments', { keyPath: 'id' });
          assess.createIndex('studentId', 'studentId');
          assess.createIndex('gradeLevel', 'gradeLevel');
          assess.createIndex('updatedAt', 'updatedAt');

          const reports = dbi.createObjectStore('careerReports', { keyPath: 'id' });
          reports.createIndex('studentId', 'studentId');
          reports.createIndex('assessmentId', 'assessmentId');
          reports.createIndex('generatedAt', 'generatedAt');
        }

        if (oldVersion < 4) {
          const sa = dbi.createObjectStore('subjectiveAnswers', { keyPath: 'id' });
          sa.createIndex('studentId', 'studentId');
          sa.createIndex('subject', 'subject');
          sa.createIndex('date', 'date');
          sa.createIndex('parentId', 'parentId');

          const ir = dbi.createObjectStore('interviewRecords', { keyPath: 'id' });
          ir.createIndex('studentId', 'studentId');
          ir.createIndex('date', 'date');

          const art = dbi.createObjectStore('pdcaArtifacts', { keyPath: 'id' });
          art.createIndex('problemId', 'problemId');
          art.createIndex('stage', 'stage');
          art.createIndex('createdAt', 'createdAt');

          const ct = dbi.createObjectStore('customTools', { keyPath: 'id' });
          ct.createIndex('name', 'name');
          ct.createIndex('updatedAt', 'updatedAt');

          const wc = dbi.createObjectStore('weeklyChecklists', { keyPath: 'id' });
          wc.createIndex('weekStart', 'weekStart');

          const ce = dbi.createObjectStore('collaborationEvents', { keyPath: 'id' });
          ce.createIndex('studentId', 'studentId');
          ce.createIndex('date', 'date');
          ce.createIndex('kind', 'kind');

          const vo = dbi.createObjectStore('vetoOverrides', { keyPath: 'id' });
          vo.createIndex('reportId', 'reportId');
          vo.createIndex('candidateId', 'candidateId');

          const ph = dbi.createObjectStore('politicsHotspots', { keyPath: 'id' });
          ph.createIndex('yearMonth', 'yearMonth');
          ph.createIndex('createdAt', 'createdAt');
        }

        if (oldVersion < 5) {
          // V5.11 §31.3 · 3 个月观察点
          const cop = dbi.createObjectStore('careerObservationPoints', { keyPath: 'id' });
          cop.createIndex('studentId', 'studentId');
          cop.createIndex('assessmentId', 'assessmentId');
          cop.createIndex('triggeredAt', 'triggeredAt');

          // V5.11 §31.3 · 事后反思 2 问
          const crr = dbi.createObjectStore('careerRetestReflections', { keyPath: 'id' });
          crr.createIndex('studentId', 'studentId');
          crr.createIndex('assessmentId', 'assessmentId');
          crr.createIndex('createdAt', 'createdAt');
        }

        if (oldVersion < 6) {
          // V5.11 §31.10 · AI 拓展候选导入记录(每次导入独立存档,支持多次)
          const cai = dbi.createObjectStore('careerAiImports', { keyPath: 'id' });
          cai.createIndex('studentId', 'studentId');
          cai.createIndex('reportId', 'reportId');
          cai.createIndex('assessmentId', 'assessmentId');
          cai.createIndex('importedAt', 'importedAt');
        }
      },
    });
  }
  return dbPromise;
}

// ============ 通用 CRUD ============

type StoreValue<S extends StoreName> = AGSchema[S]['value'];

export async function putRecord<S extends StoreName>(store: S, value: StoreValue<S>): Promise<void> {
  const dbi = await db();
  await (dbi as unknown as { put: (s: S, v: StoreValue<S>) => Promise<string> }).put(store, value);
}

export async function getRecord<S extends StoreName>(store: S, id: string): Promise<StoreValue<S> | undefined> {
  const dbi = await db();
  return (dbi as unknown as { get: (s: S, k: string) => Promise<StoreValue<S> | undefined> }).get(store, id);
}

export async function getAllRecords<S extends StoreName>(store: S): Promise<StoreValue<S>[]> {
  const dbi = await db();
  return (dbi as unknown as { getAll: (s: S) => Promise<StoreValue<S>[]> }).getAll(store);
}

export async function deleteRecord<S extends StoreName>(store: S, id: string): Promise<void> {
  const dbi = await db();
  await (dbi as unknown as { delete: (s: S, k: string) => Promise<void> }).delete(store, id);
}

export async function bulkPut<S extends StoreName>(store: S, records: StoreValue<S>[]): Promise<void> {
  if (records.length === 0) return;
  const dbi = await db();
  for (const record of records) {
    await (dbi as unknown as { put: (s: S, v: StoreValue<S>) => Promise<string> }).put(store, record);
  }
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

// ============ 导入导出 ============

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
  politicsHotspots: PoliticsHotspot[];
  careerObservationPoints?: CareerObservationPoint[];
  careerRetestReflections?: RetestReflection[];
  careerAiImports?: CareerAiImport[];
}

async function readAll<S extends StoreName>(store: S): Promise<StoreValue<S>[]> {
  try {
    return await getAllRecords(store);
  } catch {
    return [];
  }
}

export async function exportSnapshot(): Promise<ExportedSnapshot> {
  const [
    trainings,
    gaps,
    abilities,
    students,
    reviews,
    tasks,
    templates,
    assignments,
    assignmentProgress,
    exams,
    corrections,
    strategies,
    registrations,
    stagePlans,
    spacedReviews,
    pdcaProblems,
    careerAssessments,
    careerReports,
    subjectiveAnswers,
    interviewRecords,
    pdcaArtifacts,
    customTools,
    weeklyChecklists,
    collaborationEvents,
    vetoOverrides,
    politicsHotspots,
    careerObservationPoints,
    careerRetestReflections,
    careerAiImports,
  ] = await Promise.all([
    readAll('trainings'),
    readAll('gaps'),
    readAll('abilities'),
    readAll('students'),
    readAll('reviews'),
    readAll('tasks'),
    readAll('templates'),
    readAll('assignments'),
    readAll('assignmentProgress'),
    readAll('exams'),
    readAll('corrections'),
    readAll('strategies'),
    readAll('registrations'),
    readAll('stagePlans'),
    readAll('spacedReviews'),
    readAll('pdcaProblems'),
    readAll('careerAssessments'),
    readAll('careerReports'),
    readAll('subjectiveAnswers'),
    readAll('interviewRecords'),
    readAll('pdcaArtifacts'),
    readAll('customTools'),
    readAll('weeklyChecklists'),
    readAll('collaborationEvents'),
    readAll('vetoOverrides'),
    readAll('politicsHotspots'),
    readAll('careerObservationPoints'),
    readAll('careerRetestReflections'),
    readAll('careerAiImports'),
  ]);
  return {
    version: '6.0.0',
    exportedAt: new Date().toISOString(),
    trainings,
    gaps,
    abilities,
    students,
    reviews,
    tasks,
    templates,
    assignments,
    assignmentProgress,
    exams,
    corrections,
    strategies,
    registrations,
    stagePlans,
    spacedReviews,
    pdcaProblems,
    careerAssessments,
    careerReports,
    subjectiveAnswers,
    interviewRecords,
    pdcaArtifacts,
    customTools,
    weeklyChecklists,
    collaborationEvents,
    vetoOverrides,
    politicsHotspots,
    careerObservationPoints,
    careerRetestReflections,
    careerAiImports,
  };
}

export async function importSnapshot(snapshot: ExportedSnapshot, mode: 'merge' | 'replace' = 'merge'): Promise<void> {
  const dbi = await db();
  if (mode === 'replace') {
    const tx = dbi.transaction(SYNCED_STORES, 'readwrite');
    await Promise.all(SYNCED_STORES.map((s) => tx.objectStore(s).clear()));
    await tx.done;
  }

  const payload: Record<StoreName, unknown[]> = {
    trainings: snapshot.trainings ?? [],
    gaps: snapshot.gaps ?? [],
    abilities: snapshot.abilities ?? [],
    students: snapshot.students ?? [],
    reviews: snapshot.reviews ?? [],
    tasks: snapshot.tasks ?? [],
    templates: snapshot.templates ?? [],
    assignments: snapshot.assignments ?? [],
    assignmentProgress: snapshot.assignmentProgress ?? [],
    exams: snapshot.exams ?? [],
    corrections: snapshot.corrections ?? [],
    strategies: snapshot.strategies ?? [],
    registrations: snapshot.registrations ?? [],
    stagePlans: snapshot.stagePlans ?? [],
    spacedReviews: snapshot.spacedReviews ?? [],
    pdcaProblems: snapshot.pdcaProblems ?? [],
    careerAssessments: snapshot.careerAssessments ?? [],
    careerReports: snapshot.careerReports ?? [],
    subjectiveAnswers: snapshot.subjectiveAnswers ?? [],
    interviewRecords: snapshot.interviewRecords ?? [],
    pdcaArtifacts: snapshot.pdcaArtifacts ?? [],
    customTools: snapshot.customTools ?? [],
    weeklyChecklists: snapshot.weeklyChecklists ?? [],
    collaborationEvents: snapshot.collaborationEvents ?? [],
    vetoOverrides: snapshot.vetoOverrides ?? [],
    politicsHotspots: snapshot.politicsHotspots ?? [],
    careerObservationPoints: snapshot.careerObservationPoints ?? [],
    careerRetestReflections: snapshot.careerRetestReflections ?? [],
    careerAiImports: snapshot.careerAiImports ?? [],
  };
  for (const store of SYNCED_STORES) {
    for (const record of payload[store]) {
      await (dbi as unknown as { put: (s: StoreName, v: unknown) => Promise<string> }).put(store, record);
    }
  }
}

export async function clearAllBusinessData(): Promise<void> {
  const dbi = await db();
  const tx = dbi.transaction([...SYNCED_STORES, 'meta'], 'readwrite');
  await Promise.all([...SYNCED_STORES, 'meta'].map((s) => tx.objectStore(s as StoreName).clear()));
  await tx.done;
}

/** 增量同步：返回自 since 之后更新的所有实体 */
export async function getChangesSince(since: string | null): Promise<ExportedSnapshot> {
  const snapshot = await exportSnapshot();
  const cutoff = since ?? '';
  const laterThan = (u: string) => (cutoff ? u > cutoff : true);

  const filterByUpdated = <T extends { updatedAt?: string; createdAt?: string; evaluationTime?: string }>(list: T[]): T[] =>
    list.filter((r) => laterThan(r.updatedAt ?? r.createdAt ?? r.evaluationTime ?? ''));

  return {
    ...snapshot,
    trainings: filterByUpdated(snapshot.trainings),
    gaps: filterByUpdated(snapshot.gaps),
    abilities: filterByUpdated(snapshot.abilities),
    students: filterByUpdated(snapshot.students),
    reviews: filterByUpdated(snapshot.reviews),
    tasks: filterByUpdated(snapshot.tasks),
    templates: filterByUpdated(snapshot.templates),
    assignments: filterByUpdated(snapshot.assignments),
    assignmentProgress: filterByUpdated(snapshot.assignmentProgress),
    exams: filterByUpdated(snapshot.exams),
    corrections: filterByUpdated(snapshot.corrections),
    strategies: filterByUpdated(snapshot.strategies),
    registrations: filterByUpdated(snapshot.registrations),
    stagePlans: filterByUpdated(snapshot.stagePlans),
    spacedReviews: filterByUpdated(snapshot.spacedReviews),
    pdcaProblems: filterByUpdated(snapshot.pdcaProblems),
    careerAssessments: filterByUpdated(snapshot.careerAssessments),
    careerReports: filterByUpdated(snapshot.careerReports),
    subjectiveAnswers: filterByUpdated(snapshot.subjectiveAnswers),
    interviewRecords: filterByUpdated(snapshot.interviewRecords),
    pdcaArtifacts: filterByUpdated(snapshot.pdcaArtifacts),
    customTools: filterByUpdated(snapshot.customTools),
    weeklyChecklists: filterByUpdated(snapshot.weeklyChecklists),
    collaborationEvents: filterByUpdated(snapshot.collaborationEvents),
    vetoOverrides: snapshot.vetoOverrides.filter((r) => (since ? r.confirmedAt > since : true)),
    politicsHotspots: filterByUpdated(snapshot.politicsHotspots),
  };
}
