/**
 * 界面缺失信息的统一兜底
 *
 * 背景：能力缺口 / 训练记录来自 D1 的 JSON，历史数据可能缺字段，或字段值落在
 * 枚举之外。页面直接 `.split()` / 查表会在界面上渲染出字面量 `undefined`，
 * 甚至抛异常导致整页白屏。这里集中提供「安全取值 + 统一文案」。
 */
import { ERROR_CATEGORY_LABEL, type ErrorCategory, type Subject } from './types';
import { normalizeModule } from './moduleNormalize';

/** 缺字段 / 无法推断时的统一文案（不使用「未标注」「未知」） */
export const INFO_INSUFFICIENT = '信息不足';

export interface AbilityPathText {
  /** 二级模块；路径不足两段时为 null */
  module: string | null;
  /** 末级能力点；路径为空时为 null */
  point: string | null;
  /** 是否缺模块或能力点 */
  missing: boolean;
}

/** 已知学科（用于区分「学科/模块/…」与「模块/…」两种历史写法） */
const SUBJECT_PREFIXES = new Set([
  'xingce',
  'shenlun',
  'mianshi',
  'math',
  'physics',
  'chinese',
  'english',
  'chemistry',
  'biology',
]);

/**
 * 安全解析能力路径（**兼容三/四级与旧模块名**）。
 *
 * 两种历史形态都要能正确显示：
 * - 三级：`xingce/资料分析/增长率`
 * - 四级：`xingce/言语理解与表达/逻辑填空/关联词依赖`（行测允许四级）
 *
 * 旧写法里的 `言语理解与表达` 会被归一化成云端规范名 `言语理解`，
 * 这样同一条缺口在新旧数据下显示成同一个模块名，但**原始字符串不改**。
 *
 * 对正常三级路径，结果与原 `split('/').slice(-1)[0]` / `slice(-2)[0]` 完全一致。
 */
export function parseAbilityPath(abilityPath?: string | null): AbilityPathText {
  const parts = (abilityPath ?? '').split('/').filter((part) => part !== '');
  if (parts.length === 0) return { module: null, point: null, missing: true };

  // 单段路径（如 `判断推理`）：无法区分「学科」还是「模块」，按历史语义当作**能力点**、
  // 模块标记缺失（保持改动前行为，避免把 `xingce` 这种裸学科渲染成模块）。
  if (parts.length === 1) return { module: null, point: parts[0], missing: true };

  const hasSubject = SUBJECT_PREFIXES.has(parts[0]);
  const body = hasSubject ? parts.slice(1) : parts;
  if (body.length === 0) return { module: null, point: null, missing: true };

  const rawModule = body[0];
  // 学段对模块白名单有影响：行测/申论固定 adult，K12 用 adult 兜底（math 的 adult 表 = senior）
  const subject = (hasSubject ? parts[0] : 'xingce') as Subject;
  const module = normalizeModule(rawModule, subject, 'adult');
  const point = body.length >= 2 ? body[body.length - 1] : null;
  return { module, point, missing: point === null };
}

/** 能力点文案：取路径末级，取不到时统一「信息不足」 */
export function abilityPointText(abilityPath?: string | null): string {
  return parseAbilityPath(abilityPath).point ?? INFO_INSUFFICIENT;
}

/** 错因展示：已知枚举取中文；未知但非空回退原始值；空值统一「信息不足」 */
export function errorCategoryText(category?: string | null): string {
  if (!category) return INFO_INSUFFICIENT;
  return ERROR_CATEGORY_LABEL[category as ErrorCategory] ?? String(category);
}
