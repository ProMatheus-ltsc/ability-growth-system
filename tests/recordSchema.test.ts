import { describe, expect, it } from 'vitest';
import {
  MAX_RECORD_BYTES,
  MAX_TEXT_LENGTH,
  describeIssues,
  validateRecordBatch,
  validateRecordId,
  validateRecordPayload,
} from '../src/services/recordSchema';
import { normalizeStoreRecord } from '../src/services/recordNormalize';

const training = (patch: Record<string, unknown> = {}) => ({
  id: 't-2024-03-11',
  date: '2024-03-11',
  gradeLevel: 'adult',
  subject: 'xingce',
  module: '资料分析',
  trainingType: 'module',
  totalQuestions: 20,
  correctCount: 16,
  errorCount: 4,
  errorCategories: ['calculation'],
  createdAt: '2024-03-11T08:00:00.000Z',
  updatedAt: '2024-03-11T08:00:00.000Z',
  ...patch,
});

describe('validateRecordId：只挡会导致路由/主键出错的形状', () => {
  it('正常 id 通过（uuid、日期后缀、中文）', () => {
    expect(validateRecordId('0b2b63ae-71c2-4862-ac3d-61960a8074c0')).toBeNull();
    expect(validateRecordId('t-2024-03-11')).toBeNull();
    expect(validateRecordId('训练-2024')).toBeNull();
  });

  it.each([
    ['空串', ''],
    ['非字符串', 123],
    ['超长', 'a'.repeat(129)],
    ['墓碑保留值', '*'],
    ['含斜杠（会改变路由语义）', 'a/b'],
    ['含百分号', 'a%20b'],
    ['含问号', 'a?b'],
    ['含空白', 'a b'],
  ])('%s 被拒', (_label, id) => {
    expect(validateRecordId(id)).toBeTruthy();
  });
});

