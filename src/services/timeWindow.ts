/**
 * 统一时间窗口（验收缺陷 #6 口径统一）
 *
 * 此前工作台用「近 30 天」、能力中心用「全量」、分析页各 Tab 混用不同区间，
 * 导致同一问题在不同页面给出不同数字。现在全站只使用本文件的 TimeWindow：
 * - 组件标题统一用 withWindowLabel() 自动带出窗口，避免「数字有窗口、标题没窗口」；
 * - 默认窗口统一为近 30 天（DEFAULT_TIME_WINDOW），页面可切换但彼此语义一致。
 */
export type TimeWindow = '7d' | '30d' | '90d' | 'all';

export const TIME_WINDOW_LABEL: Record<TimeWindow, string> = {
  '7d': '近 7 天',
  '30d': '近 30 天',
  '90d': '近 90 天',
  all: '全部时间',
};

/** 全站默认窗口：近 30 天（原工作台口径，作为统一基准） */
export const DEFAULT_TIME_WINDOW: TimeWindow = '30d';

/** 本地时区的 yyyy-MM-dd，避免 toISOString 的 UTC 偏移 */
export function toLocalDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 窗口起始日（含）；'all' 返回 null 表示不限 */
export function windowStartDate(window: TimeWindow, today: string = toLocalDateISO()): string | null {
  if (window === 'all') return null;
  const days = window === '7d' ? 7 : window === '30d' ? 30 : 90;
  const [y, m, d] = today.split('-').map(Number);
  const base = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() - days);
  return toLocalDateISO(base);
}

/** 按统一窗口过滤记录（按 record.date 字符串比较，老数据同样适用） */
export function filterByWindow<T extends { date: string }>(
  records: T[],
  window: TimeWindow,
  today: string = toLocalDateISO(),
): T[] {
  const start = windowStartDate(window, today);
  if (start === null) return records;
  return records.filter((r) => r.date >= start && r.date <= today);
}

/** 指标标题自动带出时间窗口 */
export function withWindowLabel(title: string, window: TimeWindow): string {
  return `${title}（${TIME_WINDOW_LABEL[window]}）`;
}
