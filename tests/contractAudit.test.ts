import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectTrainingRecord } from '../src/domain/paperStructure';

/**
 * 数据契约审计（对真实导出运行，不在单测里伪造分布）
 *
 * 可复跑命令：
 *   npx wrangler d1 execute ability_growth --local --json \
 *     --command "SELECT data FROM trainings" > tmp/trainings.json
 *   $env:CONTRACT_AUDIT_FILE="tmp/trainings.json"; npm run test -- tests/contractAudit.test.ts
 *
 * 可选：$env:CONTRACT_AUDIT_STRICT="1" 时，出现契约违规即让测试失败（默认只统计不失败，
 * 因为历史记录允许新字段缺省，数据侧负责补齐）。
 *
 * 支持三种输入形态：训练记录数组、`[{data:"{json}"}]`、wrangler 的 `[{results:[{data}]}]`。
 */
const auditFile = process.env.CONTRACT_AUDIT_FILE;

function loadRecords(path: string): Record<string, unknown>[] {
  const raw = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as unknown;
  const unwrap = (value: unknown): Record<string, unknown>[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (typeof item === 'string') return [JSON.parse(item) as Record<string, unknown>];
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.data === 'string') return [JSON.parse(obj.data) as Record<string, unknown>];
        if (Array.isArray(obj.results)) return unwrap(obj.results);
        if ('id' in obj) return [obj];
      }
      return [];
    });
  };
  return unwrap(raw);
}

function distribution(values: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) {
    const key = v === undefined || v === null || v === '' ? '(缺失)' : String(v);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

describe.skipIf(!auditFile)('数据契约审计（真实导出）', () => {
  it('输出字段分布与契约违规清单', () => {
    const records = loadRecords(auditFile as string);
    const withIssue = records
      .map((r) => ({ id: r.id, issues: inspectTrainingRecord(r) }))
      .filter((item) => item.issues.length > 0);

    const summary = {
      total: records.length,
      卷型: distribution(records.map((r) => r.paperType)),
      年份: distribution(records.map((r) => r.paperYear)),
      粒度: distribution(records.map((r) => r.scope)),
      题型: distribution(records.map((r) => r.questionType)),
      有关联examId: records.filter((r) => typeof r.examId === 'string' && r.examId !== '').length,
      有满分: records.filter((r) => typeof r.fullMark === 'number').length,
      有得分: records.filter((r) => typeof r.score === 'number').length,
      有标准用时: records.filter((r) => typeof r.standardMinutes === 'number').length,
      结构化推断标记: records.filter((r) => typeof r.standardMinutesInferred === 'boolean').length,
      note含推断: records.filter((r) => typeof r.note === 'string' && r.note.includes('推断')).length,
      违规记录数: withIssue.length,
    };
    console.log(`[contract-audit] ${JSON.stringify(summary, null, 2)}`);
    if (withIssue.length > 0) {
      console.log(`[contract-audit] 违规明细: ${JSON.stringify(withIssue.slice(0, 20), null, 2)}`);
    }

    if (process.env.CONTRACT_AUDIT_STRICT === '1') {
      expect(withIssue).toEqual([]);
    } else {
      expect(records.length).toBeGreaterThan(0);
    }
  });
});
