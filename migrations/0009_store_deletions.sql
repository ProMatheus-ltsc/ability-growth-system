-- 0009_store_deletions.sql
-- 增量同步的删除墓碑（可重复执行）
--
-- 背景：前端把「每次读全量」改成「首次全量 + 之后按 updated_at 水位增量」后，
-- 增量接口只能看到「新行 / 被改的行」，看不到「被删掉的 id」——
-- 客户端 IndexedDB 镜像会一直留着已删记录（错题本、训练记录这类会删数据的表尤其明显）。
--
-- 约定：
--   id = '*'  表示「该 store 被整体清空/重建」（清空、备份恢复的 replace 模式），
--             客户端见到后清空镜像并从 epoch 重新全量拉取。
--   id = 具体记录 id  表示单条删除。
--
-- 客户端合并顺序：先应用墓碑、再应用 upserts，因此「删了又重建同一 id」不会被误删。
-- 清理：由 0010 的保留策略按 deleted_at 定期裁剪（保留 90 天，远大于任何客户端的离线周期）。

CREATE TABLE IF NOT EXISTS store_deletions (
  workspace  TEXT NOT NULL,
  store      TEXT NOT NULL,
  id         TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (workspace, store, id)
);

CREATE INDEX IF NOT EXISTS idx_store_deletions_ws_store_time
  ON store_deletions (workspace, store, deleted_at);
