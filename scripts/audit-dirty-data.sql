-- ============================================================
-- 脏数据体检（只读，不修改任何数据）
-- 字段清单与 src/services/recordNormalize.ts 的规则表一致。
--
-- 只查「缺失会崩」的两类字段：
--   array → 类型是 T[]，且被 .map / .length / for…of 裸调用，缺了直接抛异常
--   count → 有业务下界的计数（gaps.occurrenceCount 至少 1；spacedReviews.currentIndex 从 0 起）
-- 不查文本字段与普通数字：那些缺失是「未知」，补 0 / 空串会把未知伪装成真实值
-- （totalQuestions 补 0 会进分母拉低正确率；status 补 '' 会落进「其他」分组）。
-- 这类字段的正确做法是统计层排除分母、展示层显示「未知」，见 analytics.ts 的
-- questionCountOf / errorCountOf。
--
-- 执行：
--   npm run db:audit
--   npx wrangler d1 execute ability_growth --remote --file scripts/audit-dirty-data.sql
--
-- ⚠️ 每张表单独一条语句：D1 的 compound SELECT 项数上限极低（实测 UNION ALL 超过 8 项就报错）。
-- ============================================================

-- ============ 1. 总览：一张表一行 ============
-- rows=总行数，invalid_json=JSON 损坏，orphan_row=workspace 为空（永远读不到的孤儿行），
-- 其余列 = 该字段的脏行数。全 0 就是干净表。
SELECT 'trainings' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.errorCategories') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "errorCategories"
FROM trainings;

SELECT 'gaps' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.sourceRecordIds') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "sourceRecordIds",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.statusHistory') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "statusHistory",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR COALESCE(json_type(data, '$.occurrenceCount'), 'missing') NOT IN ('integer', 'real') THEN 1 ELSE 0 END), 0) AS "occurrenceCount"
FROM gaps;

SELECT 'abilities' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM abilities;

SELECT 'students' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.subjects') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "subjects"
FROM students;

SELECT 'tasks' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM tasks;

SELECT 'templates' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
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
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.relatedGapIds') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "relatedGapIds"
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
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.focusAbilities') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "focusAbilities"
FROM stagePlans;

SELECT 'spacedReviews' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.intervals') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "intervals",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.completedDates') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "completedDates",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR COALESCE(json_type(data, '$.currentIndex'), 'missing') NOT IN ('integer', 'real') THEN 1 ELSE 0 END), 0) AS "currentIndex"
FROM spacedReviews;

SELECT 'pdcaProblems' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.rootCauses') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "rootCauses",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.countermeasures') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "countermeasures",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.checkEntries') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "checkEntries",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.cycleHistory') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "cycleHistory"
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
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.problemTags') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "problemTags"
FROM interviewRecords;

SELECT 'pdcaArtifacts' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row"
FROM pdcaArtifacts;

SELECT 'customTools' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.appliesTo') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "appliesTo"
FROM customTools;

SELECT 'weeklyChecklists' AS tbl, COUNT(*) AS rows,
COALESCE(SUM(CASE WHEN json_valid(data) = 0 THEN 1 ELSE 0 END), 0) AS "invalid_json",
COALESCE(SUM(CASE WHEN workspace = '' THEN 1 ELSE 0 END), 0) AS "orphan_row",
COALESCE(SUM(CASE WHEN json_valid(data) = 0 OR json_type(data, '$.entries') IS NOT 'array' THEN 1 ELSE 0 END), 0) AS "entries"
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

