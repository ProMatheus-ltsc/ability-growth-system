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

interface Env {
  DB: D1Database;
}

const MAX_BACKUPS = 20;
const BATCH_SIZE = 50;
const SNAPSHOT_VERSION = '2.1.0';

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
}

interface UserRow {
  id: string;
  username: string;
  usernameNormalized: string;
  passwordHash: string;
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

function entityTimestamp(record: JsonRecord): string {
  const value = record.updatedAt ?? record.createdAt ?? record.evaluationTime;
  return typeof value === 'string' && value ? value : new Date().toISOString();
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
      `SELECT s.user_id AS userId, s.expires_at AS expiresAt, u.username AS username
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<{ userId: string; expiresAt: string; username: string }>();
  if (!row) return null;
  return {
    userId: row.userId,
    username: row.username,
    workspace: row.username.toLowerCase(),
    tokenHash,
    expiresAt: row.expiresAt,
  };
}

async function createSession(db: D1Database, request: Request, userId: string): Promise<string> {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db
    .prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(`ses_${crypto.randomUUID()}`, userId, await sha256(token), expiresAt, new Date().toISOString())
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
          id TEXT PRIMARY KEY,
          updated_at TEXT NOT NULL,
          data TEXT NOT NULL
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
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
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
        last_login_at TEXT NOT NULL
      )`,
    )
    .run();
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

async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await db.batch(statements.slice(index, index + BATCH_SIZE));
  }
}

function upsertStatements(
  db: D1Database,
  store: StoreName,
  workspace: string,
  records: JsonRecord[],
  lastWriteWins: boolean,
): D1PreparedStatement[] {
  const conflict = lastWriteWins
    ? `ON CONFLICT(id) DO UPDATE SET
         workspace = excluded.workspace,
         updated_at = excluded.updated_at,
         data = excluded.data
       WHERE excluded.updated_at >= ${store}.updated_at`
    : `ON CONFLICT(id) DO UPDATE SET
         workspace = excluded.workspace,
         updated_at = excluded.updated_at,
         data = excluded.data`;
  return records.map((record) =>
    db
      .prepare(
        `INSERT INTO ${store} (workspace, id, updated_at, data) VALUES (?, ?, ?, ?) ${conflict}`,
      )
      .bind(workspace, record.id, entityTimestamp(record), JSON.stringify(record)),
  );
}

function validRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (record): record is JsonRecord =>
      !!record && typeof record === 'object' && typeof (record as JsonRecord).id === 'string' && (record as JsonRecord).id.length > 0,
  );
}

async function listStore(db: D1Database, store: StoreName, workspace: string): Promise<JsonRecord[]> {
  const result = await db
    .prepare(`SELECT data FROM ${store} WHERE workspace = ? ORDER BY updated_at DESC`)
    .bind(workspace)
    .all<{ data: string }>();
  return (result.results ?? []).map((row) => parseRecord(row.data));
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

async function importSnapshot(
  db: D1Database,
  workspace: string,
  snapshot: Record<string, unknown>,
  mode: 'merge' | 'replace',
): Promise<Record<string, number>> {
  if (mode === 'replace') {
    await runBatches(
      db,
      STORE_NAMES.map((store) => db.prepare(`DELETE FROM ${store} WHERE workspace = ?`).bind(workspace)),
    );
  }

  const counts: Record<string, number> = {};
  for (const store of STORE_NAMES) {
    const records = validRecords(snapshot[store]);
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
      const cookie = await createSession(env.DB, request, userId);
      return json(
        { user: { id: userId, username: name.username }, workspace: name.normalized },
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
        `SELECT id, username, username_normalized AS usernameNormalized, password_hash AS passwordHash
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
        { user: { id: user.id, username: user.username }, workspace: user.usernameNormalized },
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
      });
    }

    return fail('未知账户端点', 404);
  }

  // ============ 业务端点：必须登录 ============
  const session = await resolveSession(env.DB, request);
  if (!session) return fail('请先登录', 401);
  const workspace = session.workspace;

  // ============ 统计 ============
  if (segments[0] === 'stats' && segments.length === 1 && method === 'GET') {
    const byStore = await countStores(env.DB, workspace);
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
      await env.DB.prepare(
        `DELETE FROM sync_backups WHERE account_id = ? AND id NOT IN (
           SELECT id FROM sync_backups WHERE account_id = ? ORDER BY created_at DESC LIMIT ?
         )`,
      )
        .bind(workspace, workspace, MAX_BACKUPS)
        .run();
      return json({ ok: true, timestamp });
    }
  }

  if (segments[0] === 'backups' && segments.length === 3 && segments[2] === 'restore' && method === 'POST') {
    const row = await env.DB.prepare('SELECT data FROM sync_backups WHERE id = ? AND account_id = ?')
      .bind(segments[1], workspace)
      .first<{ data: string }>();
    if (!row) return fail('未找到备份', 404);
    const snapshot = JSON.parse(row.data) as Record<string, unknown>;
    const counts = await importSnapshot(env.DB, workspace, snapshot, 'replace');
    return json({ ok: true, counts });
  }

  // ============ 业务表 CRUD ============
  if (segments[0] === 'stores') {
    if (segments.length === 1 && method === 'DELETE') {
      await runBatches(
        env.DB,
        STORE_NAMES.map((store) => env.DB.prepare(`DELETE FROM ${store} WHERE workspace = ?`).bind(workspace)),
      );
      return json({ ok: true });
    }

    if (segments.length < 2 || !isStore(segments[1])) return fail('未知的数据表', 404);
    const store = segments[1];

    if (segments.length === 2 && method === 'GET') {
      return json(await listStore(env.DB, store, workspace));
    }

    if (segments.length === 3 && segments[2] === 'bulk' && method === 'POST') {
      const body = (await request.json()) as { records?: unknown } | unknown[];
      const records = validRecords(Array.isArray(body) ? body : body.records);
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
      return row ? json(parseRecord(row.data)) : fail('记录不存在', 404);
    }

    if (method === 'PUT') {
      const body = (await request.json()) as Partial<JsonRecord>;
      if (!body || typeof body !== 'object') return fail('请求体必须是记录对象');
      const record: JsonRecord = { ...(body as JsonRecord), id };
      await runBatches(env.DB, upsertStatements(env.DB, store, workspace, [record], false));
      return json({ ok: true, id });
    }

    if (method === 'DELETE') {
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
