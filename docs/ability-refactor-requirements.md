# 能力增长系统改造需求（代码层 · 不动数据库）

- 基线提交：`9661cdd`（`origin/main`，Pages Functions 直连 D1）
- 文档定位：本轮改造的需求与验收基线，不是实施方案
- 范围：只改前端代码与 Pages Functions 代码；**不改表结构、不新增表、不执行迁移、不回填历史数据、不写线上库**
- 术语：`训练记录` = `trainings` store；`模考记录` = `exams` store；`能力缺口` = `gaps` store；`能力快照` = `abilities` store

---

## 1. 现状基线（代码证据）

| 层 | 位置 | 现状 |
|---|---|---|
| 类型定义 | `src/domain/types.ts` | `TrainingRecord` 167-185、`AbilityGap` 188-203、`AbilitySnapshot` 206-220、`ExamRecord` 346-367、`ExamRegistration` 411-427、`SubjectiveAnswer` 1038-1054 |
| 分析层 | `src/services/analytics.ts` | `aggregateBySubject` 41-94、`calcErrorRecurrence` 96-105、`buildRadarSlices` 107-151、`buildGrowthSeries` 153-185、`prioritizeGaps` 195-202、`analyzeTrainingROI` 216-247、`buildStageReport` 263-321、`deriveGapsFromTraining` 489-546、`deriveSnapshotFromTraining` 562-584 |
| 训练录入 | `src/pages/TrainingsPage.tsx` | 表单 227-291、提交 264-285、记录 id 269、二级考点拼路径 247/336 |
| 模考录入 | `src/pages/ExamDiagnosisPage.tsx` | 转化修复任务 28-77、提交 239-278、`moduleBreakdown` 257-270 |
| 能力中心 | `src/pages/AbilityCenterPage.tsx` | 雷达 30、增长曲线 34、模块掌握度 36-48、学科统计 76 |
| 问题中心 | `src/pages/ProblemCenterPage.tsx` | `updateGap` 47-52、`createFixTask` 65-96、状态下拉 255-260 |
| 工作台 | `src/pages/DashboardPage.tsx` | 学科统计 118、指标文案 59-72、公考倒计时 123/147/304 |
| 洞察页 | `src/pages/InsightsPage.tsx` | 预测 116/129-162、What-if 204、因果 294-319 |
| 分析页 | `src/pages/AnalyticsPage.tsx` | Tab 27/61-64、阶段报告 120 |
| 数据访问 | `src/services/d1Client.ts` | `listRecords` 148-150、`putRecord` 161-163 |
| 业务封装 | `src/services/localDB.ts` | `putRecord` 298-300、`getAllRecords` 306-308、`findTrainingsByStudent` 320-324 |
| 服务端 | `functions/api/[[path]].ts` | `ensureSchema` 241-249、`initSchema` 253-327、`upsertStatements` 344-368、`validRecords` 370-376、`listStore` 378-384、`handle` 433-685、stores CRUD 635-682 |
| 表清单 | `src/services/snapshot.ts` | `STORE_NAMES` 35-63，共 27 个 store |
| 迁移 | `migrations/0001_init.sql`、`migrations/0002_auth.sql` | 本轮**只读、不修改** |
| 部署 | `wrangler.toml` | Pages + D1 binding `DB`；`package.json` 6-16 提供 `pages:dev` / `db:migrate:local` 等脚本 |

**关键事实**：业务表统一为 `(workspace, id, updated_at, data)`，`data` 是整条记录的 JSON 文本（`functions/api/[[path]].ts:257-262`、`:366`）。`PUT /api/stores/:store/:id` 用 `{ ...body, id }` 原样透传（`:670-675`），所以**新增可选字段不需要改表、不需要迁移**。

---

## 2. 约束与「做不了」清单

### 2.1 可以做

- 在现有 `data` JSON 中追加可选字段；
- 前端表单增加输入项；
- `analytics.ts` 增加纯函数与聚合口径；
- Pages Functions 增加**基于现有 store 的只读取数/聚合**端点（可选，非必需）；
- 页面新增卡片、表格、时间线；
- 读取时对老记录做字段缺失降级。

### 2.2 因「数据库不动」明确做不了

