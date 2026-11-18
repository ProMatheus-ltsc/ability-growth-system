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
  trainingType: 'topic',
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

  it('枚举：有值就必须合法（更新也一样），缺失仍然放行', () => {
    const badStatus = { id: 'g1', subject: 'xingce', abilityPath: 'xingce/资料分析', status: 'legacy-value' };
    expect(validateRecordPayload('gaps', badStatus, { requireCore: false }).ok).toBe(false);
    expect(validateRecordPayload('gaps', { id: 'g1' }, { requireCore: false }).ok).toBe(true);
  });

  it('枚举：存量里同一个非法值被原样带回来时不拦（避免锁死老记录）', () => {
    const existing = { id: 'g1', status: 'legacy-value' };
    const payload = { id: 'g1', note: '只改了备注' };
    expect(validateRecordPayload('gaps', payload, { existing }).ok).toBe(true);
    // 换成另一个非法值就要拦
    expect(validateRecordPayload('gaps', { ...payload, status: 'another-bad' }, { existing }).ok).toBe(false);
  });

  it('trainings.kind 只接受已知结构角色（未知 kind 会被当成独立记录重复计题量）', () => {
    expect(validateRecordPayload('trainings', training({ kind: 'module' })).ok).toBe(true);
    const bad = validateRecordPayload('trainings', training({ kind: 'record' }));
    expect(bad.ok).toBe(false);
    expect(bad.issues[0].field).toBe('kind');
  });

  it('trainingType 历史别名先归一化再校验（full_mock → exam）', () => {
    const legacy = validateRecordPayload('trainings', training({ trainingType: 'full_mock' }));
    expect(legacy.ok).toBe(true);
    expect(legacy.record.trainingType).toBe('exam');
    expect(validateRecordPayload('trainings', training({ trainingType: 'wrong_review' })).record.trainingType).toBe('review');
    expect(validateRecordPayload('trainings', training({ trainingType: 'nonsense' })).ok).toBe(false);
  });

  it('作答树关联字段类型错被拒（examRef / parentId / attemptId）', () => {
    for (const field of ['examRef', 'parentId', 'attemptId', 'questionType', 'paperType']) {
      expect(validateRecordPayload('trainings', training({ [field]: 123 })).ok).toBe(false);
    }
  });

  it('depth 必须是整数（作答树层数）', () => {
    expect(validateRecordPayload('trainings', training({ depth: 2 })).ok).toBe(true);
    expect(validateRecordPayload('trainings', training({ depth: 1.5 })).ok).toBe(false);
  });

  it('跨字段：错题数不能大于总题量', () => {
    const result = validateRecordPayload('trainings', training({ totalQuestions: 10, errorCount: 12, correctCount: 0 }));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toContain('errorCount');
  });

  it('跨字段：正确数 + 错题数 必须等于总题量', () => {
    const result = validateRecordPayload('trainings', training({ totalQuestions: 20, errorCount: 4, correctCount: 10 }));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toContain('correctCount');
  });

  it('跨字段：得分不能大于满分', () => {
    expect(validateRecordPayload('trainings', training({ score: 90, fullMark: 100 })).ok).toBe(true);
    expect(validateRecordPayload('trainings', training({ score: 120, fullMark: 100 })).ok).toBe(false);
  });

  it('跨字段：abilities 的置信度必须在 0~1、样本正确数不超过总数', () => {
    const ability = (patch: Record<string, unknown> = {}) => ({
      id: 'ab1',
      subject: 'xingce',
      abilityPath: 'xingce/资料分析/增长率',
      confidence: 0.6,
      sampleTotal: 10,
      sampleCorrect: 7,
      ...patch,
    });
    expect(validateRecordPayload('abilities', ability()).ok).toBe(true);
    expect(validateRecordPayload('abilities', ability({ confidence: 1.4 })).ok).toBe(false);
    expect(validateRecordPayload('abilities', ability({ sampleCorrect: 11 })).ok).toBe(false);
  });

  it('跨字段：存量已违例的记录不因「改别的字段」被锁死', () => {
    const existing = { id: 't1', totalQuestions: 10, errorCount: 12 };
    const unchanged = { id: 't1', totalQuestions: 10, errorCount: 12, note: '改备注' };
    expect(validateRecordPayload('trainings', unchanged, { existing }).ok).toBe(true);

    // 但换个新的违例值就要拦（说明是这次改坏的）
    const brokeIt = { id: 't1', totalQuestions: 10, errorCount: 15, note: '改备注' };
    expect(validateRecordPayload('trainings', brokeIt, { existing }).ok).toBe(false);
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

  it('快照/备份导入只看形状：旧枚举值、旧口径矛盾都放行（否则老备份永远恢复不了）', () => {
    const legacy = {
      id: 't9',
      date: '2024-03-11',
      subject: 'xingce',
      kind: 'record',
      trainingType: 'legacy-type',
      totalQuestions: 10,
      errorCount: 12,
      correctCount: 0,
    };
    // 正常写入（新建/更新）要拦
    expect(validateRecordPayload('trainings', legacy).ok).toBe(false);
    // 导入放行
    expect(validateRecordBatch('trainings', [legacy], { assumeExisting: true }).ok).toBe(true);
    // 但形状错（类型不对）照样拦
    expect(
      validateRecordBatch('trainings', [{ ...legacy, errorCategories: 'x' }], { assumeExisting: true }).ok,
    ).toBe(false);
  });

  it('多条不合法时折叠错误数量', () => {
    const list = Array.from({ length: 7 }, (_, index) => ({ id: `t${index}` }));
    const result = validateRecordBatch('trainings', list, { existingOf: () => undefined });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('另有 2 条不合法');
  });
});
