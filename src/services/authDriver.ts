/**
 * 本项目认证装配：把 shared-core 的统一认证接到本项目的 API 客户端上。
 *
 * - 认证状态机、错误语义：shared-core（`@shared/core/auth`）
 * - 传输：本项目的 `services/d1Client`（credentials:"same-origin" + 401 全局事件）
 *
 * 本项目后端把用户包在 `{ user, workspace, profile }` 里再返回，**解包由基座
 * `restDriver` 承担**（见 shared-core `pickUserPayload`：裸对象 / `{ user }` /
 * `{ data }` 三种形状都认），所以这里只做「客户端 → 统一契约」的薄适配，
 * 不再自己解包、也不再自己映射用户字段。
 *
 * 历史坑（写在这里防止再犯）：本项目曾在适配层包装成 `{ user: mapUser(...) }`，
 * 等于把已经映射过的用户又包一层，基座再拿 `raw.id` 就取不到 →
 * `restore()` 静默判未登录（每次刷新被弹回登录页）、
 * `login()` 得到 `id: undefined`（业务库名变成 `...-undefined`，
 * 本地 meta 读不到 → 每次登录都强制走引导页）。
 * 结论：**形状差异归基座，项目侧只做字段翻译。**
 */
import {
  AuthError,
  createRestAuthDriver,
  type AuthDriver,
} from '@shared/core/auth';
import {
  D1ApiError,
  fetchMe,
  loginAccount,
  logoutAccount,
  registerAccount,
} from './d1Client';

/**
 * 把 d1Client 的 401 转成统一 AuthError：
 * 基座靠 `AuthError.status === 401` 判断「未登录是正常态」，
 * 不转换的话会被当成服务端故障（错误码也统一不了）。
 */
function rethrowAsAuthError(error: unknown): never {
  if (error instanceof D1ApiError && error.status === 401) {
    throw new AuthError('UNAUTHORIZED', error.message, 401);
  }
  throw error;
}

/**
 * 请求适配：把基座统一契约的路径翻译成本项目客户端的调用。
 *
 * 本项目后端：
 *   POST /api/auth/login    { username, password } → { user, workspace, profile }
 *   POST /api/auth/register { username, password } → 同上
 *   GET  /api/auth/me                              → { user, workspace, expiresAt, profile }
 *   POST /api/auth/logout                          → { ok: true }
 *
 * 返回值原样交给驱动，由驱动自己拆到用户层。
 */
async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;

  try {
    if (method === 'POST' && path.endsWith('/login')) {
      return (await loginAccount(String(body?.username ?? ''), String(body?.password ?? ''))) as T;
    }
    if (method === 'POST' && path.endsWith('/register')) {
      return (await registerAccount(String(body?.username ?? ''), String(body?.password ?? ''))) as T;
    }
    if (method === 'GET' && path.endsWith('/me')) {
      return (await fetchMe()) as T;
    }
    if (method === 'POST' && path.endsWith('/logout')) {
      await logoutAccount();
      return { ok: true } as T;
    }
  } catch (error) {
    rethrowAsAuthError(error);
  }
  throw new D1ApiError(`未预期的认证请求：${method} ${path}`, 0);
}

/** 本项目的服务端认证驱动 */
export const restAuthDriver: AuthDriver = createRestAuthDriver({
  basePath: '/api/auth',
  request: authRequest,
});
