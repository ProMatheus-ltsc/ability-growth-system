-- 从 v1（业务表只有 id 主键、无 account_id）迁移到 v2（(account_id, id) 复合主键 + 墓碑表）
--
-- ⚠️ 执行前务必先备份线上数据：
--   npx wrangler d1 export ability_growth --remote --output backup-before-v2.sql
--
-- 执行方式：
--   npx wrangler d1 execute ability_growth --remote --file=./migrate-v2.sql
--
-- 旧数据没有 account_id，无法判断归属。脚本把它们统一归到占位账户 __legacy__，
-- 迁移完成后你需要在「云端同步」页把 accountId 手动填成 __legacy__ 才能读到这批历史数据；
-- 若确认旧数据可以丢弃（本地 IndexedDB 里都有），跑完直接 DELETE 掉 __legacy__ 更干净。

-- ============ 第 1 步：旧表改名留档 ============
ALTER TABLE trainings           RENAME TO trainings_v1;
ALTER TABLE gaps                RENAME TO gaps_v1;
ALTER TABLE abilities           RENAME TO abilities_v1;
ALTER TABLE students            RENAME TO students_v1;
ALTER TABLE reviews             RENAME TO reviews_v1;
ALTER TABLE tasks               RENAME TO tasks_v1;
ALTER TABLE templates           RENAME TO templates_v1;
ALTER TABLE assignments         RENAME TO assignments_v1;
ALTER TABLE assignmentProgress  RENAME TO assignmentProgress_v1;
ALTER TABLE exams               RENAME TO exams_v1;
ALTER TABLE corrections         RENAME TO corrections_v1;
ALTER TABLE strategies          RENAME TO strategies_v1;
ALTER TABLE registrations       RENAME TO registrations_v1;
ALTER TABLE stagePlans          RENAME TO stagePlans_v1;
ALTER TABLE spacedReviews       RENAME TO spacedReviews_v1;

-- sync_backups 旧表 id 无账户前缀，改名留档（备份能重跑，风险最低）
ALTER TABLE sync_backups RENAME TO sync_backups_v1;

-- ============ 第 2 步：建新表 ============
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

CREATE TABLE IF NOT EXISTS tombstones (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  store TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, id)
);

CREATE TABLE IF NOT EXISTS sync_backups (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL
);

-- ============ 第 3 步：旧数据搬入新表（归到占位账户 __legacy__） ============
INSERT OR IGNORE INTO trainings (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM trainings_v1;
INSERT OR IGNORE INTO gaps (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM gaps_v1;
INSERT OR IGNORE INTO abilities (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM abilities_v1;
INSERT OR IGNORE INTO students (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM students_v1;
INSERT OR IGNORE INTO reviews (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM reviews_v1;
INSERT OR IGNORE INTO tasks (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM tasks_v1;
INSERT OR IGNORE INTO templates (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM templates_v1;
INSERT OR IGNORE INTO assignments (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM assignments_v1;
INSERT OR IGNORE INTO assignmentProgress (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM assignmentProgress_v1;
INSERT OR IGNORE INTO exams (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM exams_v1;
INSERT OR IGNORE INTO corrections (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM corrections_v1;
INSERT OR IGNORE INTO strategies (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM strategies_v1;
INSERT OR IGNORE INTO registrations (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM registrations_v1;
INSERT OR IGNORE INTO stagePlans (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM stagePlans_v1;
INSERT OR IGNORE INTO spacedReviews (account_id, id, updated_at, data) SELECT '__legacy__', id, updated_at, data FROM spacedReviews_v1;

-- 备份：旧 id 本身就是时间戳，用 account_id 作前缀重建
INSERT OR IGNORE INTO sync_backups (id, account_id, created_at, data)
  SELECT '__legacy__:' || created_at, '__legacy__', created_at, data FROM sync_backups_v1;

-- ============ 第 4 步：建索引 ============
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
CREATE INDEX IF NOT EXISTS idx_tombstones_account_updated ON tombstones(account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_backups_account ON sync_backups(account_id, created_at);

-- ============ 第 5 步：确认无误后清理 v1 留档表（默认注释，手动执行） ============
-- DROP TABLE trainings_v1;
-- DROP TABLE gaps_v1;
-- DROP TABLE abilities_v1;
-- DROP TABLE students_v1;
-- DROP TABLE reviews_v1;
-- DROP TABLE tasks_v1;
-- DROP TABLE templates_v1;
-- DROP TABLE assignments_v1;
-- DROP TABLE assignmentProgress_v1;
-- DROP TABLE exams_v1;
-- DROP TABLE corrections_v1;
-- DROP TABLE strategies_v1;
-- DROP TABLE registrations_v1;
-- DROP TABLE stagePlans_v1;
-- DROP TABLE spacedReviews_v1;
-- DROP TABLE sync_backups_v1;
