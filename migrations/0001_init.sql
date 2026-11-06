-- Cloudflare D1 初始化（Pages Functions 直连模式）
-- 执行：npx wrangler d1 migrations apply ability_growth --remote
-- 业务表结构：workspace(用户名) + id + updated_at + data(实体 JSON)
-- D1 是业务数据的唯一来源；旧库缺列时 Pages Functions 首次请求会自动补 workspace 列。

CREATE TABLE IF NOT EXISTS trainings (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gaps (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS abilities (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS templates (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assignments (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assignmentProgress (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exams (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS corrections (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS strategies (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS registrations (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stagePlans (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS spacedReviews (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_trainings_workspace_updated ON trainings(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_gaps_workspace_updated ON gaps(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_abilities_workspace_updated ON abilities(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_students_workspace_updated ON students(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_reviews_workspace_updated ON reviews(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_updated ON tasks(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_templates_workspace_updated ON templates(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_assignments_workspace_updated ON assignments(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_assignmentProgress_workspace_updated ON assignmentProgress(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_exams_workspace_updated ON exams(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_corrections_workspace_updated ON corrections(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_strategies_workspace_updated ON strategies(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_registrations_workspace_updated ON registrations(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_stagePlans_workspace_updated ON stagePlans(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_spacedReviews_workspace_updated ON spacedReviews(workspace, updated_at);

CREATE TABLE IF NOT EXISTS sync_backups (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backups_account ON sync_backups(account_id, created_at);
