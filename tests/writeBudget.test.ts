/**
 * 批量写入的切块预算
 *
 * D1 官方限制：单条 SQL 100,000 B、单行 2,000,000 B。原先只按「每 50 条一批」切，
 * 一批里塞进几十条大记录（套卷分题、PDCA 大复盘）时体积没有上限；
 * 现在按累计体积预算切组，普通记录仍然走 50 条一批。
 */
import { describe, expect, it } from 'vitest';
import { groupStatementsByBudget, upsertStatements } from '../functions/api/[[path]]';
import { CORE_SCHEMA, createSqliteD1 } from './helpers/sqliteD1';

const small = (index: number) => ({
  id: `t${index}`,
  date: '2024-03-11',
  subject: 'xingce',
  totalQuestions: 20,
  errorCount: 4,
});

describe('批量写入 · 体积预算', () => {
  it('普通小记录：仍然 50 条一批', () => {
    const d1 = createSqliteD1(CORE_SCHEMA);
    const records = Array.from({ length: 120 }, (_, index) => small(index));
    const groups = groupStatementsByBudget(upsertStatements(d1.db, 'trainings', 'ws-a', records, false));
    expect(groups.map((group) => group.length)).toEqual([50, 50, 20]);
  });

  it('单条记录很大时按体积切组，不再硬凑 50 条', () => {
    const d1 = createSqliteD1(CORE_SCHEMA);
    const records = Array.from({ length: 4 }, (_, index) => ({
      ...small(index),
      note: 'x'.repeat(60_000),
    }));
    const groups = groupStatementsByBudget(upsertStatements(d1.db, 'trainings', 'ws-a', records, false));
    expect(groups).toHaveLength(4);
    expect(groups.every((group) => group.length === 1)).toBe(true);
  });

  it('空输入不产生空批次', () => {
    expect(groupStatementsByBudget([])).toEqual([]);
  });
});
