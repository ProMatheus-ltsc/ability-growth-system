# 线上验收报告（2026-11-13）

验收对象：`https://ability-growth-system.pages.dev`（Pages + Functions + D1 `ability_growth`）
验收范围：A 方案（单表 attempt 语义）部署后的部署健康、认证、读路径聚合、写路径语义与幂等、学段/K12 隔离、UI。
验收方式：生产只读数据核对 + 独立 Python oracle 对拍 + 临时账号端到端写入 + 浏览器实测。临时账号与数据已全部清理。

## 结论

A 方案线上可用：读路径聚合口径与独立 oracle 完全一致；训练记录语义字段、批量幂等、写入校验、学段隔离、备份恢复按设计生效。
首轮验收发现 2 个前端缺陷（1 个白屏、1 个修复任务取错模块）和 3 个口径/隔离遗留项；**第二轮已全部修复并通过自动化 + 本地端到端复验**（见第 9 节）。
两个遗留数据决策已按用户确认处理完毕（补录 `exam-fenbi-exam-1266200582` 试卷记录、删除 `guardlive_658749` 残留训练），变更前已导出并还原校验生产备份（见第 11 节）。

## 1. 部署与健康

| 检查项 | 结果 |
|---|---|
| `GET /` | 200 |
| 生产 HTML 引用 | `assets/index-dK8SXiO6.js`、`assets/index-Bzlnxn0w.css` |
| 前端产物 | `assets/index-dK8SXiO6.js` 200 |
| Option A 前端标记 | bundle 内 `attempt:` ×4、`exam-fenbi-exam-` ×2 |
| `GET /api/health` | `{"ok":true,"storage":"d1","version":"2.2.0"}` |
| 未认证 `GET /api/profile`、`/api/stats`、`/api/stores/trainings` | 均 401 |

注意：旧标签页可能仍持有旧 bundle（`index-RM6h_lZZ.js`，无 attempt 语义），验收中复现过一次旧口径；强制刷新后恢复。不能把“用户看到旧数据”直接判为服务端回归。

## 2. 认证与会话

- 新账号注册（用户名 3–32 无空白、密码 8–72）→ 登录 → HttpOnly cookie `ability_growth_session`，全流程正常。
- 会话按 `user_id` 存储；服务端在新建会话时清理 `expires_at <= now` 的过期会话（`functions/api/[[path]].ts:274`）。
- 验收账号及其会话已删除（见第 8 节）。

## 3. 读路径聚合（生产 admin 工作区）

| 指标 | 数值 |
|---|---|
| trainings 原始行 | 3541（验收前后一致） |
| 有效记录 `selectValidRecords` | 3480（排除 duplicate 19、summary 42） |
| 聚合记录 `selectAggregationRecords` | 453（每 attempt 取 exam > module > 非 label） |
| 模块级记录 `selectModuleLevelRecords` | 514 |
| 有效 attempt 数 | 378 |
| 行测学科口径 | 7308 题 / 3030 错 / 4691.8 分钟 / 正确率 58.54% |

- 独立 Python oracle 与 TS 实现逐项一致（valid / aggregation / moduleLevel / attempts 及学科合计）。
- 模块统计一致：判断推理 1093/380、言语理解 1145/385、常识判断 915/407、数量关系 432/252、资料分析 508/269、政治理论 416/234（TS 侧未计入伪模块“错题复盘/高频错点”）。
- 排除项体量：label 2952 行 / 10426 题 / 4438 错；summary 42 行 / 1724 题 / 656 错；duplicate 19 行 / 209 题。若参与学科求和会明显虚增，当前排除正确。
- “55 个仅含标签的 attempt” 实为 42 个 summary + 11 个 duplicate practice + 2 个 duplicate exam，不存在标签层增量数据丢失。

## 4. Exam 模块投影（13 张卷）

