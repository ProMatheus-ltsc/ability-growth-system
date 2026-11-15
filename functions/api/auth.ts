/**
 * 认证实现 —— 收归 @shared/core 的统一认证。
 *
 * 本项目的 users / sessions / auth_attempts 表结构已经与共享包的统一契约
 * 一致（见 migrations/0002_auth.sql），因此这里不需要任何表结构迁移，
 * 只把重复的实现替换掉：
 * - 密码哈希（PBKDF2-SHA256 100k + 常量时间比较 + 哑元哈希防枚举）
 * - 会话令牌（库里只存 sha256(token)）
 * - Cookie 拼装与读取
 * - D1 会话/用户/限流表操作
 *
 * 本项目保留的部分：
 * - 登录名是用户名（不是邮箱）
 * - users 表的额外列：role / grade_level / profile_initialized
 *   （它们由 runtime ALTER 建出，不在 .sql migration 里）
 * - workspace 隔离：workspace 由服务端从会话推导，客户端不能指定
 */
import {
  buildClearCookie,
  buildCookie,
  generateSessionToken,
  getDummyPasswordHash,
  hashPassword,
  isSecureRequest,
  readCookie as readCookieRaw,
  sha256Hex,
  verifyPassword,
} from '@shared/core/server/authCore';
import {
  createSession as sharedCreateSession,
  deleteSession as sharedDeleteSession,
  findUserByUsername,
  insertUser as sharedInsertUser,
  recordAuthAttemptRaw,
  resolveSession as sharedResolveSession,
  touchLastLogin as sharedTouchLastLogin,
  type D1Like,
} from '@shared/core/server/authDb';

/** 会话 Cookie 名 */
export const SESSION_COOKIE = 'ability_growth_session';

/** 会话有效期（天） */
export const SESSION_DAYS = 30;

/** 每用户保留会话数上限 */
export const MAX_SESSIONS_PER_USER = 20;

/** users 表的项目特有列（共享包按 extraColumns 参与读写） */
const USER_EXTRA_COLUMNS = ['role', 'grade_level', 'profile_initialized'];

/** 共享包的 D1Like 适配 */
function asD1(db: D1Database): D1Like {
  return db as unknown as D1Like;
}

// ==================== 会话 ====================

/** 创建会话：token 只在 Cookie 里出现，库里只存 sha256 */
export async function createSession(
  db: D1Database,
  request: Request,
  userId: string,
): Promise<{ cookie: string; expiresAt: string }> {
  const token = generateSessionToken();
  const { expiresAt } = await sharedCreateSession(asD1(db), userId, token, {
    sessionDays: SESSION_DAYS,
    maxSessionsPerUser: MAX_SESSIONS_PER_USER,
    userExtraColumns: USER_EXTRA_COLUMNS,
  });
  return { cookie: sessionCookie(token, SESSION_DAYS * 86400, isSecure(request)), expiresAt };
}

/** 解析会话：token → 会话与用户（过期即删行） */
export async function resolveSession(db: D1Database, request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await sharedResolveSession(asD1(db), token, tokenHash, {
    userExtraColumns: USER_EXTRA_COLUMNS,
  });
  if (!session) return null;
  return {
    userId: session.userId,
    username: session.username,
    workspace: session.username.toLowerCase(),
    tokenHash: session.tokenHash,
    expiresAt: session.expiresAt,
    role: String(session.user.role ?? 'student'),
    gradeLevel: String(session.user.grade_level ?? 'adult'),
    profileInitialized: Number(session.user.profile_initialized ?? 0),
  };
}

/** 删除会话（登出） */
export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
  await sharedDeleteSession(asD1(db), tokenHash);
}

/** 写会话 Cookie */
export function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return buildCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'Strict',
    path: '/',
    maxAge,
  });
}

/** 清会话 Cookie */
export function clearSessionCookie(secure: boolean): string {
  return buildClearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: 'Strict',
    path: '/',
  });
}

/** 从请求读 Cookie */
export function readCookie(request: Request, name: string): string | null {
  return readCookieRaw(request, name) ?? null;
}

/** 判断请求是否 https */
export function isSecure(request: Request): boolean {
  return isSecureRequest(request);
}

// ==================== 用户 ====================

/** 按用户名查用户 */
export async function findUser(db: D1Database, username: string) {
  return findUserByUsername(asD1(db), username, { userExtraColumns: USER_EXTRA_COLUMNS });
}

/** 插入用户 */
export async function insertUser(
  db: D1Database,
  user: { id: string; username: string; normalized: string; passwordHash: string },
): Promise<void> {
  await sharedInsertUser(
    asD1(db),
    {
      id: user.id,
      username: user.username,
      passwordHash: user.passwordHash,
      extra: { role: 'student', grade_level: 'adult', profile_initialized: 0 },
    },
    { userExtraColumns: USER_EXTRA_COLUMNS },
  );
}

/** 更新最后登录时间 */
export async function touchLastLogin(db: D1Database, userId: string): Promise<void> {
  await sharedTouchLastLogin(asD1(db), userId, { userExtraColumns: USER_EXTRA_COLUMNS });
}

/** 校验密码（常量时间比较；兼容历史哈希格式） */
export async function checkPassword(password: string, stored: string | null): Promise<boolean> {
  return verifyPassword(password, stored);
}

/** 生成密码哈希 */
export async function makePasswordHash(password: string): Promise<string> {
  return hashPassword(password);
}

/** 哑元哈希：用户不存在时也跑一次 PBKDF2，降低用户名枚举价值 */
export async function dummyPasswordHash(): Promise<string> {
  return getDummyPasswordHash();
}

// ==================== 限流 ====================

/**
 * 检查是否超过限流阈值。
 *
 * @param failuresOnly 只统计失败尝试（登录场景用，避免成功登录也被限流）
 */
export async function authAttemptsExceeded(
  db: D1Database,
  key: string,
  limit: number,
  failuresOnly = true,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM auth_attempts
       WHERE client_key = ? AND created_at > ?${failuresOnly ? ' AND succeeded = 0' : ''}`,
    )
    .bind(key, new Date(Date.now() - 10 * 60_000).toISOString())
    .first<{ count: number }>();
  return Number(row?.count ?? 0) >= limit;
}

/** 记录一次认证尝试（client_key 已含 scope 前缀，原样写入） */
export async function recordAuthAttempt(
  db: D1Database,
  key: string,
  succeeded: boolean,
): Promise<void> {
  await recordAuthAttemptRaw(asD1(db), key, succeeded);
}