describe('validateRecordPayload：拒非法，不拒残缺', () => {
  it('非对象直接拒', () => {
    for (const bad of [null, [], 'x', 42]) {
      expect(validateRecordPayload('trainings', bad).ok).toBe(false);
    }
  });

  it('拒绝原型污染键', () => {
    const result = validateRecordPayload('trainings', JSON.parse('{"id":"t1","__proto__":{"polluted":true}}'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toContain('__proto__');
  });

  it('新建时空壳记录被拒（这正是脏数据的来源）', () => {
    const result = validateRecordPayload('trainings', { id: 't1' }, { requireCore: true });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['date', 'subject']));
  });

  it('更新老记录放行：库里本来就没有的核心字段，请求里没有也不算错', () => {
    const existing = { id: 't1', gradeLevel: 'adult' };
    expect(validateRecordPayload('trainings', { id: 't1' }, { requireCore: false, existing }).ok).toBe(true);
  });

  it('更新不许把已有核心字段静默丢掉（PUT 是整条覆盖）', () => {
    const existing = { id: 't1', date: '2024-03-11', subject: 'xingce' };
    const result = validateRecordPayload('trainings', { id: 't1' }, { requireCore: false, existing });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toEqual(['date', 'subject']);
    expect(describeIssues(result.issues)).toContain('更新时不能丢掉');
  });

  it('更新时清空文本字段（非核心）仍然允许，这是正常编辑', () => {
    const existing = { id: 't1', note: '旧备注' };
    expect(validateRecordPayload('trainings', { id: 't1' }, { requireCore: false, existing }).ok).toBe(true);
  });

  it('老记录缺后用字段（errorCategories）不拒，交给写入边界补齐', () => {
    const legacy = { ...training(), errorCategories: undefined };
    const result = validateRecordPayload('trainings', legacy);
    expect(result.ok).toBe(true);
    const normalized = normalizeStoreRecord('trainings', result.record) as Record<string, unknown>;
    expect(normalized.errorCategories).toEqual([]);
  });

  it('字段类型错就拒：errorCategories 给成字符串', () => {
    const result = validateRecordPayload('trainings', training({ errorCategories: 'calculation' }));
    expect(result.ok).toBe(false);
    expect(describeIssues(result.issues)).toContain('errorCategories');
  });

  it('字符串数组里混进非字符串，指到具体下标', () => {
    const result = validateRecordPayload('trainings', training({ errorCategories: ['ok', 2] }));
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toContain('errorCategories[1]');
  });

  it('stagePlans.focusModules 非数组被拒（该字段缺失/类型错会拖垮全站时间轴）', () => {
    const result = validateRecordPayload(
      'stagePlans',
      { id: 's1', stage: 'foundation', startDate: '2024-03-01', endDate: '2024-04-01', focusModules: '资料分析' },
      { requireCore: true },
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0].field).toBe('focusModules');
  });

  it('嵌套对象字段类型错被拒（careerReports.routes）', () => {
    const result = validateRecordPayload('careerReports', {
      id: 'r1',
      assessmentId: 'a1',
      generatedAt: '2024-03-11T00:00:00.000Z',
      routes: [1, 2],
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0].field).toBe('routes');
  });

  it('题量给成字符串数字时收敛为数字，而不是拒绝', () => {
    const result = validateRecordPayload('trainings', training({ totalQuestions: '20', errorCount: '4' }));
    expect(result.ok).toBe(true);
    expect(result.record.totalQuestions).toBe(20);
    expect(result.record.errorCount).toBe(4);
  });

  it('布尔字符串同样收敛', () => {
    const result = validateRecordPayload('trainings', training({ isUnfamiliar: 'true' }));
    expect(result.ok).toBe(true);
    expect(result.record.isUnfamiliar).toBe(true);
  });

  it('负数与非整数被拒', () => {
    expect(validateRecordPayload('trainings', training({ totalQuestions: -1 })).ok).toBe(false);
    expect(validateRecordPayload('trainings', training({ totalQuestions: 3.5 })).ok).toBe(false);
  });

  it('枚举只在新建时强制，存量历史值不拦', () => {
    const legacyStatus = { id: 'g1', subject: 'xingce', abilityPath: 'xingce/资料分析', status: 'legacy-value' };
    expect(validateRecordPayload('gaps', legacyStatus, { requireCore: false }).ok).toBe(true);
    expect(validateRecordPayload('gaps', legacyStatus, { requireCore: true }).ok).toBe(false);
  });

  it('未知字段透传，不做白名单（表是 schemaless 的）', () => {
    const result = validateRecordPayload('trainings', training({ experimentalField: { a: 1 } }));
    expect(result.ok).toBe(true);
    expect(result.record.experimentalField).toEqual({ a: 1 });
  });

  it('超长文本与超体积记录被拒', () => {
    expect(validateRecordPayload('trainings', training({ note: 'x'.repeat(MAX_TEXT_LENGTH + 1) })).ok).toBe(false);
    const huge = validateRecordPayload('trainings', training({ note: 'x'.repeat(MAX_RECORD_BYTES) }));
    expect(huge.ok).toBe(false);
    expect(describeIssues(huge.issues)).toContain('体积');
  });

  it('正常记录原样通过（不改值、不加字段）', () => {
    const record = training();
    const result = validateRecordPayload('trainings', record, { requireCore: true });
    expect(result.ok).toBe(true);
    expect(result.record).toEqual(record);
  });
});

describe('validateRecordBatch：整体失败并定位到条', () => {
  it('新记录缺核心字段报错，同批已存在的缺失记录放过', () => {
    const result = validateRecordBatch(
      'trainings',
      [{ id: 't1' }, training({ id: 't2' })],
      { existingOf: (id) => (id === 't2' ? { id: 't2', date: '2024-03-11', subject: 'xingce' } : undefined) },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('第 1 条（t1）');
    expect(result.message).not.toContain('第 2 条');
  });

  it('全部合法时返回收敛后的记录', () => {
    const result = validateRecordBatch('trainings', [training({ totalQuestions: '20' })], {
      existingOf: () => undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.records[0].totalQuestions).toBe(20);
  });

  it('多条不合法时折叠错误数量', () => {
    const list = Array.from({ length: 7 }, (_, index) => ({ id: `t${index}` }));
    const result = validateRecordBatch('trainings', list, { existingOf: () => undefined });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('另有 2 条不合法');
  });
});
