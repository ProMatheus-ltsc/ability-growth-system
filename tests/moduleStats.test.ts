import { describe, expect, it } from 'vitest';
import { buildModuleStats } from '../src/services/analytics';
import {
  durationOnlyTrainings,
  fullAndModuleTrainings,
  legacyTrainings,
  moduleOnlyTrainings,
} from './fixtures/demoData';

describe('F-04 模块统计（演示数据）', () => {
  it('整卷 + 模块时模块级保留模块明细、排除整卷行（不重复统计整卷）', () => {
    const stats = buildModuleStats(fullAndModuleTrainings);
    // PRD F-03：模块级排除 full 行、保留 module 行
    expect(stats.map((s) => s.module).sort()).toEqual(['判断推理', '资料分析'].sort());
    const material = stats.find((s) => s.module === '资料分析');
    const reasoning = stats.find((s) => s.module === '判断推理');
    expect(material?.totalQuestions).toBe(15);
    expect(material?.totalErrors).toBe(6);
    expect(reasoning?.totalQuestions).toBe(15);
    // 整卷行不得以「整卷」为模块出现在模块表中
    expect(stats.some((s) => s.module === '整卷')).toBe(false);
    // 模块题量之和不等同整卷题量时，学科级统计仍以整卷为准（A1 保证，见 aggregation.test）
    expect(stats.reduce((sum, s) => sum + s.totalQuestions, 0)).toBe(30);
  });

  it('仅模块时按一级模块归一化并累加', () => {
    const stats = buildModuleStats(moduleOnlyTrainings);
    const material = stats.find((s) => s.module === '资料分析');
    expect(material?.totalQuestions).toBe(10);
    expect(material?.totalErrors).toBe(3);
    expect(material?.masteryScore).toBe(70);
  });

  it('老记录（两级模块路径）归一化到一级模块', () => {
    const stats = buildModuleStats(legacyTrainings);
    expect(stats.map((s) => s.module).sort()).toEqual(['判断推理', '资料分析'].sort());
  });

  it('无题量样本时正确率与掌握度为 null（不补 0）', () => {
    const stats = buildModuleStats(durationOnlyTrainings);
    expect(stats).toHaveLength(1);
    expect(stats[0].totalQuestions).toBe(0);
    expect(stats[0].correctRate).toBeNull();
    expect(stats[0].masteryScore).toBeNull();
    expect(stats[0].avgMinutesPerQuestion).toBeNull();
    expect(stats[0].totalDurationMinutes).toBe(30);
    expect(stats[0].sampleCount).toBe(1);
  });
});
