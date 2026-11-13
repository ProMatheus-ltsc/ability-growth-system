-- 0006_data_cleanup.sql
-- 数据清理（可重复执行，不依赖代码部署，旧代码在线时执行也安全）
--
-- 1. updated_at 与 data.updatedAt 统一为 UTC ISO（形如 2026-11-09T02:13:18.000Z）。
--    旧数据里存在 +08:00 偏移格式，SQL 按字符串比较 LWW 时同一时刻会判错；
--    新代码写入时也会归一化，本迁移负责把历史行补齐。
-- 2. trainings 缺 source 回填：fenbi-* 记录补 fenbi，其余补 manual。
-- 3. gaps.sourceRecordIds 删除指向不存在记录的悬空引用（引用目标可为
--    trainings / subjectiveAnswers / exams / corrections），gap 本身保留。
-- 4. 删除已过期 sessions，并补 expires_at 索引供登录时清理。
-- 5. sync_backups 按体积保留：每个账户至少 3 份、总量上限 6MB、最多 20 份。
--
-- 不包含 labelStats 删表：那依赖新代码先部署（旧代码 initSchema 会把表重新建出来），
-- 见 0007_drop_labelStats.sql。

-- ============ 1. 时间戳统一 UTC ============
UPDATE trainings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE trainings SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE gaps SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE gaps SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE abilities SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE abilities SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE students SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE students SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE tasks SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE templates SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE assignments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE assignments SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE assignmentProgress SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE assignmentProgress SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE exams SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE exams SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE corrections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE corrections SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE strategies SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE strategies SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE registrations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE registrations SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE stagePlans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE stagePlans SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE spacedReviews SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE spacedReviews SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE pdcaProblems SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE pdcaProblems SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE careerAssessments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE careerAssessments SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE careerReports SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE careerReports SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE subjectiveAnswers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE subjectiveAnswers SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE interviewRecords SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE interviewRecords SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE pdcaArtifacts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE pdcaArtifacts SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE customTools SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE customTools SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE weeklyChecklists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE weeklyChecklists SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE collaborationEvents SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE collaborationEvents SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE vetoOverrides SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE vetoOverrides SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE careerObservationPoints SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE careerObservationPoints SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

UPDATE careerRetestReflections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
WHERE updated_at NOT LIKE '%Z' AND julianday(updated_at) IS NOT NULL;
UPDATE careerRetestReflections SET data = json_set(data, '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(data, '$.updatedAt')))
WHERE json_valid(data) AND json_type(data, '$.updatedAt') = 'text'
  AND json_extract(data, '$.updatedAt') NOT LIKE '%Z'
  AND julianday(json_extract(data, '$.updatedAt')) IS NOT NULL;

-- labelStats 不在此处理：0007 已删表，保留该段会让本迁移在 0007 之后无法重复执行。

-- ============ 2. trainings.source 回填 ============
UPDATE trainings
SET data = json_set(
  data,
  '$.source',
  CASE WHEN id LIKE 'fenbi-%' THEN 'fenbi' ELSE 'manual' END
)
WHERE json_valid(data) AND json_extract(data, '$.source') IS NULL;

-- ============ 3. gaps 悬空引用清理 ============
UPDATE gaps
SET data = json_set(
  data,
  '$.sourceRecordIds',
  json(COALESCE((
    SELECT json_group_array(ref.value)
    FROM json_each(json_extract(gaps.data, '$.sourceRecordIds')) AS ref
    WHERE ref.value IN (SELECT id FROM trainings)
       OR ref.value IN (SELECT id FROM subjectiveAnswers)
       OR ref.value IN (SELECT id FROM exams)
       OR ref.value IN (SELECT id FROM corrections)
  ), '[]'))
)
WHERE json_valid(data)
  AND json_type(data, '$.sourceRecordIds') = 'array'
  AND EXISTS (
    SELECT 1
    FROM json_each(json_extract(gaps.data, '$.sourceRecordIds')) AS ref
    WHERE ref.value NOT IN (SELECT id FROM trainings)
      AND ref.value NOT IN (SELECT id FROM subjectiveAnswers)
      AND ref.value NOT IN (SELECT id FROM exams)
      AND ref.value NOT IN (SELECT id FROM corrections)
  );

-- ============ 4. 过期会话清理 ============
DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============ 5. 备份按体积保留 ============
-- 保留规则：每账户至少 3 份；从新到旧累计，超过 6MB 或超过 20 份后删除更旧的。
DELETE FROM sync_backups
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           SUM(length(data)) OVER (PARTITION BY account_id ORDER BY created_at DESC, id DESC) AS cumulative_bytes,
           ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY created_at DESC, id DESC) AS sequence
    FROM sync_backups
  )
  WHERE sequence > 3 AND (cumulative_bytes > 6291456 OR sequence > 20)
);
