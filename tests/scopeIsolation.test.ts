import { describe, expect, it } from 'vitest';
import {
  domainOfGradeLevel,
  domainOfSubject,
  filterByGradeLevel,
  filterStoreRecordsForGrade,
  isScopeManagedStore,
  normalizeRecordScope,
  recordMatchesGradeLevel,
  resolveRecordGradeLevel,
  stampRecordScope,
  validateRecordScope,
} from '../src/domains/shared/scope';

describe('产品域判定', () => {
  it('adult 属于公考域，其余学段属于 K12 域', () => {
    expect(domainOfGradeLevel('adult')).toBe('public-exam');
    expect(domainOfGradeLevel('primary')).toBe('k12');
    expect(domainOfGradeLevel('junior')).toBe('k12');
    expect(domainOfGradeLevel('senior')).toBe('k12');
  });

  it('公考与 K12 学科集合不相交', () => {
    for (const subject of ['xingce', 'shenlun', 'mianshi']) {
      expect(domainOfSubject(subject)).toBe('public-exam');
    }
    for (const subject of ['math', 'physics', 'chinese', 'english', 'chemistry', 'biology']) {
      expect(domainOfSubject(subject)).toBe('k12');
    }
    expect(domainOfSubject('unknown')).toBeUndefined();
    expect(domainOfSubject(undefined)).toBeUndefined();
  });
});

describe('历史记录学段回落', () => {
  it('公考历史记录没有 gradeLevel 时按学科归到 adult', () => {
    expect(resolveRecordGradeLevel({ subject: 'xingce' })).toBe('adult');
    expect(recordMatchesGradeLevel({ subject: 'xingce' }, 'adult')).toBe(true);
    for (const level of ['primary', 'junior', 'senior'] as const) {
      expect(recordMatchesGradeLevel({ subject: 'xingce' }, level)).toBe(false);
    }
  });

  it('公考学科即使被写了错误学段，也不会进入 K12', () => {
    expect(resolveRecordGradeLevel({ subject: 'shenlun', gradeLevel: 'primary' })).toBe('adult');
    expect(recordMatchesGradeLevel({ subject: 'shenlun', gradeLevel: 'primary' }, 'primary')).toBe(false);
  });

  it('K12 记录缺 gradeLevel 时无法归属，任何具体学段都不显示', () => {
    expect(resolveRecordGradeLevel({ subject: 'math' })).toBeUndefined();
    for (const level of ['primary', 'junior', 'senior', 'adult'] as const) {
      expect(recordMatchesGradeLevel({ subject: 'math' }, level)).toBe(false);
    }
  });

  it('显式学段精确隔离小学 / 初中 / 高中', () => {
    expect(recordMatchesGradeLevel({ subject: 'math', gradeLevel: 'junior' }, 'junior')).toBe(true);
    expect(recordMatchesGradeLevel({ subject: 'math', gradeLevel: 'junior' }, 'primary')).toBe(false);
    expect(recordMatchesGradeLevel({ subject: 'math', gradeLevel: 'junior' }, 'senior')).toBe(false);
  });

  it('同学科跨三个 K12 学段互不可见', () => {
    const records = [
      { subject: 'math', gradeLevel: 'primary' },
      { subject: 'math', gradeLevel: 'junior' },
      { subject: 'math', gradeLevel: 'senior' },
    ];
    expect(filterByGradeLevel(records, 'primary')).toEqual([{ subject: 'math', gradeLevel: 'primary' }]);
    expect(filterByGradeLevel(records, 'junior')).toEqual([{ subject: 'math', gradeLevel: 'junior' }]);
    expect(filterByGradeLevel(records, 'senior')).toEqual([{ subject: 'math', gradeLevel: 'senior' }]);
  });

  it('K12 学科被写成 adult 属于脏数据，不进入任何具体学段', () => {
    expect(resolveRecordGradeLevel({ subject: 'physics', gradeLevel: 'adult' })).toBeUndefined();
    expect(recordMatchesGradeLevel({ subject: 'physics', gradeLevel: 'adult' }, 'adult')).toBe(false);
    for (const level of ['primary', 'junior', 'senior'] as const) {
      expect(recordMatchesGradeLevel({ subject: 'physics', gradeLevel: 'adult' }, level)).toBe(false);
    }
  });

  it('无学科无学段的历史记录按公考兜底，只出现在 adult', () => {
    expect(recordMatchesGradeLevel({}, 'adult')).toBe(true);
    for (const level of ['primary', 'junior', 'senior'] as const) {
      expect(recordMatchesGradeLevel({}, level)).toBe(false);
    }
  });
});

