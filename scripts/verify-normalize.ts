/**
 * 模块归一化回归检查（用真实导出的粉笔数据）
 * 运行: npx tsx scripts/verify-normalize.ts
 *
 * 期望:
 * - 所有能力快照的 abilityPath 都能归到标签库的一级模块
 * - 训练记录除「整卷」外都能归到一级模块（整卷本就不属于模块，属正常）
 */
import { readFileSync } from 'node:fs';
import { normalizeModule, normalizeAbilityPath } from '../src/domain/moduleNormalize';
import { getModules } from '../src/domain/abilityTags';
import type { GradeLevel, Subject } from '../src/domain/types';

const GRADE: GradeLevel = 'adult';
const SUBJECT: Subject = 'xingce';

/** 这些 module 代表整卷/综合测验，不属于任何一级模块，未命中属正常 */
const WHOLE_PAPER = new Set(['行测整卷', '整卷', '综合测验']);

const data = JSON.parse(
  readFileSync('C:/Users/liyunfei/IdeaProjects/personal-assistant-agent/data/study/ability-growth-导入-粉笔.json', 'utf8'),
) as { trainings: { module: string }[]; abilities: { abilityPath: string }[] };

const canonical = getModules(GRADE, SUBJECT);
console.log('标签库一级模块:', canonical.join(' / '));
console.log('');

const counters = new Map<string, number>();
for (const t of data.trainings) {
  const m = normalizeModule(t.module, SUBJECT, GRADE);
  counters.set(m, (counters.get(m) ?? 0) + 1);
}

console.log('训练记录归一化结果:');
let unmatchedTrainings = 0;
for (const [m, n] of [...counters].sort((a, b) => b[1] - a[1])) {
  const hit = canonical.includes(m);
  const wholePaper = WHOLE_PAPER.has(m);
  if (!hit && !wholePaper) unmatchedTrainings++;
  const mark = hit ? '✓' : wholePaper ? '—' : '✗';
  const note = wholePaper ? '（整卷，不计入模块）' : '';
  console.log(`  ${mark} ${m.padEnd(14)} ${String(n).padStart(3)} 条 ${note}`);
}
console.log('');

const abilityByModule = new Map<string, number>();
for (const a of data.abilities) {
  const p = normalizeAbilityPath(a.abilityPath, SUBJECT, GRADE);
  const m = p.split('/')[1] ?? '';
  abilityByModule.set(m, (abilityByModule.get(m) ?? 0) + 1);
}
console.log('能力快照归一化后归属模块:');
let unmatchedAbilities = 0;
for (const [m, n] of [...abilityByModule].sort((a, b) => b[1] - a[1])) {
  const hit = canonical.includes(m);
  if (!hit) unmatchedAbilities++;
  console.log(`  ${hit ? '✓' : '✗'} ${m.padEnd(14)} ${String(n).padStart(3)} 个考点`);
}
console.log('');

const ok = unmatchedTrainings === 0 && unmatchedAbilities === 0;
console.log(
  ok
    ? `通过: 能力快照 ${data.abilities.length}/${data.abilities.length} 全部归位，训练记录全部归位（整卷除外）`
    : `失败: 训练未归位 ${unmatchedTrainings} 个模块，能力快照未归位 ${unmatchedAbilities} 个模块`,
);
process.exitCode = ok ? 0 : 1;
