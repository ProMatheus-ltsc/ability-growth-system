-- Cloudflare D1 建表脚本（与 src/services/localDB.ts 的 29 张同步 store 一一对应）
-- 使用方式:
--   wrangler d1 execute ability_growth --remote --file=./schema.sql
-- 说明:
--   - 每张业务表结构相同: (account_id, id) 复合主键 + updated_at(LWW 排序/合并依据) + data(实体 JSON)
--   - account_id 隔离不同账户: 一个账户永远查不到另一个账户的数据（此前无隔离，属数据泄露缺陷）
--   - sync_backups 保存全量备份版本(按时间戳), 前端可列出/恢复历史备份点
--   - tombstones 保存删除墓碑, 让「删除」能跨设备传播（否则拉取时会被云端旧数据复活）
--
-- ⚠️ 从旧版 schema（业务表只有 id 主键、无 account_id）升级时，请跑 migrate-v2.sql，不要直接执行本文件。

-- ============ 业务表（29 张） ============
CREATE TABLE IF NOT EXISTS trainings (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS gaps (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS abilities (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS students (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS reviews (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS tasks (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS templates (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS assignments (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS assignmentProgress (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS exams (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS corrections (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS strategies (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS registrations (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS stagePlans (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS spacedReviews (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS pdcaProblems (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS careerAssessments (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS careerReports (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS subjectiveAnswers (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS interviewRecords (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS pdcaArtifacts (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS customTools (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS weeklyChecklists (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS collaborationEvents (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS vetoOverrides (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS politicsHotspots (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS careerObservationPoints (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS careerRetestReflections (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
CREATE TABLE IF NOT EXISTS careerAiImports (account_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));

-- 索引: 增量拉取按 (account_id, updated_at) 过滤
CREATE INDEX IF NOT EXISTS idx_trainings_updated ON trainings(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_gaps_updated ON gaps(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_abilities_updated ON abilities(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_students_updated ON students(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_reviews_updated ON reviews(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_templates_updated ON templates(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_assignments_updated ON assignments(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_assignmentProgress_updated ON assignmentProgress(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_exams_updated ON exams(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_corrections_updated ON corrections(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_strategies_updated ON strategies(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_registrations_updated ON registrations(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_stagePlans_updated ON stagePlans(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_spacedReviews_updated ON spacedReviews(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_pdcaProblems_updated ON pdcaProblems(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_careerAssessments_updated ON careerAssessments(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_careerReports_updated ON careerReports(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_subjectiveAnswers_updated ON subjectiveAnswers(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_interviewRecords_updated ON interviewRecords(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_pdcaArtifacts_updated ON pdcaArtifacts(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_customTools_updated ON customTools(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_weeklyChecklists_updated ON weeklyChecklists(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_collaborationEvents_updated ON collaborationEvents(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_vetoOverrides_updated ON vetoOverrides(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_politicsHotspots_updated ON politicsHotspots(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_careerObservationPoints_updated ON careerObservationPoints(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_careerRetestReflections_updated ON careerRetestReflections(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_careerAiImports_updated ON careerAiImports(account_id, updated_at);

-- ============ 删除墓碑 ============
CREATE TABLE IF NOT EXISTS tombstones (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  store TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, id)
);
CREATE INDEX IF NOT EXISTS idx_tombstones_account_updated ON tombstones(account_id, updated_at);

-- ============ 全量备份版本表 ============
CREATE TABLE IF NOT EXISTS sync_backups (
  id TEXT PRIMARY KEY,          -- `${account_id}:${timestamp}`，避免不同账户同一时刻互相覆盖
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backups_account ON sync_backups(account_id, created_at);
