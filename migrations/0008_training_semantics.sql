-- 0008_training_semantics.sql
-- Option A：单表作答树语义迁移（可重复执行）
--
-- 为历史 trainings 补齐结构字段，读取层不再依赖 scope / aggregationRole / id 约定：
--   kind       exam 整卷根 / module 模块段 / label 标签段 / practice 独立练习 /
--              review 错题复盘 / summary 跨日期聚合（不参与求和）
--   examRef    统一为 exam-fenbi-exam-{paperId}
--   examId     与 examRef 对齐（旧代码 normalizedExamId 对新格式仍可正常去前缀）
--   attemptId  attempt:{examRef}；无试卷引用的独立记录 attempt:{id}
--   depth      exam/practice/review/summary=0，module=1，label=modulePath 层级(2/3)
--   parentId   module→整卷根；label→label 父级或模块行
--
-- 同时修正 2026-11-07 同卷手工模块行与 md 模块行完全重复（题量/正确数逐模块相同）
-- 造成的模块级双算：保留带标签明细的 md 树，手工模块行打 validity=duplicate（不删数据）。
--
-- 兼容策略：scope / aggregationRole / validity 原样保留，部署中的旧版代码继续可读；
-- 新代码只读 kind / examRef / attemptId。exams.moduleBreakdown 暂留作无模块行时的回退，
-- 待新版代码全量上线后由后续迁移移除。

-- ============ 1. 结构角色 ============
UPDATE trainings
SET data = json_set(data, '$.kind', CASE
  WHEN json_extract(data, '$.aggregationRole') = 'derived' THEN 'summary'
  WHEN id LIKE '%-pt-%' THEN 'label'
  WHEN id LIKE '%-mod-%' THEN 'module'
  WHEN json_extract(data, '$.trainingType') IN ('review', 'wrong_review') THEN 'review'
  WHEN (
    json_extract(data, '$.module') IN ('整卷', '行测整卷')
    OR json_extract(data, '$.module') LIKE '错题复盘%'
  ) AND (
    json_extract(data, '$.note') LIKE '%专项智能练习%'
    OR json_extract(data, '$.note') LIKE '%举一反三%'
    OR json_extract(data, '$.note') LIKE '%快速智能练习%'
  ) THEN 'practice'
  WHEN json_extract(data, '$.aggregationRole') = 'full_paper' THEN 'exam'
  WHEN json_extract(data, '$.aggregationRole') = 'module_detail' THEN 'module'
  WHEN json_extract(data, '$.scope') = 'full' THEN 'exam'
  WHEN json_extract(data, '$.scope') = 'module' THEN 'module'
  WHEN json_extract(data, '$.module') IN ('整卷', '行测整卷')
    OR json_extract(data, '$.module') LIKE '错题复盘%' THEN 'exam'
  ELSE 'practice'
END)
WHERE json_valid(data);

-- ============ 2. trainingType 归一 ============
UPDATE trainings
SET data = json_set(data, '$.trainingType', 'exam')
WHERE json_valid(data) AND json_extract(data, '$.trainingType') = 'full_mock';

UPDATE trainings
SET data = json_set(data, '$.trainingType', 'review')
WHERE json_valid(data) AND json_extract(data, '$.trainingType') = 'wrong_review';

-- ============ 3. examRef / examId 统一 ============
-- 优先已存在的 examRef，其次 examId；整卷根的长日期 id 不臆造成试卷引用。
WITH refs AS (
  SELECT id, CASE
    WHEN json_type(data, '$.examRef') = 'text'
      AND trim(json_extract(data, '$.examRef')) <> '' THEN
      CASE
        WHEN json_extract(data, '$.examRef') GLOB 'exam-fenbi-exam-[0-9]*'
          THEN json_extract(data, '$.examRef')
        WHEN json_extract(data, '$.examRef') GLOB 'fenbi-exam-[0-9]*'
          AND substr(json_extract(data, '$.examRef'), 12) NOT GLOB '*-*'
          THEN 'exam-' || json_extract(data, '$.examRef')
        WHEN json_extract(data, '$.examRef') GLOB '[0-9]*'
          THEN 'exam-fenbi-exam-' || json_extract(data, '$.examRef')
        ELSE json_extract(data, '$.examRef')
      END
    WHEN json_type(data, '$.examId') = 'text'
      AND trim(json_extract(data, '$.examId')) <> '' THEN
      CASE
        WHEN json_extract(data, '$.examId') GLOB 'exam-fenbi-exam-[0-9]*'
          THEN json_extract(data, '$.examId')
        WHEN json_extract(data, '$.examId') GLOB 'fenbi-exam-[0-9]*'
          AND substr(json_extract(data, '$.examId'), 12) NOT GLOB '*-*'
          THEN 'exam-' || json_extract(data, '$.examId')
        WHEN json_extract(data, '$.examId') GLOB '[0-9]*'
          THEN 'exam-fenbi-exam-' || json_extract(data, '$.examId')
        ELSE json_extract(data, '$.examId')
      END
    WHEN id GLOB 'fenbi-exam-[0-9]*' AND substr(id, 12) NOT GLOB '*-*'
      THEN 'exam-' || id
    ELSE NULL
  END AS exam_ref
  FROM trainings
  WHERE json_valid(data)
)
UPDATE trainings
SET data = json_set(
  data,
  '$.examRef', (SELECT refs.exam_ref FROM refs WHERE refs.id = trainings.id),
  '$.examId', (SELECT refs.exam_ref FROM refs WHERE refs.id = trainings.id)
)
WHERE id IN (SELECT refs.id FROM refs WHERE refs.exam_ref IS NOT NULL);

