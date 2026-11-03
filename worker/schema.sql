-- Cloudflare D1 建表脚本（v2 · 纯增量，可安全重复执行）
-- 使用方式:
--   wrangler d1 execute ability_growth --remote --file=./schema.sql
--
-- 设计约束（重要）：
--   * 本脚本只做 CREATE ... IF NOT EXISTS，**不修改任何已有表结构**
--   * 已存在的业务表（id 主键 + updated_at + data）原样保留，线上数据不受影响
--   * 账户隔离通过请求头 X-Sync-Account + 前端配置的 accountId 实现（与旧方案一致）
--   * 因此本脚本可以在已有数据库上直接跑，无需备份、无需迁移、不会丢数据
--
-- v2 相对 v1 的变化：
--   1. 业务表从 15 张补齐到 27 张（此前 pdcaProblems / careerAssessments /
--      careerObservationPoints 等 12 张表缺失，前端推上去的数据被静默丢弃）
--   2. 新增 tombstones 表：让「删除」能跨设备传播
--      （此前只删本地，下次 pull 会被云端旧数据复活）
--   3. sync_backups.id 对新备份改为 `${account_id}:${timestamp}`，避免不同账户
--      同一时刻互相覆盖；读取一律按 created_at，旧备份（纯时间戳 id）仍可正常列出与恢复

-- ============ 业务表（27 张，与前端 localDB 的 SYNCED_STORES 一一对应） ============
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
CREATE TABLE IF NOT EXISTS pdcaProblems (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS careerAssessments (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS careerReports (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subjectiveAnswers (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS interviewRecords (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pdcaArtifacts (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customTools (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS weeklyChecklists (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS collaborationEvents (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vetoOverrides (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS careerObservationPoints (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS careerRetestReflections (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);

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
CREATE INDEX IF NOT EXISTS idx_pdcaProblems_updated ON pdcaProblems(updated_at);
CREATE INDEX IF NOT EXISTS idx_careerAssessments_updated ON careerAssessments(updated_at);
CREATE INDEX IF NOT EXISTS idx_careerReports_updated ON careerReports(updated_at);
CREATE INDEX IF NOT EXISTS idx_subjectiveAnswers_updated ON subjectiveAnswers(updated_at);
CREATE INDEX IF NOT EXISTS idx_interviewRecords_updated ON interviewRecords(updated_at);
CREATE INDEX IF NOT EXISTS idx_pdcaArtifacts_updated ON pdcaArtifacts(updated_at);
CREATE INDEX IF NOT EXISTS idx_customTools_updated ON customTools(updated_at);
CREATE INDEX IF NOT EXISTS idx_weeklyChecklists_updated ON weeklyChecklists(updated_at);
CREATE INDEX IF NOT EXISTS idx_collaborationEvents_updated ON collaborationEvents(updated_at);
CREATE INDEX IF NOT EXISTS idx_vetoOverrides_updated ON vetoOverrides(updated_at);
CREATE INDEX IF NOT EXISTS idx_careerObservationPoints_updated ON careerObservationPoints(updated_at);
CREATE INDEX IF NOT EXISTS idx_careerRetestReflections_updated ON careerRetestReflections(updated_at);

-- ============ 删除墓碑（新增表，纯增量） ============
-- 主键用 `${account}:${store}:${recordId}`，天然按账户隔离
CREATE TABLE IF NOT EXISTS tombstones (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  store TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tombstones_account_updated ON tombstones(account_id, updated_at);

-- ============ 全量备份版本表（v1 已有，此处仅确保存在） ============
CREATE TABLE IF NOT EXISTS sync_backups (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backups_account ON sync_backups(account_id, created_at);
