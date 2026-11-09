-- 0003_labelStats.sql
-- 题型标签聚合表（纯增量，不改动既有 27 张表）
-- 结构与 0001_init.sql 的业务表保持一致：(workspace, id, updated_at, data)
-- 一行 = 一个标签叶子在该 workspace 下的累计作答聚合。
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS labelStats (
  workspace TEXT NOT NULL DEFAULT '',
  id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL
);
