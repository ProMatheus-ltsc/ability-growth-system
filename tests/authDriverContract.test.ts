/**
 * shared-core restDriver 载荷口径回归测试
 *
 * 背景（真实线上故障）：基座服务端 `createAuthRoutes` 返回
 * `{ success: true, data: { user, expiresAt } }`，而基座客户端 `restDriver`
 * 原先只在 `raw` 顶层找 `id`：
 * - `restore()` 取不到 id → 静默返回 null → **每次刷新网页都被弹回登录页**
 * - `login()` 映射出 `id: undefined` → 业务命名空间变成 `ability-growth-app-undefined`
 *   → 本地 meta 读不到 → `onboardingDone` 恒为 false → **每次登录都强制走引导页**
 *
 * 这里把「后端可能返回的四种形状」都钉死，任何一个形状退化都会立刻失败。
 */
import { describe, it, expect } from 'vitest';
import { createRestAuthDriver, AuthError } from '@shared/core/auth';

const SERVER_USER = { id: 'usr_123', username: 'demo', nickname: '演示' };

/** 用可控的 request 模拟各类后端响应，绕开真实 fetch */
function driverReturning(payload: unknown) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const driver = createRestAuthDriver({
    basePath: '/api/auth',
    request: async <T,>(path: string, init?: RequestInit): Promise<T> => {
      calls.push({ path, init });
      return payload as T;
    },
  });
  return { driver, calls };
}

describe('restDriver /me 形状兼容', () => {
  it('{ user } 包装（基座服务端默认口径）能恢复出登录态', async () => {
    const { driver } = driverReturning({ user: SERVER_USER, expiresAt: '2030-01-01T00:00:00Z' });
    const user = await driver.restore();
    expect(user?.id).toBe('usr_123');
    expect(user?.username).toBe('demo');
  });

  it('裸用户对象能恢复出登录态', async () => {
    const { driver } = driverReturning(SERVER_USER);
    expect((await driver.restore())?.id).toBe('usr_123');
  });

  it('自定义 request 原样透传 { success, data } 信封也能恢复', async () => {
    const { driver } = driverReturning({
      success: true,
      data: { user: SERVER_USER, expiresAt: '2030-01-01T00:00:00Z' },
    });
    expect((await driver.restore())?.id).toBe('usr_123');
  });

  it('空载荷 = 未登录，返回 null 而不是抛错', async () => {
    const { driver } = driverReturning({ user: null });
    await expect(driver.restore()).resolves.toBeNull();
  });

  it('401 是未登录的正常态，不抛错', async () => {
    const driver = createRestAuthDriver({
      request: async () => {
        throw new AuthError('UNAUTHORIZED', '请先登录', 401);
      },
    });
    await expect(driver.restore()).resolves.toBeNull();
  });
});

describe('restDriver 登录/注册不得产出脏会话', () => {
  it('登录 { user } 包装能拿到 id（不再 undefined）', async () => {
    const { driver, calls } = driverReturning({ user: SERVER_USER, expiresAt: '2030-01-01T00:00:00Z' });
    const user = await driver.login({ username: 'demo', password: 'secret123' });
    expect(user.id).toBe('usr_123');
    // 请求体仍是基座统一契约字段
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ username: 'demo', password: 'secret123' });
  });

  it('登录响应缺 id 时显式报错，而不是返回 id: undefined', async () => {
    const { driver } = driverReturning({ user: { username: 'demo' } });
    await expect(driver.login({ username: 'demo', password: 'secret123' })).rejects.toBeInstanceOf(AuthError);
  });

  it('注册 { user } 包装返回 created', async () => {
    const { driver } = driverReturning({ user: SERVER_USER });
    const result = await driver.register({ username: 'demo', password: 'secret123' });
    expect(result.status).toBe('created');
    expect(result.status === 'created' && result.user.id).toBe('usr_123');
  });

  it('注册两阶段（needs_verification）返回 pending，不会误判成登录成功', async () => {
    const { driver } = driverReturning({ needs_verification: true, pending_id: 'pend_1', notice: '验证码已发送' });
    const result = await driver.register({ username: 'demo', password: 'secret123' });
    expect(result).toEqual({ status: 'pending', pendingId: 'pend_1', notice: '验证码已发送' });
  });

  it('mapUser 覆盖后仍能取到项目特有字段', async () => {
    const driver = createRestAuthDriver({
      request: async <T,>() => ({ user: { ...SERVER_USER, workspace: 'demo', role: 'teacher' } }) as T,
      mapUser: (raw) => ({
        id: raw.id,
        username: String(raw.workspace ?? raw.id),
        extra: { workspace: raw.workspace, role: raw.role },
      }),
    });
    const user = await driver.login({ username: 'demo', password: 'secret123' });
    expect(user.username).toBe('demo');
    expect(user.extra).toMatchObject({ workspace: 'demo', role: 'teacher' });
  });
});
