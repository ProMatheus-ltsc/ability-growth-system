/**
 * 通用能力增长系统 - 数据访问层
 *
 * Cloudflare D1 是业务数据的唯一数据源，读写经 Pages 同域 /api（见 d1Client.ts）。
 * 浏览器 IndexedDB 仅保留设备级元数据（登录偏好、最近一次录入默认值等）。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { configureDB } from '@shared/core/services/db';
import type {
  AbilityGap,
  AbilitySnapshot,
  Assignment,
  GradeLevel,
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
import type { StoreName } from './snapshot';
import {
  filterStoreRecordsForGrade,
  isK12GradeLevel,
  isScopeManagedStore,
  K12_ONLY_STORES,
  PUBLIC_EXAM_ONLY_STORES,
  stampRecordScope,
  type ScopeAwareRecord,
} from '../domains/shared/scope';
import * as d1 from './d1Client';
import { normalizeStoreRecord, normalizeStoreRecords } from './recordNormalize';
import type { StoreWindow, WindowQuery } from './recordWindow';
import {
  nextWatermark,
  planDeltaApply,
  SYNC_EPOCH,
  type StoreDelta,
} from './syncMirror';

export const APP_DB_PREFIX = 'ability-growth';
configureDB(APP_DB_PREFIX);

/** 数据库版本 - 每次新增 store 必须递增 */
const DB_VERSION = 3;

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
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
  /**
   * 业务表增量镜像（v3 起）。
   *
   * 目的：把「每次读表都全量拉一遍」换成「首次全量 + 之后按 updated_at 水位增量」，
   * trainings 这类 3.5k 行的表不再每次刷新都整表搬运。
   * 仅镜像**服务端可见集合**（学生已按学段过滤），与接口返回口径一致。
   */
  mirror: {
    key: [string, string];
    value: { store: string; id: string; value: unknown };
  };
}

let currentAccountId: string | undefined;
let dbPromise: Promise<IDBPDatabase<AGSchema>> | undefined;

export interface DataScope {
  role: 'student' | 'teacher';
  gradeLevel: GradeLevel;
}

/**
 * 学生端当前学段；教师端不按自身学段过滤（可能同时带不同学段学生）。
 * D1 列表接口仍返回整个 workspace，这里在数据出口统一收口，
 * 避免每个页面各写一份 filter 而漏掉某个入口。
 */
let activeDataScope: DataScope | undefined;

export function setActiveDataScope(scope: DataScope | undefined): void {
  activeDataScope = scope;
}

export function getActiveDataScope(): DataScope | undefined {
  return activeDataScope;
}

export function setBusinessAccount(accountId: string | undefined): void {
  currentAccountId = accountId;
  dbPromise = undefined;
  syncDoneAt = new Map();
  memoryCache.clear();
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
          // 增量镜像：老库直接建空表，首次读取时按 epoch 全量灌入
          dbi.createObjectStore('mirror', { keyPath: ['store', 'id'] });
        }
      },
    });
  }
  return dbPromise;
}

// ============ 增量镜像（IndexedDB） ============
//
// 改造前：每次 `getAllRecords` 都把整表拉一遍（trainings 3.5k 行），
// 一个页面有七八处读取就是七八次整表传输，既慢又烧 D1 读配额。
// 改造后：本地留一份镜像，之后每次读只拉「水位之后的行 + 删除墓碑」。
//
// 一致性保障：
// - 写入/删除成功后同步更新镜像，本端不会被自己的旧数据覆盖
// - 其他设备删记录 → 服务端墓碑 → 增量下发（见 migrations/0009）
// - 整体清空/备份恢复 → 服务端 '*' 墓碑 → 客户端清镜像后从 epoch 全量
// - 同步失败（隐私模式、配额、旧库）不影响主流程：直接退回整表拉取

const SYNC_TTL_MS = 2000;
const MIRROR_META_PREFIX = 'mirror-meta:';
const mirrorMetaKey = (store: StoreName): string => `${MIRROR_META_PREFIX}${store}`;