| 项 | 原因 |
|---|---|
| 新增 store / 新增业务表（如 `examPapers`、`examModules`、`gapHistory`） | 需要改 `STORE_NAMES`、`initSchema`、迁移文件，触及表结构 |
| 给 `data` 内部字段建索引、服务端按 `paperYear`/`module` 过滤 | D1 表只有 `workspace/id/updated_at/data` 四列，无法索引 JSON 内部字段；只能全量拉取后前端计算 |
| 历史数据回填或重组（把既有 `full_mock` 模块行补上 `examId`、合并成整卷） | 属于写库与数据迁移，本轮不做 |
| 数据库层约束（枚举、非空、唯一） | `data` 是自由 JSON，只能应用层校验 |
| 修改主键或把 JSON 字段提升为列 | 涉及表结构变更 |
| 删除/重写老记录以修正口径 | 属于数据修改，不做 |

> 结论：**新增字段本身不触发 schema 变更**；真正受限的是「新表/迁移/回填/服务端按 JSON 字段索引查询」。历史数据口径问题只能靠读取时兼容与展示标注，不能靠改库修正。

---

## 3. 逐项需求

### D1 训练记录可选字段（卷型 / 年份 / 满分 / 得分 / 标准用时 / 题型）

**现状**

- `TrainingRecord`（`src/domain/types.ts:167-185`）只有 `subject/module/trainingType/totalQuestions/correctCount/errorCount/durationMinutes/errorCategories/isUnfamiliar/note/taskId`。
- 表单（`src/pages/TrainingsPage.tsx:227-291`）没有卷型、年份、满分、得分、标准用时、独立题型输入；二级考点只能拼进 `module`（`:247`、`:336`）。
- `TrainingType` 有 `timed`/`exam`（`types.ts:101-108`），但没有对应的时间基线字段。

**期望行为（全部可选、可空、无默认值）**

| 字段 | 类型 | 默认值 | 约束 |
|---|---|---|---|
| `paperType` | `ExamRegistration['examType']`（`types.ts:422`） | `undefined` | 国考/省考/事业单位/选调/军转等 |
| `paperYear` | `number` | `undefined` | 1900-2100，非法值不入库 |
| `fullMark` | `number` | `undefined` | > 0 |
| `score` | `number` | `undefined` | 0 ≤ score ≤ fullMark（有 fullMark 时校验） |
| `standardMinutes` | `number` | `undefined` | > 0；表示本条记录对应题组的标准用时 |
| `questionType` | `string` | `undefined` | 独立题型；为空时 UI 回退显示 `module` 第二段 |

**改动落点**

- `src/domain/types.ts:167-185`：追加上述可选字段。
- `src/pages/TrainingsPage.tsx`：表单 `227-291` 增加输入；提交 `264-285` 写入；列表 `180-209` 显示标注。
- `src/services/analytics.ts`：新增口径函数读取这些字段（见 A2/A3/T1）。
- 不新增 store、不改 `migrations/`。

**兼容性**

- 老记录缺字段：读取时 `undefined`，不补 0、不补默认卷型；UI 显示「未标注」。
- 写入层原样 JSON 透传（`functions/api/[[path]].ts:366`、`:670-675`），字段不会被裁剪。
- 旧版前端读到多余字段会忽略，不需要迁移；回滚代码后新字段仍留在 JSON 中，不影响旧逻辑。

**验收标准**

1. 不填新字段保存：`PUT` 请求体不含这些键或值为 `undefined`；记录仍可读。
2. 填 `paperType=provincial`、`paperYear=2025`、`fullMark=100`、`score=72`、`standardMinutes=120`、`questionType=数量关系` 后，`GET /api/stores/trainings` 返回原值。
3. 老记录（无新字段）在列表与分析中显示「未标注」，不显示 `0` 或 `NaN`。
4. `npm run typecheck` 通过。

**风险**

- `questionType` 与 `module` 第二段语义重叠，需要在 UI 上明确「模块/考点/题型」三者关系。
- `score` 与 `totalQuestions/errorCount` 可能口径冲突，需在 A1 明确聚合以谁为准。

---

### D2 模考记录：整卷字段与整卷-模块关联

**现状**

- `ExamRecord`（`src/domain/types.ts:346-367`）有 `totalQuestions/totalErrors/durationMinutes/moduleBreakdown/mainProblems/diagnosis/generatedTaskIds`；`moduleBreakdown` 元素为 `{module,total,errors,score,level}`。
- 没有 `totalScore`、`fullMark`、`paperType`、`paperYear`、`standardMinutes`；`TrainingRecord` 也没有 `examId/scope`。
- 模考提交（`src/pages/ExamDiagnosisPage.tsx:239-278`）只写 `exams`；`convertToFixTasks`（`:28-77`）派生 `gaps`/`tasks`，不写 `trainings`。

**期望行为**

