/**
 * Cloudflare D1 直连客户端
 * 所有业务数据读写都经 Pages 同域 /api（Pages Functions + D1 Binding）。
 * 账户由服务端校验，会话放在 HttpOnly Cookie 中，前端不接触令牌。
 */
import type { StoreName } from './snapshot';
import type { StoreDelta } from './syncMirror';
import type { WindowQuery, StoreWindow } from './recordWindow';
import { windowSearchParams } from './recordWindow';
import type { UserProfile } from '../domains/shared/scope';

const ERROR_EVENT = 'ability-growth:data-error';
const UNAUTHORIZED_EVENT = 'ability-growth:auth-unauthorized';

let lastError = { message: '', at: 0 };
let pendingError: string | null = null;

export class D1ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'D1ApiError';
    this.status = status;
  }
}

function reportError(message: string): void {
  const now = Date.now();
  if (lastError.message === message && now - lastError.at < 3000) return;
  lastError = { message, at: now };
  pendingError = message;
  // 没有 window（单元测试 / 非浏览器环境）时只留在 pendingError 上；
  // 否则这里会抛 ReferenceError，把真正的错误盖掉，排查时看到的全是无关异常。
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ERROR_EVENT, { detail: message }));
}

/** 取走启动阶段产生、但当时还没有监听器的错误 */
export function consumePendingError(): string | null {
  const message = pendingError;
  pendingError = null;
  return message;
}

export const DATA_ERROR_EVENT = ERROR_EVENT;
export const UNAUTHORIZED_EVENT_NAME = UNAUTHORIZED_EVENT;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** 账户相关请求自身处理 401，不触发全局登出事件 */
  notifyUnauthorized?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, notifyUnauthorized = true } = options;

  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败';
    reportError(message);
    throw new D1ApiError(message, 0);
  }

  if (!response.ok) {
    let message = `请求失败（HTTP ${response.status}）`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // 保留默认消息
    }
    if (response.status === 401 && notifyUnauthorized) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    } else {
      reportError(message);
    }
    throw new D1ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ============ 账户 ============

export interface AuthUser {
  id: string;
  username: string;
}

interface AuthResponse {
  user: AuthUser;
  workspace: string;
  expiresAt?: string;
  profile: UserProfile;
}

export async function fetchMe(): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/me', { notifyUnauthorized: false });
}

export async function loginAccount(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
    notifyUnauthorized: false,
  });
}

export async function registerAccount(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: { username, password },
    notifyUnauthorized: false,
  });
}

export async function logoutAccount(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST', notifyUnauthorized: false });
}

// ============ 角色 / 学段偏好 ============

export async function fetchProfile(): Promise<UserProfile> {
  return request<UserProfile>('/api/profile', { notifyUnauthorized: false });
}

export async function updateProfile(
  patch: Partial<Pick<UserProfile, 'role' | 'gradeLevel'>>,
): Promise<UserProfile> {
  return request<UserProfile>('/api/profile', { method: 'PUT', body: patch });
}

// ============ 业务数据 ============

export async function checkHealth(): Promise<boolean> {
  try {
    await request('/api/health');
    return true;
  } catch {
    return false;
  }
}

export interface StorageStats {
  workspace: string;
  total: number;
  byStore: Record<StoreName, number>;
}

/**
 * 各表记录数。
 *
 * `fresh=true` 时服务端跳过自己的计数缓存（用户手动点「刷新状态」时用），
 * 平时不带：统计是个概览数字，晚 30-60 秒没有影响，但每次挂载都重算 26 个 COUNT 有影响。
 */
export async function getStats(options: { fresh?: boolean } = {}): Promise<StorageStats> {
  return request<StorageStats>(options.fresh ? '/api/stats?fresh=1' : '/api/stats');
}

export interface StorageStatus {
  isOnline: boolean;
  totalRecords: number;
  lastSyncAt: string | null;
}

/**
 * 存储状态（连通性 + 记录数）在模块级缓存 30s。
 *
 * 为什么不是「每次挂载都查一遍」：工作台和存储页各挂一个 useSyncStatus，
 * 加上 React 严格模式的双次 effect，一次点击就能打出四五个 `/api/stats`，
 * 而每次统计都是 26 个 COUNT。30 秒内的重复挂载直接复用上一次结果；
 * 用户点「刷新状态」时传 `fresh` 既绕过这里的缓存，也让服务端跳过它自己的计数缓存。
 *
 * 写操作会调 {@link invalidateStorageStatus} 清掉缓存：刚加完记录就看到旧条数，
 * 看起来就是「没存上」。
 */
