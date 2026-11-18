/**
 * Pages Functions：能力增长系统 D1 直连 API（同域 /api）
 *
 * 鉴权：
 *   - 服务端账户 + 会话 Cookie（HttpOnly），登录/注册后由服务端签发
 *   - 工作空间 = 登录用户名（小写），数据按账户隔离
 *
 * 端点：
 *   POST   /api/auth/register                注册（用户名 + 密码）
 *   POST   /api/auth/login                   登录
 *   POST   /api/auth/logout                  退出并删除会话
 *   GET    /api/auth/me                      当前登录用户
 *   GET    /api/health                       连通性
 *   GET    /api/stats                        当前工作空间各表记录数
 *   GET    /api/stores/:store                列出记录
 *   GET    /api/stores/:store/:id            读取单条
 *   PUT    /api/stores/:store/:id            新增/覆盖单条
 *   DELETE /api/stores/:store/:id            删除单条
 *   POST   /api/stores/:store/bulk           批量 upsert
 *   DELETE /api/stores                       清空当前工作空间
 *   GET    /api/backups                      备份列表
 *   POST   /api/backups                      创建备份
 *   POST   /api/backups/:id/restore          用备份覆盖当前工作空间
 */
import type { D1Database, D1PreparedStatement, PagesFunction } from '@cloudflare/workers-types';
import {
  authAttemptsExceeded as sharedAuthAttemptsExceeded,
  checkPassword,
  clearSessionCookie as sharedClearSessionCookie,
  createSession as sharedCreateSession,
  deleteSession as sharedDeleteSession,
  dummyPasswordHash,
  findUser as sharedFindUser,
  insertUser as sharedInsertUser,
  isSecure as sharedIsSecure,
  makePasswordHash,
  readCookie as sharedReadCookie,
  recordAuthAttempt as sharedRecordAuthAttempt,
  resolveSession as sharedResolveSession,
  touchLastLogin as sharedTouchLastLogin,
  SESSION_COOKIE,
} from './auth';
import { runBatches as sharedRunBatches, schemaIsSatisfiedBatched } from '@shared/core/server/d1';
import { STORE_NAMES, type ExportedSnapshot, type StoreName } from '../../src/services/snapshot';
import { STORE_RESET_TOMBSTONE, SYNC_EPOCH } from '../../src/services/syncMirror';
import { normalizeStoreRecord } from '../../src/services/recordNormalize';
import { guardTrainingRecords } from '../../src/domains/public-exam';
import {
  dedupeTrainingRecordsByIdempotencyKey,
  planTrainingWrite,
  withTrainingSemantics,
} from '../../src/domain/trainingSemantics';
import type { TrainingRecord } from '../../src/domain/types';
import {
  filterStoreRecordsForGrade,
  isGradeLevel,
  isScopeManagedStore,
  isUserRole,
  normalizeRecordScope,
  validateStoreRecordScope,
  type ScopeAwareRecord,
  type UserProfile,
} from '../../src/domains/shared/scope';
import type { GradeLevel } from '../../src/domain/types';

interface Env {
  DB: D1Database;
}

const MIN_BACKUPS = 3;
const MAX_BACKUPS = 20;
const MAX_BACKUP_BYTES = 6 * 1024 * 1024;
const BATCH_SIZE = 50;
const SNAPSHOT_VERSION = '2.2.0';

// 会话 Cookie 名、有效期、每用户会话数上限、限流窗口等认证常量
// 统一由 functions/api/auth.ts（@shared/core 统一认证）提供。

type JsonRecord = Record<string, unknown> & { id: string };

interface SessionUser {
  userId: string;
  username: string;
  workspace: string;
  tokenHash: string;
  expiresAt: string;
  profile: UserProfile;
}