- `ExamRecord` 追加可选：`paperType?`、`paperYear?`、`fullMark?`、`totalScore?`、`standardMinutes?`。
- `TrainingRecord` 追加可选：`examId?: string`、`scope?: 'full' | 'module'`。
- 保存模考时：
  - `exams` 里保留一条整卷记录（权威来源）；
  - 若用户选择「同步生成模块训练记录」，则生成 `scope='module'`、`examId=exam.id` 的 `trainings`；
  - 若生成整卷训练行，则 `scope='full'`、`examId=exam.id`；
  - 默认**不自动双写**，避免无谓重复；双写必须显式勾选。
- 展示层：同一 `examId` 可并列看到整卷与模块（见 V2）。

**改动落点**

- `src/domain/types.ts:346-367`（`ExamRecord`）、`:167-185`（`TrainingRecord`）。
- `src/pages/ExamDiagnosisPage.tsx:239-278`（提交与可选双写）。
- `src/services/analytics.ts`（A1 去重读取 `examId/scope`）。

**兼容性**

- 老 `exams`/`trainings` 无字段：正常读取，按 D1 的「未标注」降级；无 `examId` 的记录不参与去重。
- 不需要迁移；老模考的 `moduleBreakdown` 仍可展示。

**验收标准**

1. 保存模考后，`exams` 记录包含 `totalScore/fullMark`（若填写）。
2. 勾选双写时，生成的模块训练行 `examId` 与 `exams.id` 完全一致，`scope='module'`。
3. 未勾选双写时，不产生任何 `trainings` 记录。
4. 老模考记录页面不报错，`moduleBreakdown` 正常渲染。

**风险**

- 双写仍是两处事实，必须由 A1 的去重规则兜底；否则会重复聚合。
- `exams` 与 `trainings` 的删除/更新不会自动级联（数据库不动），需要在 UI 提示。

---

### A1 整卷与模块不重复聚合

**现状**

- `aggregateBySubject`（`src/services/analytics.ts:41-94`）对所有 `TrainingRecord` 无条件累加：题量 50、错题 51、用时 53、正确率 52/54。
- `ExamRecord` 不进入 `aggregateBySubject`（入参只有 `TrainingRecord[]`），所以模考数据在学科统计/能力中心里**不可见**。
- 同一场模考若既有整卷行又有模块行，会被逐条累加，造成重复。

**期望行为**

新增纯函数 `selectAggregationRecords(records: TrainingRecord[]): TrainingRecord[]`：

1. 无 `examId` 的记录：原样保留。
2. 有 `examId` 且 `scope='full'`：学科级聚合保留整卷行；模块级聚合（A2）排除整卷行。
3. 有 `examId` 且 `scope='module'`：模块级聚合保留；学科级聚合时，若同一 `examId` 存在 `scope='full'` 行，则排除模块行；否则保留模块行。
4. `scope` 缺失但有 `examId`：按 `module` 处理（兼容写法）。
5. `aggregateBySubject` 内部先调用该函数，再累加。

**改动落点**

- `src/services/analytics.ts:41-94` 前新增函数；`aggregateBySubject` 入口去重。
- `src/pages/AbilityCenterPage.tsx:76`、`DashboardPage.tsx:118` 等调用方无需改签名。
- 可选：`ExamDiagnosisPage` 双写时补齐 `examId/scope`（D2）。

**兼容性**

- 老记录无 `examId`：行为完全不变。
- **历史 `full_mock` 模块行无法自动归组**（不回填），仍按旧口径累加；本轮只保证新写入数据正确。文档与 UI 需标注这一限制。
- 不需要迁移。

**验收标准**

单元测试（见第 6 节）：

1. 输入 `[full(E), module(E)×2, normal]` → 学科总量 = `full + normal`，不含两个 module。
2. 输入 `[module(E)×2, normal]`（无 full）→ 学科总量 = 两个 module + normal。
3. 输入 `[normal×2]` → 与改造前结果完全一致。
4. 模块级聚合（A2）中 `full` 被排除，`module` 被保留。

**风险**

- 口径需产品确认：学科级总量以整卷为准，模块级以模块行为准；若用户只记模块，则退化为模块求和。
- 若未来允许同一 `examId` 多条 full 行，需要额外规则（本轮不支持）。

---

### A2 `byModule` 汇总与周环比

**现状**

