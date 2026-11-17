-- ============================================================
-- 存量记录字段补齐（业务字段的历史缺失）
--
-- 背景：errorCategories / paperQuestions / focusModules / rootCauses 这类字段是
-- 逐版加进来的，早期写入的记录里压根没有；类型上标成必填、运行时是 undefined，
-- 渲染期一 .length / for…of 就抛错 → React 卸载整棵树 → 整页白屏
-- （2026-11-17 首页 /；2026-11 上旬 PDCA 详情页）。
--
-- 读侧 src/services/recordNormalize.ts 已经兜底，页面不会再白屏；
-- 本迁移把库里的历史行也补齐，让导出 / 备份 / 其它端读到的也是完整结构。
--
-- 特性：
-- - 可重复执行：只对「缺失或类型不对」的行动手，第二遍影响 0 行
-- - 不动 updated_at 列：不改列表排序，也不会让客户端增量同步整批重拉
-- - 只补「必填却被裸用」的字段；可选字段（xxx?:）保持 undefined 语义
--
-- 执行：
--   npx wrangler d1 migrations apply ability_growth --remote
--   或 npx wrangler d1 execute ability_growth --remote --file migrations/0010_normalize_history_fields.sql
--
-- 体检先行：scripts/audit-dirty-data.sql 会给出每张表每个字段的脏行数与明细 id
-- ============================================================

-- ---------- trainings：错因数组 + 题量字段：首页错因热区直接遍历 errorCategories，题量参与求和 ----------

