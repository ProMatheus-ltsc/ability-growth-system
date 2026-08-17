-- Cloudflare D1 建表脚本（与 src/services/localDB.ts 的 15 张 store 一一对应）
-- 使用方式:
--   wrangler d1 execute ability-growth --remote --file=./schema.sql
-- 说明:
--   - 每张业务表结构相同: id 主键 + updated_at(排序/合并依据) + data(实体 JSON)
--   - sync_backups 保存全量备份版本(按时间戳), 前端可列出/恢复历史备份点

-- 15 张业务表
CREATE TABLE IF NOT EXISTS trainings (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gaps (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS abilities (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assignmentProgress (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS corrections (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS strategies (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS registrations (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stagePlans (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS spacedReviews (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);

-- 索引: 增量拉取按 updated_at 过滤
CREATE INDEX IF NOT EXISTS idx_trainings_updated ON trainings(updated_at);
CREATE INDEX IF NOT EXISTS idx_gaps_updated ON gaps(updated_at);
CREATE INDEX IF NOT EXISTS idx_abilities_updated ON abilities(updated_at);
CREATE INDEX IF NOT EXISTS idx_students_updated ON students(updated_at);
CREATE INDEX IF NOT EXISTS idx_reviews_updated ON reviews(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_templates_updated ON templates(updated_at);
CREATE INDEX IF NOT EXISTS idx_assignments_updated ON assignments(updated_at);
CREATE INDEX IF NOT EXISTS idx_assignmentProgress_updated ON assignmentProgress(updated_at);
CREATE INDEX IF NOT EXISTS idx_exams_updated ON exams(updated_at);
CREATE INDEX IF NOT EXISTS idx_corrections_updated ON corrections(updated_at);
CREATE INDEX IF NOT EXISTS idx_strategies_updated ON strategies(updated_at);
CREATE INDEX IF NOT EXISTS idx_registrations_updated ON registrations(updated_at);
CREATE INDEX IF NOT EXISTS idx_stagePlans_updated ON stagePlans(updated_at);
CREATE INDEX IF NOT EXISTS idx_spacedReviews_updated ON spacedReviews(updated_at);

-- 全量备份版本表: id = 备份时间戳(ISO), account_id 隔离不同账户
CREATE TABLE IF NOT EXISTS sync_backups (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backups_account ON sync_backups(account_id, created_at);
