/**
 * 本项目认证装配：把 shared-core 的统一认证接到本项目的 API 客户端上。
 *
 * - 认证状态机、错误语义：shared-core（`@shared/core/auth`）
 * - 传输：本项目的 `services/d1Client`（credentials:"same-origin" + 401 全局事件）
 *
 * 本项目的差异：
 * - 后端返回的是裸对象（没有 shared-core 那套 `{ success, data }` 信封），
 *   所以这里给 request 适配一层：把裸响应包成信封再交给共享包解。
 * - `/auth/me` 返回 `{ user, workspace, expiresAt, profile }`，
 *   用户载荷里没有 username，需要从 workspace（= 用户名小写）补。
 */
import {
  createRestAuthDriver,
  type AuthDriver,
  type AuthUser,
} from '@shared/core/auth';
import {
  D1ApiError,
  fetchMe,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AuthUser as ProjectAuthUser,
} from './d1Client';

/** 后端返回的用户载荷 */
interface AuthUserPayload {
  id: string;
  username?: string;
  nickname?: string;
  displayName?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * 共享包的默认映射要求 raw.id 存在，且把非标准字段塞进 extra。
 * 本项目的用户载荷没有 username（用 workspace 承载），映射如下。
 */
function mapUser(raw: AuthUserPayload): AuthUser {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (['id', 'username', 'nickname', 'displayName', 'email'].includes(key)) continue;
    extra[key] = value;
  }
  return {
    id: raw.id,
    username: raw.username ?? raw.id,
    displayName: raw.displayName ?? raw.nickname,
    email: raw.email,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

/**
 * 请求适配：把共享包统一契约的路径与字段翻译成本项目后端认的形式。
 *
 * 本项目后端：
 *   POST /api/auth/login    { username, password } → { user, workspace, profile }
 *   POST /api/auth/register { username, password } → 同上
 *   GET  /api/auth/me                            → { user, workspace, expiresAt, profile }
 *   POST /api/auth/logout                        → { ok: true }
 *
 * 共享包 REST 驱动默认：
 *   POST {base}/login    { username, password } → 用户载荷
 *   POST {base}/register { username, password, email, nickname } → 用户载荷
 *   GET  {base}/me       → 用户载荷
 *   POST {base}/logout   → 用户载荷
 *
 * 差异只在响应形状（后端把用户包在 { user } 里）与 logout 的返回值，
 * 这里统一处理。
 */
async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;

  if (method === 'POST' && path.endsWith('/login')) {
    const result = await loginAccount(String(body?.username ?? ''), String(body?.password ?? ''));
    return { user: mapUser(result.user as AuthUserPayload) } as T;
  }
  if (method === 'POST' && path.endsWith('/register')) {
    const result = await registerAccount(String(body?.username ?? ''), String(body?.password ?? ''));
    return { user: mapUser(result.user as AuthUserPayload) } as T;
  }
  if (method === 'GET' && path.endsWith('/me')) {
    const result = await fetchMe();
    return { user: mapUser(result.user as AuthUserPayload) } as T;
  }
  if (method === 'POST' && path.endsWith('/logout')) {
    await logoutAccount();
    return {} as T;
  }
  throw new D1ApiError(`未预期的认证请求：${method} ${path}`, 0);
}

/** 本项目的服务端认证驱动 */
export const restAuthDriver: AuthDriver = createRestAuthDriver({
  basePath: '/api/auth',
  request: authRequest,
  mapUser,
});