UPDATE trainings SET data = json_set(data, '$.errorCategories', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.errorCategories') IS NOT 'array';

UPDATE trainings SET data = json_set(data, '$.totalQuestions', CASE WHEN json_type(data, '$.totalQuestions') = 'text' AND CAST(json_extract(data, '$.totalQuestions') AS NUMERIC) <> 0
       THEN CAST(json_extract(data, '$.totalQuestions') AS NUMERIC) ELSE 0 END)
WHERE json_valid(data) = 1 AND COALESCE(json_type(data, '$.totalQuestions'), 'missing') NOT IN ('integer', 'real');

UPDATE trainings SET data = json_set(data, '$.errorCount', CASE WHEN json_type(data, '$.errorCount') = 'text' AND CAST(json_extract(data, '$.errorCount') AS NUMERIC) <> 0
       THEN CAST(json_extract(data, '$.errorCount') AS NUMERIC) ELSE 0 END)
WHERE json_valid(data) = 1 AND COALESCE(json_type(data, '$.errorCount'), 'missing') NOT IN ('integer', 'real');

UPDATE trainings SET data = json_set(data, '$.date', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.date') IS NOT 'text';

UPDATE trainings SET data = json_set(data, '$.subject', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.subject') IS NOT 'text';

-- correctCount 缺失：用「总题量 - 错题数」推导，避免历史训练显示 0 正确。
-- 必须排在同表其它字段补齐之后：题目数量先归位，这里才推得出正确数
UPDATE trainings
SET data = json_set(data, '$.correctCount',
  MAX(0, COALESCE(json_extract(data, '$.totalQuestions'), 0) - COALESCE(json_extract(data, '$.errorCount'), 0)))
WHERE json_valid(data) = 1
  AND COALESCE(json_type(data, '$.correctCount'), 'missing') NOT IN ('integer', 'real');

-- ---------- stagePlans：focusModules / focusAbilities 缺失 → 共享时间轴 useMemo 抛错 → 全站每个路由白屏 ----------

UPDATE stagePlans SET data = json_set(data, '$.focusModules', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.focusModules') IS NOT 'array';

UPDATE stagePlans SET data = json_set(data, '$.focusAbilities', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.focusAbilities') IS NOT 'array';

UPDATE stagePlans SET data = json_set(data, '$.startDate', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.startDate') IS NOT 'text';

UPDATE stagePlans SET data = json_set(data, '$.endDate', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.endDate') IS NOT 'text';

UPDATE stagePlans SET data = json_set(data, '$.stage', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.stage') IS NOT 'text';

-- ---------- gaps：abilityPath 被 split('/') 直接调用（瓶颈文案、雷达图） ----------

UPDATE gaps SET data = json_set(data, '$.sourceRecordIds', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.sourceRecordIds') IS NOT 'array';

UPDATE gaps SET data = json_set(data, '$.statusHistory', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.statusHistory') IS NOT 'array';

UPDATE gaps SET data = json_set(data, '$.abilityPath', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.abilityPath') IS NOT 'text';

UPDATE gaps SET data = json_set(data, '$.subject', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.subject') IS NOT 'text';

UPDATE gaps SET data = json_set(data, '$.status', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.status') IS NOT 'text';

UPDATE gaps SET data = json_set(data, '$.errorCategory', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.errorCategory') IS NOT 'text';

UPDATE gaps SET data = json_set(data, '$.occurrenceCount', CASE WHEN json_type(data, '$.occurrenceCount') = 'text' AND CAST(json_extract(data, '$.occurrenceCount') AS NUMERIC) <> 0
       THEN CAST(json_extract(data, '$.occurrenceCount') AS NUMERIC) ELSE 0 END)
WHERE json_valid(data) = 1 AND COALESCE(json_type(data, '$.occurrenceCount'), 'missing') NOT IN ('integer', 'real');

-- ---------- interviewRecords：problemTags 是历史兼容字段，早期记录没有 ----------

UPDATE interviewRecords SET data = json_set(data, '$.problemTags', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.problemTags') IS NOT 'array';

UPDATE interviewRecords SET data = json_set(data, '$.questionType', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.questionType') IS NOT 'text';

UPDATE interviewRecords SET data = json_set(data, '$.date', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.date') IS NOT 'text';

UPDATE interviewRecords SET data = json_set(data, '$.thinkingSec', CASE WHEN json_type(data, '$.thinkingSec') = 'text' AND CAST(json_extract(data, '$.thinkingSec') AS NUMERIC) <> 0
       THEN CAST(json_extract(data, '$.thinkingSec') AS NUMERIC) ELSE 0 END)
WHERE json_valid(data) = 1 AND COALESCE(json_type(data, '$.thinkingSec'), 'missing') NOT IN ('integer', 'real');

UPDATE interviewRecords SET data = json_set(data, '$.answerSec', CASE WHEN json_type(data, '$.answerSec') = 'text' AND CAST(json_extract(data, '$.answerSec') AS NUMERIC) <> 0
       THEN CAST(json_extract(data, '$.answerSec') AS NUMERIC) ELSE 0 END)
WHERE json_valid(data) = 1 AND COALESCE(json_type(data, '$.answerSec'), 'missing') NOT IN ('integer', 'real');

-- ---------- weeklyChecklists：entries 被 .length / .every 直接使用 ----------

UPDATE weeklyChecklists SET data = json_set(data, '$.entries', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.entries') IS NOT 'array';

UPDATE weeklyChecklists SET data = json_set(data, '$.weekStart', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.weekStart') IS NOT 'text';

-- ---------- customTools：appliesTo 被 .map 直接使用 ----------

UPDATE customTools SET data = json_set(data, '$.appliesTo', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.appliesTo') IS NOT 'array';

UPDATE customTools SET data = json_set(data, '$.name', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.name') IS NOT 'text';

UPDATE customTools SET data = json_set(data, '$.url', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.url') IS NOT 'text';

UPDATE customTools SET data = json_set(data, '$.embedType', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.embedType') IS NOT 'text';

-- ---------- careerReports：generatedAt 被 .slice(0,10) 裸用；routes 是嵌套对象 ----------

UPDATE careerReports SET data = json_set(data, '$.survivors', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.survivors') IS NOT 'array';

UPDATE careerReports SET data = json_set(data, '$.vetoed', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.vetoed') IS NOT 'array';

UPDATE careerReports SET data = json_set(data, '$.bottomLineNotes', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.bottomLineNotes') IS NOT 'array';

UPDATE careerReports SET data = json_set(data, '$.generatedAt', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.generatedAt') IS NOT 'text';

UPDATE careerReports SET data = json_set(data, '$.quadrant', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.quadrant') IS NOT 'text';

UPDATE careerReports SET data = json_set(data, '$.routes', json('{}'))
WHERE json_valid(data) = 1 AND json_type(data, '$.routes') IS NOT 'object';

-- ---------- spacedReviews：intervals 被 .length 直接使用（时间线页列出复习进度） ----------

UPDATE spacedReviews SET data = json_set(data, '$.intervals', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.intervals') IS NOT 'array';

UPDATE spacedReviews SET data = json_set(data, '$.completedDates', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.completedDates') IS NOT 'array';

UPDATE spacedReviews SET data = json_set(data, '$.abilityPath', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.abilityPath') IS NOT 'text';

UPDATE spacedReviews SET data = json_set(data, '$.nextDueDate', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.nextDueDate') IS NOT 'text';

UPDATE spacedReviews SET data = json_set(data, '$.status', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.status') IS NOT 'text';

UPDATE spacedReviews SET data = json_set(data, '$.currentIndex', CASE WHEN json_type(data, '$.currentIndex') = 'text' AND CAST(json_extract(data, '$.currentIndex') AS NUMERIC) <> 0
       THEN CAST(json_extract(data, '$.currentIndex') AS NUMERIC) ELSE 0 END)
WHERE json_valid(data) = 1 AND COALESCE(json_type(data, '$.currentIndex'), 'missing') NOT IN ('integer', 'real');

-- ---------- pdcaProblems：后加的四个数组字段，老记录没有 → PDCA 详情页白屏 ----------

UPDATE pdcaProblems SET data = json_set(data, '$.rootCauses', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.rootCauses') IS NOT 'array';

UPDATE pdcaProblems SET data = json_set(data, '$.countermeasures', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.countermeasures') IS NOT 'array';

UPDATE pdcaProblems SET data = json_set(data, '$.checkEntries', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.checkEntries') IS NOT 'array';

UPDATE pdcaProblems SET data = json_set(data, '$.cycleHistory', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.cycleHistory') IS NOT 'array';

UPDATE pdcaProblems SET data = json_set(data, '$.title', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.title') IS NOT 'text';

UPDATE pdcaProblems SET data = json_set(data, '$.currentStage', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.currentStage') IS NOT 'text';

-- ---------- corrections：problemTags / quickPhrases / relatedGapIds 直接渲染 ----------

UPDATE corrections SET data = json_set(data, '$.problemTags', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.problemTags') IS NOT 'array';

UPDATE corrections SET data = json_set(data, '$.quickPhrases', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.quickPhrases') IS NOT 'array';

UPDATE corrections SET data = json_set(data, '$.relatedGapIds', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.relatedGapIds') IS NOT 'array';

UPDATE corrections SET data = json_set(data, '$.scenario', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.scenario') IS NOT 'text';

UPDATE corrections SET data = json_set(data, '$.suggestion', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.suggestion') IS NOT 'text';

UPDATE corrections SET data = json_set(data, '$.date', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.date') IS NOT 'text';

-- ---------- students：subjects 参与列表与筛选 ----------

UPDATE students SET data = json_set(data, '$.subjects', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.subjects') IS NOT 'array';

UPDATE students SET data = json_set(data, '$.name', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.name') IS NOT 'text';

-- ---------- tasks：abilityPath 参与展示与过滤 ----------

UPDATE tasks SET data = json_set(data, '$.abilityPath', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.abilityPath') IS NOT 'text';

UPDATE tasks SET data = json_set(data, '$.status', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.status') IS NOT 'text';

UPDATE tasks SET data = json_set(data, '$.type', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.type') IS NOT 'text';

-- ---------- templates：name 用于下拉选项 ----------

UPDATE templates SET data = json_set(data, '$.name', '')
WHERE json_valid(data) = 1 AND json_type(data, '$.name') IS NOT 'text';

-- ---------- subjectiveAnswers：套卷整卷错因 + 分题错因（分题缺失会二次白屏） ----------
UPDATE subjectiveAnswers SET data = json_set(data, '$.errorCategories', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.errorCategories') IS NOT 'array';

UPDATE subjectiveAnswers SET data = json_set(data, '$.paperQuestions', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.paperQuestions') IS NOT 'array';

-- 套卷里的每道分题也要补 errorCategories：摊平后渲染错因区块会二次白屏
UPDATE subjectiveAnswers
SET data = json_set(data, '$.paperQuestions', (
  SELECT json_group_array(json(
    CASE
      WHEN json_type(item.value, '$.errorCategories') IS 'array' THEN item.value
      ELSE json_set(item.value, '$.errorCategories', json('[]'))
    END
  ))
  FROM json_each(json_extract(subjectiveAnswers.data, '$.paperQuestions')) AS item
))
WHERE json_valid(data) = 1
  AND json_type(data, '$.paperQuestions') = 'array'
  AND EXISTS (
    SELECT 1 FROM json_each(json_extract(subjectiveAnswers.data, '$.paperQuestions')) AS item
    WHERE json_type(item.value, '$.errorCategories') IS NOT 'array'
  );

-- ---------- 可选：让客户端 IndexedDB 镜像也重新拉一遍 ----------
-- 上面不动 updated_at，客户端镜像里仍是老数据（读侧已归一化，不会白屏）。
-- 若希望镜像也刷新成干净数据，执行下面这些（会改变列表的「最近更新」排序）：
-- UPDATE trainings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE subjectiveAnswers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE stagePlans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE gaps SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE interviewRecords SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE weeklyChecklists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE customTools SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE careerReports SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE spacedReviews SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE pdcaProblems SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE corrections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE students SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
-- UPDATE templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
