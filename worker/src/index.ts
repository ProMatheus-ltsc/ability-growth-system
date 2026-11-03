/**
 * ability-growth-system 的 Cloudflare D1 同步 Worker
 *
 * 与前端 src/services/remoteSync.ts 的 API 契约一一对应：
 *   GET  /api/sync/health   → 连通性探针，返回 'ok'
 *   POST /api/sync/push     → 接收增量快照，按 Last-Write-Wins upsert 到业务表
 *   GET  /api/sync/pull     → ?accountId&since=ISO，返回 since 之后更新的实体
 *   POST /api/sync/backup   → 全量快照存为一个备份版本（sync_backups 表）
 *   GET  /api/sync/restore  → ?accountId&timestamp=ISO，返回指定（或最新）备份版本
 *   GET  /api/sync/backups  → ?accountId，列出历史备份点
 *
 * 鉴权：
 *   - 请求头必须携带 X-Sync-Account: <accountId>（账户数据隔离；前端留空时自动取当前登录账户名）
 *   - 若 wrangler.toml 配置了 SYNC_AUTH_TOKEN，则必须再携带 Authorization: Bearer <token>
 *
 * 删除传播（v2 新增）：
 *   - 快照中的 tombstones[] 写入 tombstones 表，pull 时按账户回传给前端，由前端执行删除。
 *   - tombstones 表按 account_id 隔离，是纯新增表，不影响既有业务表结构。
 *
 * 兼容性：本 Worker 可在 v1 数据库上直接部署，无需迁移；缺失的 14 张业务表由
 * schema.sql（全部 CREATE ... IF NOT EXISTS）补齐即可。
 *
 * 部署（唯一需要配置的就是 D1 的 name 和 id）：
 *   1. 在 worker/wrangler.toml 的 [[d1_databases]] 填入你的 database_name 与 database_id
 *   2. npm run db:init    # 建表（wrangler d1 execute --remote --file=./schema.sql）
 *   3. npm run deploy     # 部署 Worker
 *   然后在应用「云端同步」页填入 Worker URL 即可（accountId 留空自动，authToken 可选）
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  SYNC_AUTH_TOKEN?: string;
}

/** 业务表白名单（防止拼接 SQL 注入） */
const STORES = [
  'trainings', 'gaps', 'abilities', 'students', 'reviews', 'tasks',
  'templates', 'assignments', 'assignmentProgress', 'exams', 'corrections',
  'strategies', 'registrations', 'stagePlans', 'spacedReviews',
  'pdcaProblems', 'careerAssessments', 'careerReports', 'subjectiveAnswers',
  'interviewRecords', 'pdcaArtifacts', 'customTools', 'weeklyChecklists',
  'collaborationEvents', 'vetoOverrides', 'politicsHotspots',
  'careerObservationPoints', 'careerRetestReflections', 'careerAiImports',
] as const;
type StoreName = (typeof STORES)[number];

const MAX_BACKUPS = 20; // 每个账户最多保留的备份版本数

/** 从实体取合并时间戳（与前端 mergeById 的字段优先级一致） */
function entityTimestamp(record: Record<string, unknown>): string {
  const t = record.updatedAt ?? record.createdAt ?? record.evaluationTime;
  return typeof t === 'string' ? t : '';
}

