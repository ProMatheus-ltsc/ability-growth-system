/**
 * Cloudflare D1 直连客户端
 * 所有业务数据读写都经 Pages 同域 /api（Pages Functions + D1 Binding）。
 * 账户由服务端校验，会话放在 HttpOnly Cookie 中，前端不接触令牌。
 */
import type { StoreName } from './snapshot';

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
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
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

export async function getStats(): Promise<StorageStats> {
  return request<StorageStats>('/api/stats');
}

export async function listRecords<T>(store: StoreName): Promise<T[]> {
  return request<T[]>(`/api/stores/${store}`);
}

export async function getRecord<T>(store: StoreName, id: string): Promise<T | undefined> {
  try {
    return await request<T>(`/api/stores/${store}/${encodeURIComponent(id)}`);
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
