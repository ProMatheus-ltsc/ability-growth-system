-- ============================================================
-- 脏数据体检（只读，不修改任何数据）
-- 字段清单 = src/services/recordNormalize.ts 的归一化规则表：
-- 读侧兜底的字段，就是会让页面白屏的字段；这里查它们入库时的缺失情况。
--
-- 执行（一条一条语句跑，D1 会把每个语句的结果分别返回）：
--   npx wrangler d1 execute ability_growth --remote --file scripts/audit-dirty-data.sql
--   Cloudflare D1 控制台：把某一段贴进去执行即可
--
-- 判定口径：
--   array  → json_type 不是 array（缺失 / null / 字符串）
--   text   → json_type 不是 text（缺失 / null / 数字）
--   count  → 不是数字（缺失 / null / 字符串）
--   object → 不是 object（缺失 / null / 数组）
--   json_valid(data) = 0 也计为脏（JSON 本身坏了，最严重）
--
-- ⚠️ 每张表单独一条语句，是因为 D1 的 compound SELECT 项数上限极低
--    （实测 UNION ALL 超过 8 项就报 too many terms），不能跨表合并。
-- ============================================================

-- ============ 1. 总览：一张表一行 ============
-- rows=总行数，invalid_json=JSON 损坏行数，orphan_row=workspace 为空（永远读不到的孤儿行），
-- 其余列 = 该字段的脏行数。全 0 就是干净表。
SELECT 'trainings' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.errorCategories') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "errorCategories",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR COALESCE(json_type(data, '$.totalQuestions'), 'missing') NOT IN ('integer', 'real') THEN 1 ELSE 0 END), 0) AS "totalQuestions",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR COALESCE(json_type(data, '$.correctCount'), 'missing') NOT IN ('integer', 'real') THEN 1 ELSE 0 END), 0) AS "correctCount",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR COALESCE(json_type(data, '$.errorCount'), 'missing') NOT IN ('integer', 'real') THEN 1 ELSE 0 END), 0) AS "errorCount",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.date') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "date",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.subject') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "subject"
FROM trainings;

SELECT 'gaps' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.sourceRecordIds') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "sourceRecordIds",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.statusHistory') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "statusHistory",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.abilityPath') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "abilityPath",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.subject') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "subject",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.status') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "status",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.errorCategory') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "errorCategory",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR COALESCE(json_type(data, '$.occurrenceCount'), 'missing') NOT IN ('integer', 'real') THEN 1 ELSE 0 END), 0) AS "occurrenceCount"
FROM gaps;

SELECT 'abilities' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM abilities;

SELECT 'students' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.subjects') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "subjects",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.name') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "name"
FROM students;

SELECT 'tasks' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.abilityPath') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "abilityPath",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.status') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "status",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.type') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "type"
FROM tasks;

SELECT 'templates' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.name') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "name"
FROM templates;

SELECT 'assignments' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM assignments;

SELECT 'assignmentProgress' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM assignmentProgress;

SELECT 'exams' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM exams;

SELECT 'corrections' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.problemTags') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "problemTags",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.quickPhrases') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "quickPhrases",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.relatedGapIds') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "relatedGapIds",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.scenario') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "scenario",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.suggestion') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "suggestion",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.date') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "date"
FROM corrections;

SELECT 'strategies' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM strategies;

SELECT 'registrations' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM registrations;

SELECT 'stagePlans' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.focusModules') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "focusModules",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.focusAbilities') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "focusAbilities",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.startDate') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "startDate",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.endDate') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "endDate",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.stage') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "stage"
FROM stagePlans;

SELECT 'spacedReviews' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.intervals') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "intervals",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.completedDates') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "completedDates",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.abilityPath') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "abilityPath",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.nextDueDate') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "nextDueDate",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.status') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "status",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR COALESCE(json_type(data, '$.currentIndex'), 'missing') NOT IN ('integer', 'real') THEN 1 ELSE 0 END), 0) AS "currentIndex"
FROM spacedReviews;

SELECT 'pdcaProblems' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.rootCauses') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "rootCauses",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.countermeasures') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "countermeasures",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.checkEntries') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "checkEntries",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.cycleHistory') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "cycleHistory",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.title') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "title",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.currentStage') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "currentStage"
FROM pdcaProblems;

