/**
 * 模块名归一化 · 打通「导入数据」与「能力标签库」的粒度差
 *
 * 背景:
 * 外部数据（粉笔导出、CSV、截图识别）里的 module 往往是两级路径（`判断推理/图形推理`）
 * 或口语化全称（`言语理解与表达`），而 abilityTags.ts 的三级标签体系用的是
 * 规范化一级模块名（`判断推理`、`言语理解`）。两者精确相等永远不成立，
 * 导致能力中心的「各模块掌握度」与「三级标签明细」全部显示无数据。
 *
 * 本模块只做一件事: 把任意写法的 module 收敛成标签库认可的一级模块名。
 * - 单点收敛，读写两路径共用（写入时归一化，读取时也归一化，历史数据无需迁移）
 * - 无法识别的模块原样返回，不丢弃数据
 */
import { getModules } from './abilityTags';
import { SUBJECT_LABEL } from './types';
import type { GradeLevel, Subject } from './types';

/** 一级模块别名 → 规范名（键与值均按「去掉空格后」比较） */
const MODULE_ALIASES: Record<string, string> = {
  // ---------- 行测 ----------
  言语理解与表达: '言语理解',
  言语: '言语理解',
  判断推理与表达: '判断推理',
  判断: '判断推理',
  资料分析材料: '资料分析',
  数量关系与资料: '数量关系',
  常识: '常识判断',
  公共基础知识: '常识判断',
  政治理论: '政治理论',
  政治常识: '政治理论',
  时政: '政治理论',
  // ---------- 数学 ----------
  数与式: '数与运算',
  运算: '数与运算',
  几何: '图形与几何',
  统计与概率: '数据统计与概率',
  函数: '函数分析',
  导数: '函数分析',
  // ---------- 物理 ----------
  力学: '力学基础',
  电磁学: '电学',
  实验: '实验探究',
  // ---------- 申论 ----------
  材料处理: '材料处理能力',
  归纳: '归纳概括',
  大作文写作: '大作文',
  // ---------- 面试 ----------
  综合: '综合分析',
  计划: '计划组织',
};

/** 去掉空格/全角空格，用于别名比较 */
function squeeze(text: string): string {
  return text.replace(/[\s\u3000]/g, '');
}

/** 取模块路径的第一段（`判断推理/图形推理` → `判断推理`） */
export function firstSegment(module: string): string {
  const raw = (module ?? '').trim();
  if (!raw) return '';
  const head = raw.split('/')[0].trim();
  return head || raw;
}

/**
 * 归一化模块名。
 *
 * 规则（依次尝试，命中即返回）：
 * 1. 取第一段路径（`a/b` → `a`）
 * 2. 与该学段-学科的规范模块名精确匹配
 * 3. 与规范模块名互为前缀关系（`言语理解与表达` ↔ `言语理解`）
 * 4. 别名表命中
 * 5. 兜底: 返回第一段原文（不丢数据）
 */
export function normalizeModule(
  module: string,
  subject: Subject,
  gradeLevel: GradeLevel,
): string {
  const head = firstSegment(module);
  if (!head) return '';

  const canonical = getModules(gradeLevel, subject);
  const target = squeeze(head);

  // 2) 精确命中规范名
  const exact = canonical.find((m) => squeeze(m) === target);
  if (exact) return exact;

  // 3) 前缀包含（双向）: 规范名是前缀，或原文是规范名的前缀。
  //    ⚠️ 必须取**最短**命中，且短名不得太短（≥3 字）——
  //    否则 K12 的 `函数` 会被 `函数分析` 吞掉（2026-11-11 实测误判）。
  //    例：`言语理解与表达` 应命中 `言语理解`（而不是更长的同前缀规范名）。
  const prefixHits = canonical
    .filter((m) => {
      const c = squeeze(m);
      return target.startsWith(c) || c.startsWith(target);
    })
    .sort((a, b) => squeeze(a).length - squeeze(b).length);
  const shortest = prefixHits[0];
  if (shortest && squeeze(shortest).length >= 3) {
    // 只有当原文比规范名长（如 `言语理解与表达` → `言语理解`）时才替换；
    // 原文本身就是完整模块名（如 `函数`）时保持原样，避免被更长的规范名吞掉。
    if (squeeze(shortest).length < target.length) return shortest;
    if (squeeze(shortest) === target) return shortest;
    // 原文是规范名的前缀但更短 → 保留原文（它可能是一个合法的更细模块）
    return head;
  }

  // 4) 别名表
  const alias = MODULE_ALIASES[target];
  if (alias && canonical.includes(alias)) return alias;

  // 5) 兜底
  return head;
}

/** 把模块名归一化后拼成能力路径（`xingce/判断推理`） */
export function normalizeAbilityPath(
  abilityPath: string,
  subject: Subject,
  gradeLevel: GradeLevel,
): string {
  const parts = (abilityPath ?? '').split('/').filter(Boolean);
  if (parts.length === 0) return '';
  // 兼容 `xingce/模块/考点` 与 `模块/考点` 两种写法
  const hasSubjectPrefix = parts[0] === subject || parts[0] === SUBJECT_LABEL[subject];
  const body = hasSubjectPrefix ? parts.slice(1) : parts;
  if (body.length === 0) return subject;
  const module = normalizeModule(body[0], subject, gradeLevel);
  const rest = body.slice(1);
  return [subject, module, ...rest].join('/');
}

/**
 * 判断某条能力路径是否落在指定一级模块下（归一化后比较）。
 * 用于雷达图维度归并与三级标签明细匹配。
 */
export function pathBelongsToModule(
  abilityPath: string,
  module: string,
  subject: Subject,
  gradeLevel: GradeLevel,
): boolean {
  const normalized = normalizeAbilityPath(abilityPath, subject, gradeLevel);
  const parts = normalized.split('/');
  return parts[0] === subject && parts[1] === module;
}
