import { describe, expect, it } from 'vitest';
import {
  TRAINING_EXCLUDED_SUBJECTS,
  guardTrainingRecords,
  isTrainingExcludedSubject,
  selectTrainingEntrySubjects,
} from '../src/domain/storeGuards';

describe('训练记录学科口径：申论 / 面试不得写入 trainings', () => {
  it('申论与面试被判定为禁止学科，其它学科放行', () => {
    for (const subject of TRAINING_EXCLUDED_SUBJECTS) {
      expect(isTrainingExcludedSubject(subject)).toBe(true);
    }
    for (const subject of ['xingce', 'math', 'physics', 'chinese', 'english']) {
      expect(isTrainingExcludedSubject(subject)).toBe(false);
    }
  });

  it('缺字段 / 非字符串不误判为禁止学科', () => {
    for (const value of [undefined, null, '', 0, {}, []]) {
      expect(isTrainingExcludedSubject(value)).toBe(false);
    }
  });

  it('客观题记录整体放行', () => {
    const result = guardTrainingRecords([
      { id: 't1', subject: 'xingce' },
      { id: 't2', subject: 'math' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.rejectedIndexes).toEqual([]);
  });

  it('单条申论训练记录被拒，并指出下标', () => {
    const result = guardTrainingRecords([{ id: 't1', subject: 'shenlun' }]);
    expect(result.ok).toBe(false);
    expect(result.rejectedIndexes).toEqual([0]);
    expect(result.message).toContain('申论');
    expect(result.message).toContain('面试');
  });

  it('批量导入中混入的申论 / 面试行只标出问题行，不误伤其它行', () => {
    const result = guardTrainingRecords([
      { id: 't1', subject: 'xingce' },
      { id: 't2', subject: 'mianshi' },
      { id: 't3', subject: 'math' },
      { id: 't4', subject: 'shenlun' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.rejectedIndexes).toEqual([1, 3]);
  });

  it('空集合视为通过（不阻断正常请求）', () => {
    expect(guardTrainingRecords([]).ok).toBe(true);
  });
});

describe('训练记录可录入学选择器', () => {
  it('剔除申论 / 面试，保留其余学科原有顺序', () => {
    expect(selectTrainingEntrySubjects(['xingce', 'shenlun', 'mianshi'])).toEqual(['xingce']);
    expect(selectTrainingEntrySubjects(['math', 'shenlun', 'physics', 'mianshi'])).toEqual(['math', 'physics']);
  });

  it('只有主观题学科时返回空数组（UI 据此显示引导入口）', () => {
    expect(selectTrainingEntrySubjects(['shenlun'])).toEqual([]);
    expect(selectTrainingEntrySubjects(['shenlun', 'mianshi'])).toEqual([]);
  });

  it('不修改入参', () => {
    const source = ['xingce', 'shenlun'];
    const picked = selectTrainingEntrySubjects(source);
    expect(source).toEqual(['xingce', 'shenlun']);
    expect(picked).not.toBe(source);
  });
});
