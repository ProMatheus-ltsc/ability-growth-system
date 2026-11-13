-- 0007_drop_labelStats.sql
-- 删除已死的 labelStats 表（224 行历史标签聚合，无任何写入路径）。
--
-- 必须在「不再创建/读取 labelStats 的新代码」部署之后执行：
-- 旧代码的 initSchema 会 `CREATE TABLE IF NOT EXISTS labelStats` 把表重新建出来。
--
-- 执行前先创建一次云端备份（POST /api/backups 或 0006 中保留的备份仍在）。

DROP TABLE IF EXISTS labelStats;