-- ============ 2. 明细：脏行缺了哪些字段（按 id 定位） ============
SELECT 'trainings' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.errorCategories') IS NOT 'array' THEN 'errorCategories ' ELSE '' END) AS missing_fields
FROM trainings
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.errorCategories') IS NOT 'array' THEN 'errorCategories ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'subjectiveAnswers' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.errorCategories') IS NOT 'array' THEN 'errorCategories ' ELSE '' END || CASE WHEN json_type(data, '$.paperQuestions') IS NOT 'array' THEN 'paperQuestions ' ELSE '' END) AS missing_fields
FROM subjectiveAnswers
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.errorCategories') IS NOT 'array' THEN 'errorCategories ' ELSE '' END || CASE WHEN json_type(data, '$.paperQuestions') IS NOT 'array' THEN 'paperQuestions ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'stagePlans' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.focusModules') IS NOT 'array' THEN 'focusModules ' ELSE '' END || CASE WHEN json_type(data, '$.focusAbilities') IS NOT 'array' THEN 'focusAbilities ' ELSE '' END) AS missing_fields
FROM stagePlans
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.focusModules') IS NOT 'array' THEN 'focusModules ' ELSE '' END || CASE WHEN json_type(data, '$.focusAbilities') IS NOT 'array' THEN 'focusAbilities ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'gaps' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.sourceRecordIds') IS NOT 'array' THEN 'sourceRecordIds ' ELSE '' END || CASE WHEN json_type(data, '$.statusHistory') IS NOT 'array' THEN 'statusHistory ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.occurrenceCount'), 'missing') NOT IN ('integer', 'real') THEN 'occurrenceCount ' ELSE '' END) AS missing_fields
FROM gaps
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.sourceRecordIds') IS NOT 'array' THEN 'sourceRecordIds ' ELSE '' END || CASE WHEN json_type(data, '$.statusHistory') IS NOT 'array' THEN 'statusHistory ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.occurrenceCount'), 'missing') NOT IN ('integer', 'real') THEN 'occurrenceCount ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'interviewRecords' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.problemTags') IS NOT 'array' THEN 'problemTags ' ELSE '' END) AS missing_fields
FROM interviewRecords
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.problemTags') IS NOT 'array' THEN 'problemTags ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'weeklyChecklists' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.entries') IS NOT 'array' THEN 'entries ' ELSE '' END) AS missing_fields
FROM weeklyChecklists
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.entries') IS NOT 'array' THEN 'entries ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'customTools' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.appliesTo') IS NOT 'array' THEN 'appliesTo ' ELSE '' END) AS missing_fields
FROM customTools
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.appliesTo') IS NOT 'array' THEN 'appliesTo ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'careerReports' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.survivors') IS NOT 'array' THEN 'survivors ' ELSE '' END || CASE WHEN json_type(data, '$.vetoed') IS NOT 'array' THEN 'vetoed ' ELSE '' END || CASE WHEN json_type(data, '$.bottomLineNotes') IS NOT 'array' THEN 'bottomLineNotes ' ELSE '' END || CASE WHEN json_type(data, '$.routes') IS NOT 'object' THEN 'routes ' ELSE '' END) AS missing_fields
FROM careerReports
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.survivors') IS NOT 'array' THEN 'survivors ' ELSE '' END || CASE WHEN json_type(data, '$.vetoed') IS NOT 'array' THEN 'vetoed ' ELSE '' END || CASE WHEN json_type(data, '$.bottomLineNotes') IS NOT 'array' THEN 'bottomLineNotes ' ELSE '' END || CASE WHEN json_type(data, '$.routes') IS NOT 'object' THEN 'routes ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'spacedReviews' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.intervals') IS NOT 'array' THEN 'intervals ' ELSE '' END || CASE WHEN json_type(data, '$.completedDates') IS NOT 'array' THEN 'completedDates ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.currentIndex'), 'missing') NOT IN ('integer', 'real') THEN 'currentIndex ' ELSE '' END) AS missing_fields
FROM spacedReviews
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.intervals') IS NOT 'array' THEN 'intervals ' ELSE '' END || CASE WHEN json_type(data, '$.completedDates') IS NOT 'array' THEN 'completedDates ' ELSE '' END || CASE WHEN COALESCE(json_type(data, '$.currentIndex'), 'missing') NOT IN ('integer', 'real') THEN 'currentIndex ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'pdcaProblems' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.rootCauses') IS NOT 'array' THEN 'rootCauses ' ELSE '' END || CASE WHEN json_type(data, '$.countermeasures') IS NOT 'array' THEN 'countermeasures ' ELSE '' END || CASE WHEN json_type(data, '$.checkEntries') IS NOT 'array' THEN 'checkEntries ' ELSE '' END || CASE WHEN json_type(data, '$.cycleHistory') IS NOT 'array' THEN 'cycleHistory ' ELSE '' END) AS missing_fields
FROM pdcaProblems
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.rootCauses') IS NOT 'array' THEN 'rootCauses ' ELSE '' END || CASE WHEN json_type(data, '$.countermeasures') IS NOT 'array' THEN 'countermeasures ' ELSE '' END || CASE WHEN json_type(data, '$.checkEntries') IS NOT 'array' THEN 'checkEntries ' ELSE '' END || CASE WHEN json_type(data, '$.cycleHistory') IS NOT 'array' THEN 'cycleHistory ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'corrections' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.problemTags') IS NOT 'array' THEN 'problemTags ' ELSE '' END || CASE WHEN json_type(data, '$.quickPhrases') IS NOT 'array' THEN 'quickPhrases ' ELSE '' END || CASE WHEN json_type(data, '$.relatedGapIds') IS NOT 'array' THEN 'relatedGapIds ' ELSE '' END) AS missing_fields
FROM corrections
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.problemTags') IS NOT 'array' THEN 'problemTags ' ELSE '' END || CASE WHEN json_type(data, '$.quickPhrases') IS NOT 'array' THEN 'quickPhrases ' ELSE '' END || CASE WHEN json_type(data, '$.relatedGapIds') IS NOT 'array' THEN 'relatedGapIds ' ELSE '' END) <> ''
ORDER BY missing_fields, id;

SELECT 'students' AS tbl, workspace, id, length(data) AS chars,
       trim(CASE WHEN json_type(data, '$.subjects') IS NOT 'array' THEN 'subjects ' ELSE '' END) AS missing_fields
FROM students
WHERE json_valid(data) = 1 AND trim(CASE WHEN json_type(data, '$.subjects') IS NOT 'array' THEN 'subjects ' ELSE '' END) <> ''
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
