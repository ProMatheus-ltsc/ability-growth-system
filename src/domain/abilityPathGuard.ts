/**
 * 能力路径白名单校验（方案 A，2026-11-11）
 *
 * 为什么需要：`abilityPath` 之前是**裸字符串无校验**，脚本可以写入任意层数、任意命名的路径，
 * 而页面派生用 `${subject}/${module}` 两级且不做归一化 —— 于是同一考点裂成多条缺口
 * （`言语理解与表达` vs `言语理解`），问题中心与实际不符。
 *
 * 校验口径（分级放行，兼顾历史数据）：
 * - **第 1 段**：必须是已知学科（xingce/shenlun/mianshi/math/physics/...）。
 * - **第 2 段**：必须落在该学科的模块白名单里（`SUBJECT_MODULES` / `getModules`）。
 * - **第 3、4 段**：**行测强校验**——必须能在 `ABILITY_TAGS` 的三级标签库里找到
 *   （第 3 段命中 `questionType` 或 `point`，第 4 段命中 `point`）；
 *   申论与 K12 只校验深度与空段，不强制白名单（标签库尚未建全，强校验会误杀）。
 *
 * 历史兼容：`validateAbilityPath(path, { lenient: true })` 用于**读取/展示**已有数据，
 * 不合规只返回 warning 不抛错；写入路径用默认的严格模式。
 */
import type { GradeLevel, Subject } from '../domain/types';
import { ABILITY_TAGS } from '../domain/abilityTags';
import { normalizeModule } from '../domain/moduleNormalize';
import { maxDepthFor } from '../domain/abilityPath';

const KNOWN_SUBJECTS: readonly string[] = [
  'xingce',
  'shenlun',
  'mianshi',
  'math',
  'physics',
  'chinese',
  'english',
  'chemistry',
  'biology',
];

/** 行测模块白名单（与 taxonomy.py 的 SUBJECT_MODULES 一致） */
const XINGCE_MODULES = ['资料分析', '判断推理', '言语理解', '数量关系', '常识判断', '政治理论'];

/** 申论模块白名单 */
const SHENLUN_MODULES = ['材料处理能力', '归纳概括', '综合分析', '提出对策', '贯彻执行', '大作文'];

export interface PathCheckResult {
  ok: boolean;
  /** 归一化后的路径（ok 时可直接落库） */
  normalized: string;
  errors: string[];
  warnings: string[];
}

/** 取某学科某模块下的所有三级考点与题型 */
function pointsOf(subject: Subject, gradeLevel: GradeLevel, module: string) {
  const tags = ABILITY_TAGS[`${gradeLevel}-${subject}` as keyof typeof ABILITY_TAGS] ?? [];
  const scoped = tags.filter((tag) => tag.module === module);
  const points = new Set(scoped.map((tag) => tag.point));
  const questionTypes = new Set(scoped.map((tag) => tag.questionType).filter(Boolean) as string[]);
  return { points, questionTypes };
}

function modulesOf(subject: string): readonly string[] | null {
  if (subject === 'xingce') return XINGCE_MODULES;
  if (subject === 'shenlun') return SHENLUN_MODULES;
  // K12：从标签库动态取（math/physics 已填充），空则不做模块校验
  return null;
}

/**
 * 校验并归一化能力路径。
 *
 * @param path     待校验路径，可省略学科前缀（会自动补）
 * @param subject  学科（用于补齐前缀与查白名单）
 * @param gradeLevel 学段（行测/申论固定 adult）
 * @param lenient  宽松模式：历史数据用，不合规只记 warning、不判失败
 */
export function validateAbilityPath(
  path: string,
  subject: Subject,
  gradeLevel: GradeLevel = 'adult',
  lenient = false,
): PathCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawParts = String(path ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  // 补齐学科前缀
  const parts = rawParts[0] === subject ? rawParts : [subject, ...rawParts];

  if (parts.length < 2) {
    errors.push('能力路径至少要两段：学科/模块');
    return { ok: false, normalized: parts.join('/'), errors, warnings };
  }

  // 1) 学科校验
  const seg0 = parts[0];
  if (!KNOWN_SUBJECTS.includes(seg0)) {
    const msg = `未知学科：${seg0}（允许 ${KNOWN_SUBJECTS.join('/')}）`;
    lenient ? warnings.push(msg) : errors.push(msg);
  }

  // 2) 模块校验
  const rawModule = parts[1];
  const module = normalizeModule(rawModule, subject, gradeLevel);
  if (module !== rawModule) {
    warnings.push(`模块名已归一化：${rawModule} → ${module}`);
  }
  const allowedModules = modulesOf(subject);
  if (allowedModules && !allowedModules.includes(module)) {
    const msg = `模块不在白名单：${module}（允许 ${allowedModules.join('/')}）`;
    lenient ? warnings.push(msg) : errors.push(msg);
  }

  const normalizedParts = [seg0, module, ...parts.slice(2)];

  // 3) 深度校验
  const limit = maxDepthFor(subject);
  if (normalizedParts.length > limit) {
    // 历史数据宽容：截断 + warning；严格模式报错
    if (lenient) {
      warnings.push(`路径超过 ${subject} 允许的 ${limit} 段，已截断`);
      normalizedParts.length = limit;
    } else {
      errors.push(`路径超过 ${subject} 允许的 ${limit} 段：${parts.join('/')}`);
    }
  }

  // 4) 行测：第 3/4 段强校验（标签库已建全，可以严）
  if (subject === 'xingce' && normalizedParts.length >= 3) {
    const { points, questionTypes } = pointsOf(subject, gradeLevel, module);
    const seg2 = normalizedParts[2];
    const seg3 = normalizedParts[3];

    if (points.size > 0 && questionTypes.size > 0) {
      const seg2Ok = questionTypes.has(seg2) || points.has(seg2);
      if (!seg2Ok) {
        const msg = `第 3 段「${seg2}」不在 ${module} 的题型/考点白名单（允许题型 ${[...questionTypes].join('/')}；考点 ${[...points].slice(0, 6).join('/')}…）`;
        lenient ? warnings.push(msg) : errors.push(msg);
      }
      if (seg3) {
        const seg3Ok = points.has(seg3) || questionTypes.has(seg3);
        if (!seg3Ok) {
          const msg = `第 4 段「${seg3}」不在 ${module} 的考点白名单`;
          lenient ? warnings.push(msg) : errors.push(msg);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    normalized: normalizedParts.join('/'),
    errors,
    warnings,
  };
}
