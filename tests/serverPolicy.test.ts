import { describe, expect, it } from 'vitest';
import {
  backupIdsToPrune,
  scopeSnapshotForProfile,
  validateWriteScope,
} from '../functions/api/[[path]]';

type Record_ = Record<string, unknown> & { id: string };
const record = (id: string, overrides: Record<string, unknown> = {}): Record_ => ({ id, ...overrides });

describe('服务端写入边界 · 学生按学段限制', () => {
  it('成年人可写公考记录', () => {
    expect(
      validateWriteScope('trainings', [record('t1', { subject: 'xingce', gradeLevel: 'adult' })], {
        role: 'student',
        gradeLevel: 'adult',
      }),
    ).toBeNull();
  });

  it('小学生不能写公考记录', () => {
    expect(
      validateWriteScope('trainings', [record('t1', { subject: 'xingce', gradeLevel: 'adult' })], {
        role: 'student',
        gradeLevel: 'primary',
      }),
    ).toMatch(/学段/);
  });

  it('小学生只能写本学段 K12 记录', () => {
    expect(
      validateWriteScope('trainings', [record('t1', { subject: 'math', gradeLevel: 'primary' })], {
        role: 'student',
        gradeLevel: 'primary',
      }),
    ).toBeNull();
    expect(
      validateWriteScope('trainings', [record('t1', { subject: 'math', gradeLevel: 'junior' })], {
        role: 'student',
        gradeLevel: 'primary',
      }),
    ).toMatch(/学段/);
  });

  it('公考专属表对 K12 学生关闭，K12 专属表对成人关闭', () => {
    expect(
      validateWriteScope('registrations', [record('r1')], { role: 'student', gradeLevel: 'primary' }),
    ).toMatch(/学段/);
    expect(
      validateWriteScope('collaborationEvents', [record('c1')], { role: 'student', gradeLevel: 'adult' }),
    ).toMatch(/学段/);
  });

  it('教师不受学段限制', () => {
    expect(
      validateWriteScope('trainings', [record('t1', { subject: 'math', gradeLevel: 'junior' })], {
        role: 'teacher',
        gradeLevel: 'adult',
      }),
    ).toBeNull();
  });
});

describe('服务端恢复边界 · 学生只还原本学段', () => {
  const snapshot = {
    version: '2.2.0',
    trainings: [
      record('primary-1', { subject: 'math', gradeLevel: 'primary' }),
      record('junior-1', { subject: 'math', gradeLevel: 'junior' }),
      record('adult-1', { subject: 'xingce', gradeLevel: 'adult' }),
    ],
    registrations: [record('reg-1')],
  };

  it('学生快照只保留当前学段可见记录', () => {
    const scoped = scopeSnapshotForProfile(snapshot, { role: 'student', gradeLevel: 'primary' });
    expect((scoped.trainings as Record_[]).map((r) => r.id)).toEqual(['primary-1']);
    expect(scoped.registrations).toEqual([]);
  });

  it('教师恢复全量快照', () => {
    const scoped = scopeSnapshotForProfile(snapshot, { role: 'teacher', gradeLevel: 'adult' });
    expect((scoped.trainings as Record_[]).map((r) => r.id)).toEqual(['primary-1', 'junior-1', 'adult-1']);
    expect(scoped.registrations).toEqual([{ id: 'reg-1' }]);
  });
});

describe('备份按体积保留', () => {
  const MB = 1024 * 1024;

  it('未超限时不删除', () => {
    expect(backupIdsToPrune([{ id: 'a', size: MB }, { id: 'b', size: MB }])).toEqual([]);
  });

  it('至少保留 3 份，即使每份都很大', () => {
    const backups = ['a', 'b', 'c', 'd'].map((id) => ({ id, size: 10 * MB }));
    expect(backupIdsToPrune(backups)).toEqual(['d']);
  });

  it('累计超过 6MB 后删除更旧的', () => {
    const backups = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, size: 2 * MB }));
    expect(backupIdsToPrune(backups)).toEqual(['d', 'e']);
  });

  it('份数超过 20 后删除更旧的', () => {
    const backups = Array.from({ length: 23 }, (_, index) => ({ id: `b${index}`, size: 1 }));
    expect(backupIdsToPrune(backups)).toEqual(['b20', 'b21', 'b22']);
  });
});