describe('记录集合过滤', () => {
  const records = [
    { id: 'adult', subject: 'xingce' },
    { id: 'adult-explicit', subject: 'shenlun', gradeLevel: 'adult' },
    { id: 'primary', subject: 'math', gradeLevel: 'primary' },
    { id: 'junior-legacy', subject: 'physics' },
    { id: 'unknown' },
  ];

  it('切到 K12 时公考记录全部消失', () => {
    const ids = filterByGradeLevel(records, 'primary').map((r) => r.id);
    expect(ids).not.toContain('adult');
    expect(ids).not.toContain('adult-explicit');
    expect(ids).toContain('primary');
    expect(ids).toContain('primary');
    expect(ids).not.toContain('unknown');
  });

  it('K12 内部按显式学段隔离，缺学段的 K12 记录不猜归属', () => {
    expect(filterByGradeLevel(records, 'junior').map((r) => r.id)).toEqual([]);
    expect(filterByGradeLevel(records, 'primary').map((r) => r.id)).toEqual(['primary']);
  });

  it('公考域只保留公考与无法判断的记录', () => {
    expect(filterByGradeLevel(records, 'adult').map((r) => r.id)).toEqual([
      'adult',
      'adult-explicit',
      'unknown',
    ]);
  });

  it('公考专属表在 K12 学段直接返回空，K12 专属表反之', () => {
    expect(filterStoreRecordsForGrade('registrations', records, 'primary')).toEqual([]);
    expect(filterStoreRecordsForGrade('registrations', records, 'adult')).toHaveLength(records.length);
    expect(filterStoreRecordsForGrade('collaborationEvents', records, 'adult')).toEqual([]);
    expect(filterStoreRecordsForGrade('collaborationEvents', records, 'junior')).toHaveLength(records.length);
  });

  it('无学段语义的表不受影响', () => {
    expect(filterStoreRecordsForGrade('students', records, 'primary')).toEqual(records);
    expect(isScopeManagedStore('students')).toBe(false);
    expect(isScopeManagedStore('trainings')).toBe(true);
  });
});

describe('写入学段印章', () => {
  it('缺 gradeLevel 时按当前学段补齐', () => {
    expect(stampRecordScope({ subject: 'math' }, 'junior')).toEqual({ subject: 'math', gradeLevel: 'junior' });
    expect(stampRecordScope({ subject: 'xingce' }, 'adult')).toEqual({ subject: 'xingce', gradeLevel: 'adult' });
  });

  it('已有学段不被覆盖', () => {
    const record = { subject: 'math', gradeLevel: 'primary' as const };
    expect(stampRecordScope(record, 'junior')).toBe(record);
  });

  it('学科与当前学段冲突时不打错学段', () => {
    expect(stampRecordScope({ subject: 'xingce' }, 'primary')).toEqual({ subject: 'xingce' });
    expect(stampRecordScope({ subject: 'math' }, 'adult')).toEqual({ subject: 'math' });
  });

  it('历史公考记录在服务端归一为 adult', () => {
    expect(normalizeRecordScope({ subject: 'mianshi' })).toEqual({ subject: 'mianshi', gradeLevel: 'adult' });
    expect(normalizeRecordScope({ subject: 'math' })).toEqual({ subject: 'math' });
    expect(normalizeRecordScope({ subject: 'math', gradeLevel: 'senior' })).toEqual({
      subject: 'math',
      gradeLevel: 'senior',
    });
  });
});

describe('写入边界校验', () => {
  it('公考学科不能写入 K12 学段', () => {
    const result = validateRecordScope({ subject: 'xingce', gradeLevel: 'primary' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('小学');
    expect(result.message).toContain('行测');
  });

  it('K12 学科不能写入公考学段', () => {
    const result = validateRecordScope({ subject: 'math', gradeLevel: 'adult' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('成年人');
  });

  it('同学段学科放行，公考缺学段交给归一逻辑处理', () => {
    expect(validateRecordScope({ subject: 'xingce', gradeLevel: 'adult' }).ok).toBe(true);
    expect(validateRecordScope({ subject: 'math', gradeLevel: 'senior' }).ok).toBe(true);
    expect(validateRecordScope({ subject: 'xingce' }).ok).toBe(true);
  });

  it('K12 学科缺学段直接拒绝，避免跨学段串数据', () => {
    for (const subject of ['math', 'physics', 'chinese', 'english', 'chemistry', 'biology']) {
      const result = validateRecordScope({ subject });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('必须指定学段');
    }
  });

  it('非法学段与无学科记录的处理', () => {
    const invalid = validateRecordScope({ subject: 'math', gradeLevel: 'university' });
    expect(invalid.ok).toBe(false);
    expect(invalid.message).toContain('未知学段');
    expect(validateRecordScope({}).ok).toBe(true);
  });
});
