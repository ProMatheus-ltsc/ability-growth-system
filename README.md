# 通用能力增长系统

> **副标题**: 覆盖小学 · 初中 · 高中 · 公考等多学段多学科的能力增长与教学管理系统
> **项目版本**: v0.1.0 ｜ **PRD 版本**: V5.1 (交互体验增强版) ｜ **PRD 覆盖**: P0 / P1 / P2 全需求

---

## 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | React 19 + TypeScript + Vite 8 |
| 样式 | Tailwind CSS 3 |
| 路由 | react-router-dom 6 |
| 业务存储 | Cloudflare D1（唯一数据源，经 Pages Functions 同域 `/api` 直连 CRUD） |
| 账户体系 | 服务端用户名 + 密码（PBKDF2-SHA256），HttpOnly 会话 Cookie（30 天） |
| 本机存储 | IndexedDB（仅偏好设置） |
| 图表 | recharts |
| 共享基座 | [`@shared/core`](https://github.com/ProMatheus-ltsc/shared-core)（GitHub git 依赖，复用表单引擎/UI 组件/工具层） |
| 部署 | Cloudflare Pages + Pages Functions（GitHub 集成自动构建） |

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
- **D1 唯一数据源**: 全部业务数据直接存储在 Cloudflare D1，通过 Pages Functions 同域 `/api` 完成 CRUD；
  浏览器只保留偏好设置。
- **服务端账户**: 用户名 + 密码注册登录，会话由服务端写入 HttpOnly Cookie；暂不接入邮箱找回。
- **按用户名分工作空间**: 工作空间 = 登录用户名（转小写），同一用户名在不同设备自动共享数据。
- **少输入 / 多默认 / 强可视 / 短路径**: 让用户把时间花在训练/反馈/修复上,而不是花在填表单上。
- **心理安全**: 训练时不显示历史表现;错误改称「待修复问题」,防止失败回避与过度自我监控。

---

## 3. 功能覆盖 (PRD P0 + P1 + P2)

### 3.1 P0 · 通用核心

| 模块 | 页面 | 说明 |
|------|------|------|
| 今日工作台 | `/` | 每日核心任务、待修复问题、复盘提醒、能力变化、云端存储状态 |
| 训练记录 | `/trainings` | 支持多学段多学科的训练记录,含标准/快速模式、错误 chips、陌生题标记 |
| 能力中心 | `/abilities` | 能力雷达图、增长曲线、模块掌握度、三级能力标签明细 |
| 问题中心 | `/problems` | 跨学科统一管理未修复能力缺口,含错误复现率、修复→验证状态机 |
| 复盘中心 | `/reviews` | 日 / 周 / 月三级复盘,自动带出训练摘要与短板推荐 |
| 学段学科配置 | `Onboarding` | 5 分钟启动引导:身份 → 学段 → 学科 |
| 学生管理 (教师) | `/students` | 添加/编辑学生,含学段/年级/学科/分组/考试类型 |
| 设置 | `/settings` | 身份/学段/学科偏好,清空云端数据 |
| 数据存储 | `/storage` | D1 连通性、工作空间记录数、云端备份与恢复 |

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
| AI 辅助评估 | `/ai-assist` | 生成 5 学科提示词 → 粘贴 AI 返回 JSON → 校验后填充学生能力档案 |
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
│  ├── aiPrompt.ts    外部 AI 提示词生成 + JSON 解析                   │
│  ├── taskTemplates.ts   内置任务模板库 + 评语库                      │
│  ├── localDB.ts     业务 CRUD 门面（转调 d1Client）+ 设备级元数据        │
│  ├── d1Client.ts    Pages 同域 /api 请求层（Cookie 会话，credentials 同源）│
│  └── snapshot.ts    15 张表名单 + 快照类型的唯一来源                  │
├─────────────────────────────────────────────────────────────────────┤
│  Domain                                                              │
│  ├── types.ts       15+ 领域实体类型定义                             │
│  ├── abilityTags.ts 5 学科三级能力标签体系 (PRD §11-15)              │
│  └── abilityTransfer.ts   能力迁移矩阵 (PRD §12B/§15B)               │
├─────────────────────────────────────────────────────────────────────┤
│  Persistence                                                         │
│  Cloudflare Pages Functions (functions/api/[[path]].ts)              │
│  └── 同域 /api → D1 Binding "DB"                                     │
│      ├── 服务端账户: users / sessions / auth_attempts                │
│      ├── 15 张业务表: (workspace, id, updated_at, data)               │
│      ├── workspace = 用户名（小写），多设备共享                        │
│      └── sync_backups: 每账户最近 20 个备份点                         │
│  IndexedDB（本机）                                                   │
│  └── 仅偏好设置                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 目录结构

```
ability-growth-system/
├── src/
│   ├── App.tsx                     # 路由 + 身份感知导航 + RoleGuard
│   ├── main.tsx                    # 入口: BrowserRouter + Providers
│   ├── domain/                     # 领域模型
│   │   ├── types.ts                # 15+ 实体类型
│   │   ├── abilityTags.ts          # 三级能力标签体系
│   │   └── abilityTransfer.ts      # 能力迁移矩阵
│   ├── services/                   # 服务层
│   │   ├── localDB.ts              # 业务 CRUD 门面（转调 D1）+ 设备级元数据
│   │   ├── d1Client.ts             # Pages 同域 /api 请求层
│   │   ├── snapshot.ts             # 15 张表名单 / 快照类型
│   │   ├── analytics.ts            # 基础分析引擎
│   │   ├── insights.ts             # P2 深度洞察引擎
│   │   ├── planner.ts              # 学习规划器
│   │   ├── aiPrompt.ts             # 外部 AI 辅助
│   │   └── taskTemplates.ts        # 任务模板 / 快捷短语
│   ├── hooks/
│   │   ├── useAuth.tsx             # 服务端登录/注册/退出 + 会话状态
│   │   ├── useAppSession.tsx       # 身份/学段/学科/当前学生偏好
│   │   └── useSyncStatus.tsx       # D1 连通性 + 云端记录数
│   ├── components/
│   │   ├── AppLayout.tsx           # 侧边栏外壳 + 退出登录
│   │   ├── RoleGuard.tsx           # 路由权限守卫（教师专属）
│   │   ├── Toaster.tsx / MasteryBar.tsx / RadarChart.tsx ...
│   ├── pages/                      # 学生端页面
│   │   ├── DashboardPage.tsx
│   │   ├── TrainingsPage.tsx
│   │   ├── AbilityCenterPage.tsx
│   │   ├── ProblemCenterPage.tsx
│   │   ├── ExamDiagnosisPage.tsx
│   │   ├── ReviewPage.tsx
│   │   ├── TimelinePage.tsx
│   │   ├── AnalyticsPage.tsx
│   │   ├── InsightsPage.tsx        # P2 深度洞察
│   │   ├── ExamRegistrationPage.tsx
│   │   ├── StoragePage.tsx         # 数据存储 / 备份恢复
│   │   ├── SettingsPage.tsx
│   │   ├── LoginPage.tsx
│   │   └── OnboardingPage.tsx
│   └── pages/teacher/              # 教师端页面
│       ├── ClassOverviewPage.tsx
│       ├── StudentsPage.tsx        (从 pages/ 复用)
│       ├── StudentDetailPage.tsx
│       ├── AssignmentsPage.tsx
│       ├── CorrectionPage.tsx
│       ├── StudentComparePage.tsx
│       ├── TeachingEffectPage.tsx
│       ├── AIAssistPage.tsx
│       └── WarningPage.tsx
├── functions/
│   ├── api/[[path]].ts             # Pages Functions: 账户会话 + /api CRUD + 备份
│   └── tsconfig.json
├── migrations/0001_init.sql        # D1 建表脚本（15 张业务表 + sync_backups）
├── migrations/0002_auth.sql        # users / sessions / auth_attempts
├── public/_redirects               # SPA 路由回退
├── wrangler.toml                   # Pages 构建输出 + D1 绑定
├── .github/workflows/              # CI（当前无，部署走 Cloudflare Pages 集成）
├── package.json
├── vite.config.ts                  # host 0.0.0.0 · port 3000 · strictPort
├── tailwind.config.js
└── tsconfig.app.json
```

> **共享基座 @shared/core**：通过 `git+https://github.com/ProMatheus-ltsc/shared-core.git` 引入（见 package.json），
> 安装到 `node_modules/@shared/core`，提供表单引擎（RHF 增强版）、认证、Layout、PasswordInput、图表等基础能力；
> tailwind.config.js 已将其 `src` 纳入 content 扫描。

---

## 5. 数据模型

### 5.1 D1 表结构

15 张业务表结构一致，主键为 `id`，`workspace` 为登录用户名（小写）：

```sql
CREATE TABLE trainings (
  workspace  TEXT NOT NULL DEFAULT '',
  id         TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  data       TEXT NOT NULL           -- 实体 JSON
);
CREATE INDEX idx_trainings_workspace_updated ON trainings(workspace, updated_at);
```

| 表 | 实体 | 主要字段 |
|-------|-------|---------|
| `trainings` | 训练记录 | date · subject · module · totalQuestions · errorCount · errorCategories · isUnfamiliar |
| `gaps` | 能力缺口 | subject · abilityPath · severity · status · occurrenceCount |
| `abilities` | 能力快照 | subject · abilityPath · score · level · confidence · source |
| `students` | 学生档案 | name · gradeLevel · subjects · group · examDate |
| `reviews` | 复盘记录 | level · date · did · issues · next |
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

另有 `sync_backups(id, account_id, created_at, data)` 保存每个工作空间最近 20 个全量备份点。

账户相关表：

| 表 | 说明 |
|-------|------|
| `users` | `username_normalized` 唯一；密码以 `pbkdf2-sha256$<iterations>$<salt>$<hash>` 存储 |
| `sessions` | 只保存会话令牌的 SHA-256 哈希，30 天过期 |
| `auth_attempts` | 按 IP 哈希统计注册/登录失败次数，10 分钟窗口限流 |

浏览器 IndexedDB 仅保留偏好设置（`meta`），不存储业务数据和登录令牌。

### 5.2 Pages Functions API

前端只依赖同域 `/api`。账户端点用用户名 + 密码换取 HttpOnly 会话 Cookie，浏览器自动随请求携带；
业务端点在服务端校验会话，并把工作空间固定为该账户的用户名，客户端无法指定其他工作空间。

| 端点 | 鉴权 | 说明 |
|------|:----:|------|
| `POST   /api/auth/register` | 公开 | 注册并自动登录（用户名 3-32 位，密码 8-72 位） |
| `POST   /api/auth/login` | 公开 | 登录并签发会话 Cookie |
| `POST   /api/auth/logout` | 会话 | 删除当前会话并清除 Cookie |
| `GET    /api/auth/me` | 会话 | 当前登录用户与工作空间 |
| `GET    /api/health` | 公开 | 连通性探针（D1 可用性） |
| `GET    /api/stats` | 会话 | 当前工作空间各表记录数 |
| `GET    /api/stores/:store` | 会话 | 列出记录 |
| `GET    /api/stores/:store/:id` | 会话 | 读取单条 |
| `PUT    /api/stores/:store/:id` | 会话 | 新增/覆盖单条 |
| `DELETE /api/stores/:store/:id` | 会话 | 删除单条 |
| `POST   /api/stores/:store/bulk` | 会话 | 批量 upsert |
| `DELETE /api/stores` | 会话 | 清空当前工作空间 |
| `GET/POST /api/backups` | 会话 | 备份列表 / 创建备份 |
| `POST   /api/backups/:id/restore` | 会话 | 用备份覆盖当前工作空间 |

**冲突策略**: Last-Write-Wins，按 `updatedAt / createdAt / evaluationTime` 逐条比对，保留较新版本。

---

## 6. 学生 vs 教师 权限区分

系统按 `AppSession.prefs.role` 展示不同导航,并在路由层通过 `<TeacherOnly>` 组件强制守卫。

| 路由 | 学生 | 教师 | 说明 |
|------|:----:|:----:|------|
| `/` 今日工作台 | ✅ | ✅ | 首页 |
| `/trainings` 训练记录 | ✅ | ✅ | 教师端可切换到指定学生视图 |
| `/abilities` 能力中心 | ✅ | ✅ | 同上 |
| `/problems` 问题中心 | ✅ | ✅ | 同上 |
| `/exams` 测验诊断 | ✅ | ✅ | 同上 |
| `/reviews` 复盘中心 | ✅ | ✅ | 同上 |
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
| `/ai-assist` AI 辅助评估 | ❌ | ✅ | **教师专属** |
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

- Node.js ≥ 20
- npm ≥ 10（依赖从官方 npm 源安装）

### 8.2 安装与启动

```bash
npm install

# 终端 1：本地 D1 + Pages Functions（读取 wrangler.toml，默认 http://127.0.0.1:8788）
npm run db:migrate:local      # 首次：建业务表 + 账户表（旧库会自动补 workspace 列）
npm run pages:dev             # 构建前端并启动 Pages dev

# 终端 2：前端热更新（Vite 代理 /api → 127.0.0.1:8788）
npm run dev                   # 访问 http://localhost:3000
```

> 若本机网络代理导致 GitHub tarball 下载证书校验失败，可临时用 `NPM_CONFIG_STRICT_SSL=false npm install`；
> `@shared/core` 为 git 依赖，首次安装会从 GitHub 拉取。

### 8.3 类型检查 & 构建

```bash
npm run typecheck    # 前端 + functions 独立类型检查 (不生成文件)
npm run build        # Vite 构建
npm run preview      # 本地预览生产构建（不含 /api）
```

### 8.4 本地联调说明

- `vite.config.ts` 将 `/api` 代理到 `http://127.0.0.1:8788`，必须同时运行 `npm run pages:dev` 才能读写 D1。
- 本地 D1 数据保存在 `.wrangler/state/v3/d1`（已 gitignore）。
- 直接用浏览器访问 `http://127.0.0.1:8788` 时，由 Pages dev 同时提供静态页面和 `/api`。

---

## 9. 部署

### 9.1 前端 + API：Cloudflare Pages

项目通过 Cloudflare Pages 的 **GitHub 集成**部署：在 Dashboard 创建 Pages 项目并连接本仓库后，
每次 push 到 `main` 自动构建。`functions/` 目录会随 Pages 一起发布，提供同域 `/api`。

| 配置项 | 值 |
|--------|-----|
| 构建命令 | `npm ci && npm run build` |
| 输出目录 | `dist` |
| Node 版本 | 20 |
| Pages 项目名 | `ability-growth-system` |
| 访问域名 | `https://<项目名>.<你的 Pages 子域>.pages.dev`（不使用 workers.dev） |

也可命令行部署：

```bash
npm run pages:deploy    # 构建并 wrangler pages deploy dist
```

### 9.2 绑定 Cloudflare D1

1. 创建数据库并记下 `database_id`：

   ```bash
   npx wrangler d1 create ability_growth
   ```

2. 把 `database_id` 填入根目录 [`wrangler.toml`](./wrangler.toml) 的 `[[d1_databases]]`；
   或在 Pages 项目 **Settings → Functions → D1 database bindings** 中绑定：
   - Variable name: `DB`
   - D1 database: `ability_growth`

3. 执行建表（业务表 + `users` / `sessions` / `auth_attempts`）：

   ```bash
   npm run db:migrate:remote
   ```

4. 部署后访问 `https://<项目>.pages.dev/api/health`，返回 `{"ok":true,"storage":"d1"}` 即连通。
   首次使用在登录页注册用户名和密码即可；暂不接入邮箱，因此没有找回密码流程。

> 若旧数据已按用户名存放在 `workspace` 列，用同一个用户名注册后即可看到原有数据。
> D1 是业务数据的唯一来源，应用不提供本地数据导入/合并，也不提供 JSON 导出。
> 备份与恢复都在云端完成（`sync_backups` 表，每个工作空间保留最近 20 个版本）。

---

## 10. 版本演进路线

- **v0.1.0 (当前)**: P0 + P1 + P2 全需求覆盖；业务数据直连 Cloudflare D1（Pages Functions），服务端用户名/密码登录 + HttpOnly 会话 Cookie，按用户名分工作空间；接入 `@shared/core` 共享基座包
- v0.2 (规划): 语文/英语/化学/生物 能力标签库补齐
- v0.3 (规划): 教师端多设备协同、批改照片上传、语音批改
- v1.0 (规划): 移动端 PWA、离线优先架构完善、多语言

---

## 11. 引用

- PRD 版本: V5.1 (交互体验增强版)
- 共享基座: [`@shared/core`](https://github.com/ProMatheus-ltsc/shared-core)（GitHub git 依赖，复用 root-cause-analysis / personal_review_system 的表单/账户/工具基础层）
- 图表: recharts
- 图标: lucide-react
- 存储: idb (Jake Archibald)

---

**Not: 用更多题, 而是搞清楚为什么做了这么多题却没有变得足够强, 以及下一小时应该用在哪里。**