SELECT 'careerAssessments' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM careerAssessments;

SELECT 'careerReports' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.survivors') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "survivors",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.vetoed') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "vetoed",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.bottomLineNotes') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "bottomLineNotes",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.generatedAt') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "generatedAt",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.quadrant') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "quadrant",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.routes') IS NOT 'object' THEN 1 ELSE 0 END), 0) AS "routes"
FROM careerReports;

SELECT 'subjectiveAnswers' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.errorCategories') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "errorCategories",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.paperQuestions') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "paperQuestions"
FROM subjectiveAnswers;

SELECT 'interviewRecords' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.problemTags') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "problemTags",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.questionType') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "questionType",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.date') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "date",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR COALESCE(json_type(data, '$.thinkingSec'), 'missing') NOT IN ('integer', 'real') THEN 1 ELSE 0 END), 0) AS "thinkingSec",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR COALESCE(json_type(data, '$.answerSec'), 'missing') NOT IN ('integer', 'real') THEN 1 ELSE 0 END), 0) AS "answerSec"
FROM interviewRecords;

SELECT 'pdcaArtifacts' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM pdcaArtifacts;

SELECT 'customTools' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.appliesTo') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "appliesTo",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.name') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "name",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.url') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "url",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.embedType') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "embedType"
FROM customTools;

SELECT 'weeklyChecklists' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.entries') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "entries",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.weekStart') IS NOT 'text' THEN 1 ELSE 0 END), 0) AS "weekStart"
FROM weeklyChecklists;

SELECT 'collaborationEvents' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM collaborationEvents;

SELECT 'vetoOverrides' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM vetoOverrides;

SELECT 'careerObservationPoints' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM careerObservationPoints;

SELECT 'careerRetestReflections' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM careerRetestReflections;

