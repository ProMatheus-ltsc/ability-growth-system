# 通用能力增长系统

> **副标题**: 覆盖小学 · 初中 · 高中 · 公考等多学段多学科的能力增长与教学管理系统
> **版本**: V5.8
> **PRD 覆盖**: P0 / P1 / P2 全需求 + §30 PDCA 问题跟进 + §31 职业选择 + §18A 学习素养

---

## 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | React 19 + TypeScript + Vite 8 |
| 样式 | Tailwind CSS 3 |
| 路由 | react-router-dom 6 |
| 业务存储 | Cloudflare D1（唯一数据源，Pages Functions 同域 `/api`） |
| 本机存储 | IndexedDB（仅设备级偏好） |
| 认证 | 用户名 + 密码，PBKDF2 哈希，HttpOnly 会话 Cookie |
| 图表 | recharts |
| 共享基座 | [`@shared/core`](https://github.com/ProMatheus-ltsc/shared-core)（`file:../shared-core`） |
| 部署 | Cloudflare Pages + Pages Functions |

---

## 1. 产品定位

**本产品不是**:题库平台、刷题网站、题目管理工具、在线考试测验平台、任何现有教育 App 的替代品。

**本产品是**:

> 覆盖小学至成人 (含公考) 全学段的 **训练管理 + 错误诊断 + 能力增长 + 复盘决策系统**,
> 同时支持个人自用与教师管理多学生场景。
>
> 用户继续使用自己已有的纸质教材/试卷/题库/线上刷题平台完成训练;
> 系统只负责记录: **我做了什么 → 做得怎么样 → 为什么错 → 有没有修复 → 能力有没有增长 → 下一步做什么。**

---

## 2. 核心设计原则

- **淡化分数,强化能力**: 以「能力掌握度」为唯一核心指标,而非分数。 分数仅作为诊断输入信号。
- **North Star Metric**: 单位有效学习时间产生的能力掌握度增长。
- **D1 唯一数据源**: 全部业务数据直接存储在 Cloudflare D1，经 Pages Functions 同域 `/api` 完成 CRUD；
  浏览器 IndexedDB 仅保留登录偏好等设备级元数据。
- **按用户名分工作空间**: 工作空间 = 登录用户名（转小写），同一账号在不同设备自动共享数据；工作空间由服务端会话决定，前端不可指定。
- **少输入 / 多默认 / 强可视 / 短路径**: 让用户把时间花在训练/反馈/修复上,而不是花在填表单上。
- **心理安全**: 训练时不显示历史表现;错误改称「待修复问题」,防止失败回避与过度自我监控。

---

## 3. 功能覆盖 (PRD P0 + P1 + P2)

### 3.1 P0 · 通用核心

| 模块 | 页面 | 说明 |
|------|------|------|
| 今日工作台 | `/` | 每日核心任务、待修复问题、能力变化、云端存储状态 |
| 训练记录 | `/trainings` | 支持多学段多学科的训练记录,含标准/快速模式、错误 chips、陌生题标记 |
| 能力中心 | `/abilities` | 能力雷达图、增长曲线、模块掌握度、三级能力标签明细 |
| 问题中心 | `/problems` | 跨学科统一管理未修复能力缺口,含错误复现率、修复→验证状态机 |
| 复盘中心 | — | 已下线（2026-11-09 用户另有独立复盘站点，界面与素养指标一并移除；`reviews` 表已删除） |
| 学段学科配置 | `Onboarding` | 5 分钟启动引导:身份 → 学段 → 学科 |
| 学生管理 (教师) | `/students` | 添加/编辑学生,含学段/年级/学科/分组/考试类型 |
| 设置 | `/settings` | 身份/学段/学科偏好,清空云端数据 |
| 云端存储 | `/storage` | D1 连通性、工作空间记录数、云端备份与恢复 |

### 3.2 P1 · 学生端进阶

| 模块 | 页面 | 说明 |
|------|------|------|
| 学习时间线 | `/timeline` | 考试倒计时 + 4 阶段规划 + 艾宾浩斯间隔复习 (学段差异化 1-30 天) |
| 测验诊断中心 | `/exams` | 录入模考各模块错误数,系统自动生成掌握度诊断 |
| 训练收益 & 阶段报告 | `/analytics` | 训练方式 ROI / 阶段报告 / 投入产出曲线 / 恶性反馈回路 / 能力迁移杠杆 |
| 公考报考信息 | `/registrations` | 岗位/招录/学历要求/历年进面记录 (不做分数预测) |

### 3.3 P1 · 教师端

| 模块 | 页面 | 说明 |
|------|------|------|
| 班级总览 | `/class` | 学生 × 学科能力热力图、活跃/停滞/退步统计、高危预警计数 |
| 学生详情 | `/students/detail` | 单学生能力雷达 / 短板 / 测验 / 教师批注时间线 |
| 任务下发 | `/assignments` | 15+ 内置模板 + 自建模板;差异化下发到全班/分组/勾选学生 |
| 批改评价 | `/corrections` | 问题标签 chips + 快捷评语库 + 星级评分,自动关联能力缺口 |
| 学生对比 | `/compare` | 2-5 学生能力雷达并列对比 + 投入 vs 错题率 |
| 教学效果 | `/effect` | 记录教师策略,一段时间后自动量化前后能力差 |
| 预警中心 | `/warnings` | 三级预警 (长期未训练 / 停滞 / 退步) |

### 3.4 P2 · 深度洞察 (`/insights`)

| Tab | 说明 |
|-----|------|
| 策略推荐 | 基于历史 ROI 和短板优先级,自动生成个性化训练策略推荐 |
| 收益预测 | 线性回归 12 周走势预测,给出达到熟练/精通所需周数 |
| What-if 模拟 | 假设每周 X 小时按特定训练结构分配,N 周后能力将达到什么水平 |
| 因果建模 | 错误类型 → 能力短板 → 建议训练方式 三层因果链可视化 |
| 迁移杠杆 | 高迁移强度能力点识别,单位时间收益最高的修复路径 |

### 3.5 学科扩展 (PRD P2)

学科枚举已扩展支持: 数学 / 物理 / 行测 / 申论 / 面试 / **语文 / 英语 / 化学 / 生物**。 后 4 科在 v1 中作为占位接口, 用户可自建模块与训练记录, 能力标签库随版本迭代补充。

### 3.6 PRD V5.8 · 问题跟进 PDCA (成年人学段, §30)

| 模块 | 页面 | 说明 |
|------|------|------|
| 问题清单 | `/pdca` | 六阶段状态机(P1/P2/P3/D/C/A) · 三种问题类型 · 生活域分类 · 停滞风险排序 |
| 问题详情 | `/pdca/detail` | 状态轴 + 根因 + 对策(5W1H) + ORID 检查 + **内嵌 iframe 工具** + **产出物归档** + **拉伸区自查** + A 阶段三出口 |
| 问题日历 | `/pdca-calendar` | 月/周/日视图 · 甘特事件条 · 三色域 · **拖拽改期** · 公考时间线并存 |
| 周检查清单 | `/pdca-weekly` | 循环衔接触发器: 每周固定推送 D/C/A 阶段问题, 强制填写检查结果 |
| PDCA 工具箱 | `/pdca-tools` | 自定义工具注册: 名称 + 链接 + 适用阶段 + 嵌入方式 |
| PDCA 效率分析 | `/pdca-efficiency` | 循环周期统计 · 停滞瓶颈识别 · 成功经验复用池 |

**下一轮 P 计划预生成草稿**: A 阶段选择"下一轮" 时, 系统自动延续高影响根因, 清空对策等待重制。

### 3.7 PRD V5.8 · 职业选择 (初中/高中/成年人, §31)

| 模块 | 页面 | 说明 |
|------|------|------|
| 职业测评 | `/career` | 简短版 15+28+20 + 完整版 45+93+60 双题库支持 |
| 报告页 | `/career` (报告 tab) | 兴趣×能力四象限 + 一票否决 + 三定 + 双路线 + **成就动机细分** + **差异提示** |
| 学段化输出 | 自动切换 | 初中: 不显示避坑清单 · 高中: 双路线 + 大学专业 · 成年人: 完整三定 |
| 一票否决可解除 | 报告页 | 二次确认 + 理由留档到 D1 |
| 高中专业变体 | 报告页(自动) | 大学专业名称 / 选科要求 / 就业去向 |
| 教师班级汇总 | `/career-class` | 匿名统计: MBTI 分布 + 四象限分布 + 底线价值分布 |

### 3.8 PRD V5.8 · 学习素养 (K12 通用, §18A)

| 模块 | 页面 | 说明 |
|------|------|------|
| 素养五维雷达 | `/literacy` | 元认知 / 时间管理 / 信息检索 / 批判性思维 / 协作沟通 |
| 行为锚点 | 页面内 | L1/L2/L3 分级, 数据来自训练/能力缺口 |
| 协作行为录入 | `/literacy-collab` | 讲题 / 小组任务 / 互助修复 专项行为记录 |
| 学期报告 | (数据服务) | `buildTermReport` 可派生学期成长报告(每学期) |
| 与职业选择联动 | 自动 | 高中素养数据校准职业选择·能力检测的自评偏差 |

### 3.9 P1 补齐 · 特殊学科能力

| 模块 | 页面 | 说明 |
|------|------|------|
| 申论作答版本管理 (§14.4) | `/subjective-answers` | 原始答案 → 教师批改 → 二次修改 版本链 |
| 面试专项训练 (§15.1) | `/interview` | 音频录制 · 思考时间 · 答题时间 · 自评+他评 |
| 学生 CSV 批量导入 (§29.2) | `/students/import` | CSV/表格粘贴 · 学段/学科自动校验 |
| 模考诊断→修复任务 | `/exams` | 一键把 <60% 模块转为能力缺口 + 修复任务 |
| 键盘快捷键 (§29.5) | 全局 | Ctrl+N 新建训练 · Ctrl+M 快速标记 |

---

## 4. 技术架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         React 19 + TS + Vite                        │
├─────────────────────────────────────────────────────────────────────┤
│  Pages                                                              │
│  ├── 学生端: DashboardPage / TrainingsPage / AbilityCenterPage ...   │
│  ├── 教师端: ClassOverview / Assignments / Correction ...           │
│  └── RoleGuard: 教师专属路由自动重定向学生到工作台                    │
├─────────────────────────────────────────────────────────────────────┤
│  Services                                                            │
│  ├── analytics.ts   聚合统计 / 训练收益 / 阶段报告 / 预警 / 边际收益 │
│  ├── insights.ts    P2 策略推荐 / 收益预测 / 因果建模 / What-if      │
│  ├── planner.ts     艾宾浩斯间隔复习 / 阶段规划 / 今日推荐            │
│  ├── taskTemplates.ts   内置任务模板库 + 评语库                      │
│  ├── localDB.ts     业务 CRUD 门面（转调 d1Client）+ 设备级元数据    │
│  ├── d1Client.ts    Pages 同域 /api 请求层（Cookie 会话）            │
│  └── snapshot.ts    26 张表名单 + 快照类型的唯一来源                 │
├─────────────────────────────────────────────────────────────────────┤
│  Domain                                                              │
│  ├── types.ts       30+ 领域实体类型定义                             │
│  ├── abilityTags.ts 5 学科三级能力标签体系 (PRD §11-15)              │
│  └── abilityTransfer.ts   能力迁移矩阵 (PRD §12B/§15B)               │
├─────────────────────────────────────────────────────────────────────┤
│  Persistence                                                         │
│  Cloudflare Pages Functions (functions/api/[[path]].ts)              │
│  └── 同域 /api → D1 Binding "DB"                                     │
│      ├── 26 张业务表: (workspace, id, updated_at, data)               │
│      ├── 服务端账号: users(含 role/grade_level) / sessions / auth_attempts │
│      └── sync_backups: 每工作空间按体积保留（≥3 个，≤6MB / 20 个）    │
│  IndexedDB（本机）                                                   │
│  └── 仅登录偏好 / 设备级元数据                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 目录结构

```
ability-growth-system/
├── src/
│   ├── App.tsx                     # 路由 + 身份感知导航 + RoleGuard
│   ├── main.tsx                    # 入口: BrowserRouter + AuthProvider
│   ├── domain/                     # 领域模型
│   │   ├── types.ts                # 30+ 实体类型 + 学段模块可见性
│   │   ├── abilityTags.ts          # 三级能力标签体系
│   │   └── abilityTransfer.ts      # 能力迁移矩阵
│   ├── services/                   # 服务层
│   │   ├── localDB.ts              # 业务 CRUD 门面（转调 d1Client）+ 设备元数据
│   │   ├── d1Client.ts             # Pages 同域 /api 请求层
│   │   ├── snapshot.ts             # 26 张表名单 / 快照类型
│   │   ├── analytics.ts            # 基础分析引擎
│   │   ├── insights.ts             # P2 深度洞察引擎
│   │   ├── planner.ts              # 学习规划器
│   │   ├── pdca.ts                 # PDCA 状态机 / 效率分析
│   │   ├── careerAssessment.ts     # 职业测评与报告
│   │   ├── literacy.ts             # 学习素养维度
│   │   └── taskTemplates.ts        # 任务模板 / 快捷短语
│   ├── hooks/
│   │   ├── useAuth.tsx             # 会话登录/注册/登出
│   │   ├── useAppSession.tsx       # 身份/学段/学科/当前学生偏好
│   │   ├── useSyncStatus.tsx       # D1 连通性 + 云端记录数
│   │   └── useKeyboardShortcuts.tsx
│   ├── components/                 # RoleGuard / Toaster / 图表 / PDCA 组件 ...
│   └── pages/                      # 学生端页面
│       ├── DashboardPage.tsx / TrainingsPage.tsx / AbilityCenterPage.tsx ...
│       ├── PdcaPage.tsx / CareerPage.tsx / LiteracyPage.tsx ...
│       ├── StoragePage.tsx         # D1 存储状态 / 备份恢复
│       ├── SettingsPage.tsx
│       ├── LoginPage.tsx           # 登录 / 注册
│       └── teacher/                # 教师端页面
├── functions/
│   ├── api/[[path]].ts             # Pages Functions: 鉴权 + /api CRUD + 备份
│   └── tsconfig.json
├── migrations/
│   ├── 0001_init.sql               # 27 张业务表 + sync_backups
│   ├── 0002_auth.sql               # users / sessions / auth_attempts
│   ├── 0003_labelStats.sql         # 题型标签聚合表（已被 0007 删除）
│   ├── 0004_drop_reviews.sql       # 下线 reviews 表
│   ├── 0005_composite_pk.sql       # 业务表主键改为 (workspace, id)
│   ├── 0006_data_cleanup.sql       # 时间戳 UTC / source 回填 / 悬空引用 / 会话 / 备份保留
│   └── 0007_drop_labelStats.sql    # 删除已死的 labelStats（需在新代码部署后执行）
├── public/_redirects               # SPA 路由回退
├── scripts/cf-pages-build.sh       # Pages 构建：克隆 shared-core + npm ci + build
├── worker/                         # 仅保留粉笔练习数据播种 SQL（旧 Worker 已删除）
├── wrangler.toml                   # Pages 输出目录 + D1 绑定
├── package.json
├── vite.config.ts                  # host 0.0.0.0 · port 3000 · /api 代理
├── tailwind.config.js
└── tsconfig.app.json
```

> **共享基座 @shared/core**：以 `file:../shared-core` 方式引入，提供表单引擎、Layout、PasswordInput、Toast、图表等基础能力。
> `tailwind.config.js` 已将其 `src` 纳入 content 扫描；Cloudflare Pages 构建由 `scripts/cf-pages-build.sh` 自动 clone 该仓库。

---

## 5. 数据模型

### 5.1 D1 表结构

26 张在用业务表结构一致，主键为 `(workspace, id)`，`workspace` 为登录用户名（小写）。
已下线的 `reviews` 与 `labelStats` 表均已从库中删除，不在快照与备份范围内。
复合主键保证确定性 id（如粉笔派生的 `ab-*`、`fenbi-md-*`）在不同账户下各自独立，写入不会跨账户抢行。
写入使用不带目标的 `ON CONFLICT DO UPDATE`，兼容迁移前后的主键。

**迁移执行顺序**：先发布代码，再执行 `0005_composite_pk.sql`，最后执行 `0007_drop_labelStats.sql`
（旧代码的 `initSchema` 会把 labelStats 重建出来，必须等新代码上线后再删）。
`0006_data_cleanup.sql` 只做数据订正与索引，已在新代码部署前执行，可重复执行。
`0008_training_semantics.sql` 归一训练记录结构字段（`kind/examRef/attemptId/parentId/depth`），
保留 `scope/aggregationRole` 供旧代码在线时读取，新旧代码均可运行，可重复执行
（已于 2026-11-13 在旧代码在线时应用到线上 D1，执行前已导出全量备份）。

**D1 迁移成本纪律**：D1 按读取/写入行数计费，迁移必须先估算再执行。

- 禁止相关子查询逐行回扫大表（历史事故：单次迁移读取 3976 万行，打满免费额度）；
  优先 `INSERT ... SELECT` 或按主键分块，每批 ≤ 50 行。
- 执行前用 `EXPLAIN QUERY PLAN` 或 `SELECT COUNT(*)` 估算扫描行数，并先 `wrangler d1 export` 备份。
- 迁移必须可重复执行：加列前查 `sqlite_master`，数据订正使用幂等条件（如 `WHERE kind IS NULL`）。
- 先发兼容代码再迁移；新代码必须能在迁移前后运行，禁止让迁移成为上线前置条件。
- 迁移后核对 26 张表行数与关键聚合口径，确认 no-op 时不改动线上数据。

```sql
CREATE TABLE trainings (
  workspace  TEXT NOT NULL DEFAULT '',
  id         TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data       TEXT NOT NULL,          -- 实体 JSON
  PRIMARY KEY (workspace, id)
);
CREATE INDEX idx_trainings_workspace_updated ON trainings(workspace, updated_at);
```

| 表 | 实体 | 主要字段 |
|-------|-------|---------|
| `trainings` | 训练记录 | date · subject · module · source · sourceId · kind · attemptId · examRef · parentId · depth · totalQuestions · errorCount · errorCategories · isUnfamiliar |
| `gaps` | 能力缺口 | subject · abilityPath · severity · status · occurrenceCount |
| `abilities` | 能力快照 | subject · abilityPath · score · level · confidence · source |
| `students` | 学生档案 | name · gradeLevel · subjects · group · examDate |
| `tasks` | 修复/验证任务 | subject · abilityPath · type · status |
| `templates` | 任务模板库 | gradeLevel · subject · taskKind · suggestedQuestions |
| `assignments` | 教师任务下发 | title · subject · totalQuestions · dueAt · assigneeStudentIds |
| `assignmentProgress` | 任务完成度 | assignmentId · studentId · status · submittedAt |
| `exams` | 测验/模考诊断 | subject · scenario · moduleBreakdown · diagnosis |
| `corrections` | 批改记录 | studentId · subject · problemTags · quickPhrases · scoreDims |
| `strategies` | 教学策略追踪 | strategyName · targetStudentIds · metricsSnapshotBefore/After |
| `registrations` | 公考报考信息 | postName · department · examType · examDate |
| `stagePlans` | 阶段规划 | stage · startDate · endDate · focusModules |
| `spacedReviews` | 艾宾浩斯间隔复习 | abilityPath · intervals · currentIndex · nextDueDate |
| `pdcaProblems` | PDCA 问题 | currentStage · problemType · lifeDomain · rootCause |
| `careerAssessments` | 职业测评 | gradeLevel · answers · result |
| `careerReports` | 职业报告 | assessmentId · quadrants · recommendations · vetoes |
| `subjectiveAnswers` | 申论作答版本 | parentId · version · content · review |
| `interviewRecords` | 面试训练 | questions · thinkingSeconds · answeringSeconds · selfReview |
| `pdcaArtifacts` | PDCA 产出物 | problemId · stage · title · content |
| `customTools` | 自定义 PDCA 工具 | name · url · stage · embedMode |
| `weeklyChecklists` | 周检查清单 | weekStart · items |
| `collaborationEvents` | 协作行为 | studentId · kind · date · detail |
| `vetoOverrides` | 一票否决解除 | reportId · candidateId · reason |
| `careerObservationPoints` | 3 个月观察点 | assessmentId · triggeredAt · note |
| `careerRetestReflections` | 复测反思 | assessmentId · answers · createdAt |

辅助表：

- `users(id, username, password_hash, created_at, role, grade_level, profile_initialized)` — 用户名唯一（小写）；
  `role` 为 `student | teacher`，`grade_level` 为 `primary | junior | senior | adult`。
- `sessions(token_hash, user_id, created_at, expires_at, user_agent, ip_hash)` — 仅保存令牌 SHA-256；
  过期会话在创建新会话或旧令牌再次出现时被删除，`idx_sessions_expires` 支撑清理。
- `auth_attempts(ip_hash, kind, attempted_at)` — 注册/登录失败限流。
- `sync_backups(id, account_id, created_at, data)` — 全量备份点，按体积保留：
  至少 3 个，累计超过 6MB 或超过 20 个时从最旧开始删除。

浏览器 IndexedDB 仅保留设备级 `meta`（偏好、最近录入默认值），不存储业务数据。

### 5.2 训练记录语义层（Option A）

`trainings` 仍是单表，但每条记录显式声明自己在一次作答中的结构角色，不再依赖
`scope` / `aggregationRole` / id 字符串约定互相压制：

| 字段 | 含义 |
|------|------|
| `kind` | `exam`（整卷根，depth 0）· `module`（模块段，depth 1）· `label`（标签段，depth ≥ 2）· `practice`（独立练习）· `review`（错题复盘）· `summary`（跨日期聚合行，任何求和都排除） |
| `attemptId` | 同一次作答的树；未来拆 attempts 表时直接作为主键 |
| `examRef` | 试卷实体引用，统一为 `exam-fenbi-exam-{paperId}`；同一张卷的多次作答可共享 `examRef`、不同 `attemptId` |
| `parentId` / `depth` | 直接父节点与层级；`module → exam`、`label → module/label` |

**聚合口径**：学科题量同一棵树优先整卷 → 否则模块 → 否则独立记录，`label` 永不相加
（一张 130 题卷的标签题量和为 330，直接加会虚增）；模块统计优先模块 → 否则整卷。
`exams.moduleBreakdown` 是派生投影：存在模块行时由 `deriveExamModuleBreakdown` 计算，
仅在没有模块行时回退到快照中的存量值；页面展示与修复任务生成统一走
`resolveExamModuleBreakdown`，避免两处口径不一致。
`validity='duplicate'` 只是数据质量标记（如 2026-11-07 卷手工模块行与粉笔模块行重复），
不参与结构判定，也不参与求和。

**0009 决策**：不新建数据重写迁移。线上 13 条测验均已有模块行，派生投影已能覆盖；
存量 `moduleBreakdown` 保留为快照兜底，`scope/aggregationRole` 停止写入，仅读取兼容。

写入边界（前端 `putRecord`、API `PUT/bulk/快照导入`）统一调用 `withTrainingSemantics`
补全 `kind/examRef/attemptId/depth`；外部导入按 `(source, sourceId, kind)` 幂等去重。
API 写入训练记录前还会查询库内同 `sourceId` 的旧行，由 `planTrainingWrite` 选择较新的
`updatedAt` 胜出并删除被替代行，避免跨请求重复导入把同一份作答计两次；
快照导入沿用 LWW 比较，不覆盖更新的库内记录。
`migrations/0008_training_semantics.sql` 对存量数据做同样归一，可重复执行。

### 5.3 Pages Functions API

前端只依赖同域 `/api`，通过 HttpOnly 会话 Cookie 鉴权；业务路由的工作空间由服务端会话推导，客户端无法指定。

| 端点 | 说明 |
|------|------|
| `GET  /api/health` | 连通性探针（D1 可用性） |
| `POST /api/auth/register` | 注册（用户名 + 密码），成功后写入会话 Cookie |
| `POST /api/auth/login` | 登录 |
| `POST /api/auth/logout` | 登出并清除 Cookie |
| `GET  /api/auth/me` | 当前会话用户（含 `profile`） |
| `GET  /api/profile` | 当前角色 / 学段 / 是否已完成初始化 |
| `PUT  /api/profile` | 更新角色与学段（写入 `users.role / grade_level`） |
| `GET  /api/stats` | 当前工作空间各表记录数（学生按本学段统计） |
| `GET  /api/stores/:store` | 列出记录 |
| `GET  /api/stores/:store/:id` | 读取单条 |
| `PUT  /api/stores/:store/:id` | 新增/覆盖单条 |
| `DELETE /api/stores/:store/:id` | 删除单条 |
| `POST   /api/stores/:store/bulk` | 批量 upsert |
| `DELETE /api/stores` | 清空当前工作空间 |
| `GET/POST /api/backups` | 备份列表 / 创建备份 |
| `POST   /api/backups/:id/restore` | 用备份覆盖当前工作空间 |

**角色与学段过滤**: 角色是服务端概念（`users.role`），不是前端视图。
`student` 账号的读写、统计、备份恢复与清空都只作用于 `users.grade_level` 对应的学段；
`teacher` 账号不受学段限制。跨学段写入会被 API 拒绝，快照导入/恢复同样按学段裁剪。
**冲突策略**: Last-Write-Wins，按 `updatedAt / createdAt / evaluationTime` 逐条比对，保留较新版本；
比较使用 `julianday()`，`+08:00` 与 `Z` 在同一时间轴上；写入前时间戳统一归一为 UTC ISO（毫秒精度）。
**账号安全**: 密码使用 PBKDF2-SHA256（10 万次迭代）加盐哈希；会话令牌 30 天有效，仅存哈希；
过期会话自动清理；同一 IP 10 分钟内注册失败 8 次或登录失败 10 次会被限流。

---

## 6. 学生 vs 教师 权限区分

系统按 `AppSession.prefs.role` 展示不同导航,并在路由层通过 `<TeacherOnly>` 组件强制守卫。
角色同时是服务端事实：`users.role` 由 `/api/profile` 维护，前端角色只影响导航与默认视图。
学生账号的读写、统计、备份恢复与清空都只作用于自身 `grade_level`；教师账号不做学段过滤；
越权写入由 API 拒绝，而不是仅靠前端隐藏。

| 路由 | 学生 | 教师 | 说明 |
|------|:----:|:----:|------|
| `/` 今日工作台 | ✅ | ✅ | 首页 |
| `/trainings` 训练记录 | ✅ | ✅ | 教师端可切换到指定学生视图 |
| `/abilities` 能力中心 | ✅ | ✅ | 同上 |
| `/problems` 问题中心 | ✅ | ✅ | 同上 |
| `/exams` 测验诊断 | ✅ | ✅ | 同上 |
| `/reviews` 复盘中心 | — | — | 已下线（用户另有独立复盘站点），旧入口重定向到首页 |
| `/timeline` 学习时间线 | ✅ | ✅ | 学生自行规划,教师可代规划 |
| `/analytics` 训练收益 | ✅ | ✅ | 同上 |
| `/insights` 深度洞察 (P2) | ✅ | ✅ | 同上 |
| `/registrations` 公考报考 | ✅ | ✅ | 公考学生备考专用 |
| `/storage` 数据存储 | ✅ | ✅ | D1 连通性 / 备份恢复 |
| `/settings` 设置 | ✅ | ✅ | 身份切换/学科配置/数据管理 |
| `/class` 班级总览 | ❌ | ✅ | **教师专属** |
| `/students` 学生管理 | ❌ | ✅ | **教师专属** |
| `/students/detail` 学生详情 | ❌ | ✅ | **教师专属** |
| `/assignments` 任务下发 | ❌ | ✅ | **教师专属** |
| `/corrections` 批改评价 | ❌ | ✅ | **教师专属** |
| `/compare` 学生对比 | ❌ | ✅ | **教师专属** |
| `/effect` 教学效果 | ❌ | ✅ | **教师专属** |
| `/warnings` 预警中心 | ❌ | ✅ | **教师专属** |

学生访问教师路由时,`<TeacherOnly>` 会重定向到 `/` 工作台。 用户可在「设置」中切换身份。

---

## 7. 关键算法说明

### 7.1 能力掌握度评估

`masteryScore = 0.7 × 陌生题正确率 + 0.3 × 整体正确率` — PRD 强调 「陌生题正确率」是能力增长的真实核心指标,重复题正确率不代表能力增长。

### 7.2 训练收益 (ROI)

对每种训练类型 (`daily / topic / review / unfamiliar / timed / experiment / exam`):
- 按训练日期排序,分为前半段与后半段
- 用 `后半段掌握度 - 前半段掌握度` 作为该训练方式在你身上的能力增量
- 除以总投入小时数得到 `perHour` (单位小时能力增量)
- 排序输出,并给出「降低低 ROI 训练投入」建议

### 7.3 艾宾浩斯间隔复习

按学段差异化 (PRD §6):

```
小学: 1 / 2 / 4 / 7 天
初中: 1 / 3 / 7 / 14 天
高中: 1 / 3 / 7 / 14 / 30 天
成年人: 1 / 3 / 7 / 14 / 30 天 (可自配置)
```

到期时系统自动推送提醒;完成后 `advanceSpacedReview` 会推进到下一个复习节点或标记为「毕业」。

### 7.4 P2 · What-if 模拟

给定 (每周投入小时 × 训练结构比例 × 模拟周数):

```
weightedPerHour = Σ (perHour(trainingType) × ratio(trainingType)) / Σ ratios

for each week:
  decayFactor = max(0.15, (100 - currentMastery) / 100)   // 边际递减
  currentMastery += weightedPerHour × hoursPerWeek × decayFactor
```

避免了简单线性外推带来的「无限增长」问题,靠近满分时增益衰减。

### 7.5 恶性反馈回路检测

近 8 周内同一错误类型出现于 ≥ 4 周,且缺少对应修复动作 → 标记为恶性回路,提示打破循环。

### 7.6 迁移杠杆点识别

对每个未修复的能力缺口 (`AbilityGap`):
- 查询迁移矩阵,找到该能力作为「源头」的边
- 加权计算迁移强度覆盖度: `strong = 2, medium = 1`
- 结合复现次数、严重度输出杠杆分数

---

## 8. 本地开发

### 8.1 环境要求

- Node.js ≥ 20.19（Vite 8 要求 `^20.19.0 || >=22.12.0`）
- npm ≥ 10
- 共享基座目录 `../shared-core`（`@shared/core` 以 `file:` 依赖引入）

### 8.2 安装与启动

```bash
npm install

# 终端 1：本地 D1 + Pages Functions（默认 http://127.0.0.1:8788）
npm run db:migrate:local      # 首次：建表
npm run pages:dev             # 构建前端并启动 Pages dev

# 终端 2：前端热更新（Vite 代理 /api → 127.0.0.1:8788）
npm run dev                   # 访问 http://localhost:3000
```

> 本地 D1 数据保存在 `.wrangler/state/v3/d1`（已 gitignore）。
> 直接用浏览器访问 `http://127.0.0.1:8788` 时，由 Pages dev 同时提供静态页面和 `/api`。

### 8.3 类型检查 & 构建

```bash
npm run typecheck    # 前端 + functions 独立类型检查 (不生成文件)
npm run lint         # oxlint
npm run build        # Vite 构建
npm run preview      # 本地预览生产构建（不含 /api）
```

### 8.4 首次使用

打开应用 → 注册用户名和密码 → 进入学段/学科引导 → 开始记录。
再次访问时自动使用当前会话；同一用户名在其它设备登录即可看到相同数据。

### 8.5 Vite 服务器配置

`vite.config.ts` 固定 `host: '0.0.0.0'` + `port: 3000` + `strictPort: true`，并将 `/api` 代理到本地 Pages dev。

---

## 9. 部署（Cloudflare Pages + Pages Functions + D1）

### 9.1 Cloudflare Pages（前端 + API）

通过 Cloudflare Pages 的 GitHub 集成部署：push 到 `main` 自动构建，`functions/` 目录随 Pages 一起发布，提供同域 `/api`。

- **Build command**: `bash scripts/cf-pages-build.sh`
- **Build output directory**: `dist`
- **Environment variables**: `NODE_VERSION = 22`

> `@shared/core` 以 `file:../shared-core` 方式引入，构建时要求项目父目录存在该公共包；
> `scripts/cf-pages-build.sh` 会在构建前自动 clone `github.com/ProMatheus-ltsc/shared-core` 到父目录并安装其依赖。
> 本地手动 `wrangler pages deploy dist` 无需该脚本（本地已存在 shared-core）。

也可命令行部署：

```bash
npm run pages:deploy
```

### 9.2 绑定 Cloudflare D1

1. 创建数据库并记下 `database_id`：

   ```bash
   npx wrangler d1 create ability_growth
   ```

2. 把 `database_id` 填入根目录 `wrangler.toml` 的 `[[d1_databases]]`；
   或在 Pages 项目 **Settings → Functions → D1 database bindings** 中绑定：
   - Variable name: `DB`
   - D1 database: `ability_growth`

3. 执行建表（26 张业务表 + 账户/会话表）：

   ```bash
   npm run db:migrate:remote
   ```

   Pages Functions 首次请求也会自动补建缺失的表，因此旧库无需手工迁移。
   但 `0005_composite_pk.sql` 属于主键重建：旧库必须显式 apply 才会生效，
   建议顺序为 **先发布代码、再 apply 0005**（写入语句对新旧主键都兼容），
   apply 前先导出一份 D1 备份，执行后核对 26 张表行数与 `PRAGMA table_info(<表名>)` 的 pk 列。

   完整顺序：

   1. 部署新代码（`0006` 只订正数据与索引，可在部署前执行，且可重复执行）；
   2. apply `0005_composite_pk.sql`；
   3. apply `0007_drop_labelStats.sql`（必须在新代码之后，否则旧 `initSchema` 会重建该表）。

4. 部署后访问 `https://<项目>.pages.dev/api/health`，返回 `{"ok":true,"storage":"d1"}` 即连通。

> D1 是业务数据的唯一来源，应用不提供本地数据导入/合并，也不提供 JSON 导出。
> 备份与恢复都在云端完成（`sync_backups` 表，按体积保留：至少 3 个，累计超过 6MB 或 20 个时从最旧删除）。
> 账号密码与会话完全由 Pages Functions 管理，无需额外环境变量或访问令牌。

### 9.3 数据播种脚本（旧 Worker 已移除）

早期独立同步 Worker `ability-growth-sync` 及其自动部署工作流已删除，前端与 API 全部由 Pages Functions 提供。
`worker/` 目录仅保留粉笔练习数据的播种脚本 `seed-fenbi.sql`，手动执行方式见 `worker/seed-fenbi.README.md`。

---

## 10. 版本演进路线

- **v0.1 (当前)**: P0 + P1 + P2 全需求覆盖 + PDCA/职业选择/学习素养；业务数据直连 Cloudflare D1（Pages Functions），服务端用户名密码登录，按用户名分工作空间
- v0.2 (规划): 语文/英语/化学/生物 能力标签库补齐
- v0.3 (规划): 教师端多设备协同、批改照片上传、语音批改
- v1.0 (规划): 移动端 PWA、离线优先架构完善、多语言

---

## 11. 引用

- PRD 版本: V5.8（P0 + P1 + P2 + §30 PDCA + §31 职业选择 + §18A 学习素养）
- 共享基座: [`@shared/core`](https://github.com/ProMatheus-ltsc/shared-core)（以 `file:../shared-core` 本地路径引入，勿提交到本仓库）
- 图表: recharts
- 图标: lucide-react
- 存储: Cloudflare D1 + Pages Functions；idb 仅用于设备级元数据

---

**Not: 用更多题, 而是搞清楚为什么做了这么多题却没有变得足够强, 以及下一小时应该用在哪里。**
