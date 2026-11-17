#!/usr/bin/env node
/**
 * 脏数据体检：跑 scripts/audit-dirty-data.sql，把 40 个结果集汇总成人能读的结论。
 *
 *   npm run db:audit            # 线上库（需要 CLOUDFLARE_API_TOKEN 或 wrangler login）
 *   npm run db:audit -- --local # 本地 dev 库
 *
 * 只读。SQL 侧按「一张表一条语句」组织，因为 D1 的 compound SELECT 项数上限极低
 * （UNION ALL 超过 8 项就报 too many terms），见 SQL 文件头部说明。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sqlFile = resolve(here, 'audit-dirty-data.sql');
const local = process.argv.includes('--local');

/** wrangler 会在 JSON 前打代理/版本警告，截到第一个 JSON 起始位置 */
function parseWranglerJson(stdout) {
  const start = stdout.search(/\n[[{]/);
  const text = start >= 0 ? stdout.slice(start + 1) : stdout;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['wrangler', 'd1', 'execute', 'ability_growth', local ? '--local' : '--remote', '--json', '--file', sqlFile],
  { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 32 * 1024 * 1024 },
);

const stdout = result.stdout ?? '';
if (result.status !== 0 || !stdout.trim()) {
  console.error('✗ wrangler 执行失败：');
  console.error((result.stderr || stdout).trim().slice(0, 2000));
  if (/CLOUDFLARE_API_TOKEN/.test(stdout + result.stderr)) {
    console.error('\n线上库需要凭据：export CLOUDFLARE_API_TOKEN=... 或先 npx wrangler login');
  }
  process.exit(1);
}

const payload = parseWranglerJson(stdout);
if (!Array.isArray(payload)) {
  console.error('✗ 无法解析 wrangler 输出：');
  console.error(stdout.slice(0, 2000));
  process.exit(1);
}

const failed = payload.find((item) => item && item.success === false);
if (failed) {
  console.error('✗ SQL 执行失败：', JSON.stringify(failed.error ?? failed).slice(0, 1000));
  process.exit(1);
}

// 前若干条是总览（有字段规则的表带脏数，其余表只有基础三列），之后是明细
const overviewSql = readFileSync(sqlFile, 'utf8');
const overviewCount = (overviewSql.match(/SELECT '[^']+' AS tbl, COUNT\(\*\) AS rows/g) ?? []).length;
const overview = payload.slice(0, overviewCount).map((r) => r.results?.[0]).filter(Boolean);
const detailSets = payload.slice(overviewCount).map((r) => r.results ?? []);

const fmt = (rows) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (cells) => cells.map((cell, i) => String(cell ?? '').padEnd(widths[i])).join('  ');
  return [line(cols), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map((r) => line(cols.map((c) => r[c])))].join('\n');
};

console.log(`\n=== 总览（${local ? '本地库' : '线上库'}）===`);
const dirtyTables = overview.filter((row) => Object.entries(row).some(([k, v]) => k !== 'tbl' && k !== 'rows' && Number(v) > 0));
if (!dirtyTables.length) {
  console.log('全部干净：没有缺字段、没有坏 JSON、没有孤儿行。');
} else {
  for (const row of dirtyTables) {
    const bad = Object.entries(row)
      .filter(([k, v]) => k !== 'tbl' && k !== 'rows' && Number(v) > 0)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    console.log(`  ${row.tbl}  (${row.rows} 行)  ${bad}`);
  }
  const totalRows = overview.reduce((sum, r) => sum + Number(r.rows ?? 0), 0);
  console.log(`\n  共 ${dirtyTables.length} 张表有脏数据 / 全库 ${totalRows} 行`);
}

const detailRows = detailSets.flat();
if (detailRows.length) {
  console.log('\n=== 明细（缺字段的行）===');
  console.log(fmt(detailRows));
}

const broken = overview.filter((r) => Number(r.invalid_json) > 0);
const orphans = overview.filter((r) => Number(r.orphan_row) > 0);
if (broken.length) console.log(`\n⚠ JSON 损坏：${broken.map((r) => `${r.tbl}(${r.invalid_json})`).join(' ')}`);
if (orphans.length) console.log(`⚠ workspace 为空（永远读不到的孤儿行）：${orphans.map((r) => `${r.tbl}(${r.orphan_row})`).join(' ')}`);

if (dirtyTables.length || broken.length || orphans.length) {
  console.log('\n修复：npm run db:migrate:remote（执行 0010_normalize_history_fields.sql，幂等）');
}
