/**
 * `GET /api/stores/:store` 的窗口 / 游标分页契约（前后端共用）。
 *
 * 为什么需要它：`/api/stores/:store` 以前只有两种形态——「整表」和「增量（`since` 水位）」。
 * 整表对 trainings 这种 3.5k 行的表意味着首屏几 MB 的搬运；而 Dashboard 只算近 30 天、
 * Trainings 一屏只显示 20 条，绝大多数行是白拉的。
 *
 * 于是同一个端点按参数分成三种模式（**互不重叠**，老客户端不受影响）：
 *
 * | 参数                     | 语义                                   | 响应形状                |
 * | ------------------------ | -------------------------------------- | ----------------------- |
 * | 无                       | 整表（备份 / 导出 / 内部全量路径）     | 记录数组                |
 * | 只有 `since`             | 增量同步（镜像用，见 syncMirror.ts）   | `{records,deleted,watermark}` |
 * | `limit` 或 `before`      | **窗口 / 游标分页**（本文件）          | `{records,hasMore,nextBefore}` |
 *
 * 判定顺序不能反：`since` 已经是增量协议的关键字，若把「带 since = 窗口」的实现塞进去，
 * 线上还缓存着旧 bundle 的标签页会拿到对象而按 `{records,deleted,watermark}` 解构，
 * 直接抛错。所以**窗口模式必须由新参数（limit / before）显式进入**。
 *
 * 游标语义：
 * - 排序固定 `DESC`，`order=updated` 按写入时间（走 `(workspace, updated_at)` 索引），
 *   `order=date` 按记录业务日期（`$.date`，避免「编辑过的老记录」跳到列表最前面）。
 * - 游标是 `(排序值, id)` 复合键：只按时间翻页时，同一时间戳的多行会在页边界被整批跳过
 *   （批量导入 / 一次生成多条计划都会造成同毫秒写入），所以必须带 id 兜底。
 * - `limit + 1` 判定 `hasMore`，不做额外 COUNT：多取一条比再查一次计数便宜且不会失真。
 */
import type { StoreName } from './snapshot';

export const WINDOW_DEFAULT_LIMIT = 50;
export const WINDOW_MAX_LIMIT = 200;

/** 允许作为 facets 聚合（下拉选项）的字段，白名单避免任意 JSON 路径进 SQL */
export const WINDOW_FACET_FIELDS = ['subject', 'module', 'trainingType', 'status'] as const;
export type WindowFacetField = (typeof WINDOW_FACET_FIELDS)[number];

export type WindowOrder = 'updated' | 'date';

export interface WindowQuery {
  limit: number;
  order: WindowOrder;
  /** 写入时间下界（UTC ISO）：走索引剪枝，不做业务口径判断 */
  since?: string;
  /** 游标：上一页最后一行的排序值 */
  before?: string;
  /** 游标：上一页最后一行的 id（排序值相同的行靠它决胜） */
  beforeId?: string;
  subject?: string;
  studentId?: string;
  /** 业务日期区间（`$.date`），与 `since` 正交 */
  dateFrom?: string;
  dateTo?: string;
  facets: WindowFacetField[];
}

export interface StoreWindow<T> {
  records: T[];
  hasMore: boolean;
  /** 下一页游标；`hasMore` 为 false 时服务端也会返回，客户端可忽略 */
  nextBefore?: string;
  nextBeforeId?: string;
  /** 仅首页（无 before）且显式请求 facets 时返回 */
  facets?: Partial<Record<WindowFacetField, string[]>>;
}

/** 是否为 JSON 合法时才求值：一行 JSON 损坏不能把整条窗口查询打死（json_extract 会抛） */
function jsonField(field: string): string {
  return `CASE WHEN json_valid(data) THEN json_extract(data, '$.${field}') END`;
}

function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FILTER_LENGTH = 128;

export type WindowParseResult = { ok: true; query: WindowQuery } | { ok: false; message: string };

/**
 * 解析窗口参数。任何非法值都返回 400 语义而不是「静默当成默认值」：
 * 分页参数写错时最糟的结果是「看着有数据、其实是另一页」，宁可报错。
 */