-- ============ 2. 明细：脏行缺了哪些字段（按 id 定位，可直接改） ============
-- 最后一条是套卷分题（paperQuestions[].errorCategories），嵌套在数组里，单列出来
SELECT 'trainings' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.errorCategories') IS NOT 'array' THEN 'errorCategories ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.totalQuestions'), 'missing') NOT IN ('integer', 'real') THEN 'totalQuestions ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.correctCount'), 'missing') NOT IN ('integer', 'real') THEN 'correctCount ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.errorCount'), 'missing') NOT IN ('integer', 'real') THEN 'errorCount ' ELSE '' END || CASE WHEN json_type(data, '$.date') IS NOT 'text' THEN 'date ' ELSE '' END || CASE WHEN json_type(data, '$.subject') IS NOT 'text' THEN 'subject ' ELSE '' END) AS missing_fields
FROM trainings
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.errorCategories') IS NOT 'array' THEN 'errorCategories ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.totalQuestions'), 'missing') NOT IN ('integer', 'real') THEN 'totalQuestions ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.correctCount'), 'missing') NOT IN ('integer', 'real') THEN 'correctCount ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.errorCount'), 'missing') NOT IN ('integer', 'real') THEN 'errorCount ' ELSE '' END || CASE WHEN json_type(data, '$.date') IS NOT 'text' THEN 'date ' ELSE '' END || CASE WHEN json_type(data, '$.subject') IS NOT 'text' THEN 'subject ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'subjectiveAnswers' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.errorCategories') IS NOT 'array' THEN 'errorCategories ' ELSE '' END || CASE WHEN json_type(data, '$.paperQuestions') IS NOT 'array' THEN 'paperQuestions ' ELSE '' END) AS missing_fields
FROM subjectiveAnswers
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.errorCategories') IS NOT 'array' THEN 'errorCategories ' ELSE '' END || CASE WHEN json_type(data, '$.paperQuestions') IS NOT 'array' THEN 'paperQuestions ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'stagePlans' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.focusModules') IS NOT 'array' THEN 'focusModules ' ELSE '' END || CASE WHEN json_type(data, '$.focusAbilities') IS NOT 'array' THEN 'focusAbilities ' ELSE '' END || CASE WHEN json_type(data, '$.startDate') IS NOT 'text' THEN 'startDate ' ELSE '' END || CASE WHEN json_type(data, '$.endDate') IS NOT 'text' THEN 'endDate ' ELSE '' END || CASE WHEN json_type(data, '$.stage') IS NOT 'text' THEN 'stage ' ELSE '' END) AS missing_fields
FROM stagePlans
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.focusModules') IS NOT 'array' THEN 'focusModules ' ELSE '' END || CASE WHEN json_type(data, '$.focusAbilities') IS NOT 'array' THEN 'focusAbilities ' ELSE '' END || CASE WHEN json_type(data, '$.startDate') IS NOT 'text' THEN 'startDate ' ELSE '' END || CASE WHEN json_type(data, '$.endDate') IS NOT 'text' THEN 'endDate ' ELSE '' END || CASE WHEN json_type(data, '$.stage') IS NOT 'text' THEN 'stage ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'gaps' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.sourceRecordIds') IS NOT 'array' THEN 'sourceRecordIds ' ELSE '' END || CASE WHEN json_type(data, '$.statusHistory') IS NOT 'array' THEN 'statusHistory ' ELSE '' END || CASE WHEN json_type(data, '$.abilityPath') IS NOT 'text' THEN 'abilityPath ' ELSE '' END || CASE WHEN json_type(data, '$.subject') IS NOT 'text' THEN 'subject ' ELSE '' END || CASE WHEN json_type(data, '$.status') IS NOT 'text' THEN 'status ' ELSE '' END || CASE WHEN json_type(data, '$.errorCategory') IS NOT 'text' THEN 'errorCategory ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.occurrenceCount'), 'missing') NOT IN ('integer', 'real') THEN 'occurrenceCount ' ELSE '' END) AS missing_fields
FROM gaps
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.sourceRecordIds') IS NOT 'array' THEN 'sourceRecordIds ' ELSE '' END || CASE WHEN json_type(data, '$.statusHistory') IS NOT 'array' THEN 'statusHistory ' ELSE '' END || CASE WHEN json_type(data, '$.abilityPath') IS NOT 'text' THEN 'abilityPath ' ELSE '' END || CASE WHEN json_type(data, '$.subject') IS NOT 'text' THEN 'subject ' ELSE '' END || CASE WHEN json_type(data, '$.status') IS NOT 'text' THEN 'status ' ELSE '' END || CASE WHEN json_type(data, '$.errorCategory') IS NOT 'text' THEN 'errorCategory ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.occurrenceCount'), 'missing') NOT IN ('integer', 'real') THEN 'occurrenceCount ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'interviewRecords' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.problemTags') IS NOT 'array' THEN 'problemTags ' ELSE '' END || CASE WHEN json_type(data, '$.questionType') IS NOT 'text' THEN 'questionType ' ELSE '' END || CASE WHEN json_type(data, '$.date') IS NOT 'text' THEN 'date ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.thinkingSec'), 'missing') NOT IN ('integer', 'real') THEN 'thinkingSec ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.answerSec'), 'missing') NOT IN ('integer', 'real') THEN 'answerSec ' ELSE '' END) AS missing_fields
FROM interviewRecords
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.problemTags') IS NOT 'array' THEN 'problemTags ' ELSE '' END || CASE WHEN json_type(data, '$.questionType') IS NOT 'text' THEN 'questionType ' ELSE '' END || CASE WHEN json_type(data, '$.date') IS NOT 'text' THEN 'date ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.thinkingSec'), 'missing') NOT IN ('integer', 'real') THEN 'thinkingSec ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.answerSec'), 'missing') NOT IN ('integer', 'real') THEN 'answerSec ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'weeklyChecklists' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.entries') IS NOT 'array' THEN 'entries ' ELSE '' END || CASE WHEN json_type(data, '$.weekStart') IS NOT 'text' THEN 'weekStart ' ELSE '' END) AS missing_fields
FROM weeklyChecklists
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.entries') IS NOT 'array' THEN 'entries ' ELSE '' END || CASE WHEN json_type(data, '$.weekStart') IS NOT 'text' THEN 'weekStart ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'customTools' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.appliesTo') IS NOT 'array' THEN 'appliesTo ' ELSE '' END || CASE WHEN json_type(data, '$.name') IS NOT 'text' THEN 'name ' ELSE '' END || CASE WHEN json_type(data, '$.url') IS NOT 'text' THEN 'url ' ELSE '' END || CASE WHEN json_type(data, '$.embedType') IS NOT 'text' THEN 'embedType ' ELSE '' END) AS missing_fields
FROM customTools
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.appliesTo') IS NOT 'array' THEN 'appliesTo ' ELSE '' END || CASE WHEN json_type(data, '$.name') IS NOT 'text' THEN 'name ' ELSE '' END || CASE WHEN json_type(data, '$.url') IS NOT 'text' THEN 'url ' ELSE '' END || CASE WHEN json_type(data, '$.embedType') IS NOT 'text' THEN 'embedType ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'careerReports' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.survivors') IS NOT 'array' THEN 'survivors ' ELSE '' END || CASE WHEN json_type(data, '$.vetoed') IS NOT 'array' THEN 'vetoed ' ELSE '' END || CASE WHEN json_type(data, '$.bottomLineNotes') IS NOT 'array' THEN 'bottomLineNotes ' ELSE '' END || CASE WHEN json_type(data, '$.generatedAt') IS NOT 'text' THEN 'generatedAt ' ELSE '' END || CASE WHEN json_type(data, '$.quadrant') IS NOT 'text' THEN 'quadrant ' ELSE '' END || CASE WHEN json_type(data, '$.routes') IS NOT 'object' THEN 'routes ' ELSE '' END) AS missing_fields
FROM careerReports
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.survivors') IS NOT 'array' THEN 'survivors ' ELSE '' END || CASE WHEN json_type(data, '$.vetoed') IS NOT 'array' THEN 'vetoed ' ELSE '' END || CASE WHEN json_type(data, '$.bottomLineNotes') IS NOT 'array' THEN 'bottomLineNotes ' ELSE '' END || CASE WHEN json_type(data, '$.generatedAt') IS NOT 'text' THEN 'generatedAt ' ELSE '' END || CASE WHEN json_type(data, '$.quadrant') IS NOT 'text' THEN 'quadrant ' ELSE '' END || CASE WHEN json_type(data, '$.routes') IS NOT 'object' THEN 'routes ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'spacedReviews' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.intervals') IS NOT 'array' THEN 'intervals ' ELSE '' END || CASE WHEN json_type(data, '$.completedDates') IS NOT 'array' THEN 'completedDates ' ELSE '' END || CASE WHEN json_type(data, '$.abilityPath') IS NOT 'text' THEN 'abilityPath ' ELSE '' END || CASE WHEN json_type(data, '$.nextDueDate') IS NOT 'text' THEN 'nextDueDate ' ELSE '' END || CASE WHEN json_type(data, '$.status') IS NOT 'text' THEN 'status ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.currentIndex'), 'missing') NOT IN ('integer', 'real') THEN 'currentIndex ' ELSE '' END) AS missing_fields
FROM spacedReviews
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.intervals') IS NOT 'array' THEN 'intervals ' ELSE '' END || CASE WHEN json_type(data, '$.completedDates') IS NOT 'array' THEN 'completedDates ' ELSE '' END || CASE WHEN json_type(data, '$.abilityPath') IS NOT 'text' THEN 'abilityPath ' ELSE '' END || CASE WHEN json_type(data, '$.nextDueDate') IS NOT 'text' THEN 'nextDueDate ' ELSE '' END || CASE WHEN json_type(data, '$.status') IS NOT 'text' THEN 'status ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.currentIndex'), 'missing') NOT IN ('integer', 'real') THEN 'currentIndex ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'pdcaProblems' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.rootCauses') IS NOT 'array' THEN 'rootCauses ' ELSE '' END || CASE WHEN json_type(data, '$.countermeasures') IS NOT 'array' THEN 'countermeasures ' ELSE '' END || CASE WHEN json_type(data, '$.checkEntries') IS NOT 'array' THEN 'checkEntries ' ELSE '' END || CASE WHEN json_type(data, '$.cycleHistory') IS NOT 'array' THEN 'cycleHistory ' ELSE '' END || CASE WHEN json_type(data, '$.title') IS NOT 'text' THEN 'title ' ELSE '' END || CASE WHEN json_type(data, '$.currentStage') IS NOT 'text' THEN 'currentStage ' ELSE '' END) AS missing_fields
FROM pdcaProblems
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.rootCauses') IS NOT 'array' THEN 'rootCauses ' ELSE '' END || CASE WHEN json_type(data, '$.countermeasures') IS NOT 'array' THEN 'countermeasures ' ELSE '' END || CASE WHEN json_type(data, '$.checkEntries') IS NOT 'array' THEN 'checkEntries ' ELSE '' END || CASE WHEN json_type(data, '$.cycleHistory') IS NOT 'array' THEN 'cycleHistory ' ELSE '' END || CASE WHEN json_type(data, '$.title') IS NOT 'text' THEN 'title ' ELSE '' END || CASE WHEN json_type(data, '$.currentStage') IS NOT 'text' THEN 'currentStage ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'corrections' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.problemTags') IS NOT 'array' THEN 'problemTags ' ELSE '' END || CASE WHEN json_type(data, '$.quickPhrases') IS NOT 'array' THEN 'quickPhrases ' ELSE '' END || CASE WHEN json_type(data, '$.relatedGapIds') IS NOT 'array' THEN 'relatedGapIds ' ELSE '' END || CASE WHEN json_type(data, '$.scenario') IS NOT 'text' THEN 'scenario ' ELSE '' END || CASE WHEN json_type(data, '$.suggestion') IS NOT 'text' THEN 'suggestion ' ELSE '' END || CASE WHEN json_type(data, '$.date') IS NOT 'text' THEN 'date ' ELSE '' END) AS missing_fields
FROM corrections
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.problemTags') IS NOT 'array' THEN 'problemTags ' ELSE '' END || CASE WHEN json_type(data, '$.quickPhrases') IS NOT 'array' THEN 'quickPhrases ' ELSE '' END || CASE WHEN json_type(data, '$.relatedGapIds') IS NOT 'array' THEN 'relatedGapIds ' ELSE '' END || CASE WHEN json_type(data, '$.scenario') IS NOT 'text' THEN 'scenario ' ELSE '' END || CASE WHEN json_type(data, '$.suggestion') IS NOT 'text' THEN 'suggestion ' ELSE '' END || CASE WHEN json_type(data, '$.date') IS NOT 'text' THEN 'date ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'students' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.subjects') IS NOT 'array' THEN 'subjects ' ELSE '' END || CASE WHEN json_type(data, '$.name') IS NOT 'text' THEN 'name ' ELSE '' END) AS missing_fields
FROM students
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.subjects') IS NOT 'array' THEN 'subjects ' ELSE '' END || CASE WHEN json_type(data, '$.name') IS NOT 'text' THEN 'name ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'tasks' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.abilityPath') IS NOT 'text' THEN 'abilityPath ' ELSE '' END || CASE WHEN json_type(data, '$.status') IS NOT 'text' THEN 'status ' ELSE '' END || CASE WHEN json_type(data, '$.type') IS NOT 'text' THEN 'type ' ELSE '' END) AS missing_fields
FROM tasks
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.abilityPath') IS NOT 'text' THEN 'abilityPath ' ELSE '' END || CASE WHEN json_type(data, '$.status') IS NOT 'text' THEN 'status ' ELSE '' END || CASE WHEN json_type(data, '$.type') IS NOT 'text' THEN 'type ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'templates' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.name') IS NOT 'text' THEN 'name ' ELSE '' END) AS missing_fields
FROM templates
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.name') IS NOT 'text' THEN 'name ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'subjectiveAnswers' AS tbl, workspace, id, length(data) AS chars,
       'paperQuestions[].errorCategories' AS missing_fields
FROM subjectiveAnswers
WHERE json_valid(data) = 1
  AND json_type(data, '$.paperQuestions') = 'array'
  AND EXISTS (
    SELECT 1 FROM json_each(json_extract(subjectiveAnswers.data, '$.paperQuestions')) AS item
    WHERE json_type(item.value, '$.errorCategories') IS NOT 'array'
  )
ORDER BY id;
