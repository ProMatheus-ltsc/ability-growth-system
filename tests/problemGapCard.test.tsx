import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { GapCard } from '../src/pages/ProblemCenterPage';
import type { AbilityGap } from '../src/domain/types';

function baseGap(overrides: Partial<AbilityGap>): AbilityGap {
  return {
    id: 'g1',
    subject: 'xingce',
    abilityPath: 'xingce/判断推理/图形推理',
    errorCategory: 'concept',
    severity: 'medium',
    status: 'unresolved',
    sourceRecordIds: ['t1'],
    occurrenceCount: 2,
    firstSeenAt: '2026-01-01T08:00:00.000Z',
    lastSeenAt: '2026-01-05T08:00:00.000Z',
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-05T08:00:00.000Z',
    statusHistory: [
      { status: 'unresolved', at: '2026-01-01T08:00:00.000Z', source: 'manual', reason: 'created' },
    ],
    ...overrides,
  };
}

function renderGap(gap: AbilityGap, recurrence = 0.5): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <GapCard gap={gap} recurrence={recurrence} onUpdate={() => {}} onDelete={() => {}} onCreateTask={() => {}} />
    </MemoryRouter>,
  );
}

describe('问题中心 GapCard：缺失信息兜底为「信息不足」', () => {
  it('正常数据展示与原逻辑一致，且不出现 undefined / NaN', () => {
    const html = renderGap(baseGap({}));
    expect(html).toContain('图形推理');
    expect(html).toContain('判断推理');
    expect(html).toContain('概念错误');
    expect(html).toContain('50%');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('abilityPath 为空时显示「信息不足」并给出关联训练的提示', () => {
    const html = renderGap(baseGap({ abilityPath: '' }));
    expect(html).toContain('信息不足');
    expect(html).toContain('去关联一次训练记录');
    expect(html).not.toContain('undefined');
  });

  it('未知错因回退原始值，空错因显示「信息不足」', () => {
    const unknown = renderGap(baseGap({ errorCategory: 'legacy_calc' as AbilityGap['errorCategory'] }));
    expect(unknown).toContain('legacy_calc');
    expect(unknown).not.toContain('undefined');

    const empty = renderGap(baseGap({ errorCategory: '' as AbilityGap['errorCategory'] }));
    expect(empty).toContain('信息不足');
    expect(empty).not.toContain('undefined');
  });

  it('缺日期 / 缺来源 / 未知状态历史不抛异常也不渲染 undefined', () => {
    const html = renderGap(
      baseGap({
        sourceRecordIds: undefined as unknown as string[],
        firstSeenAt: undefined as unknown as string,
        lastSeenAt: undefined as unknown as string,
        statusHistory: [
          { status: 'weird' as AbilityGap['status'], at: undefined as unknown as string, source: 'auto', reason: 'weird' as never },
        ],
      }),
    );
    expect(html).toContain('信息不足');
    expect(html).not.toContain('undefined');
  });

  it('复现率非有限数时不渲染 NaN', () => {
    const html = renderGap(baseGap({}), Number.NaN);
    expect(html).not.toContain('NaN');
    expect(html).toContain('信息不足');
  });
});