- 13/13 都有模块行；13/13 的 derived 合计与 stored 合计相等。
- 差异均为“derived 更准确”的方向：
  - `4291592376`：仅分数取整差异（74 vs 74.3、77 vs 76.7）。
  - `1266355745`：stored 科学推理 10/2 → derived 判断推理 10/2（模块归一）。
  - `3406247520`：stored 判断推理 20/4 + 科学推理 5/1 → derived 判断推理 25/5（合并）。
  - `4291593113`：stored 常识判断 20/9 且无政治理论 → derived 常识判断 10/3 + 政治理论 10/6（拆分）。
  - `4293024384`：12 行模块 = 6 duplicate + 6 canonical，derived 只取 6 行。
- `exam-fenbi-exam-1266200582` 原只存在于 trainings；2026-11-13 已用粉笔 `report/v2` 复核（100 题 / 68 对 / 32 错 / 用时 6009 秒 / 章节“思维能力测验”）并补录 exams 记录，41 条训练全部保留（见第 11 节）。

## 5. 写路径语义与幂等（临时工作区，已清理）

- 显式 `kind` 保留；legacy `scope:'module'` + `aggregationRole:'module_detail'` → `kind='module'`、`depth=1`；label `depth=2`；exam/practice `depth=0`。
- 缺省 `source` → `manual`；公考学科自动补 `gradeLevel='adult'`。
- examRef 归一：`fenbi-exam-9999990001` → `exam-fenbi-exam-9999990001`；纯数字 `9999990003` → `exam-fenbi-exam-9999990003`；`attemptId='attempt:<examRef>'`。
- 批量幂等：同一 bulk 内相同 `(source, sourceId, kind)` → 落库 1 行，保留 `updatedAt` 最新。
- 跨请求幂等未强制：两次独立 PUT 相同 key → 2 行（详见问题 4）。
- 写入校验（均返回 422）：shenlun 写 trainings、K12 学科缺 gradeLevel、math + adult 组合、学生 adult 写 primary、学生 primary 写 junior。
- 备份：创建、列表、删除、恢复均可用。恢复快照同样走批量幂等，10 条快照恢复 9 条（`acc-cross-x1` 被较新的 `acc-cross-x2` 去重），符合预期。

## 6. 学段隔离与 K12

- primary 只读到 primary 数据；junior 只读到 junior 数据；adult 只读到 10 条 adult 训练与 0 条 K12 试卷。
- teacher 读到全部（12 条训练、1 张 junior 试卷、2 条 collaborationEvents），符合“教师看全量”设计。
- K12 学科强制显式 `gradeLevel`；公考学科自动归 `adult`；K12 缺学段写入被 422 拦截。
- 漏洞（第二轮已修复）：`collaborationEvents` 现按记录 `gradeLevel` 过滤，缺学段/写 adult 的写入被 422 拦截。
- 观察（第二轮已修复）：`students` 已纳入 `GRADE_SCOPED_STORES`，按学段过滤；缺学段的历史行按既有兜底策略只落在 adult，不会串入 K12。

## 7. UI 验收

- 登录 + onboarding（student → 行测 → 跳过基线）正常。
- 强制刷新后 Dashboard 显示“行测 71% · 195 题 · 错 56”，与 `aggregateBySubject` 一致。
- `/exams` 显示 derived 模块：判断推理 80%（30/6）、政治理论 20%（10/8）、常识判断 80%（10/2）；而该卷存储快照为“常识判断 40、判断推理 80、无政治理论”，证明 derived 投影已生效。
- 首轮缺陷（第二轮已复验修复）：
  - “一键生成修复任务”首轮只生成 `xingce/常识判断`，未生成政治理论，证明当时 `convertToFixTasks` 仍读存储快照。第二轮改为 derived-first 后，用只有模块行、没有存储快照的旧卷复验：页面显示数量关系 40%，点击后生成 `xingce/数量关系` gap + task。
  - 首轮一条缺 `mainProblems` 的 exam 记录导致 `/exams` 白屏。第二轮同一条旧卷（缺 `moduleBreakdown` / `mainProblems` / `generatedTaskIds`）正常渲染，Layer 3 自动省略。
