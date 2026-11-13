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
import { STORE_NAMES, type ExportedSnapshot, type StoreName } from '../../src/services/snapshot';
import { guardTrainingRecords } from '../../src/domains/public-exam';
import {
  filterStoreRecordsForGrade,
  isGradeLevel,
  isScopeManagedStore,
  isUserRole,
  normalizeRecordScope,
  validateRecordScope,
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

const SESSION_COOKIE = 'ability_growth_session';
const SESSION_DAYS = 30;
// Workers WebCrypto 对 PBKDF2 迭代次数有上限，100000 是两者兼容的安全值
const PASSWORD_ITERATIONS = 100_000;
const AUTH_WINDOW_MS = 10 * 60_000;

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

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, iterationsRaw, saltBase64, hashBase64] = stored.split('$');
  const iterations = Number(iterationsRaw);
  if (scheme !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 1000 || !saltBase64 || !hashBase64) {
    return false;
  }
  const expected = fromBase64(hashBase64);
  const actual = await derivePassword(password, fromBase64(saltBase64), iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < actual.length; index += 1) diff |= actual[index] ^ expected[index];
  return diff === 0;
}

/** 账户不存在时也跑一次 PBKDF2，让失败响应耗时接近，降低用户名枚举价值 */
let dummyPasswordHash: Promise<string> | null = null;
function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword('dummy-password-not-used');
  return dummyPasswordHash;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${
    secure ? '; Secure' : ''
  }`;
}

function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
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
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db
    .prepare(
      `SELECT s.user_id AS userId, s.expires_at AS expiresAt, u.username AS username,
              u.role AS role, u.grade_level AS gradeLevel, u.profile_initialized AS profileInitialized
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{
      userId: string;
      expiresAt: string;
      username: string;
      role: string;
      gradeLevel: string;
      profileInitialized: number;
    }>();
  if (!row) return null;
  const expiresMs = Date.parse(row.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    // 过期令牌只在被访问时顺手删掉，避免每次请求都全表清理
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return {
    userId: row.userId,
    username: row.username,
    workspace: row.username.toLowerCase(),
    tokenHash,
    expiresAt: row.expiresAt,
    profile: profileFromRow(row),
  };
}

async function createSession(db: D1Database, request: Request, userId: string): Promise<string> {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString();
  // 登录/注册是低频写，顺手清掉全库过期会话；索引 idx_sessions_expires 保证成本可控
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
  await db
    .prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(`ses_${crypto.randomUUID()}`, userId, await sha256(token), expiresAt, now.toISOString())
    .run();
  return sessionCookie(token, SESSION_DAYS * 86_400, isSecure(request));
}