- 模块掌握度只在 `AbilityCenterPage.tsx:36-48` 页面内临时计算，未进入 `analytics.ts`，其他页面无法复用。
- `buildGrowthSeries`（`analytics.ts:153-185`）按周分桶返回 `score/unfamiliar/samples`，没有「本周 vs 上周」差值。
- `weekKey`（`:187-193`）是按自然年周数近似，不是严格 ISO 周。
- 洞察页 `InsightsPage.tsx:116/129-162` 用的是「周增长率」斜率，不是相邻两周差值。

**期望行为**

新增：

```ts
interface ModuleStats {
  subject: Subject;
  module: string;              // normalizeModule 后的一级模块
  totalQuestions: number;
  totalErrors: number;
  correctRate: number;         // 0-100
  masteryScore: number;        // 复用现有掌握度口径
  totalDurationMinutes: number;
  avgMinutesPerQuestion: number | null; // 无题量或无用时时 null
  sampleCount: number;
  lastSeenAt: string | null;
}

function buildModuleStats(records: TrainingRecord[]): ModuleStats[];
function buildWeeklyDelta(records: TrainingRecord[], subject: Subject): {
  currentWeek: string | null;
  previousWeek: string | null;
  deltaCorrectRate: number | null; // 本周正确率 - 上周正确率（百分点）
  deltaQuestions: number | null;
  deltaDurationMinutes: number | null;
};
```

- `buildModuleStats` 先走 A1 的 `selectAggregationRecords`（模块级），再用 `normalizeModule`（`src/domain/moduleNormalize.ts:75-104`）归并二级考点。
- `buildWeeklyDelta` 复用 `weekKey`，相邻两周无样本时返回 `null`，不返回 0。

**改动落点**

- `src/services/analytics.ts`（`aggregateBySubject` 附近新增 `buildModuleStats`；`buildGrowthSeries` 附近新增 `buildWeeklyDelta`）。
- `src/pages/AbilityCenterPage.tsx:36-48` 改为调用 `buildModuleStats`。
- `src/pages/DashboardPage.tsx` 增加「本周 vs 上周」卡片。
- 可选：`AnalyticsPage` 增加模块表。

**兼容性**

- 纯新增函数，老调用方不变。
- 老记录无新字段照常计算；无 `durationMinutes` 时 `avgMinutesPerQuestion=null`，不显示 0。
- 不改变 `buildGrowthSeries` 的既有输出，避免影响现有图表。

**验收标准**

1. 两周 fixture：第 1 周 60%、第 2 周 75% → `deltaCorrectRate=15`。
2. 只有一周数据 → `deltaCorrectRate=null`，UI 显示「暂无上周对比」。
3. 模块表题量/正确率与手工计算一致；`module` 为一级模块，不混入二级考点。
4. 无数据模块显示「暂无」，不显示 0%。

**风险**

- `weekKey` 的周界近似可能导致跨年周偏差；本轮复用现有实现，不修改全局口径。
- 模块归一化依赖 `normalizeModule` 别名表，新增模块需同步维护。

---

### A3 限时达标率

**现状**

- `TrainingRecord.durationMinutes`（`types.ts:178`）只是整条记录总用时。
- 没有 `standardMinutes`、没有单题标准用时、没有达标判定；`TrainingType.timed`（`:106`）只是标签。
- `aggregateBySubject` 只累加总用时（`analytics.ts:53`），不计算任何时间达标率。

**期望行为**

新增纯函数：

```ts
function isTimedMet(record: TrainingRecord): boolean | null; // 无 standardMinutes 或无 durationMinutes 时 null
function timedComplianceRate(records: TrainingRecord[]): {
  rate: number | null;       // 0-100
  sampleSize: number;       // 有标准用时且有实际用时的记录数
};
```

判定规则：

- 单题标准用时 = `standardMinutes / totalQuestions`；
- 单题实际用时 = `durationMinutes / totalQuestions`；
- 实际 ≤ 标准 → 达标；
- 任一侧缺失 → `null`，不计入 `sampleSize`；
- 仅在 `trainingType='timed'` 或显式填写 `standardMinutes` 的记录上计算。

**改动落点**

- `src/services/analytics.ts`（`aggregateBySubject` 之后）。
- `src/pages/TrainingsPage.tsx:180-209` 列表显示「达标 / 超时 / 无基准」。
- `src/pages/AbilityCenterPage.tsx` 或 `DashboardPage.tsx` 增加达标率指标。

**兼容性**

- 老记录无 `standardMinutes`：显示「无基准」，不判定为未达标。
- 不迁移、不回填标准用时。

**验收标准**