interface MirrorMeta {
  /** 已同步到的时间水位（store 的 updated_at 列） */
  watermark: string;
  /** 本端上次成功同步的时刻，用于 TTL 合并同一轮渲染的多次读取 */
  syncedAt: number;
  /**
   * 已经「付过全量代价」的那次整表重建墓碑时间（`'*'` 的 `deleted_at`）。
   *
   * reset 之后水位正好停在墓碑时间上，服务端用 `deleted_at >= since` 会把它再发一次；
   * 靠这个字段把「同一个重建」与「新的重建」区分开，否则每次同步都全量重拉。
   */
  resetConsumedAt?: string;
}

const syncInflight = new Map<StoreName, Promise<void>>();
let syncDoneAt = new Map<StoreName, number>();

/**
 * 进程内读缓存：一个页面会读同一张表七八次（37 处 trainings 调用点），
 * 每次回 IndexedDB 取 3.5k 行 + 反序列化会明显拖慢首屏，这里给个短窗口直接命中内存。
 * 写入/删除（`markStoreStale`）会清掉对应条目，本端写入立刻可见。
 */
const memoryCache = new Map<StoreName, { rows: unknown[]; at: number }>();
const MEMORY_TTL_MS = 5000;

/** 无 IndexedDB 的环境（node 测试、隐私模式）退回整表拉取 */
function mirrorSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** 复合主键 [store, id] 的区间：'store' 下所有行 */
function mirrorRange(store: StoreName): IDBKeyRange {
  return IDBKeyRange.bound([store, ''], [store, '\uffff']);
}

async function readMirrorMeta(store: StoreName): Promise<MirrorMeta | undefined> {
  const dbi = await db();
  const row = await dbi.get('meta', mirrorMetaKey(store));
  const value = row?.value as MirrorMeta | undefined;
  return value && typeof value.watermark === 'string' ? value : undefined;
}

async function readMirrorRows<S extends StoreName>(store: S): Promise<StoreValue<S>[]> {
  const dbi = await db();
  const rows = await dbi.getAll('mirror', mirrorRange(store));
  return rows.map((row) => row.value as StoreValue<S>);
}

