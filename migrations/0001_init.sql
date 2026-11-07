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
CREATE TABLE IF NOT EXISTS pdcaProblems (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS careerAssessments (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS careerReports (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subjectiveAnswers (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS interviewRecords (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pdcaArtifacts (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customTools (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS weeklyChecklists (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS collaborationEvents (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vetoOverrides (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS careerObservationPoints (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS careerRetestReflections (workspace TEXT NOT NULL DEFAULT '', id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, data TEXT NOT NULL);

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
CREATE INDEX IF NOT EXISTS idx_pdcaProblems_workspace_updated ON pdcaProblems(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_careerAssessments_workspace_updated ON careerAssessments(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_careerReports_workspace_updated ON careerReports(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_subjectiveAnswers_workspace_updated ON subjectiveAnswers(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_interviewRecords_workspace_updated ON interviewRecords(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_pdcaArtifacts_workspace_updated ON pdcaArtifacts(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_customTools_workspace_updated ON customTools(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_weeklyChecklists_workspace_updated ON weeklyChecklists(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_collaborationEvents_workspace_updated ON collaborationEvents(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_vetoOverrides_workspace_updated ON vetoOverrides(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_careerObservationPoints_workspace_updated ON careerObservationPoints(workspace, updated_at);
CREATE INDEX IF NOT EXISTS idx_careerRetestReflections_workspace_updated ON careerRetestReflections(workspace, updated_at);

CREATE TABLE IF NOT EXISTS sync_backups (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backups_account ON sync_backups(account_id, created_at);