1. fixture：`standardMinutes=60,totalQuestions=30,durationMinutes=55` → 达标。
2. 同上但 `duration=65` → 未达标。
3. `standardMinutes` 缺失 → `null`，`sampleSize` 不增加。
4. `sampleSize=0` 时 UI 显示「暂无时间基准」，不显示 0%。

**风险**

- `standardMinutes` 是「整卷/整组」还是「单题」需在表单文案中写清；本轮按整条记录的标准总用时解释。

---

### G1 Gap 重开与 `statusHistory`

**现状**

- `AbilityGap`（`src/domain/types.ts:188-203`）只有 3 个状态，无历史、无 `reopenedCount`。
- `deriveGapsFromTraining`（`src/services/analytics.ts:489-546`）：
  - 阈值：错题 <3 且错误率 <40% 直接跳过（`:493-495`）；
  - 匹配条件包含 `status !== 'verified'`（`:508-515`）；
  - 已有缺口只更新次数/时间/严重度/来源（`:516-526`）；
  - 没有匹配时**新建**（`:527-543`），导致已验证缺口再次出现时换新 id；
  - `sourceRecordIds` 只保留最近 20 条（`:523-525`）。
- 手工流转：`ProblemCenterPage.tsx:47-52` 的 `updateGap`；状态下拉 `:255-260`；`createFixTask` 把未解决置为 `in-progress`（`:91-92`）。

**期望行为**

- `AbilityGap` 追加可选：
  - `statusHistory?: Array<{ status: AbilityGap['status']; at: string; source: 'auto' | 'manual'; recordId?: string; reason?: 'created' | 'merged' | 'reappeared' | 'task-created' | 'manual' }>`
  - `reopenedCount?: number`
  - `verifiedAt?: string`
- 已验证缺口在同 key 再次出现时：
  - **复用原 id**，状态改为 `in-progress`（或 `unresolved`，取产品确认值）；
  - `occurrenceCount += 1`、刷新 `lastSeenAt`；
  - `reopenedCount += 1`；
  - 追加 `statusHistory` 的 `reappeared` 记录。
- 每次状态变化（手工或自动）追加一条历史；同一 `at` 不重复追加。
- 老缺口没有 `statusHistory` 时，读取时惰性展示「当前状态（历史缺失）」，不写回。

**改动落点**

- `src/domain/types.ts:188-203`。
- `src/services/analytics.ts:489-546`（匹配逻辑、重开逻辑、历史追加）。
- `src/pages/ProblemCenterPage.tsx:47-52`（手工流转追加历史）、`:65-96`（建任务追加历史）、`:255-260`（状态下拉）。
- 可选：`ProblemCenterPage` 增加缺口时间线组件（V2）。

**兼容性**

- 老记录无 `statusHistory`：正常读取，不补写、不迁移。
- 不改状态枚举，避免影响筛选（`ProblemCenterPage.tsx:26/43`）。
- 阈值与严重度规则保持不变。

**验收标准**

1. 单元：`verified` 缺口 + 新训练同 key → 返回同一 `id`，`status='in-progress'`，`occurrenceCount+1`，`reopenedCount=1`，历史长度 +1 且 `reason='reappeared'`。
2. 单元：`unresolved` → 手工 `verified` → 历史新增 `source='manual'`。
3. 单元：同一条训练重复处理两次不重复追加历史。
4. UI：老缺口只显示当前状态；新缺口显示时间线。
5. 现有筛选（unresolved/in-progress/verified/all）行为不变。

**风险**

- `updateGap` 用对象展开合并（`ProblemCenterPage.tsx:47-52`），需避免把历史数组覆盖成空。
- 重开后的状态选择（`in-progress` vs `unresolved`）需产品确认；本轮建议 `in-progress`，因为已有修复流程。

---

### S1 申论四维

**现状**

- `SubjectiveAnswer`（`src/domain/types.ts:1038-1054`）只有 `scoreDims?: Array<{label,stars}>`，不是固定的四维分数。
- 录入页 `SubjectiveAnswersPage.tsx:169-190` 只保存 `content/wordCount/durationMinutes`，没有四维输入。
- `TrainingRecord` 对申论训练没有维度字段。

**期望行为**

- `SubjectiveAnswer` 追加可选 `dimensionScores?: { points?: number; structure?: number; language?: number; logic?: number }`，每项 0-100，可空。
- 保留 `scoreDims` 不动，避免破坏老数据与老 UI。
- 新增 `buildSubjectiveDimensions(records)`：返回四维平均值、样本数、最弱维度；缺项不计入平均。
- 表单增加四维输入；不填则不入库。

