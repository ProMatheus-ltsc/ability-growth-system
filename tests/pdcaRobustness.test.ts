/**
 * PDCA 历史记录健壮性回归测试
 *
 * 背景（线上白屏）：V5.8 之前的 PDCA 问题记录里没有 `rootCauses` /
 * `countermeasures` / `checkEntries` 这几个数组字段。详情页在**渲染期**执行
 * `for (const c of problem.rootCauses)` → `TypeError: ... is not iterable`
 * → React 卸载整棵树 → 用户看到纯白页面，刷新同样白屏。
 *
 * 另外 `/api/stores/<store>/`（id 为空）会被服务端归一化成「列表」并返回数组，
 * 客户端把数组当单条记录用，同样是渲染期崩溃。这里把两处口径都钉死。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeProblem } from '../src/services/pdca';
import { getRecord } from '../src/services/d1Client';
import type { PDCAProblem } from '../src/domain/types';

/** 老版本写进 D1 的记录：只有标量字段，没有任何数组 */
const LEGACY_RECORD = {
  id: 'legacy-p1',
  title: '老版本问题',
  description: '描述',
  problemType: 'capability',
  lifeDomain: 'work',
  targetState: '目标',
  successCriteria: '标准',
  currentStage: 'p2-root-cause',
  createdAt: '2025-02-01T00:00:00.000Z',
  updatedAt: '2025-02-01T00:00:00.000Z',
} as unknown as PDCAProblem;

describe('normalizeProblem 补齐历史记录', () => {
  it('缺失的数组字段补成空数组，渲染期可安全遍历', () => {
    const problem = normalizeProblem(LEGACY_RECORD);
    expect(problem.rootCauses).toEqual([]);
    expect(problem.countermeasures).toEqual([]);
    expect(problem.checkEntries).toEqual([]);
    expect(problem.archivedLessons).toEqual([]);
    expect(problem.cycleHistory).toEqual([]);
    expect(problem.sensorySignals).toEqual([]);
    // 数组可遍历、可 map，不再抛 is not iterable
    expect(() => problem.rootCauses.map((c) => c.id)).not.toThrow();
  });

  it('缺失的标量字段补默认值，阶段流转判断不会因 undefined 崩', () => {
    const problem = normalizeProblem(LEGACY_RECORD);
    expect(problem.currentCycle).toBe(1);
    expect(problem.status).toBe('active');
    expect(problem.stageEnteredAt).toBe('2025-02-01T00:00:00.000Z');
  });

  it('已有数组字段原样保留（不会把真实根因抹掉）', () => {
    const withCauses = normalizeProblem({
      ...LEGACY_RECORD,
      rootCauses: [{ id: 'rc1', content: '根因', impact: 'high' }],
    } as unknown as PDCAProblem);
    expect(withCauses.rootCauses).toHaveLength(1);
    expect(withCauses.rootCauses[0].content).toBe('根因');
  });
});

describe('getRecord 单条读取契约', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('空 id 直接返回 undefined，且不会发出请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getRecord('pdcaProblems', '')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('服务端误返回数组时不下发给页面（避免当记录使用）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    await expect(getRecord('pdcaProblems', 'x')).resolves.toBeUndefined();
  });

  it('正常记录原样返回', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: 'p1', title: '问题' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    await expect(getRecord('pdcaProblems', 'p1')).resolves.toMatchObject({ id: 'p1' });
  });

  it('404 归一成 undefined，不抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: '记录不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } })),
    );
    await expect(getRecord('pdcaProblems', 'nope')).resolves.toBeUndefined();
  });
});
