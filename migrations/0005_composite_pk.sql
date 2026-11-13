-- 0005_composite_pk.sql
-- 业务表主键从 `id` 改为 `(workspace, id)`。
--
-- 背景：旧主键只有 `id`，写入用 `ON CONFLICT(id) DO UPDATE SET workspace = excluded.workspace`，
-- 第二个账户写入同名 id（粉笔派生 id 是确定性的，如 `ab-xingce-资料分析`）会把第一账户的行直接抢走。
-- 改成复合主键后，同一 id 可以在不同 workspace 下各自存在，冲突键也不再改写 workspace。
--
-- 部署顺序（推荐）：先发布兼容两种主键的新代码，再 apply 本迁移。
-- 新代码使用不带目标的 `ON CONFLICT DO UPDATE`，迁移前后都能写入；
-- 旧代码使用 `ON CONFLICT(id)`，在本迁移之后会因缺少 id 唯一约束而写入失败。
-- apply 前先做 D1 导出备份，apply 后核对 27 张表行数与 `PRAGMA table_info(<表名>)` 的 pk 列。
--
-- 结构：27 张业务表统一为 (workspace, id)，备份表为 (account_id, id)；索引保持不变。
-- 当前旧主键下不可能存在重复 id，数据可原样复制；重建只为替换主键约束。
--
-- 备份表一并改主键：id 是 ISO 时间戳，两个账户同一毫秒创建备份会撞唯一约束。

DROP TABLE IF EXISTS trainings_new;
CREATE TABLE trainings_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO trainings_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM trainings;
DROP TABLE trainings;
ALTER TABLE trainings_new RENAME TO trainings;
CREATE INDEX IF NOT EXISTS idx_trainings_workspace_updated ON trainings(workspace, updated_at);

DROP TABLE IF EXISTS gaps_new;
CREATE TABLE gaps_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO gaps_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM gaps;
DROP TABLE gaps;
ALTER TABLE gaps_new RENAME TO gaps;
CREATE INDEX IF NOT EXISTS idx_gaps_workspace_updated ON gaps(workspace, updated_at);

DROP TABLE IF EXISTS abilities_new;
CREATE TABLE abilities_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO abilities_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM abilities;
DROP TABLE abilities;
ALTER TABLE abilities_new RENAME TO abilities;
CREATE INDEX IF NOT EXISTS idx_abilities_workspace_updated ON abilities(workspace, updated_at);

DROP TABLE IF EXISTS students_new;
CREATE TABLE students_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO students_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM students;
DROP TABLE students;
ALTER TABLE students_new RENAME TO students;
CREATE INDEX IF NOT EXISTS idx_students_workspace_updated ON students(workspace, updated_at);

DROP TABLE IF EXISTS tasks_new;
CREATE TABLE tasks_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO tasks_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_updated ON tasks(workspace, updated_at);

DROP TABLE IF EXISTS templates_new;
CREATE TABLE templates_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO templates_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM templates;
DROP TABLE templates;
ALTER TABLE templates_new RENAME TO templates;
CREATE INDEX IF NOT EXISTS idx_templates_workspace_updated ON templates(workspace, updated_at);

DROP TABLE IF EXISTS assignments_new;
CREATE TABLE assignments_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO assignments_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM assignments;
DROP TABLE assignments;
ALTER TABLE assignments_new RENAME TO assignments;
CREATE INDEX IF NOT EXISTS idx_assignments_workspace_updated ON assignments(workspace, updated_at);

DROP TABLE IF EXISTS assignmentProgress_new;
CREATE TABLE assignmentProgress_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO assignmentProgress_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM assignmentProgress;
DROP TABLE assignmentProgress;
ALTER TABLE assignmentProgress_new RENAME TO assignmentProgress;
CREATE INDEX IF NOT EXISTS idx_assignmentProgress_workspace_updated ON assignmentProgress(workspace, updated_at);