**改动落点**

- `src/domain/types.ts:1038-1054`。
- `src/pages/SubjectiveAnswersPage.tsx:169-190`（状态与提交）、列表 `:121-125`（显示四维）。
- `src/services/analytics.ts` 新增汇总函数。

**兼容性**

- 老记录无 `dimensionScores`：不参与四维平均；`scoreDims` 仍按原样显示。
- 不迁移、不回填。

**验收标准**

1. 不填四维保存：`dimensionScores` 为 `undefined` 或缺失。
2. 填 `{points:70,structure:60,language:80,logic:65}` 后读取原值。
3. 汇总函数只对已填维度求平均，缺项返回 `null` 而不是 0。
4. 老记录列表正常显示星级 `scoreDims`。

**风险**

- 存在两套评分模型（星级 vs 四维），UI 需明确标注，避免用户误解。

---

### T1 目标分差

**现状**

- `AbilityRadarSlice.targetScore`（`types.ts:290-296`）存在，但 `buildRadarSlices` 固定写 80（`analytics.ts:148`）。
- `ExamRegistration`（`types.ts:411-427`）没有 `targetScore`；`StudentProfile` 只有 `goal?: string`（`:231`）。
- 工作台只有考试倒计时（`DashboardPage.tsx:123/147/304`），没有「离目标差多少」。

**期望行为**

- `ExamRegistration` 追加可选 `targetScore?: number`（0-100，掌握度口径；可空）。
- 新增 `computeTargetGap(stats: SubjectStats, targetScore?: number)`：
  - `targetScore` 缺失 → `null`；
  - 返回 `{ target, current, gap, reached }`，`gap = target - current`（可为负）。
- UI 在 `DashboardPage`/`AbilityCenterPage` 显示「距目标 X 分」或「已达标」；无目标显示「未设置目标」。

**改动落点**

- `src/domain/types.ts:411-427`。
- `src/services/analytics.ts`（新增函数）。
- `src/pages/DashboardPage.tsx`、`src/pages/AbilityCenterPage.tsx`。

**兼容性**

- 老 registrations 无目标：隐藏差值卡片，不影响其他模块。
- 不迁移、不回填。

**验收标准**

1. 单元：`target=80,current=65` → `gap=15`；`current=85` → `gap=-5, reached=true`。
2. 无目标 → `null`，UI 显示「未设置目标」。
3. 目标为非法值（<0 或 >100）时不保存或按未设置处理。

**风险**

- 目标分是「掌握度分」而非真实卷面分；需要在文案中写清，避免与 `fullMark/score` 混淆。

---

### V1 时间分配视图

**现状**

- `aggregateBySubject` 只累加学科总用时（`analytics.ts:53`、`:84`）；没有模块用时占比、没有每题用时。
- 训练列表显示总用时（`TrainingsPage.tsx:180-209`）；工作台没有时间分配图。
- 目标时间分配字段不存在（无 `targetDistribution`）。

**期望行为**

- 新增 `buildTimeAllocation(records: TrainingRecord[])`，返回按学科/模块：
  - `totalMinutes`、`share`（0-100）、`avgMinutesPerQuestion`、`sessionCount`；
  - 仅统计 `durationMinutes > 0` 的记录；
  - 无用时记录不计入分母。
- UI 在 `AbilityCenterPage` 或 `AnalyticsPage` 增加「模块时间分配」表/堆叠条。
- 只展示实际分配，不引入目标分配（避免新增字段与目标口径争议）。

**改动落点**

- `src/services/analytics.ts`（A2 的 `buildModuleStats` 可复用用时字段）。
- `src/pages/AbilityCenterPage.tsx` 或 `src/pages/AnalyticsPage.tsx`。

**兼容性**

- 老记录无 `durationMinutes`：不参与用时占比；题量统计不受影响。
- 不迁移、不回填。

**验收标准**

1. 单元：模块 A 120 分钟/60 题、模块 B 30 分钟/20 题 → 占比 80%/20%，每题 2/1.5 分钟。
2. 全部无用时 → 返回空数组，UI 显示「暂无用时数据」。
3. 页面占比之和在有数据时为 100%（允许四舍五入误差 1%）。

**风险**

- 用时缺失会让占比失真；UI 需标注「仅统计已填用时记录」。

---

### V2 展示补充（本周 vs 上周、gap 时间线、整卷-模块并列）

**现状**