const STATUS_TTL_MS = 30_000;
let statusCache: { at: number; value: StorageStatus } | null = null;
let statusInflight: Promise<StorageStatus> | null = null;

export function invalidateStorageStatus(): void {
  statusCache = null;
}

export async function fetchStorageStatus(options: { fresh?: boolean } = {}): Promise<StorageStatus> {
  if (!options.fresh && statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.value;
  if (statusInflight) return statusInflight;

  statusInflight = (async () => {
    const [isOnline, stats] = await Promise.all([
      checkHealth(),
      getStats({ fresh: options.fresh === true }).catch(() => null),
    ]);
    const value: StorageStatus = { isOnline, totalRecords: stats?.total ?? 0, lastSyncAt: null };
    statusCache = { at: Date.now(), value };
    return value;
  })();

  try {
    return await statusInflight;
  } finally {
    statusInflight = null;
  }
}

export async function listRecords<T>(store: StoreName): Promise<T[]> {
  return request<T[]>(`/api/stores/${store}`);
}

/**
 * 窗口 / 游标分页读取（契约见 recordWindow.ts）。
 *
 * 注意这里**不经过本地镜像**：镜像是「整表 + 水位」语义，回答不了「下一页从哪开始」。
 * 需要完整历史的页面继续用 listStoreDelta，需要一屏/一段时间的页面用这个。
 */
export async function listStoreWindow<T>(
  store: StoreName,
  query: Partial<WindowQuery>,
): Promise<StoreWindow<T>> {
  const params = windowSearchParams(query);
  const search = params.toString();
  return request<StoreWindow<T>>(`/api/stores/${store}${search ? `?${search}` : ''}`);
}

/**
 * 增量列表：只取 `since` 水位之后被写入的行 + 被删除的 id。
 *
 * 首次同步传 {@link SYNC_EPOCH}，与服务端走同一条路径，顺带拿到服务端水位，
 * 不需要「全量接口 + 客户端自己算水位」那套两套口径。
 */
export async function listStoreDelta<T>(store: StoreName, since: string): Promise<StoreDelta<T>> {
  return request<StoreDelta<T>>(`/api/stores/${store}?since=${encodeURIComponent(since)}`);
}

export async function getRecord<T>(store: StoreName, id: string): Promise<T | undefined> {
  // 空 id 会拼成 `/api/stores/<store>/`，服务端把它当「列表」处理并返回**数组**。
  // 这个数组一路走到页面 state 里，页面再读 record.xxx 就是渲染期 TypeError → 白屏。
  // 单条读取的契约是「记录对象或 undefined」，这里先把两种违约形状挡掉。
  if (!id) return undefined;
  try {
    const record = await request<unknown>(`/api/stores/${store}/${encodeURIComponent(id)}`);
    if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
    return record as T;
  } catch (error) {
    if (error instanceof D1ApiError && error.status === 404) return undefined;
    throw error;
  }
}

export async function putRecord<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  await request(`/api/stores/${store}/${encodeURIComponent(value.id)}`, { method: 'PUT', body: value });
}

export async function deleteRecord(store: StoreName, id: string): Promise<void> {
  await request(`/api/stores/${store}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function bulkPut<T extends { id: string }>(store: StoreName, records: T[]): Promise<void> {
  if (records.length === 0) return;
  await request(`/api/stores/${store}/bulk`, { method: 'POST', body: { records } });
}

export async function clearWorkspace(): Promise<void> {
  await request('/api/stores', { method: 'DELETE' });
}

export interface BackupPoint {
  timestamp: string;
  size: number;
  records: number;
}

export async function listBackups(): Promise<BackupPoint[]> {
  return request<BackupPoint[]>('/api/backups');
}

export async function createBackup(): Promise<{ timestamp: string }> {
  return request('/api/backups', { method: 'POST' });
}

export async function restoreBackup(timestamp: string): Promise<void> {
  await request(`/api/backups/${encodeURIComponent(timestamp)}/restore`, { method: 'POST' });
}