interface UserRow {
  id: string;
  username: string;
  usernameNormalized: string;
  passwordHash: string;
  role: string;
  gradeLevel: string;
  profileInitialized: number;
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function isStore(value: string): value is StoreName {
  return (STORE_NAMES as readonly string[]).includes(value);
}

/**
 * 统一为 UTC ISO（毫秒、Z 后缀）。
 * 旧数据混用 `+08:00` 与 `Z`，按字符串比较 LWW 会把同一时刻判错；
 * 所有写入都先归一化，列上的 LWW 再用 julianday 比较。
 */
export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** 增量同步的 since 参数：非法或缺失时退回 epoch（等价于全量） */
export function normalizeSince(value: string | null): string {
  return normalizeTimestamp(value) ?? SYNC_EPOCH;
}

function entityTimestamp(record: JsonRecord): string {
  return (
    normalizeTimestamp(record.updatedAt) ??
    normalizeTimestamp(record.createdAt) ??
    normalizeTimestamp(record.evaluationTime) ??
    new Date().toISOString()
  );
}

/** 记录自身的 updatedAt 也归一化后再入库，避免备份/导出数据继续携带偏移格式 */
function normalizeRecordTimestamp(record: JsonRecord): JsonRecord {
  const updatedAt = normalizeTimestamp(record.updatedAt);
  if (!updatedAt || updatedAt === record.updatedAt) return record;
  return { ...record, updatedAt };
}

function profileFromRow(row: Pick<UserRow, 'role' | 'gradeLevel' | 'profileInitialized'>): UserProfile {
  return {
    role: isUserRole(row.role) ? row.role : 'student',
    gradeLevel: isGradeLevel(row.gradeLevel) ? row.gradeLevel : 'adult',
    profileInitialized: Number(row.profileInitialized) === 1,
  };
}

function parseRecord(data: string): JsonRecord {
  return JSON.parse(data) as JsonRecord;
}

// ============ 密码与会话 ============
// 认证实现见 functions/api/auth.ts —— 已收归 @shared/core 的统一认证。
// 这里只保留本项目特有的部分：登录名规范、用户档案（role/grade_level）。

const encoder = new TextEncoder();

/** base64 编解码：业务侧（分享码/校验）仍在用，与认证实现无关 */
function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** SHA-256 摘要（hex）：会话 token 的哈希 */
async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeUsername(value: unknown): { username: string; normalized: string } | null {
  if (typeof value !== 'string') return null;
  const username = value.trim();
  if (username.length < 3 || username.length > 32) return null;
  if (/\s/.test(username)) return null;
  if ([...username].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  return { username, normalized: username.toLowerCase() };
}

function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 72;
}

async function resolveSession(db: D1Database, request: Request): Promise<SessionUser | null> {
  const session = await sharedResolveSession(db, request);
  if (!session) return null;
  return {
    userId: session.userId,
    username: session.username,
    workspace: session.username.toLowerCase(),
    tokenHash: session.tokenHash,
    expiresAt: session.expiresAt,
    profile: profileFromRow(session),
  };
}

async function clientKey(request: Request, scope: string): Promise<string> {
  return `${scope}:${await sha256(request.headers.get('CF-Connecting-IP') ?? 'local')}`;
}

// ============ Schema ============

const STORE_REQUIRED_COLUMNS = ['workspace', 'id', 'updated_at', 'data'];
const TABLE_REQUIRED_COLUMNS: Record<string, string[]> = {
  users: [
    'id',
    'username',
    'username_normalized',
    'password_hash',
    'created_at',
    'last_login_at',
    'role',
    'grade_level',
    'profile_initialized',
  ],
  sessions: ['id', 'user_id', 'token_hash', 'expires_at', 'created_at'],
  auth_attempts: ['id', 'client_key', 'succeeded', 'created_at'],
  sync_backups: ['id', 'account_id', 'created_at', 'data'],
};
const REQUIRED_INDEXES = ['idx_sessions_expires', 'idx_auth_attempts_client_created'];

/**
 * 单次 batch 探活：确认所有表与关键列/索引都在。
 * 冷启动不再逐表建表，避免上百次 D1 往返把请求拖过 30s 客户端超时。
 *
 * 实现收归 @shared/core/server/d1 的 schemaIsSatisfiedBatched。
 */
export async function schemaIsCurrent(db: D1Database): Promise<boolean> {
  const required: Record<string, string[]> = {};
  for (const store of STORE_NAMES) required[store] = STORE_REQUIRED_COLUMNS;
  for (const [table, columns] of Object.entries(TABLE_REQUIRED_COLUMNS)) {
    required[table] = columns;
  }
  return schemaIsSatisfiedBatched(db, required, REQUIRED_INDEXES);
}

export async function ensureSchemaReady(db: D1Database): Promise<void> {
  let current = false;
  try {
    current = await schemaIsCurrent(db);
  } catch {
    // 探活失败时退回完整建表，避免把冷启动保护变成新的故障点
  }
  if (current) return;
  await initSchema(db);
}

/** 首次冷启动时补齐 workspace 列与索引；旧同步库数据保留，workspace 默认为空串。 */
function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = ensureSchemaReady(db).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

let schemaPromise: Promise<void> | null = null;

async function initSchema(db: D1Database): Promise<void> {
  for (const store of STORE_NAMES) {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${store} (
          workspace TEXT NOT NULL DEFAULT '',
          id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (workspace, id)
        )`,
      )
      .run();
    const info = await db.prepare(`PRAGMA table_info(${store})`).all<{ name: string }>();
    if (!(info.results ?? []).some((column) => column.name === 'workspace')) {
      try {
        await db.prepare(`ALTER TABLE ${store} ADD COLUMN workspace TEXT NOT NULL DEFAULT ''`).run();
      } catch (error) {
        // 并发冷启动时另一个实例可能已经补列，忽略重复列错误
        if (!(error instanceof Error) || !/duplicate column/i.test(error.message)) throw error;
      }
    }
    await db
      .prepare(`CREATE INDEX IF NOT EXISTS idx_${store}_workspace_updated ON ${store}(workspace, updated_at)`)
      .run();
  }
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sync_backups (
        id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (account_id, id)
      )`,
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_backups_account ON sync_backups(account_id, created_at)').run();

  // 增量同步的删除墓碑（见 migrations/0009_store_deletions.sql）
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS store_deletions (
        workspace TEXT NOT NULL,
        store TEXT NOT NULL,
        id TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        PRIMARY KEY (workspace, store, id)
      )`,
    )
    .run();
  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_store_deletions_ws_store_time ON store_deletions(workspace, store, deleted_at)',
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_normalized TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_login_at TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student',
        grade_level TEXT NOT NULL DEFAULT 'adult',
        profile_initialized INTEGER NOT NULL DEFAULT 0
      )`,
    )
    .run();
  const userInfo = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>();
  const userColumns = new Set((userInfo.results ?? []).map((column) => column.name));
  const profileColumns: Array<[string, string]> = [
    ['role', "role TEXT NOT NULL DEFAULT 'student'"],
    ['grade_level', "grade_level TEXT NOT NULL DEFAULT 'adult'"],
    ['profile_initialized', 'profile_initialized INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [name, ddl] of profileColumns) {
    if (userColumns.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE users ADD COLUMN ${ddl}`).run();
    } catch (error) {
      // 并发冷启动可能已由另一个实例补列
      if (!(error instanceof Error) || !/duplicate column/i.test(error.message)) throw error;
    }
  }
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)').run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS auth_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_key TEXT NOT NULL,
        succeeded INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`,
    )
    .run();
  await db
    .prepare('CREATE INDEX IF NOT EXISTS idx_auth_attempts_client_created ON auth_attempts(client_key, created_at)')
    .run();
}

async function claimLegacyWorkspace(db: D1Database, workspace: string): Promise<void> {
  for (const store of STORE_NAMES) {
    await db.prepare(`UPDATE ${store} SET workspace = ? WHERE workspace = ''`).bind(workspace).run();
  }
  await db
    .prepare('UPDATE sync_backups SET account_id = ? WHERE account_id <> ?')
    .bind(workspace, workspace)
    .run();
}

/**
 * 分批执行（D1 单次 batch 有语句数上限）。
 * 实现收归 @shared/core/server/d1 的 runBatches。
 */
async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  await sharedRunBatches(db, statements, BATCH_SIZE);
}

/**
 * 冲突处理使用不带目标的 `ON CONFLICT DO UPDATE`，兼容迁移前后两种主键：
 * - 旧表 `PRIMARY KEY(id)`：仍按 id 冲突；
 * - 新表 `PRIMARY KEY(workspace, id)`：按租户内冲突，这是目标状态。
 * 因此可以先发代码、再执行 0005 迁移，中间不会出现写入 500；
 * 迁移前跨账户同 id 仍可能互相覆盖，迁移完成后即彻底隔离。
 * 注意：不能再 `SET workspace = excluded.workspace`，否则会把别人的行改写成当前账户（跨账户抢行）。
 */
export function upsertSql(store: StoreName, lastWriteWins: boolean): string {
  // julianday 把 `Z` 与 `+08:00` 归一为同一时间轴；字符串比较会让后写入的旧格式数据误判为更旧
  const conflict = lastWriteWins
    ? `ON CONFLICT DO UPDATE SET
         updated_at = excluded.updated_at,
         data = excluded.data
       WHERE julianday(excluded.updated_at) >= julianday(${store}.updated_at)`
    : `ON CONFLICT DO UPDATE SET
         updated_at = excluded.updated_at,
         data = excluded.data`;
  return `INSERT INTO ${store} (workspace, id, updated_at, data) VALUES (?, ?, ?, ?) ${conflict}`;
}

/**
 * 写入边界：所有落库路径（PUT / bulk / 快照导入 / 备份恢复 / 训练派生行）都从这里出去。
 *
 * 入库前先做一次结构归一化（与读侧共用 `src/services/recordNormalize`）：
 * 老记录缺的必填数组 / 数字字段在这里补齐，而不是等读出来再兜。
 * 为什么不在写入时「校验后拒绝」：库里已经躺着大量历史残缺记录，且客户端类型是
 * 编译期承诺（运行期没有 schema）；拒收会让用户「改一个字段就保存失败」。
 * 补而不拒既让存量自愈（每次编辑写回即补全），也不改变任何合法记录的语义。
 */
export function upsertStatements(
  db: D1Database,
  store: StoreName,
  workspace: string,
  records: JsonRecord[],
  lastWriteWins: boolean,
): D1PreparedStatement[] {
  const sql = upsertSql(store, lastWriteWins);
  return records.map((source) => {
    const record = normalizeRecordTimestamp(normalizeStoreRecord(store, source) as JsonRecord);
    return db.prepare(sql).bind(workspace, record.id, entityTimestamp(record), JSON.stringify(record));
  });
}

function validRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (record): record is JsonRecord =>
      !!record && typeof record === 'object' && typeof (record as JsonRecord).id === 'string' && (record as JsonRecord).id.length > 0,
  );
}