-- ============ 4. attemptId ============
UPDATE trainings
SET data = json_set(data, '$.attemptId', CASE
  WHEN json_type(data, '$.examRef') = 'text'
    AND trim(json_extract(data, '$.examRef')) <> ''
    THEN 'attempt:' || json_extract(data, '$.examRef')
  ELSE 'attempt:' || id
END)
WHERE json_valid(data);

-- ============ 5. depth ============
UPDATE trainings
SET data = json_set(data, '$.depth', CASE
  WHEN json_extract(data, '$.kind') = 'module' THEN 1
  WHEN json_extract(data, '$.kind') = 'label' THEN
    CASE
      WHEN (
        length(json_extract(data, '$.modulePath'))
        - length(replace(json_extract(data, '$.modulePath'), '/', ''))
      ) >= 2 THEN (
        length(json_extract(data, '$.modulePath'))
        - length(replace(json_extract(data, '$.modulePath'), '/', ''))
      )
      ELSE 2
    END
  ELSE 0
END)
WHERE json_valid(data);

-- ============ 6. 同卷重复模块行打质量标记 ============
UPDATE trainings
SET data = json_set(data, '$.validity', 'duplicate')
WHERE json_valid(data)
  AND json_extract(data, '$.kind') = 'module'
  AND id NOT LIKE '%-mod-%'
  AND json_extract(data, '$.source') = 'fenbi'
  AND EXISTS (
    SELECT 1
    FROM trainings AS m
    WHERE m.id LIKE 'fenbi-md-%-mod-%'
      AND json_extract(m.data, '$.examRef') = json_extract(trainings.data, '$.examRef')
      AND json_extract(m.data, '$.module') = json_extract(trainings.data, '$.module')
      AND json_extract(m.data, '$.totalQuestions') = json_extract(trainings.data, '$.totalQuestions')
      AND json_extract(m.data, '$.correctCount') = json_extract(trainings.data, '$.correctCount')
  );

-- ============ 7. parentId：模块 → 整卷根 ============
UPDATE trainings
SET data = json_set(data, '$.parentId', (
  SELECT p.id
  FROM trainings AS p
  WHERE json_extract(p.data, '$.kind') = 'exam'
    AND json_extract(p.data, '$.examRef') = json_extract(trainings.data, '$.examRef')
  ORDER BY p.updated_at
  LIMIT 1
))
WHERE json_valid(data)
  AND json_extract(data, '$.kind') = 'module'
  AND json_extract(data, '$.examRef') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM trainings AS p
    WHERE json_extract(p.data, '$.kind') = 'exam'
      AND json_extract(p.data, '$.examRef') = json_extract(trainings.data, '$.examRef')
  );

-- ============ 8. parentId：深度 ≥3 标签 → 上一级标签 ============
UPDATE trainings
SET data = json_set(data, '$.parentId', (
  SELECT p.id
  FROM trainings AS p
  WHERE json_extract(p.data, '$.kind') = 'label'
    AND json_extract(p.data, '$.examRef') = json_extract(trainings.data, '$.examRef')
    AND json_extract(p.data, '$.module') = json_extract(trainings.data, '$.module')
    AND substr(
      json_extract(trainings.data, '$.modulePath'),
      1,
      length(json_extract(p.data, '$.modulePath')) + 1
    ) = json_extract(p.data, '$.modulePath') || '/'
  LIMIT 1
))
WHERE json_valid(data)
  AND json_extract(data, '$.kind') = 'label'
  AND json_extract(data, '$.depth') >= 3
  AND EXISTS (
    SELECT 1
    FROM trainings AS p
    WHERE json_extract(p.data, '$.kind') = 'label'
      AND json_extract(p.data, '$.examRef') = json_extract(trainings.data, '$.examRef')
      AND json_extract(p.data, '$.module') = json_extract(trainings.data, '$.module')
      AND substr(
        json_extract(trainings.data, '$.modulePath'),
        1,
        length(json_extract(p.data, '$.modulePath')) + 1
      ) = json_extract(p.data, '$.modulePath') || '/'
  );

-- ============ 9. parentId：深度 2 标签（以及无上级标签的深度 3）→ 模块行 ============
UPDATE trainings
SET data = json_set(data, '$.parentId', (
  SELECT m.id
  FROM trainings AS m
  WHERE m.id LIKE 'fenbi-md-%-mod-%'
    AND json_extract(m.data, '$.examRef') = json_extract(trainings.data, '$.examRef')
    AND json_extract(m.data, '$.module') = json_extract(trainings.data, '$.module')
  LIMIT 1
))
WHERE json_valid(data)
  AND json_extract(data, '$.kind') = 'label'
  AND json_extract(data, '$.parentId') IS NULL
  AND EXISTS (
    SELECT 1
    FROM trainings AS m
    WHERE m.id LIKE 'fenbi-md-%-mod-%'
      AND json_extract(m.data, '$.examRef') = json_extract(trainings.data, '$.examRef')
      AND json_extract(m.data, '$.module') = json_extract(trainings.data, '$.module')
  );