- 周趋势只有 `buildGrowthSeries` 折线（`AbilityCenterPage.tsx:159-184`），没有相邻周差值卡片。
- 问题中心只有列表与复现率（`ProblemCenterPage.tsx:141`），没有状态时间线。
- 模考页只展示 `moduleBreakdown`（`ExamDiagnosisPage.tsx:139`），没有按 `examId` 关联整卷与模块。

**期望行为**

- 工作台增加「本周 vs 上周」卡片（读 A2 的 `buildWeeklyDelta`）。
- 问题中心增加缺口详情时间线（读 G1 的 `statusHistory`；老数据显示「历史缺失」）。
- 模考详情按 `examId` 分组展示整卷与模块，标注「整卷权威/模块明细」。

**改动落点**

- `src/pages/DashboardPage.tsx`、`src/pages/ProblemCenterPage.tsx`、`src/pages/ExamDiagnosisPage.tsx`。
- 只读现有字段，不新增 store。

**兼容性**

- 老数据无 `statusHistory`/`examId`：显示降级文案，不报错。
- 不迁移。

**验收标准**

1. 有连续两周数据时，卡片显示正确差值与方向（↑/↓）。
2. 只有一周时显示「暂无上周对比」。
3. 无 `statusHistory` 的老缺口显示「当前状态」而不空白。
4. 无 `examId` 的模考不出现分组错误。

**风险**

- 展示依赖 A2/G1 字段，必须按实施顺序执行。

---

## 4. 原 R1–R10 映射

| 原编号 | 是否本仓库 | 本轮需求项 | 说明 |
|---|---|---|---|
| R1 store.py 只读化 | 否，Agent 侧 | — | 本仓库无本地写路径 |
| R2 幂等键稳定摘要 | 否，Agent 侧 | — | 记录 id 由调用方生成；本仓库仅 upsert |
| R3 examId/scope + 聚合去重 | 是 | D2 + A1 | 字段与聚合均在本仓库 |
| R4 查询过滤 | 否，Agent 侧 | — | 本仓库只有全量 `GET /api/stores/:store` |
| R5 gap 写入合并 | 是 | G1 | 已有合并逻辑，补重开与历史 |
| R6 可选公考字段/题型 | 是 | D1 + D2 | 字段、表单、分析 |
| R7 summary byModule/weekly/timedAcc | 是 | A2 + A3 | 新增分析函数 |
| R8 申论维度 | 是 | S1 | `SubjectiveAnswer` 四维 |
| R9 gap 状态流转/重做闭合 | 是 | G1 | 状态历史与重开 |
| R10 报表脚本 | 否，Agent 侧 | — | 本仓库只负责展示页面 |

---

## 5. 实施顺序与硬依赖

### 阶段 0：基线

1. `npm run typecheck`、`npm run lint` 通过（当前基线 `9661cdd`）。
2. 建立测试 fixture（不含真实用户数据），只读。

### 阶段 1：数据字段（无依赖）

1. **D1** 训练可选字段：`types.ts` + `TrainingsPage`。
2. **D2** 模考可选字段与 `examId/scope`：`types.ts` + `ExamDiagnosisPage`。

### 阶段 2：聚合（硬依赖 D1/D2）

1. **A1** 去重聚合（依赖 `examId/scope`）。
2. **A2** `buildModuleStats` / `buildWeeklyDelta`（依赖 A1 的模块级去重）。
3. **A3** 限时达标率（硬依赖 D1 的 `standardMinutes`）。
4. **T1** 目标分差（依赖 D2/`ExamRegistration.targetScore` 与现有统计）。
5. **V1** 时间分配（依赖 A2 的模块归并）。

### 阶段 3：缺口与申论（可与阶段 2 并行）

1. **G1** gap 重开与 `statusHistory`（依赖 D1 的模块 key 稳定；不依赖 A1）。
2. **S1** 申论四维（独立）。
3. **V2** 展示补充（依赖 A2、G1、D2）。

**硬依赖汇总**：

- A1 ← D2（`examId/scope`）
- A2 ← A1
- A3 ← D1（`standardMinutes`）
- V1 ← A2
- V2 ← A2 + G1 + D2
- T1 ← D2（`targetScore` 可放 `ExamRegistration`，不依赖 A1）

---

## 6. 测试方案

### 6.1 现状

本仓库当前**没有测试框架**（`package.json:6-16` 无 `test` 脚本，仓库无测试文件）。本轮改造需要补最小单测，避免纯函数口径回归。

### 6.2 建议补充的最小单测

建议引入 `vitest`（devDependency）并新增 `"test": "vitest run"`；测试文件放在 `tests/`，不改业务代码结构。

