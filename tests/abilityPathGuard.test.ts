/**
 * 能力路径白名单校验与历史数据兼容（2026-11-11）
 *
 * 回归背景：`abilityPath` 曾是**无校验裸字符串**，脚本可以写入任意层数/任意命名，
 * 而页面派生用两级且不归一化 → 同一考点裂成多条缺口（`言语理解与表达` vs `言语理解`），
 * 问题中心与实际不符。这里钉住三件事：
 *   1. 行测第 3/4 段必须在标签库白名单内，非法考点/模块/超深必须被拦下；
 *   2. 行测允许**四级**，申论与 K12 只允许**三级**；
 *   3. 历史数据不改：旧模块名 `言语理解与表达` 在**读取时**归一化成 `言语理解` 显示，
 *      新旧写法显示一致（但原始字符串不迁移）。
 */
import { describe, expect, it } from 'vitest';
import { validateAbilityPath } from '../src/domain/abilityPathGuard';
import { parseAbilityPath } from '../src/domain/missingInfo';
import { normalizeModule } from '../src/domain/moduleNormalize';

describe('能力路径白名单校验', () => {
  it('行测四级：合法考点放行', () => {
    for (const p of [
      'xingce/言语理解/逻辑填空/关联词依赖',
      'xingce/言语理解/逻辑填空/提示句定位',
      'xingce/言语理解/逻辑填空/语素辨析',
    ]) {
      expect(validateAbilityPath(p, 'xingce').ok, p).toBe(true);
    }
  });

  it('行测：非法考点被拦下', () => {
    const r = validateAbilityPath('xingce/言语理解/逻辑填空/胡编乱造考点', 'xingce');
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('胡编乱造考点');
  });

  it('行测：非法模块被拦下', () => {
    const r = validateAbilityPath('xingce/玄学模块/测试', 'xingce');
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('玄学模块');
  });

  it('行测：超过四级被拦下', () => {
    const r = validateAbilityPath('xingce/资料分析/增长率/基本增长率/更细', 'xingce');
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('4 段');
  });

  it('申论与 K12 只允许三级，四级被拦下', () => {
    expect(validateAbilityPath('shenlun/归纳概括/全面性', 'shenlun').ok).toBe(true);
    expect(validateAbilityPath('shenlun/归纳概括/全面性/更细', 'shenlun').ok).toBe(false);
    expect(validateAbilityPath('math/函数/二次函数', 'math').ok).toBe(true);
    expect(validateAbilityPath('math/函析/二次函数/顶点式', 'math').ok).toBe(false);
  });

  it('省略学科前缀会自动补齐', () => {
    const r = validateAbilityPath('资料分析/增长率/基本增长率', 'xingce');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('xingce/资料分析/增长率/基本增长率');
  });

  it('宽容模式（历史数据）：只告警不判失败', () => {
    const r = validateAbilityPath('xingce/玄学模块/测试', 'xingce', 'adult', true);
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('历史数据兼容：旧模块名读取时归一化', () => {
  it('新旧写法解析结果一致（原始字符串不迁移）', () => {
    const legacy = parseAbilityPath('xingce/言语理解与表达/逻辑填空/关联词依赖');
    const fresh = parseAbilityPath('xingce/言语理解/逻辑填空/关联词依赖');
    expect(legacy).toEqual(fresh);
    expect(legacy.module).toBe('言语理解');
    expect(legacy.point).toBe('关联词依赖');
  });

  it('四级路径不会被误当成「模块=第三段」', () => {
    // 改动前用 parts[len-2] 取模块，四级会渲染成「逻辑填空 · 关联词依赖」
    const r = parseAbilityPath('xingce/言语理解/逻辑填空/提示句定位');
    expect(r.module).toBe('言语理解');
    expect(r.point).toBe('提示句定位');
  });

  it('单段路径保持历史语义（模块缺失，原值作能力点）', () => {
    expect(parseAbilityPath('判断推理')).toEqual({
      module: null,
      point: '判断推理',
      missing: true,
    });
  });
});

describe('模块归一化不会吞掉更短的合法模块名', () => {
  it('K12「函数」保持原样，不被「函数分析」吞掉', () => {
    expect(normalizeModule('函数', 'math', 'senior')).toBe('函数');
    expect(normalizeModule('函数分析', 'math', 'senior')).toBe('函数分析');
  });

  it('行测旧名收敛到规范名', () => {
    expect(normalizeModule('言语理解与表达', 'xingce', 'adult')).toBe('言语理解');
    expect(normalizeModule('言语理解', 'xingce', 'adult')).toBe('言语理解');
  });
});