function recordId(row: unknown): string | undefined {
  const id = (row as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** 整表替换（首次同步 / 服务端整体重建） */
async function replaceMirror<S extends StoreName>(
  store: S,
  rows: StoreValue<S>[],
  watermark: string,
  resetConsumedAt?: string,
): Promise<void> {
  const dbi = await db();
  const tx = dbi.transaction(['mirror', 'meta'], 'readwrite');
  const mirror = tx.objectStore('mirror');
  await mirror.delete(mirrorRange(store));
  const puts = rows.flatMap((row) => {
    const id = recordId(row);
    return id ? [mirror.put({ store, id, value: row })] : [];
  });
  await Promise.all(puts);
  await tx.objectStore('meta').put({
    key: mirrorMetaKey(store),
    value: { watermark, syncedAt: Date.now(), resetConsumedAt } satisfies MirrorMeta,
  });
  await tx.done;
}

/** 增量应用：先删后写（见 syncMirror.planDeltaApply 的顺序约定） */
async function applyMirrorDelta<S extends StoreName>(
  store: S,
  delta: StoreDelta<StoreValue<S>>,
  previous: Pick<MirrorMeta, 'watermark' | 'resetConsumedAt'>,
): Promise<void> {
  const plan = planDeltaApply(delta, { resetConsumedAt: previous.resetConsumedAt });
  const watermark = nextWatermark(previous.watermark, delta.watermark, false);
  const dbi = await db();
  const tx = dbi.transaction(['mirror', 'meta'], 'readwrite');
  const mirror = tx.objectStore('mirror');
  await Promise.all([
    ...plan.deleteIds.map((id) => mirror.delete([store, id])),
    ...plan.upserts.flatMap((row) => {
      const id = recordId(row);
      return id ? [mirror.put({ store, id, value: row })] : [];
    }),
  ]);
  await tx.objectStore('meta').put({
    key: mirrorMetaKey(store),
    value: {
      watermark,
      syncedAt: Date.now(),
      resetConsumedAt: previous.resetConsumedAt,
    } satisfies MirrorMeta,
  });
  await tx.done;
}

/** 把某张表同步到最新（首次全量 / 水位增量） */
async function syncMirrorStore<S extends StoreName>(store: S): Promise<void> {
  if (Date.now() - (syncDoneAt.get(store) ?? 0) < SYNC_TTL_MS) return;
  const inflight = syncInflight.get(store);
  if (inflight) return inflight;

  const run = (async () => {
    const meta = await readMirrorMeta(store);
    const delta = await d1.listStoreDelta<StoreValue<S>>(store, meta?.watermark ?? SYNC_EPOCH);
    const plan = planDeltaApply(delta, { resetConsumedAt: meta?.resetConsumedAt });
    if (!meta || plan.reset) {
      // 首次同步，或服务端告知「整表被清空/重建」→ 从 epoch 重新全量
      const full = meta ? await d1.listStoreDelta<StoreValue<S>>(store, SYNC_EPOCH) : delta;
      // 记下这次重建已消费的时间点：水位会停在墓碑的 deleted_at 上，
      // 不记的话下一次同步会用 `>=` 再次命中同一个 '*'，陷入「每次同步都全量」
      await replaceMirror(
        store,
        full.records,
        full.watermark,
        full.resetAt ?? delta.resetAt ?? meta?.resetConsumedAt,
      );
      return;
    }
    await applyMirrorDelta(store, delta, meta);
  })();

  syncInflight.set(store, run);
  try {
    await run;
    syncDoneAt.set(store, Date.now());
  } finally {
    syncInflight.delete(store);
  }
}

/** 读表：内存 → 镜像 → 整表拉取（逐级降级，任何一级都不阻塞主流程） */
async function readStore<S extends StoreName>(store: S): Promise<StoreValue<S>[]> {
  const cached = memoryCache.get(store);
  if (cached && Date.now() - cached.at < MEMORY_TTL_MS) return cached.rows as StoreValue<S>[];
  if (!mirrorSupported()) {
    const rows = await d1.listRecords<StoreValue<S>>(store);
    memoryCache.set(store, { rows, at: Date.now() });
    return rows;
  }
  try {
    await syncMirrorStore(store);
    const rows = await readMirrorRows(store);
    memoryCache.set(store, { rows, at: Date.now() });
    return rows;
  } catch {
    const rows = await d1.listRecords<StoreValue<S>>(store);
    memoryCache.set(store, { rows, at: Date.now() });
    return rows;
  }
}

/**
 * 本端写完把该表标记为「待同步」，下次读取立即做一次增量。
 *
 * 这里**不做乐观写入镜像**：服务端对 PUT/bulk 是 lastWriteWins（updated_at 更旧的不覆盖），
 * 乐观写会让镜像留下服务端并未接受的版本，而增量水位再也纠正不回来。
 * 直接让下次读取走增量，拿到的就是服务端真相，代价只是一次很小的请求。
 */
function markStoreStale(store: StoreName): void {
  syncDoneAt.delete(store);
  memoryCache.delete(store);
}

/**
 * 丢弃本地镜像（备份恢复、整库清空、导入之后调用）。
 *
 * 这些操作改的是「整个结果集」，增量水位无法表达（导入的行可能带更旧的 updatedAt），
 * 所以直接让镜像失效，下次读取从 epoch 重新全量。
 */
export async function invalidateSyncedData(): Promise<void> {
  syncDoneAt = new Map();
  memoryCache.clear();
  if (!mirrorSupported()) return;
  try {
    const dbi = await db();
    const tx = dbi.transaction(['mirror', 'meta'], 'readwrite');
    await tx.objectStore('mirror').clear();
    const metaStore = tx.objectStore('meta');
    let cursor = await metaStore.openCursor();
    while (cursor) {
      if (String(cursor.key).startsWith(MIRROR_META_PREFIX)) await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch {
    // 清不掉也只是下次多拉一次全量
  }
}

// ============ 通用 CRUD（D1 直连 + 本地镜像） ============

type StoreValue<S extends StoreName> = AGSchema[S]['value'];

function stampForActiveScope<S extends StoreName>(store: S, value: StoreValue<S>): StoreValue<S> {
  if (!activeDataScope || activeDataScope.role !== 'student' || !isScopeManagedStore(store)) return value;
  const record = value as unknown as ScopeAwareRecord;
  if (PUBLIC_EXAM_ONLY_STORES.has(store)) {
    return activeDataScope.gradeLevel === 'adult'
      ? ({ ...record, gradeLevel: 'adult' } as unknown as StoreValue<S>)
      : value;
  }
  if (K12_ONLY_STORES.has(store)) {
    return isK12GradeLevel(activeDataScope.gradeLevel)
      ? ({ ...record, gradeLevel: activeDataScope.gradeLevel } as unknown as StoreValue<S>)
      : value;
  }
  return stampRecordScope(record, activeDataScope.gradeLevel) as unknown as StoreValue<S>;
}

function filterForActiveScope<S extends StoreName>(store: S, list: StoreValue<S>[]): StoreValue<S>[] {
  if (!activeDataScope || activeDataScope.role !== 'student') return list;
  return filterStoreRecordsForGrade(store, list, activeDataScope.gradeLevel);
}

export async function putRecord<S extends StoreName>(store: S, value: StoreValue<S>): Promise<void> {
  await d1.putRecord(store, stampForActiveScope(store, value) as StoreValue<S> & { id: string });
  markStoreStale(store);
  // 刚加完记录就看到旧的「共 N 条」，用户会以为没存上 —— 状态缓存跟着一起失效
  d1.invalidateStorageStatus();
}

export async function getRecord<S extends StoreName>(store: S, id: string): Promise<StoreValue<S> | undefined> {
  const record = await d1.getRecord<StoreValue<S>>(store, id);
  if (!record) return record;
  const [scoped] = filterForActiveScope(store, [record]);
  if (!scoped) return undefined;
  return normalizeStoreRecord(store, scoped) as StoreValue<S>;
}

export async function getAllRecords<S extends StoreName>(store: S): Promise<StoreValue<S>[]> {
  const list = filterForActiveScope(store, await readStore(store));
  return normalizeStoreRecords(store, list);
}

// ============ 窗口 / 游标读取（不经过镜像） ============
//
// 镜像回答的是「全量是什么」，回答不了「下一页从哪开始」：
// 它的水位是同步进度，不是排序游标。所以窗口读直接打服务端，但**出口口径不变**——
// 仍然在这里统一做学段过滤与记录归一化，页面拿到的形状与 getAllRecords 完全一致。

/**
 * 读一页窗口数据。
 *
 * @param query 见 src/services/recordWindow.ts。`limit` 缺省时服务端按 50 返回。
 */
export async function getWindowRecords<S extends StoreName>(
  store: S,
  query: Partial<WindowQuery>,
): Promise<StoreWindow<StoreValue<S>>> {
  const page = await d1.listStoreWindow<StoreValue<S>>(store, query);
  const records = normalizeStoreRecords(store, filterForActiveScope(store, page.records));
  return { ...page, records };
}

/**
 * 把窗口读到底（用于「这段窗口内的聚合」场景，如工作台近 30 天）。
 *
 * 为什么要循环：聚合结果对「少了一页」是**静默失真**——分母变小、正确率看起来更好，
 * 页面上没有任何异常可查。所以这里宁可多翻几页，也要拿到 hasMore=false。
 * `maxPages` 是兜底闸门：真的遇到超大窗口时宁可少算，也不要把首屏拖死
 * （调用方通过返回值里的 `complete` 自行决定要不要提示）。
 */
export async function getAllWindowRecords<S extends StoreName>(
  store: S,
  query: Partial<WindowQuery>,
  options: { maxPages?: number } = {},
): Promise<{ records: StoreValue<S>[]; complete: boolean }> {
  const maxPages = Math.max(1, options.maxPages ?? 5);
  const seen = new Set<string>();
  const records: StoreValue<S>[] = [];
  let cursor: { before?: string; beforeId?: string } = {};

  for (let page = 0; page < maxPages; page += 1) {
    const result = await getWindowRecords(store, { ...query, ...cursor });
    for (const record of result.records) {
      const id = recordId(record);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      records.push(record);
    }
    if (!result.hasMore) return { records, complete: true };
    if (result.nextBefore === undefined) return { records, complete: false };
    cursor = { before: result.nextBefore, beforeId: result.nextBeforeId };
  }
  return { records, complete: false };
}

export async function deleteRecord<S extends StoreName>(store: S, id: string): Promise<void> {
  await d1.deleteRecord(store, id);
  markStoreStale(store);
  d1.invalidateStorageStatus();
}

export async function bulkPut<S extends StoreName>(store: S, records: StoreValue<S>[]): Promise<void> {
  const stamped = records.map((record) => stampForActiveScope(store, record));
  await d1.bulkPut(store, stamped as (StoreValue<S> & { id: string })[]);
  markStoreStale(store);
  d1.invalidateStorageStatus();
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

/**
 * 某段时间内的训练记录（工作台「近 30 天」等聚合场景）。
 *
 * 走窗口读而不是整表镜像：工作台只要近 30 天，却因为读训练表而触发整表同步
 * （3.5k 行 / 数 MB），首屏大部分流量都花在了它不要的数据上。
 *
 * 两个关键参数的分工：
 * - `since` = 窗口起点（按写入时间）：能走 `(workspace, updated_at)` 索引剪枝；
 * - `dateFrom` = 同一个起点（按业务日期）：这才是「近 30 天」的口径，
 *   否则「上周补录的老日期训练」会因为写入时间新而混进来、而「上个月录入但日期在窗口内」
 *   的行又可能被 since 剪掉。
 *
 * 窗口读不全（超过翻页闸门）时**退回整表镜像**：聚合数字算少是静默失真，
 * 慢一点但准确，比一个对不上的正确率更可取。这条路实际几乎不会走到
 * （30 天内 2000 条以上训练记录）。
 */
export async function listRecentTrainings(
  studentId: string | undefined,
  fromDate: string | null,
): Promise<TrainingRecord[]> {
  // 剪枝下界要比窗口起点再早一天：`since` 比的是 UTC 写入时间，而用户在本地凌晨
  // 录入的行，其 UTC 时间会落到窗口起点之前（UTC+8 差 8 小时，最大的时区差 14 小时）。
  // 精确口径由 `dateFrom` 决定，这里放宽只会多取几条、不会多算。
  const pruneFrom = fromDate
    ? new Date(Date.parse(`${fromDate}T00:00:00.000Z`) - 86_400_000).toISOString()
    : undefined;

  const windowQuery: Partial<WindowQuery> = {
    order: 'date',
    limit: 200,
    ...(studentId ? { studentId } : {}),
    ...(pruneFrom ? { since: pruneFrom } : {}),
    ...(fromDate ? { dateFrom: fromDate } : {}),
  };

  const { records, complete } = await getAllWindowRecords('trainings', windowQuery, { maxPages: 10 });
  const list = complete ? records : await getAllRecords('trainings');
  const scoped = studentId ? list.filter((record) => record.studentId === studentId) : list;
  const bounded = fromDate ? scoped.filter((record) => record.date >= fromDate) : scoped;
  return [...bounded].sort((a, b) => b.date.localeCompare(a.date));
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
  await invalidateSyncedData();
  d1.invalidateStorageStatus();
}