DROP TABLE IF EXISTS exams_new;
CREATE TABLE exams_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO exams_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM exams;
DROP TABLE exams;
ALTER TABLE exams_new RENAME TO exams;
CREATE INDEX IF NOT EXISTS idx_exams_workspace_updated ON exams(workspace, updated_at);

DROP TABLE IF EXISTS corrections_new;
CREATE TABLE corrections_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO corrections_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM corrections;
DROP TABLE corrections;
ALTER TABLE corrections_new RENAME TO corrections;
CREATE INDEX IF NOT EXISTS idx_corrections_workspace_updated ON corrections(workspace, updated_at);

DROP TABLE IF EXISTS strategies_new;
CREATE TABLE strategies_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO strategies_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM strategies;
DROP TABLE strategies;
ALTER TABLE strategies_new RENAME TO strategies;
CREATE INDEX IF NOT EXISTS idx_strategies_workspace_updated ON strategies(workspace, updated_at);

DROP TABLE IF EXISTS registrations_new;
CREATE TABLE registrations_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO registrations_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM registrations;
DROP TABLE registrations;
ALTER TABLE registrations_new RENAME TO registrations;
CREATE INDEX IF NOT EXISTS idx_registrations_workspace_updated ON registrations(workspace, updated_at);

DROP TABLE IF EXISTS stagePlans_new;
CREATE TABLE stagePlans_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO stagePlans_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM stagePlans;
DROP TABLE stagePlans;
ALTER TABLE stagePlans_new RENAME TO stagePlans;
CREATE INDEX IF NOT EXISTS idx_stagePlans_workspace_updated ON stagePlans(workspace, updated_at);

DROP TABLE IF EXISTS spacedReviews_new;
CREATE TABLE spacedReviews_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO spacedReviews_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM spacedReviews;
DROP TABLE spacedReviews;
ALTER TABLE spacedReviews_new RENAME TO spacedReviews;
CREATE INDEX IF NOT EXISTS idx_spacedReviews_workspace_updated ON spacedReviews(workspace, updated_at);

DROP TABLE IF EXISTS pdcaProblems_new;
CREATE TABLE pdcaProblems_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO pdcaProblems_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM pdcaProblems;
DROP TABLE pdcaProblems;
ALTER TABLE pdcaProblems_new RENAME TO pdcaProblems;
CREATE INDEX IF NOT EXISTS idx_pdcaProblems_workspace_updated ON pdcaProblems(workspace, updated_at);

DROP TABLE IF EXISTS careerAssessments_new;
CREATE TABLE careerAssessments_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO careerAssessments_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM careerAssessments;
DROP TABLE careerAssessments;
ALTER TABLE careerAssessments_new RENAME TO careerAssessments;
CREATE INDEX IF NOT EXISTS idx_careerAssessments_workspace_updated ON careerAssessments(workspace, updated_at);

DROP TABLE IF EXISTS careerReports_new;
CREATE TABLE careerReports_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO careerReports_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM careerReports;
DROP TABLE careerReports;
ALTER TABLE careerReports_new RENAME TO careerReports;
CREATE INDEX IF NOT EXISTS idx_careerReports_workspace_updated ON careerReports(workspace, updated_at);

DROP TABLE IF EXISTS subjectiveAnswers_new;
CREATE TABLE subjectiveAnswers_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO subjectiveAnswers_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM subjectiveAnswers;
DROP TABLE subjectiveAnswers;
ALTER TABLE subjectiveAnswers_new RENAME TO subjectiveAnswers;
CREATE INDEX IF NOT EXISTS idx_subjectiveAnswers_workspace_updated ON subjectiveAnswers(workspace, updated_at);

DROP TABLE IF EXISTS interviewRecords_new;
CREATE TABLE interviewRecords_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO interviewRecords_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM interviewRecords;
DROP TABLE interviewRecords;
ALTER TABLE interviewRecords_new RENAME TO interviewRecords;
CREATE INDEX IF NOT EXISTS idx_interviewRecords_workspace_updated ON interviewRecords(workspace, updated_at);

