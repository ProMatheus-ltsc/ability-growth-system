/**
 * 界面缺失信息的统一兜底
 *
 * 背景：能力缺口 / 训练记录来自 D1 的 JSON，历史数据可能缺字段，或字段值落在
 * 枚举之外。页面直接 `.split()` / 查表会在界面上渲染出字面量 `undefined`，
 * 甚至抛异常导致整页白屏。这里集中提供「安全取值 + 统一文案」。
 */
import { ERROR_CATEGORY_LABEL, type ErrorCategory } from './types';

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

/**
 * 安全解析 `学科/模块/能力点` 形式的能力路径。
 * 对正常的三级路径，结果与原 `split('/').slice(-1)[0]` / `slice(-2)[0]` 完全一致。
 */
export function parseAbilityPath(abilityPath?: string | null): AbilityPathText {
  const parts = (abilityPath ?? '').split('/').filter((part) => part !== '');
  if (parts.length === 0) return { module: null, point: null, missing: true };
  const point = parts[parts.length - 1];
  const module = parts.length >= 2 ? parts[parts.length - 2] : null;
  return { module, point, missing: module === null };
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