export function parseWindowQuery(params: URLSearchParams): WindowParseResult {
  const rawLimit = params.get('limit');
  let limit = WINDOW_DEFAULT_LIMIT;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) return { ok: false, message: 'limit 必须是正整数' };
    limit = Number(rawLimit);
    if (limit < 1 || limit > WINDOW_MAX_LIMIT) {
      return { ok: false, message: `limit 取值范围 1-${WINDOW_MAX_LIMIT}` };
    }
  }

  const rawOrder = params.get('order');
  if (rawOrder !== null && rawOrder !== 'updated' && rawOrder !== 'date') {
    return { ok: false, message: 'order 只能是 updated 或 date' };
  }
  const order: WindowOrder = rawOrder === 'date' ? 'date' : 'updated';

  const rawSince = params.get('since');
  let since: string | undefined;
  if (rawSince) {
    const iso = isoOrNull(rawSince);
    if (!iso) return { ok: false, message: 'since 不是合法时间' };
    since = iso;
  }

  const rawBefore = params.get('before');
  let before: string | undefined;
  if (rawBefore !== null && rawBefore !== '') {
    if (order === 'date') {
      if (!DATE_PATTERN.test(rawBefore)) return { ok: false, message: 'before 必须是 yyyy-MM-dd（order=date）' };
      before = rawBefore;
    } else {
      const iso = isoOrNull(rawBefore);
      if (!iso) return { ok: false, message: 'before 不是合法时间' };
      before = iso;
    }
  }

  const rawBeforeId = params.get('beforeId');
  let beforeId: string | undefined;
  if (rawBeforeId) {
    if (rawBeforeId.length > MAX_FILTER_LENGTH) return { ok: false, message: 'beforeId 过长' };
    beforeId = rawBeforeId;
  }
  // 只给 before 不给 beforeId 也能翻页（同值行可能重复下发一次，按 id upsert 幂等）；
  // 反过来只有 beforeId 没有 before 则无从比较
  if (beforeId && !before) return { ok: false, message: 'beforeId 必须与 before 同时出现' };

  const readFilter = (name: string): { value?: string; error?: string } => {
    const raw = params.get(name);
    if (raw === null || raw === '') return {};
    if (raw.length > MAX_FILTER_LENGTH) return { error: `${name} 过长` };
    return { value: raw };
  };

  const subject = readFilter('subject');
  if (subject.error) return { ok: false, message: subject.error };
  const studentId = readFilter('studentId');
  if (studentId.error) return { ok: false, message: studentId.error };

  const readDate = (name: string): { value?: string; error?: string } => {
    const raw = params.get(name);
    if (raw === null || raw === '') return {};
    if (!DATE_PATTERN.test(raw)) return { error: `${name} 必须是 yyyy-MM-dd` };
    return { value: raw };
  };
  const dateFrom = readDate('dateFrom');
  if (dateFrom.error) return { ok: false, message: dateFrom.error };
  const dateTo = readDate('dateTo');
  if (dateTo.error) return { ok: false, message: dateTo.error };

  const rawFacets = params.get('facets');
  const facets: WindowFacetField[] = [];
  if (rawFacets) {
    for (const name of rawFacets.split(',').map((item) => item.trim()).filter(Boolean)) {
      if (!(WINDOW_FACET_FIELDS as readonly string[]).includes(name)) {
        return { ok: false, message: `facets 只支持 ${WINDOW_FACET_FIELDS.join(' / ')}` };
      }
      if (!facets.includes(name as WindowFacetField)) facets.push(name as WindowFacetField);
    }
  }

  return {
    ok: true,
    query: {
      limit,
      order,
      ...(since ? { since } : {}),
      ...(before ? { before } : {}),
      ...(beforeId ? { beforeId } : {}),
      ...(subject.value ? { subject: subject.value } : {}),
      ...(studentId.value ? { studentId: studentId.value } : {}),
      ...(dateFrom.value ? { dateFrom: dateFrom.value } : {}),
      ...(dateTo.value ? { dateTo: dateTo.value } : {}),
      facets,
    },
  };
}

interface SqlParts {
  sql: string;
  params: unknown[];
}

/** 追加的过滤片段（如学生学段隔离），由调用方给出 SQL 与参数 */
export interface ExtraFilter {
  sql: string;
  params: string[];
}