const EXAM_ARRAY_FIELDS = ['moduleBreakdown', 'mainProblems', 'generatedTaskIds'] as const;

/** 历史测验记录可能缺数组字段；读入口直接兜底，避免页面在 `.length` / `.map` 上崩溃 */
function normalizeExamArrays(record: JsonRecord): JsonRecord {
  let next = record;
  for (const field of EXAM_ARRAY_FIELDS) {
    if (Array.isArray(next[field])) continue;
    if (next === record) next = { ...record };
    next[field] = [];
  }
  return next;
}

/** 历史公考记录缺 gradeLevel 时补 adult；K12 记录缺学段保持原样，不做猜测 */
export function normalizeScopedRecords(store: StoreName, records: JsonRecord[]): JsonRecord[] {
  // 来源可追溯：训练记录缺 source 时按手工录入补齐，外部同步工具会显式写 fenbi。
  // 训练记录同时补 kind / examRef / attemptId / depth，并按 (source, sourceId, kind) 去重，
  // 保证未迁移的旧快照重新导入后也落到同一语义模型。
  const withSource =
    store === 'trainings'
      ? (dedupeTrainingRecordsByIdempotencyKey(
          records.map((record) =>
            withTrainingSemantics({
              ...(record as unknown as TrainingRecord),
              source:
                typeof record.source === 'string' && record.source ? record.source : 'manual',
            }),
          ),
        ) as unknown as JsonRecord[])
      : records;
  const shaped = store === 'exams' ? withSource.map(normalizeExamArrays) : withSource;
  if (!isScopeManagedStore(store)) return shaped;
  return shaped.map(
    (record) => normalizeRecordScope(record as unknown as ScopeAwareRecord) as unknown as JsonRecord,
  );
}

/** 学段与学科必须属于同一产品域；K12 专属表还要求显式 K12 学段 */
export function validateScopedRecords(store: StoreName, records: JsonRecord[]): string | null {
  if (!isScopeManagedStore(store)) return null;
  for (let index = 0; index < records.length; index += 1) {
    const result = validateStoreRecordScope(store, records[index] as unknown as ScopeAwareRecord);
    if (!result.ok) return `第 ${index + 1} 条：${result.message ?? '学段与学科不匹配'}`;
  }
  return null;
}

/** 传 gradeLevel 时只返回该学段可见记录；教师端传 undefined 保持全量 */
async function listStore(
  db: D1Database,
  store: StoreName,
  workspace: string,
  gradeLevel?: GradeLevel,
): Promise<JsonRecord[]> {
  const result = await db
    .prepare(`SELECT data FROM ${store} WHERE workspace = ? ORDER BY updated_at DESC`)
    .bind(workspace)
    .all<{ data: string }>();
  const records = (result.results ?? []).map((row) => parseRecord(row.data));
  return gradeLevel ? filterStoreRecordsForGrade(store, records, gradeLevel) : records;
}

