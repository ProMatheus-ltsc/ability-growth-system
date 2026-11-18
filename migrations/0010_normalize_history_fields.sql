-- ============================================================
-- 存量记录结构补齐（**只补会崩的数组与有下界的计数，不伪造业务值**）
--
-- 背景：errorCategories / rootCauses / focusModules 这类字段是逐版加进来的，
-- 早期记录里压根没有；类型上标成必填，运行时 undefined，渲染期一 .length / for…of
-- 就抛错 → React 卸载整棵树 → 整页白屏（2026-11-17 首页、2026-11 上旬 PDCA 详情）。
--
-- 为什么不再「统一补 0 / 空串」（2026-11-18 修订）：
--   缺失的 totalQuestions 补 0 → 这条记录照样进分母，把整科正确率拉低；
--   缺失的 status / stage 补 '' → 落进「其他」分组，和真正的「未分类」混在一起；
--   缺失的 occurrenceCount 补 0 → 缺口权重归零，严重缺口从排行里消失。
--   项目既有契约本来就是「缺失不当 0、不进入加权分母」（tests/dataContract.test.ts），
--   所以这里只做两件事：
--     1) 数组补 []：没有条目就是空集合，语义正确，且挡住裸调用；
--     2) 有业务下界的计数补真值：occurrenceCount = 1、currentIndex = 0、
--        correctCount = totalQuestions - errorCount（可验算）。
--   文本与普通数字保持缺失，由统计层排除、展示层显示「未知」。
--
-- 特性：
-- - 可重复执行：只对「缺失或类型不对」的行动手，第二遍影响 0 行
-- - 不动 updated_at 列：不改列表排序，也不会让客户端增量同步整批重拉
--
-- 执行：
--   npm run db:migrate:remote
--   或 npx wrangler d1 execute ability_growth --remote --file migrations/0010_normalize_history_fields.sql
--
-- 体检先行：npm run db:audit
-- ============================================================

-- ---------- trainings：错因数组：首页错因热区直接遍历 errorCategories ----------

UPDATE trainings SET data = json_set(data, '$.errorCategories', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.errorCategories') IS NOT 'array';

-- correctCount 不补 0：只有「总题量 - 错题数」两个输入都有效时才验算，否则保持缺失。
-- 补 0 会让历史训练显示「正确 0 题」，也会污染正确率。
UPDATE trainings
SET data = json_set(data, '$.correctCount',
  MAX(0, CAST(json_extract(data, '$.totalQuestions') AS INTEGER) - CAST(json_extract(data, '$.errorCount') AS INTEGER)))
WHERE json_valid(data) = 1
  AND COALESCE(json_type(data, '$.correctCount'), 'missing') NOT IN ('integer', 'real')
  AND COALESCE(json_type(data, '$.totalQuestions'), 'missing') IN ('integer', 'real')
  AND COALESCE(json_type(data, '$.errorCount'), 'missing') IN ('integer', 'real');

-- ---------- stagePlans：focusModules / focusAbilities 缺失 → 共享时间轴 useMemo 抛错 → 全站每个路由白屏 ----------

UPDATE stagePlans SET data = json_set(data, '$.focusModules', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.focusModules') IS NOT 'array';

UPDATE stagePlans SET data = json_set(data, '$.focusAbilities', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.focusAbilities') IS NOT 'array';

-- ---------- gaps：sourceRecordIds / statusHistory 被直接渲染；occurrenceCount 是缺口权重，缺失按 1（新建时就是 1） ----------

UPDATE gaps SET data = json_set(data, '$.sourceRecordIds', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.sourceRecordIds') IS NOT 'array';

UPDATE gaps SET data = json_set(data, '$.statusHistory', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.statusHistory') IS NOT 'array';

UPDATE gaps SET data = json_set(data, '$.occurrenceCount', 1)
WHERE json_valid(data) = 1 AND COALESCE(json_type(data, '$.occurrenceCount'), 'missing') NOT IN ('integer', 'real');

-- ---------- interviewRecords：problemTags 是历史兼容字段，早期记录没有 ----------

UPDATE interviewRecords SET data = json_set(data, '$.problemTags', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.problemTags') IS NOT 'array';

-- ---------- weeklyChecklists：entries 被 .length / .every 直接使用 ----------

UPDATE weeklyChecklists SET data = json_set(data, '$.entries', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.entries') IS NOT 'array';

-- ---------- customTools：appliesTo 被 .map 直接使用 ----------

UPDATE customTools SET data = json_set(data, '$.appliesTo', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.appliesTo') IS NOT 'array';

-- ---------- careerReports：survivors / vetoed / bottomLineNotes 直接渲染；routes 是嵌套对象 ----------

UPDATE careerReports SET data = json_set(data, '$.survivors', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.survivors') IS NOT 'array';

UPDATE careerReports SET data = json_set(data, '$.vetoed', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.vetoed') IS NOT 'array';

UPDATE careerReports SET data = json_set(data, '$.bottomLineNotes', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.bottomLineNotes') IS NOT 'array';

UPDATE careerReports SET data = json_set(data, '$.routes', json('{}'))
WHERE json_valid(data) = 1 AND json_type(data, '$.routes') IS NOT 'object';

-- ---------- spacedReviews：intervals 被 .length 直接使用；currentIndex 未开始时确实是 0 ----------

UPDATE spacedReviews SET data = json_set(data, '$.intervals', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.intervals') IS NOT 'array';

UPDATE spacedReviews SET data = json_set(data, '$.completedDates', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.completedDates') IS NOT 'array';

UPDATE spacedReviews SET data = json_set(data, '$.currentIndex', 0)
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

-- ---------- corrections：problemTags / quickPhrases / relatedGapIds 直接渲染 ----------

UPDATE corrections SET data = json_set(data, '$.problemTags', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.problemTags') IS NOT 'array';

UPDATE corrections SET data = json_set(data, '$.quickPhrases', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.quickPhrases') IS NOT 'array';

UPDATE corrections SET data = json_set(data, '$.relatedGapIds', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.relatedGapIds') IS NOT 'array';

-- ---------- students：subjects 参与列表与筛选 ----------

UPDATE students SET data = json_set(data, '$.subjects', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.subjects') IS NOT 'array';

-- ---------- subjectiveAnswers：套卷整卷错因 + 分题错因（分题缺失会二次白屏） ----------

UPDATE subjectiveAnswers SET data = json_set(data, '$.errorCategories', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.errorCategories') IS NOT 'array';

UPDATE subjectiveAnswers SET data = json_set(data, '$.paperQuestions', json('[]'))
WHERE json_valid(data) = 1 AND json_type(data, '$.paperQuestions') IS NOT 'array';

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
-- 若希望镜像也刷新，执行下面这些（会改变列表的「最近更新」排序）：
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
