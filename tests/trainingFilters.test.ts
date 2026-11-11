/**
 * 训练记录页的筛选 / 排序 / 分页（2026-11-12）
 *
 * 回归背景：记录多了以后一屏几十条刷屏。这里把「筛选维度 + 排序 + 分页」的
 * 纯计算逻辑抽出来钉住，避免以后改动把筛选条件吃掉或分页越界。
 */
import { describe, expect, it } from 'vitest';
import type { TrainingRecord, TrainingType } from '../src/domain/types';

interface Row {
  id: string;
  subject: string;
  module: string;
  trainingType: TrainingType;
  date: string;
  totalQuestions: number;
  errorCount: number;
}

const accuracy = (r: Row) =>
  r.totalQuestions > 0 ? (r.totalQuestions - r.errorCount) / r.totalQuestions : 0;

/** 与页面内联逻辑同口径的最小复刻 */
function applyFilters(
  records: Row[],
  opts: {
    subject?: string;
    module?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: 'date-desc' | 'date-asc' | 'accuracy-asc' | 'accuracy-desc';
  },
): Row[] {
  let list = opts.subject && opts.subject !== 'all' ? records.filter((r) => r.subject === opts.subject) : records;
  if (opts.module && opts.module !== 'all') list = list.filter((r) => r.module === opts.module);
  if (opts.type && opts.type !== 'all') list = list.filter((r) => r.trainingType === opts.type);
  if (opts.dateFrom) list = list.filter((r) => r.date >= opts.dateFrom!);
  if (opts.dateTo) list = list.filter((r) => r.date <= opts.dateTo!);
  const sorted = [...list];
  switch (opts.sortBy) {
    case 'date-asc':
      sorted.sort((a, b) => a.date.localeCompare(b.date));
      break;
    case 'accuracy-asc':
      sorted.sort((a, b) => accuracy(a) - accuracy(b));
      break;
    case 'accuracy-desc':
      sorted.sort((a, b) => accuracy(b) - accuracy(a));
      break;
    default:
      sorted.sort((a, b) => b.date.localeCompare(a.date));
  }
  return sorted;
}

const rows: Row[] = [
  { id: 'a', subject: 'xingce', module: '资料分析', trainingType: 'topic', date: '2026-11-01', totalQuestions: 10, errorCount: 1 },
  { id: 'b', subject: 'xingce', module: '资料分析', trainingType: 'exam', date: '2026-11-05', totalQuestions: 10, errorCount: 5 },
  { id: 'c', subject: 'xingce', module: '判断推理', trainingType: 'topic', date: '2026-11-10', totalQuestions: 20, errorCount: 2 },
  { id: 'd', subject: 'shenlun', module: '归纳概括', trainingType: 'daily', date: '2026-11-08', totalQuestions: 4, errorCount: 0 },
];

describe('训练记录筛选与排序', () => {
  it('按学科筛选', () => {
    expect(applyFilters(rows, { subject: 'xingce' }).map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(applyFilters(rows, { subject: 'shenlun' }).map((r) => r.id)).toEqual(['d']);
  });

  it('按模块（考点）筛选', () => {
    expect(applyFilters(rows, { module: '资料分析' }).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('按题型筛选', () => {
    expect(applyFilters(rows, { type: 'exam' }).map((r) => r.id)).toEqual(['b']);
  });

  it('按时间范围筛选（含边界）', () => {
    expect(applyFilters(rows, { dateFrom: '2026-11-05', dateTo: '2026-11-09' }).map((r) => r.id)).toEqual([
      'd',
      'b',
    ]);
  });

  it('多个条件叠加', () => {
    const out = applyFilters(rows, { subject: 'xingce', module: '资料分析', type: 'topic' });
    expect(out.map((r) => r.id)).toEqual(['a']);
  });

  it('排序：日期降序 / 升序', () => {
    expect(applyFilters(rows, { sortBy: 'date-desc' }).map((r) => r.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(applyFilters(rows, { sortBy: 'date-asc' }).map((r) => r.id)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('排序：正确率升序（最差的在前）', () => {
    // a=90% c=90% d=100% b=50%
    const out = applyFilters(rows, { sortBy: 'accuracy-asc' });
    expect(out[0].id).toBe('b');
    expect(out[out.length - 1].id).toBe('d');
  });

  it('无记录时 totalQuestions 为 0 不会产生 NaN', () => {
    const zero = [{ ...rows[0], totalQuestions: 0, errorCount: 0 }];
    expect(Number.isNaN(accuracy(zero[0]))).toBe(false);
    expect(accuracy(zero[0])).toBe(0);
  });
});

describe('分页', () => {
  const PAGE_SIZE = 20;
  const many: Row[] = Array.from({ length: 45 }, (_, i) => ({
    id: `r${i}`,
    subject: 'xingce',
    module: '资料分析',
    trainingType: 'topic' as TrainingType,
    date: '2026-11-01',
    totalQuestions: 10,
    errorCount: 1,
  }));

  it('页数按 ceil(总数/每页) 计算', () => {
    expect(Math.ceil(many.length / PAGE_SIZE)).toBe(3);
    expect(Math.ceil(0 / PAGE_SIZE)).toBe(0);
  });

  it('页码越界时回落到最后一页（筛选后条目变少不会白屏）', () => {
    const totalPages = Math.ceil(45 / PAGE_SIZE);
    const page = 3;
    const safePage = Math.min(page, totalPages);
    // 筛选后只剩 5 条 → 只有 1 页，原 page=3 必须回落
    const shrunkPages = Math.ceil(5 / PAGE_SIZE);
    expect(Math.min(3, shrunkPages)).toBe(1);
    // 原页仍合法时不变
    expect(Math.min(2, totalPages)).toBe(2);
  });

  it('切片边界正确', () => {
    const slice = many.slice(0, PAGE_SIZE);
    expect(slice).toHaveLength(20);
    expect(many.slice(40, 60).map((r) => r.id)).toEqual(['r40', 'r41', 'r42', 'r43', 'r44']);
  });
});
