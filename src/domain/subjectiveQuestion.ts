/**
 * 申论题目身份与题型工具
 *
 * questionKey = 学科 + 试卷来源 + 年份（可选）+ 题号，规范化后拼成字符串。
 * 同一 key 下的多次作答按 answeredAt 排序即构成版本序列，不依赖手动 parentId。
 * 老记录没有 questionKey → 返回 null，不进入自动版本链，展示层标为「未分类」。
 */
import { UNCLASSIFIED_QUESTION_TYPE } from './types';

const normalizePart = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function makeQuestionKey(input: {
  subject: string;
  paperSource?: string;
  paperYear?: string;
  questionNo?: string;
}): string | null {
  const source = input.paperSource?.trim();
  const no = input.questionNo?.trim();
  if (!source || !no) return null;
  return [input.subject, normalizePart(source), normalizePart(input.paperYear ?? ''), normalizePart(no)].join('|');
}

/** 缺题型统一展示为「未分类」 */
export function displayQuestionType(type?: string): string {
  return type?.trim() ? type.trim() : UNCLASSIFIED_QUESTION_TYPE;
}

/** 「未分类」不参与题型聚合 */
export function isClassifiedType(type?: string): boolean {
  return displayQuestionType(type) !== UNCLASSIFIED_QUESTION_TYPE;
}

/** 把 datetime-local 值转 ISO；非法输入返回 null */
export function toAnsweredAtIso(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 当前本地时间对应的 datetime-local 值（yyyy-MM-ddTHH:mm） */
export function nowLocalInputValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