- 第二轮同时验证：把账号切到 primary 后 `/exams` 为空，adult 试卷不会串入 K12 视图。

## 8. 数据清理

- 已删除临时工作区 `accept20261113` 全部数据并复核为 0：trainings 15、exams 2、gaps 1、tasks 1、collaborationEvents 2、sync_backups 1、users 1、sessions 2；其余 store 本就没有该工作区数据。
- 生产 admin 未受影响（复核，数据变更前）：trainings 3541、exams 13、gaps 74、abilities 69、students 1、registrations 2。
- 临时测试文件 `tests/onlineAcceptance.tmp.test.ts` 已删除，工作树干净。
- `auth_attempts` 仅按 `client_key` 哈希计数，无法按用户名定位验收记录，未删除（会自然过期）。
- `guardlive_658749` 工作区的 1 条历史测试训练已于 2026-11-13 删除；该工作区在 exams / students / gaps 中本就没有数据（见第 11 节）。

## 问题清单

### P1（影响正确性 / 稳定性）

1. **修复任务取错模块** — `src/pages/ExamDiagnosisPage.tsx:49` ✅ 已修复（第二轮）
   `convertToFixTasks` 用 `exam.moduleBreakdown`（存储快照），页面展示用 `deriveExamModuleBreakdown(...) ?? exam.moduleBreakdown`（第 154 行），两处口径不一致。线上已复现：页面显示政治理论 20%，生成的任务却落在常识判断。
   建议：统一改为 derived-first；生成任务前强制 materialize 模块行。

2. **旧试卷记录导致 /exams 白屏** — `src/pages/ExamDiagnosisPage.tsx:252` ✅ 已修复（第二轮）
   `e.mainProblems.length` 无空值保护；API 写入/导入未校验 `ExamRecord` 必填数组字段，异常记录可直接落库。
   建议：改为 `(e.mainProblems?.length ?? 0) > 0`，并在写入/导入边界校验必填字段。

3. **collaborationEvents 学段间串数据** — `src/domains/shared/scope.ts:164` ✅ 已修复（第二轮）
   `K12_ONLY_STORES` 对任意 K12 学段返回全量记录。线上复现：primary 档案看到 junior 事件。
   建议：与 `SUBJECT_SCOPED_STORES` 一致，按记录 `gradeLevel` 过滤；缺学段的记录拒绝或显式归属。

### P2（口径 / 一致性问题）

4. **跨请求幂等未强制** — `functions/api/[[path]].ts:481-501` ✅ 已修复（第二轮）
   只在单次批量/导入时去重，两次独立请求相同 `(source, sourceId, kind)` 会落 2 行，读取层不跨行去重。
   建议：需要硬保证时改为按 key 查询后 upsert，或加唯一索引；否则须要求调用方复用稳定 id。

5. **students 不参与学段过滤** — `src/domains/shared/scope.ts:148-169`（观察项）✅ 已修复（第二轮）
   学生列表跨学段共享是否产品意图需确认；若不是，应纳入 `GRADE_SCOPED_STORES`。

6. **悬空 examRef** — `exam-fenbi-exam-1266200582` 只存在于 trainings，exams 表无记录，诊断列表不展示。✅ 已修复（2026-11-13）：粉笔复核后补录 exams 记录，41 条训练保留（见第 11 节）。

### P3（清理 / 后续）

7. legacy `scope` / `aggregationRole` 字段仍可写入（已兼容），可择期移除并同步 `paperStructure` 校验。✅ 已清理（第二轮）：业务代码停写，`paperStructure` 契约只看 `kind`，旧字段仅读兼容。
8. 备份保留策略：至少 3 份、最多 20 份、累计 6 MiB（`functions/api/[[path]].ts:49-51,658`）；当前 `sync_backups` 5 行。0009 对账迁移（materialize 模块行后停写 `moduleBreakdown`）尚未执行。✅ 决策已记录（第二轮）：不新建 0009 数据重写，模块投影 derived-first、存储快照仅兜底，详见 README。
9. README 缺迁移成本指引（集合式/分批、先估算 rowsRead）——本次 D1 限流的直接教训。✅ 已补（第二轮）。
10. `guardlive_658749` 测试工作区残留 1 条训练记录。✅ 已删除（2026-11-13，见第 11 节）。

