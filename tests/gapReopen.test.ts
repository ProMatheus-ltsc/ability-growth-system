import { describe, expect, it } from 'vitest';
import { deriveGapsFromTraining } from '../src/services/analytics';
import {
  legacyVerifiedGap,
  mergeTraining,
  reopenTraining,
} from './fixtures/demoData';
import type { AbilityGap } from '../src/domain/types';

describe('能力缺口重开与历史（演示数据）', () => {
  it('已验证 gap 同 key 再次出现：复用 id、重开、计数与历史追加', () => {
    const [updated] = deriveGapsFromTraining(reopenTraining, [legacyVerifiedGap]);

    expect(updated.id).toBe(legacyVerifiedGap.id);
    expect(updated.status).toBe('in-progress');
    expect(updated.occurrenceCount).toBe(legacyVerifiedGap.occurrenceCount + 1);
    expect(updated.reopenedCount).toBe(1);
    expect(updated.statusHistory).toHaveLength(1);
    expect(updated.statusHistory?.[0]).toMatchObject({
      status: 'in-progress',
      source: 'auto',
      reason: 'reappeared',
      recordId: 'reopen-1',
      from: 'verified',
    });
    // 老数据无 verifiedAt 时保持不伪造
    expect(updated.verifiedAt).toBeUndefined();
  });

  it('同一训练重复处理不重复追加历史与计数', () => {
    const [first] = deriveGapsFromTraining(reopenTraining, [legacyVerifiedGap]);
    const second = deriveGapsFromTraining(reopenTraining, [first]);

    expect(second).toEqual([]);
  });

  it('未验证 gap 合并：追加 merged 历史', () => {
    const unresolved: AbilityGap = {
      ...legacyVerifiedGap,
      status: 'unresolved',
      reopenedCount: 0,
      statusHistory: [
        { status: 'unresolved', at: '2026-10-01T00:00:00.000Z', source: 'auto', reason: 'created' },
      ],
    };
    const [updated] = deriveGapsFromTraining(mergeTraining, [unresolved]);

    expect(updated.status).toBe('unresolved');
    expect(updated.occurrenceCount).toBe(unresolved.occurrenceCount + 1);
    expect(updated.reopenedCount).toBe(0);
    expect(updated.statusHistory).toHaveLength(2);
    expect(updated.statusHistory?.[1]).toMatchObject({
      status: 'unresolved',
      source: 'auto',
      reason: 'merged',
      recordId: 'merge-1',
    });
  });

  it('新缺口带 created 历史', () => {
    const [created] = deriveGapsFromTraining(reopenTraining, []);
    expect(created.status).toBe('unresolved');
    expect(created.reopenedCount).toBe(0);
    expect(created.statusHistory).toHaveLength(1);
    expect(created.statusHistory?.[0]).toMatchObject({
      status: 'unresolved',
      source: 'auto',
      reason: 'created',
      recordId: 'reopen-1',
    });
  });

  it('未达到阈值不派生缺口', () => {
    const lowRisk = { ...reopenTraining, totalQuestions: 10, errorCount: 2, correctCount: 8 };
    expect(deriveGapsFromTraining(lowRisk, [])).toEqual([]);
  });
});