| 被测函数 | 用例 |
|---|---|
| `aggregateBySubject` | 无 `examId` 老记录结果不变；`full+module` 去重；仅 module 时求和；空数组返回 `[]` |
| `buildModuleStats` | 二级考点归并到一级模块；题量/正确率/每题用时；无数据模块返回 0 样本 |
| `buildWeeklyDelta` | 两周差值；仅一周返回 `null`；跨年周不崩溃 |
| `timedComplianceRate` | 达标/超时/缺 `standardMinutes`/缺 `durationMinutes` |
| `deriveGapsFromTraining` | 未验证合并；`verified` 重现重开且 id 稳定；重复同一记录不重复追加历史 |
| `computeTargetGap` | 有目标/无目标/已达标 |
| `buildTimeAllocation` | 占比 80/20；全部无用时返回空 |
| `buildSubjectiveDimensions` | 全填/部分填/全空 |

**Fixture 要求**：至少包含

1. 一条 2025 年完整字段训练；
2. 一条缺所有新字段的老训练；
3. 一场含 `moduleBreakdown` 的老模考；
4. 一场含 `examId/scope` 的新模考 + 模块行；
5. 一条 `verified` gap；
6. 一条无 `statusHistory` 的老 gap；
7. 一条申论老记录（仅有 `scoreDims`）。

### 6.3 手工验证（不写自动化测试的项）

在**本地 D1**（`npm run db:migrate:local` + `npm run pages:dev`）执行，禁止连线上库：

1. 新建训练不填新字段 → 保存成功、列表无「NaN/0」。
2. 填全部新字段 → 刷新后原值回显。
3. 录入一场模考并勾选双写 → 检查同 `examId` 的整卷/模块在模考页并列显示。
4. 工作台「本周 vs 上周」卡片：造两周数据 → 显示差值；删掉一周 → 显示「暂无上周对比」。
5. 问题中心：老 gap 显示「历史缺失」；新 gap 状态切换出现时间线。
6. 申论页：只填正文 → 四维区显示「未评分」；填四维 → 列表显示四维。
7. 时间分配表：无用时数据显示「暂无用时数据」；有用时数据占比正确。
8. 回归：现有雷达、增长曲线、ROI、阶段报告、洞察页不报错。

### 6.4 命令

```bash
npm run typecheck
npm run lint
npm run test        # 新增测试脚本后
```

---

## 7. 兼容性与回滚

- 所有新增字段均为可选；老记录读取时缺省为 `undefined`，不补 0、不补默认值。
- 服务端 `PUT` 与 `GET` 原样透传 JSON（`functions/api/[[path]].ts:366`、`:670-675`），新增字段不会被裁剪。
- **不需要迁移**；`migrations/` 本轮不改。
- 回滚方式：只回滚代码即可；已写入的新字段留在 JSON 中，旧代码会忽略，不影响运行。
- 历史数据（尤其 11-07 的 6 条 `full_mock` 模块行）无法自动归组；本轮明确不回填，旧口径问题在 UI 标注。

---

## 8. 风险总表

| 风险 | 影响 | 缓解 |
|---|---|---|
| `standardMinutes` 语义不清 | A3/V1 口径错误 | 表单文案写明「本条记录的标准总用时」 |
| `questionType` 与 `module` 二级路径重叠 | 数据重复或口径分裂 | UI 明确三者关系；为空时回退 module 第二段 |
| 整卷/模块双写 | 重复聚合 | A1 去重兜底；默认不双写，需显式勾选 |
| `weekKey` 周界近似 | 周环比偏差 | 复用现有实现，新增测试锁定行为，不在本轮改全局 |
| gap 重开状态选择 | 流程语义争议 | 默认 `in-progress`，产品确认后可调 |
| 老数据无 `statusHistory`/`examId` | 展示降级 | 读取时惰性降级，不写回、不迁移 |
| 全量拉取 27 表 | 数据量大时性能下降 | 本轮不引入服务端 JSON 索引；页面按需加载/限制范围 |

---

## 9. 本轮不做（再次确认）

- 不新增表、不新增 store、不改 `STORE_NAMES`、不改 `migrations/`。
- 不执行 `db:migrate:remote`、不写线上 D1、不回填历史数据。
- 不改 Agent 侧 `mcp/ability`（R1/R2/R4/R10 属于 Agent 侧，不在本仓库范围）。
- 不改现有 `scoreDims` 语义、不改现有状态枚举、不改现有 `buildGrowthSeries` 输出。