## 9. 第二轮修复与回归（2026-11-13）

### 9.1 修复清单

| 编号 | 修复 | 验证 |
|---|---|---|
| P1-1 | 新增 `resolveExamModuleBreakdown`（derived-first，存储快照兜底）；`convertToFixTasks` 与页面展示共用同一投影 | 单测 3 条；本地旧卷只有模块行时页面显示数量关系 40%，点击后生成 `xingce/数量关系` gap + task |
| P1-2 | 渲染改为 `(e.mainProblems ?? [])`；API `normalizeExamArrays` 把 exams 的 `moduleBreakdown / mainProblems / generatedTaskIds` 缺失或脏值归一为 `[]` | 单测 4 条；本地旧卷缺三个数组字段仍正常渲染，Layer 3 自动省略 |
| P1-3 | `collaborationEvents` 按显式 `gradeLevel` 过滤；`validateStoreRecordScope` 拒绝缺学段与 adult | 单测覆盖 primary/junior/senior 隔离；本地 API 返回 422 两条预期错误 |
| P2-4 | `planTrainingWrite` + `loadTrainingSourceRows` + `writeTrainingRecords`：同 `(source, sourceId, kind)` 跨请求 LWW，旧行删除，过期写入跳过；批量/单条/快照导入统一 | 单测 7 条；本地 API 连写三条：新 id 覆盖旧 id、过期写 `skipped:true`、最终仅 1 行 |
| P2-5 | `students` 纳入 `GRADE_SCOPED_STORES` | 单测覆盖各学段可见性；读路径按学段过滤 |
| P3-7 | 业务代码停写 `scope / aggregationRole`；移除 `syncModule` 开关，整卷与模块行始终 materialize；`paperStructure` 契约只看 `kind`，历史 `scope` 仅读兼容 | 单测覆盖；类型检查通过 |
| P3-8 | 不新建 0009 数据重写：线上 13/13 卷已有模块行，derived 投影可覆盖；快照仅兜底 | README「0009 决策」 |
| P3-9 | README 增加 D1 迁移成本纪律（按行计费、集合式/分批、先估算） | README |
| P3-10 | 删除 `guardlive_658749` 残留训练 `g1` | 2026-11-13 已删除，工作区各 store 复核为 0 |

附带修正：`0006_data_cleanup.sql` 删除已废弃的 `labelStats` 时间戳段（0007 已删表），恢复“0007 之后仍可重复执行”的承诺。

### 9.2 自动化验证

- `npm run typecheck`：通过。
- `npm test`：259 条用例，258 passed / 1 skipped（26 个文件通过 + 1 个跳过，共 27 个测试文件）。
- `npm run lint`：0 errors（31 条既有 warning）。
- `npm run build`：成功（`dist/assets/index-BjvZSmyl.js`、`index-Bzlnxn0w.css`）。

### 9.3 本地端到端验证

- 本地 Pages + D1 启动后注册独立测试账号，完整走完 4 步 onboarding（学生 → 行测 → 跳过基线）。
- 插入缺 `moduleBreakdown / mainProblems / generatedTaskIds` 的旧卷 + 一条 `kind=module` 训练行：`/exams` 正常渲染，Layer 1 显示 derived「数量关系 40%」。
- 点击「一键生成修复任务」：生成 1 条 `xingce/数量关系` gap 与 1 条 task，证明 P1-1 生效。
- 跨请求幂等：`legacy-idem-1` → `legacy-idem-2`（较新）替换并删除旧行；`legacy-idem-3`（较旧）返回 `skipped:true`；最终列表只剩 1 行。
- 学段隔离：切到 primary 后 `/exams` 为空，adult 试卷与训练不进入 K12 视图。
- 测试工作区数据已通过 `DELETE /api/stores` 清空，本地开发服务已停止。