// ============ 增量同步（updated_at 水位 + 删除墓碑） ============
//
// 前端每次读表都全量拉一遍（trainings 3.5k 行）既慢又费 D1 读配额。
// 改成「首次全量 + 之后只拉水位之后的行」，水位取 updated_at 列（入库时已归一化）。
//
// 纯增量拉不到「被删掉的 id」，所以删除时打墓碑：
//   id = '*'        整个 store 被清空/重建（清空、备份恢复 replace 模式）
//   id = 具体记录    单条删除
// 客户端先应用墓碑再应用 upserts，因此「删了又重建同一个 id」不会被误删。
//
// ⚠️ 墓碑表**不进冷启动探活清单**（见 TABLE_REQUIRED_COLUMNS）。
// 曾把它加进探活，结果线上库还没这张表 → 探活恒失败 → 每个请求都跑一遍完整建表
// （90+ 次串行 D1 往返）→ 登录/刷新直接撞 30s 客户端超时。
// 现在改为「按需建表 + 建不出来就降级」，能力缺失不能再拖垮主流程。

let tombstoneTable: Promise<boolean> | null = null;

/** 按需建墓碑表（每个 isolate 只试一次；失败降级为「无墓碑」） */
function ensureTombstoneTable(db: D1Database): Promise<boolean> {
  if (!tombstoneTable) {
    tombstoneTable = (async () => {
      try {
        await db
          .prepare(
            `CREATE TABLE IF NOT EXISTS store_deletions (
              workspace TEXT NOT NULL,
              store TEXT NOT NULL,
              id TEXT NOT NULL,
              deleted_at TEXT NOT NULL,
              PRIMARY KEY (workspace, store, id)
            )`,
          )
          .run();
        await db
          .prepare(
            'CREATE INDEX IF NOT EXISTS idx_store_deletions_ws_store_time ON store_deletions(workspace, store, deleted_at)',
          )
          .run();
        return true;
      } catch {
        // 建不出来就退回「全量读」语义，绝不能因此让请求变慢或失败
        return false;
      }
    })().catch(() => false);
  }
  return tombstoneTable;
}

/** 清空/重建标记（墓碑 id，见 src/services/syncMirror.ts） */

/** 记录删除墓碑（批量写入，单次 batch）；墓碑表不可用时静默跳过 */
async function recordDeletions(
  db: D1Database,
  store: StoreName,
  workspace: string,
  ids: string[],
  at = new Date().toISOString(),
): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return;
  if (!(await ensureTombstoneTable(db))) return;
  for (let index = 0; index < unique.length; index += BATCH_SIZE) {
    const chunk = unique.slice(index, index + BATCH_SIZE);
    await db.batch(
      chunk.map((id) =>
        db
          .prepare('INSERT OR REPLACE INTO store_deletions (workspace, store, id, deleted_at) VALUES (?, ?, ?, ?)')
          .bind(workspace, store, id, at),
      ),
    );
  }
}

/** 整个 store 被清空/重建：打一条 '*' 墓碑，客户端据此清镜像并重新全量 */
async function recordStoreReset(
  db: D1Database,
  store: StoreName,
  workspace: string,
  at = new Date().toISOString(),
): Promise<void> {
  await recordDeletions(db, store, workspace, [STORE_RESET_TOMBSTONE], at);
}

/**
 * 增量列表：返回水位之后被写入的行、被删除的 id，以及新的水位。
 *
 * `since` 用 `>=` 而不是 `>`：同毫秒写入的多行不会因为边界被漏掉。
 * 代价是水位处那一批会被重复下发一次，客户端按 id upsert 是幂等的。
 */
export async function listStoreDelta(
  db: D1Database,
  store: StoreName,
  workspace: string,
  since: string,
  gradeLevel?: GradeLevel,
): Promise<{ records: JsonRecord[]; deleted: string[]; watermark: string }> {
  const rows = await db
    .prepare(`SELECT data, updated_at FROM ${store} WHERE workspace = ? AND updated_at >= ? ORDER BY updated_at DESC`)
    .bind(workspace, since)
    .all<{ data: string; updated_at: string }>();
  const records = (rows.results ?? []).map((row) => parseRecord(row.data));

  // 墓碑表还不可用（老库、迁移未执行）时降级为「无墓碑」，增量照常工作
  const tombstones = (await ensureTombstoneTable(db))
    ? await db
        .prepare('SELECT id, deleted_at FROM store_deletions WHERE workspace = ? AND store = ? AND deleted_at >= ?')
        .bind(workspace, store, since)
        .all<{ id: string; deleted_at: string }>()
    : { results: [] as { id: string; deleted_at: string }[] };
  const deleted = (tombstones.results ?? []).map((row) => row.id);

  // 水位取「本次返回的行列值」与「墓碑时间」的最大值；没有任何变化时保持原水位
  let watermark = since;
  for (const row of rows.results ?? []) {
    if (row.updated_at > watermark) watermark = row.updated_at;
  }
  for (const row of tombstones.results ?? []) {
    if (row.deleted_at > watermark) watermark = row.deleted_at;
  }

  return {
    records: gradeLevel ? filterStoreRecordsForGrade(store, records, gradeLevel) : records,
    deleted,
    watermark,
  };
}

