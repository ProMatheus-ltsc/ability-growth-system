/**
 * `/api/stats` 学段计数的 SQL 与 JS 口径一致性测试。
 *
 * 背景：统计接口原来对学生是「24 张表各整表拉回 JS 再 filter 计数」，
 * 一次统计能搬几百 KB 到几 MB，而它还挂在界面定时刷新上。
 * 现在学段判定下推成 SQL（src/domains/shared/scope.ts 的 gradeLevelMatchSql），
 * 但**同一套规则有了两份实现**——这份测试就是防止两份实现悄悄跑偏：
 * 同一批记录，SQL 数出来的条数必须与 `filterStoreRecordsForGrade` 逐例相同。
 */
import { describe, expect, it } from 'vitest';
import { buildCountStoresSql } from '../functions/api/[[path]]';
import { filterStoreRecordsForGrade } from '../src/domains/shared/scope';
import { STORE_NAMES, type StoreName } from '../src/services/snapshot';
import type { GradeLevel } from '../src/domain/types';
import { createSqliteD1 } from './helpers/sqliteD1';

const WORKSPACE = 'alice';
const GRADES: GradeLevel[] = ['primary', 'junior', 'senior', 'adult'];

const SCHEMA = STORE_NAMES.map(
  (store) => `CREATE TABLE ${store} (
    workspace TEXT NOT NULL,
    id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (workspace, id)
  );`,
).join('\n');

interface Fixture {
  id: string;
  /** 写进 data 的完整记录；`null` 表示写入坏 JSON（读侧会被 safeParseRecord 降级成只有 id 的空壳） */
  data: Record<string, unknown> | null;
}

const FIXTURES: Fixture[] = [
  { id: 'f01', data: { id: 'f01', subject: 'xingce' } }, // 公考学科，无学段 → adult
  { id: 'f02', data: { id: 'f02', subject: 'xingce', gradeLevel: 'primary' } }, // 学科域优先 → adult
  { id: 'f03', data: { id: 'f03', subject: 'math', gradeLevel: 'primary' } },
  { id: 'f04', data: { id: 'f04', subject: 'math', gradeLevel: 'junior' } },
  { id: 'f05', data: { id: 'f05', subject: 'math', gradeLevel: 'senior' } },
  { id: 'f06', data: { id: 'f06', subject: 'physics', gradeLevel: 'adult' } }, // K12 学科配公考学段 → 谁都不匹配
  { id: 'f07', data: { id: 'f07', subject: 'math' } }, // K12 学科缺学段 → 不猜
  { id: 'f08', data: { id: 'f08' } }, // 无学科无学段 → adult 兜底
  { id: 'f09', data: { id: 'f09', gradeLevel: 'junior' } }, // 只有显式学段
  { id: 'f10', data: { id: 'f10', subject: 'shenlun', gradeLevel: 'senior' } }, // 公考学科盖过显式学段
  { id: 'f11', data: { id: 'f11', subject: 'unknown-subject' } }, // 未知学科 → 按显式学段 / adult 兜底
  { id: 'f12', data: null }, // 坏 JSON
];

/** 读侧对坏行的降级形状（见 functions/api 的 safeParseRecord） */
function asReadShape(fixture: Fixture): Record<string, unknown> {
  return fixture.data ?? { id: fixture.id };
}

function seed(store: StoreName): ReturnType<typeof createSqliteD1> {
  const db = createSqliteD1(SCHEMA);
  for (const fixture of FIXTURES) {
    db.raw
      .prepare(`INSERT INTO ${store} (workspace, id, updated_at, data) VALUES (?, ?, ?, ?)`)
      .run(WORKSPACE, fixture.id, '2026-11-01T00:00:00.000Z', fixture.data === null ? '{坏 JSON' : JSON.stringify(fixture.data));
  }
  return db;
}

async function countInSql(db: ReturnType<typeof createSqliteD1>['db'], gradeLevel: GradeLevel): Promise<Record<string, number>> {
  const { sql, params } = buildCountStoresSql(WORKSPACE, gradeLevel);
  const row = await db
    .prepare(sql)
    .bind(...params)
    .first<Record<string, number>>();
  return Object.fromEntries(STORE_NAMES.map((store) => [store, Number(row?.[store] ?? 0)]));
}

describe('学段计数 · SQL 与 JS 口径必须一致', () => {
  // 四类表各测一遍：按学科+学段、公考专属、K12 专属、纯学段字段、以及不受学段约束的表
  const stores: StoreName[] = [
    'trainings', // SUBJECT_SCOPED
    'stagePlans', // SUBJECT_SCOPED（历史记录可能没有 subject）
    'registrations', // PUBLIC_EXAM_ONLY
    'collaborationEvents', // K12_ONLY
    'students', // GRADE_SCOPED
    'careerReports', // 不受学段约束 → 全量
  ];

  for (const store of stores) {
    for (const grade of GRADES) {
      it(`${store} · ${grade}`, async () => {
        const { db } = seed(store);
        const counts = await countInSql(db, grade);
        const expected = filterStoreRecordsForGrade(
          store,
          FIXTURES.map(asReadShape),
          grade,
        ).length;
        expect(counts[store]).toBe(expected);
      });
    }
  }

  it('公考专属表在 K12 学段直接给 0，不发无谓的子查询', () => {
    const { sql, params } = buildCountStoresSql(WORKSPACE, 'primary');
    expect(sql).toContain('0 AS registrations');
    expect(sql).not.toContain('FROM registrations WHERE');
    // D1 单语句绑定参数上限 100：学段值必须内联，参数只留 workspace
    expect(params.length).toBeLessThanOrEqual(STORE_NAMES.length);
    expect(params.every((value) => value === WORKSPACE)).toBe(true);
  });

  it('学段值内联后仍不能出现语法错误（每个分支都能跑）', async () => {
    const { db } = seed('trainings');
    const counts = await countInSql(db, 'adult');
    expect(counts.trainings).toBe(
      filterStoreRecordsForGrade('trainings', FIXTURES.map(asReadShape), 'adult').length,
    );
  });

  it('不传学段时退化成纯 COUNT(*)，且不引入 json 判定', () => {
    const { sql, params } = buildCountStoresSql(WORKSPACE);
    expect(sql).not.toContain('json_extract');
    expect(params.every((value) => value === WORKSPACE)).toBe(true);
  });
});