## 10. 历史对话事项完成度

| 事项 | 状态 | 证据 |
|---|---|---|
| GitLab 建仓、禁止 GitHub 提交 | 完成 | 仅 GitLab origin；本轮未提交/未推送/未部署 |
| 既有数据备份 | 完成 | `pre-domain-split-20261112.sql`、`pre0008`、`post0007` 三份备份 + md5 校验 |
| Option A 单表 attempt 语义 | 完成并上线 | 第 3–6 节读/写/隔离验收 |
| 公考数据不进 K12、K12 学段互隔离 | 完成 | 代码 + 单测 + 本轮本地 UI 复验 |
| 时间戳统一 UTC + LWW | 完成 | 生产 `trainings.updated_at NOT LIKE '%Z'` = 0 |
| 服务端强制角色/学段过滤 | 完成 | `validateWriteScope` / `gradeFilter` + 单测 |
| sessions 过期清理 | 完成 | 生产过期会话 = 0；`idx_sessions_expires` 已建 |
| 备份按体积保留 | 完成 | 生产 `sync_backups` 5 行 / 6,079,814 B（≤ 6 MiB） |
| 228 行缺 source 回填 | 完成 | 生产缺 `source` 训练 = 0 |
| labelStats 死表移除 | 完成 | 生产 `sqlite_master` 无 labelStats |
| 10 条悬空 gap 引用清理 | 完成 | 生产悬空引用 = 0 |
| 角色服务端化 | 完成 | `users.role` + 服务端过滤 |
| 线上验收报告 | 完成 | 本文件 |
| 悬空 examRef `1266200582` | 完成 | 粉笔复核后补 exams 记录，41 条训练保留；`kind=exam` 孤儿 = 0 |
| `guardlive_658749` 残留训练 | 完成 | 生产已删除，各 store 复核为 0 |

## 11. 遗留数据决策执行（2026-11-13）

### 11.1 变更前备份

- 生产 D1 导出：`~/.local/share/gongkao-agent/backups/ability-growth-d1-20261113-pre-fix.sql`（10,677,802 B，md5 `dd5d5155362ad3e2d3f8b83025dcc70b`）。
- 还原到临时 SQLite 校验：trainings 3542、exams 13、gaps 74、abilities 69、students 1、users 2；41 条训练挂在目标 examRef 下；`guardlive_658749` 仅 1 条训练。

### 11.2 补录试卷记录

- 粉笔 `report/v2` 复核 exercise id `1266200582`：100 题、68 对、32 错、用时 6009 秒、章节“思维能力测验”，与训练行（68/100、100 分钟）一致。
- 写入 `exams`（workspace=`admin`）：`exam-fenbi-exam-1266200582`，2021-03-10，省考/地方卷、2021 年、满分 100、总分 68、标准用时 90 分。
- 模块投影：数量关系 20 题 / 错 8 / 60%；判断推理 80 题 / 错 24 / 70%。

### 11.3 删除测试残留

- 删除 `trainings` 中 `workspace='guardlive_658749' AND id='g1'`（module `????`、date 2026-11-10 的 topic 测试行）；该工作区 exams / students / gaps 均无数据。

### 11.4 变更后复核（生产 D1）

- trainings 3541、exams 14；目标 examRef 下 41 条训练保持不变；`kind='exam'` 且 examRef 无对应 exams 的记录 = 0。
- `guardlive_658749` trainings = 0。
- 另有 2095 条 `kind=module/label` 训练引用 172 个无 exams 行的 examRef，属模块专项训练（无整卷记录），非数据缺失。

## 范围外（本次未验收）

- 多租户 / 计费 / 订阅等商业化能力。
- K12 内容补齐 v0.2。
- Option B（独立 attempts / segments 表）。