/** 读取库里与本次写入可能同键的训练行（按 sourceId 预筛，source/kind 由纯函数精确比较） */
async function loadTrainingSourceRows(
  db: D1Database,
  workspace: string,
  records: TrainingRecord[],
  gradeLevel?: GradeLevel,
): Promise<TrainingRecord[]> {
  const sourceIds = Array.from(
    new Set(
      records
        .map((record) => (typeof record.sourceId === 'string' ? record.sourceId.trim() : ''))
        .filter(Boolean),
    ),
  );
  const rows: TrainingRecord[] = [];
  for (let index = 0; index < sourceIds.length; index += BATCH_SIZE) {
    const chunk = sourceIds.slice(index, index + BATCH_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT data FROM trainings WHERE workspace = ? AND json_extract(data, '$.sourceId') IN (${placeholders})`,
      )
      .bind(workspace, ...chunk)
      .all<{ data: string }>();
    rows.push(...(result.results ?? []).map((row) => parseRecord(row.data) as unknown as TrainingRecord));
  }
  // 学生只能替换本学段记录，避免同 sourceId 跨学段误删
  return gradeLevel ? (filterStoreRecordsForGrade('trainings', rows, gradeLevel) as TrainingRecord[]) : rows;
}

/**
 * 训练记录写入口：先按跨请求幂等键比较库内旧行，旧行被替代时删除，再写入胜出行。
 * 删除必须先于写入，避免同一次请求中「先删后写」与批内顺序无关地互相覆盖。
 */
async function writeTrainingRecords(
  db: D1Database,
  workspace: string,
  records: JsonRecord[],
  lastWriteWins = false,
  gradeLevel?: GradeLevel,
): Promise<{ written: number; deleted: number }> {
  const incoming = records as unknown as TrainingRecord[];
  const plan = planTrainingWrite(
    incoming,
    await loadTrainingSourceRows(db, workspace, incoming, gradeLevel),
  );
  for (let index = 0; index < plan.deleteIds.length; index += BATCH_SIZE) {
    const chunk = plan.deleteIds.slice(index, index + BATCH_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(`DELETE FROM trainings WHERE workspace = ? AND id IN (${placeholders})`)
      .bind(workspace, ...chunk)
      .run();
  }
  if (plan.upserts.length > 0) {
    await runBatches(db, upsertStatements(db, 'trainings', workspace, plan.upserts as unknown as JsonRecord[], lastWriteWins));
  }
  return { written: plan.upserts.length, deleted: plan.deleteIds.length };
}

/** 学生写入只能落在自己的学段；教师不受学段限制（仍受 workspace 隔离） */
export function validateWriteScope(
  store: StoreName,
  records: JsonRecord[],
  profile: Pick<UserProfile, 'role' | 'gradeLevel'>,
): string | null {
  if (profile.role === 'teacher') return null;
  for (let index = 0; index < records.length; index += 1) {
    if (filterStoreRecordsForGrade(store, [records[index]], profile.gradeLevel).length === 1) continue;
    return `第 ${index + 1} 条记录不属于当前学段，学生账号只能读写本学段数据`;
  }
  return null;
}

/** 学生恢复备份时只还原当前学段，避免把同 workspace 的其他学段数据覆盖掉 */
export function scopeSnapshotForProfile(
  snapshot: Record<string, unknown>,
  profile: Pick<UserProfile, 'role' | 'gradeLevel'>,
): Record<string, unknown> {
  if (profile.role === 'teacher') return snapshot;
  const scoped: Record<string, unknown> = { ...snapshot };
  for (const store of STORE_NAMES) {
    scoped[store] = filterStoreRecordsForGrade(store, validRecords(snapshot[store]), profile.gradeLevel);
  }
  return scoped;
}

/** 学生清空/恢复时只删除可见记录；教师删除整个 workspace */
async function deleteStoreForProfile(
  db: D1Database,
  store: StoreName,
  workspace: string,
  profile: Pick<UserProfile, 'role' | 'gradeLevel'>,
): Promise<void> {
  if (profile.role === 'teacher') {
    await db.prepare(`DELETE FROM ${store} WHERE workspace = ?`).bind(workspace).run();
    await recordStoreReset(db, store, workspace);
    return;
  }
  const ids = (await listStore(db, store, workspace, profile.gradeLevel)).map((record) => record.id);
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const chunk = ids.slice(index, index + BATCH_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(`DELETE FROM ${store} WHERE workspace = ? AND id IN (${placeholders})`)
      .bind(workspace, ...chunk)
      .run();
  }
  if (ids.length > 0) await recordDeletions(db, store, workspace, ids);
}

async function exportSnapshot(db: D1Database, workspace: string): Promise<ExportedSnapshot> {
  const entries = await Promise.all(
    STORE_NAMES.map(async (store) => [store, await listStore(db, store, workspace)] as const),
  );
  const snapshot: Record<string, unknown> = {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
  };
  for (const [store, records] of entries) snapshot[store] = records;
  return snapshot as unknown as ExportedSnapshot;
}

class SnapshotValidationError extends Error {}

/** 纯校验：归一化学段、训练口径拦截、学段/学科校验；返回可直接写库的分表记录 */
export function prepareSnapshotRecords(
  snapshot: Record<string, unknown>,
): Array<readonly [StoreName, JsonRecord[]]> {
  const prepared: Array<readonly [StoreName, JsonRecord[]]> = [];
  for (const store of STORE_NAMES) {
    const records = normalizeScopedRecords(store, validRecords(snapshot[store]));
    if (store === 'trainings') {
      const guard = guardTrainingRecords(records);
      if (!guard.ok) {
        throw new SnapshotValidationError(
          `trainings ${guard.message}（本次快照中第 ${guard.rejectedIndexes.map((i) => i + 1).join('、')} 条不符合）`,
        );
      }
    }
    const scopeError = validateScopedRecords(store, records);
    if (scopeError) throw new SnapshotValidationError(`${store} ${scopeError}`);
    prepared.push([store, records]);
  }
  return prepared;
}

/**
 * 导入快照必须走与 bulk/PUT 相同的写入边界：
 * 1. 先归一化学段、执行训练口径拦截、校验学段与学科；
 * 2. 全部通过后才删旧数据，避免校验失败时把账户清空；
 * 3. replace 模式仍按表分块写入。
 */
async function importSnapshot(
  db: D1Database,
  workspace: string,
  snapshot: Record<string, unknown>,
  mode: 'merge' | 'replace',
  profile: Pick<UserProfile, 'role' | 'gradeLevel'>,
): Promise<Record<string, number>> {
  const prepared = prepareSnapshotRecords(scopeSnapshotForProfile(snapshot, profile));

  if (mode === 'replace') {
    for (const store of STORE_NAMES) {
      await deleteStoreForProfile(db, store, workspace, profile);
    }
  }

  const counts: Record<string, number> = {};
  for (const [store, records] of prepared) {
    counts[store] = records.length;
    if (records.length === 0) continue;
    // 恢复/导入改的是「结果集」而不只是「新行」：导入的行可能带着更旧的 updatedAt，
    // 增量水位看不到它们，所以给每个被导入的 store 打一条 '*' 墓碑，
    // 让各端清镜像后重新全量拉取（导入是低频重操作，这次全量可接受）。
    await recordStoreReset(db, store, workspace);
    if (store === 'trainings') {
      const result = await writeTrainingRecords(
        db,
        workspace,
        records,
        true,
        profile.role === 'student' ? profile.gradeLevel : undefined,
      );
      counts[store] = result.written;
      continue;
    }
    await runBatches(db, upsertStatements(db, store, workspace, records, true));
  }
  return counts;
}

async function countStores(db: D1Database, workspace: string): Promise<Record<string, number>> {
  const columns = STORE_NAMES.map((store) => `(SELECT COUNT(*) FROM ${store} WHERE workspace = ?) AS ${store}`).join(', ');
  const row = await db
    .prepare(`SELECT ${columns}`)
    .bind(...STORE_NAMES.map(() => workspace))
    .first<Record<string, number>>();
  return Object.fromEntries(STORE_NAMES.map((store) => [store, Number(row?.[store] ?? 0)]));
}

/**
 * 备份保留：按新→旧累计，至少保留 MIN_BACKUPS 份；
 * 累计超过 MAX_BACKUP_BYTES 或份数超过 MAX_BACKUPS 后删除更旧的。
 * 与 0006 迁移里的窗口函数规则保持一致。
 */
export function backupIdsToPrune(backups: ReadonlyArray<{ id: string; size: number }>): string[] {
  let cumulative = 0;
  const prune: string[] = [];
  backups.forEach((backup, index) => {
    cumulative += backup.size;
    const sequence = index + 1;
    if (sequence > MIN_BACKUPS && (cumulative > MAX_BACKUP_BYTES || sequence > MAX_BACKUPS)) {
      prune.push(backup.id);
    }
  });
  return prune;
}

// ============ 备份载荷编码 ============
// D1 单行上限 2,000,000 字节；快照明文已达 1.85MB，gzip 后体积约为原来的 1/6。
const BACKUP_GZIP_PREFIX = 'gz:';
const MAX_BACKUP_ROW_BYTES = 1_900_000;
const textDecoder = new TextDecoder();

async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeBackupPayload(snapshot: unknown): Promise<string> {
  const compressed = await gzipBytes(encoder.encode(JSON.stringify(snapshot)));
  return `${BACKUP_GZIP_PREFIX}${toBase64(compressed)}`;
}

/** 兼容压缩前的历史明文备份；只有带 gz: 前缀的才解压 */
export async function decodeBackupPayload(payload: string): Promise<Record<string, unknown>> {
  const json = payload.startsWith(BACKUP_GZIP_PREFIX)
    ? textDecoder.decode(await gunzipBytes(fromBase64(payload.slice(BACKUP_GZIP_PREFIX.length))))
    : payload;
  return JSON.parse(json) as Record<string, unknown>;
}

// ============ 路由 ============

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  const { method } = request;

  if (segments[0] === 'health' && method === 'GET') {
    try {
      await env.DB.prepare('SELECT 1').first();
      return json({ ok: true, storage: 'd1', version: SNAPSHOT_VERSION });
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'D1 不可用', 503);
    }
  }

  // SameSite=Strict Cookie 已挡住跨站 Cookie；这里再拒绝显式跨站请求
  if (method !== 'GET' && request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return fail('拒绝跨站请求', 403);
  }

  await ensureSchema(env.DB);

  // ============ 账户 ============
  if (segments[0] === 'auth') {
    if (segments.length === 2 && segments[1] === 'register' && method === 'POST') {
      const key = await clientKey(request, 'register');
      if (await sharedAuthAttemptsExceeded(env.DB, key, 8, false))
        return fail('注册过于频繁，请稍后再试', 429);

      const body = (await request.json().catch(() => null)) as
        | { username?: unknown; password?: unknown }
        | null;
      const name = normalizeUsername(body?.username);
      if (!name || !validPassword(body?.password)) {
        await sharedRecordAuthAttempt(env.DB, key, false);
        return fail('用户名需 3-32 位且不含空白，密码需 8-72 位');
      }

      const existing = await env.DB.prepare('SELECT id FROM users WHERE username_normalized = ?')
        .bind(name.normalized)
        .first<{ id: string }>();
      if (existing) {
        await sharedRecordAuthAttempt(env.DB, key, false);
        return fail('该用户名已注册，请直接登录', 409);
      }

      const userId = `usr_${crypto.randomUUID()}`;
      try {
        await sharedInsertUser(env.DB, {
          id: userId,
          username: name.username,
          normalized: name.normalized,
          passwordHash: await makePasswordHash(body!.password as string),
        });
      } catch (error) {
        await sharedRecordAuthAttempt(env.DB, key, false);
        if (String(error).includes('UNIQUE constraint failed')) return fail('该用户名已注册，请直接登录', 409);
        throw error;
      }
      await sharedRecordAuthAttempt(env.DB, key, true);
      // 旧版同步库的业务行 workspace 为空；首个账号注册时把它们归入该账号，避免历史数据不可见
      const userCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
      if (Number(userCount?.n ?? 0) === 1) await claimLegacyWorkspace(env.DB, name.normalized);
      const { cookie } = await sharedCreateSession(env.DB, request, userId);
      return json(
        {
          user: { id: userId, username: name.username },
          workspace: name.normalized,
          profile: profileFromRow({ role: 'student', gradeLevel: 'adult', profileInitialized: 0 }),
        },
        201,
        { 'Set-Cookie': cookie },
      );
    }

    if (segments.length === 2 && segments[1] === 'login' && method === 'POST') {
      const key = await clientKey(request, 'login');
      if (await sharedAuthAttemptsExceeded(env.DB, key, 10, true)) return fail('登录尝试过于频繁，请稍后再试', 429);

      const body = (await request.json().catch(() => null)) as
        | { username?: unknown; password?: unknown }
        | null;
      const name = normalizeUsername(body?.username);
      if (!name || !validPassword(body?.password)) {
        await sharedRecordAuthAttempt(env.DB, key, false);
        return fail('用户名或密码不正确', 401);
      }

      const user = await sharedFindUser(env.DB, name.normalized);
      const valid = await checkPassword(
        body!.password as string,
        user?.password_hash ?? (await dummyPasswordHash()),
      );
      await sharedRecordAuthAttempt(env.DB, key, Boolean(user) && valid);
      if (!user || !valid) return fail('用户名或密码不正确', 401);

      await sharedTouchLastLogin(env.DB, user.id);
      const { cookie } = await sharedCreateSession(env.DB, request, user.id);
      return json(
        {
          user: { id: user.id, username: user.username },
          workspace: user.username_normalized,
          profile: profileFromRow({
            role: String(user.role ?? 'student'),
            gradeLevel: String(user.grade_level ?? 'adult'),
            profileInitialized: Number(user.profile_initialized ?? 0),
          }),
        },
        200,
        { 'Set-Cookie': cookie },
      );
    }

    if (segments.length === 2 && segments[1] === 'logout' && method === 'POST') {
      const token = sharedReadCookie(request, SESSION_COOKIE);
      if (token) {
        await sharedDeleteSession(env.DB, await sha256(token));
      }
      return json({ ok: true }, 200, { 'Set-Cookie': sharedClearSessionCookie(sharedIsSecure(request)) });
    }

    if (segments.length === 2 && segments[1] === 'me' && method === 'GET') {
      const session = await resolveSession(env.DB, request);
      if (!session) return fail('请先登录', 401);
      return json({
        user: { id: session.userId, username: session.username },
        workspace: session.workspace,
        expiresAt: session.expiresAt,
        profile: session.profile,
      });
    }

    return fail('未知账户端点', 404);
  }

  // ============ 业务端点：必须登录 ============
  const session = await resolveSession(env.DB, request);
  if (!session) return fail('请先登录', 401);
  const workspace = session.workspace;
  const profile = session.profile;
  const gradeFilter = profile.role === 'student' ? profile.gradeLevel : undefined;

  // ============ 角色 / 学段偏好 ============
  if (segments[0] === 'profile' && segments.length === 1) {
    if (method === 'GET') return json(profile);
    if (method === 'PUT') {
      const body = (await request.json().catch(() => null)) as
        | { role?: unknown; gradeLevel?: unknown }
        | null;
      if (!body || typeof body !== 'object') return fail('请求体必须是对象');
      const nextRole = body.role === undefined ? undefined : body.role;
      const nextGrade = body.gradeLevel === undefined ? undefined : body.gradeLevel;
      if (nextRole === undefined && nextGrade === undefined) return fail('至少提供 role 或 gradeLevel');
      if (nextRole !== undefined && !isUserRole(nextRole)) return fail('role 只能是 student 或 teacher');
      if (nextGrade !== undefined && !isGradeLevel(nextGrade)) {
        return fail('gradeLevel 只能是 primary / junior / senior / adult');
      }
      const updated = {
        role: (nextRole as UserProfile['role'] | undefined) ?? profile.role,
        gradeLevel: (nextGrade as GradeLevel | undefined) ?? profile.gradeLevel,
      };
      await env.DB.prepare(
        'UPDATE users SET role = ?, grade_level = ?, profile_initialized = 1 WHERE id = ?',
      )
        .bind(updated.role, updated.gradeLevel, session.userId)
        .run();
      return json({ ...updated, profileInitialized: true });
    }
    return fail('未知 profile 端点', 404);
  }

  // ============ 统计 ============
  if (segments[0] === 'stats' && segments.length === 1 && method === 'GET') {
    let byStore: Record<string, number>;
    if (gradeFilter) {
      const entries = await Promise.all(
        STORE_NAMES.map(async (store) => [store, (await listStore(env.DB, store, workspace, gradeFilter)).length] as const),
      );
      byStore = Object.fromEntries(entries);
    } else {
      byStore = await countStores(env.DB, workspace);
    }
    const total = Object.values(byStore).reduce((sum, value) => sum + value, 0);
    return json({ workspace, total, byStore });
  }

  // ============ 备份 ============
  if (segments[0] === 'backups' && segments.length === 1) {
    if (method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT id, created_at, data FROM sync_backups WHERE account_id = ? ORDER BY created_at DESC',
      )
        .bind(workspace)
        .all<{ id: string; created_at: string; data: string }>();
      return json(
        await Promise.all(
          (rows.results ?? []).map(async (row) => {
            let records = 0;
            try {
              const snapshot = await decodeBackupPayload(row.data);
              records = STORE_NAMES.reduce(
                (sum, store) => sum + (Array.isArray(snapshot[store]) ? (snapshot[store] as unknown[]).length : 0),
                0,
              );
            } catch {
              records = 0;
            }
            return { timestamp: row.id, size: row.data.length, records };
          }),
        ),
      );
    }
    if (method === 'POST') {
      const timestamp = new Date().toISOString();
      const snapshot = await exportSnapshot(env.DB, workspace);
      const data = await encodeBackupPayload(snapshot);
      if (data.length > MAX_BACKUP_ROW_BYTES) {
        return fail(`备份体积 ${data.length} 字节超过单行上限，请先清理历史数据再试`, 413);
      }
      await env.DB.prepare('INSERT INTO sync_backups (id, account_id, created_at, data) VALUES (?, ?, ?, ?)')
        .bind(timestamp, workspace, timestamp, data)
        .run();
      const rows = await env.DB.prepare(
        'SELECT id, length(data) AS size FROM sync_backups WHERE account_id = ? ORDER BY created_at DESC, id DESC',
      )
        .bind(workspace)
        .all<{ id: string; size: number }>();
      const prune = backupIdsToPrune(
        (rows.results ?? []).map((row) => ({ id: row.id, size: Number(row.size) })),
      );
      for (let index = 0; index < prune.length; index += BATCH_SIZE) {
        const chunk = prune.slice(index, index + BATCH_SIZE);
        const placeholders = chunk.map(() => '?').join(', ');
        await env.DB.prepare(`DELETE FROM sync_backups WHERE account_id = ? AND id IN (${placeholders})`)
          .bind(workspace, ...chunk)
          .run();
      }
      return json({ ok: true, timestamp, pruned: prune.length, size: data.length });
    }
  }

  if (segments[0] === 'backups' && segments.length === 3 && segments[2] === 'restore' && method === 'POST') {
    const row = await env.DB.prepare('SELECT data FROM sync_backups WHERE id = ? AND account_id = ?')
      .bind(segments[1], workspace)
      .first<{ data: string }>();
    if (!row) return fail('未找到备份', 404);
    const snapshot = await decodeBackupPayload(row.data);
    try {
      const counts = await importSnapshot(env.DB, workspace, snapshot, 'replace', profile);
      return json({ ok: true, counts });
    } catch (error) {
      if (error instanceof SnapshotValidationError) {
        return fail(`备份数据未通过校验，当前数据未改动：${error.message}`, 422);
      }
      throw error;
    }
  }

  // ============ 业务表 CRUD ============
  if (segments[0] === 'stores') {
    if (segments.length === 1 && method === 'DELETE') {
      for (const store of STORE_NAMES) {
        await deleteStoreForProfile(env.DB, store, workspace, profile);
      }
      return json({ ok: true });
    }

    if (segments.length < 2 || !isStore(segments[1])) return fail('未知的数据表', 404);
    const store = segments[1];

    // 尾部斜杠（`/api/stores/trainings/`）会被 pathname 归一化成正斜杠形式，
    // 于是「取单条」被误判成「列表」并返回数组 —— 客户端把数组当记录用就是渲染期崩溃。
    // 契约上单条读取必须有 id，这里直接拒绝，不再静默返回整表。
    if (url.pathname.endsWith('/')) return fail('缺少记录 id', 400);

    if (segments.length === 2 && method === 'GET') {
      // 带 since = 增量（首屏全量用 since=1970-01-01，走同一条路径拿水位）
      const since = url.searchParams.get('since');
      if (since) {
        return json(await listStoreDelta(env.DB, store, workspace, normalizeSince(since), gradeFilter));
      }
      return json(await listStore(env.DB, store, workspace, gradeFilter));
    }

    if (segments.length === 3 && segments[2] === 'bulk' && method === 'POST') {
      const body = (await request.json()) as { records?: unknown } | unknown[];
      const records = normalizeScopedRecords(store, validRecords(Array.isArray(body) ? body : body.records));
      // 口径拦截：申论 / 面试不得写入训练记录（历史记录不受影响，不做迁移与删除）
      if (store === 'trainings') {
        const guard = guardTrainingRecords(records);
        if (!guard.ok) {
          return fail(
            `${guard.message}（本次请求中第 ${guard.rejectedIndexes.map((i) => i + 1).join('、')} 条不符合）`,
            422,
          );
        }
      }
      const scopeError = validateScopedRecords(store, records);
      if (scopeError) return fail(scopeError, 422);
      const writeScopeError = validateWriteScope(store, records, profile);
      if (writeScopeError) return fail(writeScopeError, 422);
      if (records.length > 0) {
        if (store === 'trainings') {
          const result = await writeTrainingRecords(env.DB, workspace, records, false, gradeFilter);
          return json({ ok: true, count: result.written, deleted: result.deleted });
        }
        await runBatches(env.DB, upsertStatements(env.DB, store, workspace, records, false));
      }
      return json({ ok: true, count: records.length });
    }

    const id = segments[2];
    if (!id) return fail('缺少记录 id', 400);

    if (method === 'GET') {
      const row = await env.DB.prepare(`SELECT data FROM ${store} WHERE workspace = ? AND id = ?`)
        .bind(workspace, id)
        .first<{ data: string }>();
      if (!row) return fail('记录不存在', 404);
      const record = parseRecord(row.data);
      if (gradeFilter && filterStoreRecordsForGrade(store, [record], gradeFilter).length === 0) {
        return fail('记录不存在', 404);
      }
      return json(record);
    }

    if (method === 'PUT') {
      const body = (await request.json()) as Partial<JsonRecord>;
      if (!body || typeof body !== 'object') return fail('请求体必须是记录对象');
      const record = normalizeScopedRecords(store, [{ ...(body as JsonRecord), id }])[0];
      // 口径拦截：申论 / 面试不得写入训练记录（历史记录不受影响，不做迁移与删除）
      if (store === 'trainings') {
        const guard = guardTrainingRecords([record]);
        if (!guard.ok) return fail(guard.message, 422);
      }
      const scopeError = validateScopedRecords(store, [record]);
      if (scopeError) return fail(scopeError, 422);
      const writeScopeError = validateWriteScope(store, [record], profile);
      if (writeScopeError) return fail(writeScopeError, 422);
      if (store === 'trainings') {
        const result = await writeTrainingRecords(env.DB, workspace, [record], false, gradeFilter);
        return json({ ok: true, id, skipped: result.written === 0 });
      }
      await runBatches(env.DB, upsertStatements(env.DB, store, workspace, [record], false));
      return json({ ok: true, id });
    }

    if (method === 'DELETE') {
      if (gradeFilter) {
        const row = await env.DB.prepare(`SELECT data FROM ${store} WHERE workspace = ? AND id = ?`)
          .bind(workspace, id)
          .first<{ data: string }>();
        if (!row) return fail('记录不存在', 404);
        const record = parseRecord(row.data);
        if (filterStoreRecordsForGrade(store, [record], gradeFilter).length === 0) {
          return fail('记录不存在', 404);
        }
      }
      await env.DB.prepare(`DELETE FROM ${store} WHERE workspace = ? AND id = ?`).bind(workspace, id).run();
      // 墓碑：其他设备的镜像靠它清掉这条已删记录（增量拉取看不到删除）
      await recordDeletions(env.DB, store, workspace, [id]);
      return json({ ok: true });
    }
  }

  return fail(`未知端点 ${url.pathname}`, 404);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await handle(context.request, context.env);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '服务器内部错误', 500);
  }
};