async function authAttemptsExceeded(
  db: D1Database,
  key: string,
  limit: number,
  failuresOnly = false,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM auth_attempts
       WHERE client_key = ? AND created_at > ?${failuresOnly ? ' AND succeeded = 0' : ''}`,
    )
    .bind(key, new Date(Date.now() - AUTH_WINDOW_MS).toISOString())
    .first<{ count: number }>();
  return Number(row?.count ?? 0) >= limit;
}

async function recordAuthAttempt(db: D1Database, key: string, succeeded: boolean): Promise<void> {
  await db
    .prepare('INSERT INTO auth_attempts (client_key, succeeded, created_at) VALUES (?, ?, ?)')
    .bind(key, succeeded ? 1 : 0, new Date().toISOString())
    .run();
}

async function clientKey(request: Request, scope: string): Promise<string> {
  return `${scope}:${await sha256(request.headers.get('CF-Connecting-IP') ?? 'local')}`;
}

// ============ Schema ============

/** 首次冷启动时补齐 workspace 列与索引；旧同步库数据保留，workspace 默认为空串。 */
function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = initSchema(db).catch((error) => {
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

async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await db.batch(statements.slice(index, index + BATCH_SIZE));
  }
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

function upsertStatements(
  db: D1Database,
  store: StoreName,
  workspace: string,
  records: JsonRecord[],
  lastWriteWins: boolean,
): D1PreparedStatement[] {
  const sql = upsertSql(store, lastWriteWins);
  return records.map((source) => {
    const record = normalizeRecordTimestamp(source);
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

/** 历史公考记录缺 gradeLevel 时补 adult；K12 记录缺学段保持原样，不做猜测 */
function normalizeScopedRecords(store: StoreName, records: JsonRecord[]): JsonRecord[] {
  // 来源可追溯：训练记录缺 source 时按手工录入补齐，外部同步工具会显式写 fenbi
  const withSource =
    store === 'trainings'
      ? records.map((record) =>
          typeof record.source === 'string' && record.source ? record : { ...record, source: 'manual' },
        )
      : records;
  if (!isScopeManagedStore(store)) return withSource;
  return withSource.map(
    (record) => normalizeRecordScope(record as unknown as ScopeAwareRecord) as unknown as JsonRecord,
  );
}

/** 学段与学科必须属于同一产品域；公考历史数据缺学段已由 normalizeScopedRecords 补 adult，K12 缺学段会被拦截 */
function validateScopedRecords(store: StoreName, records: JsonRecord[]): string | null {
  if (!isScopeManagedStore(store)) return null;
  for (let index = 0; index < records.length; index += 1) {
    const result = validateRecordScope(records[index] as unknown as ScopeAwareRecord);
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
    if (records.length > 0) {
      await runBatches(db, upsertStatements(db, store, workspace, records, true));
    }
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
      if (await authAttemptsExceeded(env.DB, key, 8)) return fail('注册过于频繁，请稍后再试', 429);

      const body = (await request.json().catch(() => null)) as
        | { username?: unknown; password?: unknown }
        | null;
      const name = normalizeUsername(body?.username);
      if (!name || !validPassword(body?.password)) {
        await recordAuthAttempt(env.DB, key, false);
        return fail('用户名需 3-32 位且不含空白，密码需 8-72 位');
      }

      const existing = await env.DB.prepare('SELECT id FROM users WHERE username_normalized = ?')
        .bind(name.normalized)
        .first<{ id: string }>();
      if (existing) {
        await recordAuthAttempt(env.DB, key, false);
        return fail('该用户名已注册，请直接登录', 409);
      }

      const userId = `usr_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      try {
        await env.DB.prepare(
          `INSERT INTO users (id, username, username_normalized, password_hash, created_at, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(userId, name.username, name.normalized, await hashPassword(body!.password as string), now, now)
          .run();
      } catch (error) {
        await recordAuthAttempt(env.DB, key, false);
        if (String(error).includes('UNIQUE constraint failed')) return fail('该用户名已注册，请直接登录', 409);
        throw error;
      }
      await recordAuthAttempt(env.DB, key, true);
      // 旧版同步库的业务行 workspace 为空；首个账号注册时把它们归入该账号，避免历史数据不可见
      const userCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
      if (Number(userCount?.n ?? 0) === 1) await claimLegacyWorkspace(env.DB, name.normalized);
      const cookie = await createSession(env.DB, request, userId);
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
      if (await authAttemptsExceeded(env.DB, key, 10, true)) return fail('登录尝试过于频繁，请稍后再试', 429);

      const body = (await request.json().catch(() => null)) as
        | { username?: unknown; password?: unknown }
        | null;
      const name = normalizeUsername(body?.username);
      if (!name || !validPassword(body?.password)) {
        await recordAuthAttempt(env.DB, key, false);
        return fail('用户名或密码不正确', 401);
      }

      const user = await env.DB.prepare(
        `SELECT id, username, username_normalized AS usernameNormalized, password_hash AS passwordHash,
                role, grade_level AS gradeLevel, profile_initialized AS profileInitialized
         FROM users WHERE username_normalized = ?`,
      )
        .bind(name.normalized)
        .first<UserRow>();
      const valid = await verifyPassword(body!.password as string, user?.passwordHash ?? (await getDummyPasswordHash()));
      await recordAuthAttempt(env.DB, key, Boolean(user) && valid);
      if (!user || !valid) return fail('用户名或密码不正确', 401);

      await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), user.id)
        .run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?')
        .bind(user.id, new Date().toISOString())
        .run();
      const cookie = await createSession(env.DB, request, user.id);
      return json(
        {
          user: { id: user.id, username: user.username },
          workspace: user.usernameNormalized,
          profile: profileFromRow(user),
        },
        200,
        { 'Set-Cookie': cookie },
      );
    }

    if (segments.length === 2 && segments[1] === 'logout' && method === 'POST') {
      const token = readCookie(request, SESSION_COOKIE);
      if (token) {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      }
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(isSecure(request)) });
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
        (rows.results ?? []).map((row) => {
          let records = 0;
          try {
            const snapshot = JSON.parse(row.data) as Record<string, unknown>;
            records = STORE_NAMES.reduce(
              (sum, store) => sum + (Array.isArray(snapshot[store]) ? (snapshot[store] as unknown[]).length : 0),
              0,
            );
          } catch {
            records = 0;
          }
          return { timestamp: row.id, size: row.data.length, records };
        }),
      );
    }
    if (method === 'POST') {
      const timestamp = new Date().toISOString();
      const snapshot = await exportSnapshot(env.DB, workspace);
      await env.DB.prepare('INSERT INTO sync_backups (id, account_id, created_at, data) VALUES (?, ?, ?, ?)')
        .bind(timestamp, workspace, timestamp, JSON.stringify(snapshot))
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
      return json({ ok: true, timestamp, pruned: prune.length });
    }
  }

  if (segments[0] === 'backups' && segments.length === 3 && segments[2] === 'restore' && method === 'POST') {
    const row = await env.DB.prepare('SELECT data FROM sync_backups WHERE id = ? AND account_id = ?')
      .bind(segments[1], workspace)
      .first<{ data: string }>();
    if (!row) return fail('未找到备份', 404);
    const snapshot = JSON.parse(row.data) as Record<string, unknown>;
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

    if (segments.length === 2 && method === 'GET') {
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
