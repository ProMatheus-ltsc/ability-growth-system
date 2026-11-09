import { describe, expect, it } from 'vitest';
import {
  INFO_INSUFFICIENT,
  abilityPointText,
  errorCategoryText,
  parseAbilityPath,
} from '../src/domain/missingInfo';
import { calcErrorRecurrence } from '../src/services/analytics';
import type { TrainingRecord } from '../src/domain/types';

describe('能力路径解析：缺失时不再渲染 undefined', () => {
  it('正常三级路径与原 split 结果完全一致', () => {
    const path = 'xingce/判断推理/图形推理';
    expect(parseAbilityPath(path)).toEqual({ module: '判断推理', point: '图形推理', missing: false });
    // 与改动前的表达式逐项比对，确保正常数据展示不变
    const parts = path.split('/');
    expect(parseAbilityPath(path).point).toBe(parts.slice(-1)[0]);
    expect(parseAbilityPath(path).module).toBe(parts.slice(-2)[0]);
  });

  it('空路径 / 缺字段：解析结果为空并标记缺失', () => {
    for (const value of [undefined, null, '', '///']) {
      expect(parseAbilityPath(value)).toEqual({ module: null, point: null, missing: true });
    }
  });

  it('只有一段路径：能力点保留、模块标记缺失', () => {
    expect(parseAbilityPath('判断推理')).toEqual({ module: null, point: '判断推理', missing: true });
  });

  it('能力点文案兜底为「信息不足」', () => {
    expect(abilityPointText('xingce/判断推理/图形推理')).toBe('图形推理');
    expect(abilityPointText('')).toBe(INFO_INSUFFICIENT);
    expect(abilityPointText(undefined)).toBe(INFO_INSUFFICIENT);
  });
});

describe('错因文案兜底', () => {
  it('枚举内取中文文案', () => {
    expect(errorCategoryText('concept')).toBe('概念错误');
  });

  it('枚举外的历史值回退原始值，不出现 undefined', () => {
    expect(errorCategoryText('legacy_calc')).toBe('legacy_calc');
  });

  it('缺字段统一显示「信息不足」', () => {
    expect(errorCategoryText(undefined)).toBe(INFO_INSUFFICIENT);
    expect(errorCategoryText('')).toBe(INFO_INSUFFICIENT);
  });
});

describe('calcErrorRecurrence 对历史记录缺失错因字段的兼容', () => {
  it('老训练记录没有 errorCategories 时不抛异常，按无错因计', () => {
    const legacy = [
      { id: 't1', date: '2026-01-01' },
      { id: 't2', date: '2026-01-02' },
    ] as unknown as TrainingRecord[];
    expect(() => calcErrorRecurrence(legacy, 'concept')).not.toThrow();
    expect(calcErrorRecurrence(legacy, 'concept')).toBe(0);
  });

  it('有错因字段时结果不变', () => {
    const records = [
      { id: 't1', date: '2026-01-01', errorCategories: ['concept'] },
      { id: 't2', date: '2026-01-02', errorCategories: ['calc'] },
    ] as unknown as TrainingRecord[];
    expect(calcErrorRecurrence(records, 'concept')).toBe(0.5);
  });
});