function json(res: unknown, status = 200): Response {
  return new Response(JSON.stringify(res), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

/** 鉴权：校验 X-Sync-Account，可选校验 Bearer Token */
function authorize(request: Request, env: Env): { ok: true; accountId: string } | { ok: false; error: string } {
  const accountId = request.headers.get('X-Sync-Account');
  if (!accountId) return { ok: false, error: '缺少 X-Sync-Account 请求头' };
  if (env.SYNC_AUTH_TOKEN) {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (token !== env.SYNC_AUTH_TOKEN) return { ok: false, error: '鉴权失败' };
  }
  return { ok: true, accountId };
}

/**
 * 批量 upsert 一张表（LWW：仅当传入更新的时间戳大于库中记录时才覆盖）。
 *
 * 隔离说明：业务表结构沿用 v1（id 主键，无 account_id 列）。
 * 多账户若使用相同记录 id（uuid，实际不可能碰撞），会互相覆盖；
 * 前端按账户名绑定同一个 Worker，是既定的轻量方案。
 */
async function upsertStore(
  db: D1Database,
  store: StoreName,
  records: Record<string, unknown>[],
): Promise<number> {
  let conflicts = 0;
  for (const record of records) {
    if (!record || typeof record.id !== 'string') continue;
    const ts = entityTimestamp(record);
    const stmt = await db
      .prepare(
        `INSERT INTO ${store} (id, updated_at, data) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           updated_at = excluded.updated_at,
           data = excluded.data
         WHERE excluded.updated_at > ${store}.updated_at`,
      )
      .bind(record.id, ts, JSON.stringify(record))
      .run();
    if (stmt.meta.changes === 0 && (stmt.meta.last_row_id ?? 0) !== 0) conflicts++;
  }
  return conflicts;
}

/** 写入删除墓碑（id = `${account}:${store}:${recordId}`，天然按账户隔离） */
async function upsertTombstones(
  db: D1Database,
  accountId: string,
  records: Record<string, unknown>[],
): Promise<void> {
  for (const record of records) {
    if (!record || typeof record.store !== 'string' || typeof record.recordId !== 'string') continue;
    const id = `${accountId}:${record.store}:${record.recordId}`;
    const deletedAt = typeof record.deletedAt === 'string' ? record.deletedAt : new Date().toISOString();
    const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : deletedAt;
    await db
      .prepare(
        `INSERT INTO tombstones (id, account_id, store, record_id, deleted_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           deleted_at = excluded.deleted_at,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at > tombstones.updated_at`,
      )
      .bind(id, accountId, record.store, record.recordId, deletedAt, updatedAt)
      .run();
  }
}

/** 增量读取一张表（since 之后的记录） */
async function readStore(db: D1Database, store: StoreName, since: string): Promise<Record<string, unknown>[]> {
  const res = since
    ? await db.prepare(`SELECT data FROM ${store} WHERE updated_at > ?`).bind(since).all<{ data: string }>()
    : await db.prepare(`SELECT data FROM ${store}`).all<{ data: string }>();
  return (res.results ?? []).map((r) => JSON.parse(r.data) as Record<string, unknown>);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Account',
        },
      });
    }

    // 连通性探针（无需鉴权，前端 checkConnectivity 用它探测）
    // 注意：必须带 CORS 头，否则跨域前端 fetch 会被浏览器拦截
    if (path === '/api/sync/health' && request.method === 'GET') {
      return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const auth = authorize(request, env);
    if (!auth.ok) return json({ error: auth.error }, 401);
    const accountId = auth.accountId;

    try {
      // ============ 增量推送 ============
      if (path === '/api/sync/push' && request.method === 'POST') {
        const body = (await request.json()) as {
          accountId: string;
          since?: string | null;
          snapshot: Record<string, unknown[]> & { version?: string };
        };
        let conflicts = 0;
        for (const store of STORES) {
          const list = Array.isArray(body.snapshot?.[store]) ? (body.snapshot[store] as Record<string, unknown>[]) : [];
          if (list.length > 0) conflicts += await upsertStore(env.DB, store, list);
        }
        // 删除墓碑（v2）
        const tombs = Array.isArray(body.snapshot?.tombstones)
          ? (body.snapshot.tombstones as Record<string, unknown>[])
          : [];
        if (tombs.length > 0) await upsertTombstones(env.DB, accountId, tombs);
        return json({ ok: true, conflicts });
      }

      // ============ 增量拉取 ============
      if (path === '/api/sync/pull' && request.method === 'GET') {
        const since = url.searchParams.get('since') ?? '';
        const snapshot: Record<string, unknown> = { version: '7.0.0', exportedAt: new Date().toISOString() };
        for (const store of STORES) {
          snapshot[store] = await readStore(env.DB, store, since);
        }
        // 墓碑按账户 + since 增量返回（v2）
        const tombSql = since
          ? 'SELECT store, record_id, deleted_at, updated_at FROM tombstones WHERE account_id = ? AND updated_at > ?'
          : 'SELECT store, record_id, deleted_at, updated_at FROM tombstones WHERE account_id = ?';
        const tombStmt = since
          ? env.DB.prepare(tombSql).bind(accountId, since)
          : env.DB.prepare(tombSql).bind(accountId);
        const tombRows = await tombStmt.all<{
          store: string; record_id: string; deleted_at: string; updated_at: string;
        }>();
        snapshot.tombstones = (tombRows.results ?? []).map((r) => ({
          id: `${r.store}:${r.record_id}`,
          store: r.store,
          recordId: r.record_id,
          deletedAt: r.deleted_at,
          updatedAt: r.updated_at,
        }));
        return json(snapshot);
      }

      // ============ 全量备份 ============
      if (path === '/api/sync/backup' && request.method === 'POST') {
        const body = (await request.json()) as {
          accountId: string;
          snapshot: Record<string, unknown[]>;
          timestamp: string;
        };
        const backupAt = body.timestamp || new Date().toISOString();
        // id 加账户前缀，避免不同账户同一时刻互相覆盖；created_at 保持纯时间戳便于展示与恢复
        await env.DB.prepare(
          'INSERT OR REPLACE INTO sync_backups (id, account_id, created_at, data) VALUES (?, ?, ?, ?)',
        )
          .bind(`${accountId}:${backupAt}`, accountId, backupAt, JSON.stringify(body.snapshot))
          .run();
        // 清理超量备份（保留最新 MAX_BACKUPS 个）
        const old = await env.DB.prepare(
          'SELECT id FROM sync_backups WHERE account_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?',
        )
          .bind(accountId, MAX_BACKUPS)
          .all<{ id: string }>();
        for (const row of old.results ?? []) {
          await env.DB.prepare('DELETE FROM sync_backups WHERE id = ?').bind(row.id).run();
        }
        return json({ ok: true, timestamp: backupAt });
      }

      // ============ 恢复备份 ============
      // 兼容 v1 旧备份（id 就是时间戳）与 v2 新备份（id 带账户前缀）：一律按 created_at 查
      if (path === '/api/sync/restore' && request.method === 'GET') {
        const timestamp = url.searchParams.get('timestamp');
        const row = timestamp
          ? await env.DB.prepare('SELECT data FROM sync_backups WHERE account_id = ? AND created_at = ?')
              .bind(accountId, timestamp)
              .first<{ data: string }>()
          : await env.DB.prepare('SELECT data FROM sync_backups WHERE account_id = ? ORDER BY created_at DESC LIMIT 1')
              .bind(accountId)
              .first<{ data: string }>();
        if (!row) return json({ error: '未找到备份' }, 404);
        return json(JSON.parse(row.data));
      }

      // ============ 列出备份点 ============
      if (path === '/api/sync/backups' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT created_at, data FROM sync_backups WHERE account_id = ? ORDER BY created_at DESC',
        )
          .bind(accountId)
          .all<{ created_at: string; data: string }>();
        return json(
          (rows.results ?? []).map((r) => {
            const snap = JSON.parse(r.data) as Record<string, unknown>;
            const records = STORES.reduce(
              (sum, s) => sum + (Array.isArray(snap[s]) ? (snap[s] as unknown[]).length : 0),
              0,
            );
            return { timestamp: r.created_at, size: r.data.length, records };
          }),
        );
      }

      return json({ error: `未知端点 ${path}` }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : '内部错误' }, 500);
    }
  },
};