/** 窗口查询的 WHERE 片段（窗口查询与 facets 聚合共用，保证两者的筛选口径一致） */
function windowWhere(query: WindowQuery, workspace: string, extra?: ExtraFilter): SqlParts {
  const clauses = ['workspace = ?'];
  const params: unknown[] = [workspace];
  if (extra) {
    clauses.push(`(${extra.sql})`);
    params.push(...extra.params);
  }
  if (query.since) {
    clauses.push('updated_at >= ?');
    params.push(query.since);
  }
  if (query.subject) {
    clauses.push(`${jsonField('subject')} = ?`);
    params.push(query.subject);
  }
  if (query.studentId) {
    clauses.push(`${jsonField('studentId')} = ?`);
    params.push(query.studentId);
  }
  if (query.dateFrom) {
    clauses.push(`${jsonField('date')} >= ?`);
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    clauses.push(`${jsonField('date')} <= ?`);
    params.push(query.dateTo);
  }
  return { sql: clauses.join(' AND '), params };
}

/**
 * 构造窗口查询。
 *
 * `order=updated` 直接用 `updated_at` 列做排序与游标比较（可用 `(workspace, updated_at)` 索引，
 * 不必额外排序）；`order=date` 退化成 `$.date`，此时只能走覆盖索引扫描后的临时排序，
 * 换来的是「列表顺序与用户看到的日期一致」。
 *
 * @param extra 额外过滤（学生端学段隔离）。放在 SQL 而不是取回后再过滤，是因为
 *   「取 20 条再筛掉一半」会让学生看到半空的页，翻页次数也翻倍。
 */
export function buildWindowSql(
  store: StoreName,
  query: WindowQuery,
  workspace: string,
  extra?: ExtraFilter,
): SqlParts {
  const where = windowWhere(query, workspace, extra);
  const clauses = [where.sql];
  const params = [...where.params];

  const sortExpr = query.order === 'date' ? `COALESCE(${jsonField('date')}, '')` : 'updated_at';

  if (query.before !== undefined) {
    if (query.beforeId) {
      clauses.push(`(${sortExpr} < ? OR (${sortExpr} = ? AND id < ?))`);
      params.push(query.before, query.before, query.beforeId);
    } else {
      clauses.push(`${sortExpr} < ?`);
      params.push(query.before);
    }
  }

  // 多取一条用于判定 hasMore（见文件头），客户端拿到的仍然是 limit 条
  params.push(query.limit + 1);

  return {
    sql: `SELECT id, data, ${sortExpr} AS cursor_value
          FROM ${store}
          WHERE ${clauses.join(' AND ')}
          ORDER BY ${sortExpr} DESC, id DESC
          LIMIT ?`,
    params,
  };
}

/** facets 聚合：与窗口共用筛选条件，保证「下拉里能选到的值」与「列表里能翻到的行」一致 */
export function buildFacetSql(
  store: StoreName,
  query: WindowQuery,
  workspace: string,
  field: WindowFacetField,
  extra?: ExtraFilter,
  limit = WINDOW_MAX_LIMIT,
): SqlParts {
  const where = windowWhere(query, workspace, extra);
  return {
    sql: `SELECT DISTINCT ${jsonField(field)} AS value
          FROM ${store}
          WHERE ${where.sql} AND ${jsonField(field)} IS NOT NULL
          ORDER BY value
          LIMIT ?`,
    params: [...where.params, limit],
  };
}

/**
 * 客户端拼查询串：只带真正需要的参数，避免把 `limit` 带进增量同步路径。
 * （`since` 单独出现代表增量协议，这里只有走窗口读的调用方才用它）
 */
export function windowSearchParams(query: Partial<WindowQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.order && query.order !== 'updated') params.set('order', query.order);
  if (query.since) params.set('since', query.since);
  if (query.before !== undefined) params.set('before', query.before);
  if (query.beforeId) params.set('beforeId', query.beforeId);
  if (query.subject) params.set('subject', query.subject);
  if (query.studentId) params.set('studentId', query.studentId);
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.facets && query.facets.length > 0) params.set('facets', query.facets.join(','));
  return params;
}
