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
| 本地存储 | IndexedDB（idb），按账户隔离 15 张 store |
| 远程备份 | Cloudflare D1（可选，Worker + REST 网关） |
| 图表 | recharts |
| 共享基座 | [`@shared/core`](https://github.com/ProMatheus-ltsc/shared-core)（GitHub git 依赖，复用表单引擎/认证/工具层） |
| 部署 | Cloudflare Pages（GitHub 集成自动构建） |

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
- **Local-First**: 全部业务数据默认存储在浏览器 IndexedDB 中;Cloudflare D1 仅作为可选异地备份。
- **少输入 / 多默认 / 强可视 / 短路径**: 让用户把时间花在训练/反馈/修复上,而不是花在填表单上。
- **心理安全**: 训练时不显示历史表现;错误改称「待修复问题」,防止失败回避与过度自我监控。

---

## 3. 功能覆盖 (PRD P0 + P1 + P2)

### 3.1 P0 · 通用核心

| 模块 | 页面 | 说明 |
|------|------|------|
| 今日工作台 | `/` | 每日核心任务、待修复问题、复盘提醒、能力变化、云端同步状态 |
| 训练记录 | `/trainings` | 支持多学段多学科的训练记录,含标准/快速模式、错误 chips、陌生题标记 |
| 能力中心 | `/abilities` | 能力雷达图、增长曲线、模块掌握度、三级能力标签明细 |
| 问题中心 | `/problems` | 跨学科统一管理未修复能力缺口,含错误复现率、修复→验证状态机 |
| 复盘中心 | `/reviews` | 日 / 周 / 月三级复盘,自动带出训练摘要与短板推荐 |
| 学段学科配置 | `Onboarding` | 5 分钟启动引导:身份 → 学段 → 学科 |
| 学生管理 (教师) | `/students` | 添加/编辑学生,含学段/年级/学科/分组/考试类型 |
| 设置 | `/settings` | 身份/学段/学科偏好,数据导入导出,清空本地数据 |
| 云端同步 | `/sync` | Cloudflare D1 配置、增量推拉、全量备份、历史恢复 |

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
│  ├── localDB.ts     IndexedDB 15 张 store, 按账户隔离                │
│  └── remoteSync.ts  Cloudflare D1 增量同步 / 全量备份 / LWW 冲突     │
├─────────────────────────────────────────────────────────────────────┤
│  Domain                                                              │
│  ├── types.ts       15+ 领域实体类型定义                             │
│  ├── abilityTags.ts 5 学科三级能力标签体系 (PRD §11-15)              │
│  └── abilityTransfer.ts   能力迁移矩阵 (PRD §12B/§15B)               │
├─────────────────────────────────────────────────────────────────────┤
│  Persistence                                                         │
│  IndexedDB (本地)                    Cloudflare D1 (远程可选)         │
│  按账户隔离, 15 张 store              Worker + D1 Binding             │
│  即写即存, 断网可用                    异地备份 + 多端同步              │
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
│   │   ├── localDB.ts              # IndexedDB 抽象（15 store，复用 @shared/core configureDB）
│   │   ├── remoteSync.ts           # Cloudflare D1 同步
│   │   ├── analytics.ts            # 基础分析引擎
│   │   ├── insights.ts             # P2 深度洞察引擎
│   │   ├── planner.ts              # 学习规划器
│   │   ├── aiPrompt.ts             # 外部 AI 辅助
│   │   └── taskTemplates.ts        # 任务模板 / 快捷短语
│   ├── hooks/
│   │   ├── useAppSession.tsx       # 身份/学段/学科/当前学生偏好
│   │   └── useSyncStatus.tsx       # 云端同步状态
│   ├── components/
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
│   │   ├── SyncPage.tsx
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

### 5.1 IndexedDB 分库

按认证账户隔离:`ability-growth-app-<accountId>`。 共 15 张 store 加 1 张 meta:

| Store | 实体 | 主要字段 |
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

### 5.2 Cloudflare D1 同步

前端只依赖 HTTP,与 Cloudflare Worker 通过如下 REST 端点通信:

| 端点 | 说明 |
|------|------|
| `POST /api/sync/push` | 增量推送 (自 lastSyncAt 起的所有变更) |
| `GET  /api/sync/pull` | 增量拉取 (可传 `?since=` 时间戳) |
| `POST /api/sync/backup` | 全量备份到 D1 |
| `GET  /api/sync/restore` | 全量恢复 (可传 `?timestamp=` 选取历史备份点) |
| `GET  /api/sync/health` | 连通性探针 |
| `GET  /api/sync/backups` | 列出历史备份点 |

**冲突策略**: Last-Write-Wins,合并时对每个实体按 `updatedAt / createdAt / evaluationTime` 逐条比对; 冲突数会上报便于教师端知情。

**完整 Worker 实现**：见 [`worker/`](./worker) 目录（`wrangler.toml` + `schema.sql` + `src/index.ts`），六个端点全部实现，部署步骤见 §9.2。

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
| `/sync` 云端同步 | ✅ | ✅ | 账户级备份 |
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
npm run dev
# 访问 http://localhost:3000
```

> 若本机网络代理导致 GitHub tarball 下载证书校验失败，可临时用 `NPM_CONFIG_STRICT_SSL=false npm install`；
> `@shared/core` 为 git 依赖，首次安装会从 GitHub 拉取。

### 8.3 类型检查 & 构建

```bash
npm run typecheck    # 独立类型检查 (不生成文件)
npm run build        # Vite 构建 (不含 tsc)
npm run preview      # 本地预览生产构建
```

### 8.4 Vite 服务器配置

`vite.config.ts` 中强制 `host: '0.0.0.0'` + `port: 3000` + `strictPort: true`,确保沙箱外可访问。

---

## 9. 部署

### 9.1 前端：Cloudflare Pages（GitHub 集成）

项目通过 Cloudflare Pages 的 **GitHub 集成**部署：在 Cloudflare Dashboard 创建 Pages 项目并连接本仓库后，
每次 push 到 `main` 自动构建：

| 配置项 | 值 |
|--------|-----|
| 构建命令 | `npm ci && npm run build` |
| 输出目录 | `dist` |
| Node 版本 | 20 |

构建时 `npm ci` 会从 GitHub 拉取 `@shared/core`（public 仓库，无需凭据）。

### 9.2 远程备份：Cloudflare D1

仓库已提供可直接部署的 Worker 实现（`worker/` 目录），与前端 `src/services/remoteSync.ts` 的 API 契约一一对应。
接入步骤：

```bash
cd worker

# 1. 安装依赖（含 wrangler）
npm install

# 2. 登录 Cloudflare（浏览器授权）
npx wrangler login

# 3. 创建 D1 数据库，记下输出的 database_id
npx wrangler d1 create ability-growth

# 4. 配置 database_id（不写进 wrangler.toml，用环境变量注入，避免明文提交）
cp .dev.vars.example .dev.vars      # 然后编辑 .dev.vars，填入 D1_DATABASE_ID=<database_id>

# 5. 建表（15 张业务表 + 备份版本表）
npm run db:init

# 6. （可选）设置鉴权 Token——用 wrangler secret，不落盘
npx wrangler secret put SYNC_AUTH_TOKEN   # 输入一个随机串，前端同步页 authToken 填同一个值

# 7. 部署 Worker（自动从 .dev.vars 读取 D1_DATABASE_ID）
npm run deploy
```

> **安全说明**：
> - `database_id` 通过 `.dev.vars`（已 gitignore）或环境变量 `D1_DATABASE_ID` 注入（wrangler 的 `{VAR}` 插值语法），不提交明文；
> - 鉴权 Token 用 `wrangler secret put SYNC_AUTH_TOKEN` 设置，运行时读取 `env.SYNC_AUTH_TOKEN`，不进代码库；
> - 未设置 `D1_DATABASE_ID` 时部署会缺少 D1 绑定，务必先完成第 4 步。

然后在应用「云端同步」页填入：
- **Worker URL**（如 `https://ability-growth-sync.<你的子域>.workers.dev`）
- **accountId**（任意账户标识，用于多账户数据隔离，请求头 `X-Sync-Account`）
- **authToken**（可选；与第 6 步 secret 设置的值一致，若未设置则留空）

Worker 端点说明见 §5.2，冲突策略为 Last-Write-Wins。

---

## 10. 版本演进路线

- **v0.1.0 (当前)**: P0 + P1 + P2 全需求覆盖,单账户 IndexedDB + 可选 D1 同步；接入 `@shared/core` 共享基座包
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