DROP TABLE IF EXISTS pdcaArtifacts_new;
CREATE TABLE pdcaArtifacts_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO pdcaArtifacts_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM pdcaArtifacts;
DROP TABLE pdcaArtifacts;
ALTER TABLE pdcaArtifacts_new RENAME TO pdcaArtifacts;
CREATE INDEX IF NOT EXISTS idx_pdcaArtifacts_workspace_updated ON pdcaArtifacts(workspace, updated_at);

DROP TABLE IF EXISTS customTools_new;
CREATE TABLE customTools_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO customTools_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM customTools;
DROP TABLE customTools;
ALTER TABLE customTools_new RENAME TO customTools;
CREATE INDEX IF NOT EXISTS idx_customTools_workspace_updated ON customTools(workspace, updated_at);

DROP TABLE IF EXISTS weeklyChecklists_new;
CREATE TABLE weeklyChecklists_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO weeklyChecklists_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM weeklyChecklists;
DROP TABLE weeklyChecklists;
ALTER TABLE weeklyChecklists_new RENAME TO weeklyChecklists;
CREATE INDEX IF NOT EXISTS idx_weeklyChecklists_workspace_updated ON weeklyChecklists(workspace, updated_at);

DROP TABLE IF EXISTS collaborationEvents_new;
CREATE TABLE collaborationEvents_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO collaborationEvents_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM collaborationEvents;
DROP TABLE collaborationEvents;
ALTER TABLE collaborationEvents_new RENAME TO collaborationEvents;
CREATE INDEX IF NOT EXISTS idx_collaborationEvents_workspace_updated ON collaborationEvents(workspace, updated_at);

DROP TABLE IF EXISTS vetoOverrides_new;
CREATE TABLE vetoOverrides_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO vetoOverrides_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM vetoOverrides;
DROP TABLE vetoOverrides;
ALTER TABLE vetoOverrides_new RENAME TO vetoOverrides;
CREATE INDEX IF NOT EXISTS idx_vetoOverrides_workspace_updated ON vetoOverrides(workspace, updated_at);

DROP TABLE IF EXISTS careerObservationPoints_new;
CREATE TABLE careerObservationPoints_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO careerObservationPoints_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM careerObservationPoints;
DROP TABLE careerObservationPoints;
ALTER TABLE careerObservationPoints_new RENAME TO careerObservationPoints;
CREATE INDEX IF NOT EXISTS idx_careerObservationPoints_workspace_updated ON careerObservationPoints(workspace, updated_at);

DROP TABLE IF EXISTS careerRetestReflections_new;
CREATE TABLE careerRetestReflections_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO careerRetestReflections_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM careerRetestReflections;
DROP TABLE careerRetestReflections;
ALTER TABLE careerRetestReflections_new RENAME TO careerRetestReflections;
CREATE INDEX IF NOT EXISTS idx_careerRetestReflections_workspace_updated ON careerRetestReflections(workspace, updated_at);

DROP TABLE IF EXISTS labelStats_new;
CREATE TABLE labelStats_new (workspace TEXT NOT NULL DEFAULT '', id TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id));
INSERT INTO labelStats_new (workspace, id, updated_at, data) SELECT workspace, id, updated_at, data FROM labelStats;
DROP TABLE labelStats;
ALTER TABLE labelStats_new RENAME TO labelStats;
CREATE INDEX IF NOT EXISTS idx_labelStats_workspace_updated ON labelStats(workspace, updated_at);

DROP TABLE IF EXISTS sync_backups_new;
CREATE TABLE sync_backups_new (id TEXT NOT NULL, account_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (account_id, id));
INSERT INTO sync_backups_new (id, account_id, created_at, data) SELECT id, account_id, created_at, data FROM sync_backups;
DROP TABLE sync_backups;
ALTER TABLE sync_backups_new RENAME TO sync_backups;
CREATE INDEX IF NOT EXISTS idx_backups_account ON sync_backups(account_id, created_at);
