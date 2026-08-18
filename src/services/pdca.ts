/**
 * PDCA 问题跟进服务 (PRD V5.8 §30)
 *
 * 六阶段状态机: P1 → P2 → P3 → D → C → A → (归档 / 下一轮 / 调整对策)
 * 不允许跳阶段;A 阶段必须做出出口决定,不能悬置。
 * 外部工具(根因分析/决策日志)通过 iframe 嵌入,系统只负责状态与归档时间戳。
 */
import { v4 as uuid } from 'uuid';
import type {
  ClosureObstacleType,
  CustomPdcaTool,
  InformationType,
  MECEBuildPath,
  MECEStructure,
  PDCAActExit,
  PDCACheckEntry,
  PDCACountermeasure,
  PDCAProblem,
  PDCARootCause,
  PDCAStage,
  PdcaArtifact,
  SensorySignalMethod,
  WeeklyChecklist,
} from '../domain/types';
import { getAllRecords, putRecord } from './localDB';

const STAGE_ORDER: PDCAStage[] = [
  'p1-define',
  'p2-root-cause',
  'p3-countermeasure',
  'd-execute',
  'c-check',
  'a-act',
];

/** 验证阶段流转合法性 */
export function canAdvance(problem: PDCAProblem): { ok: boolean; reason?: string } {
  switch (problem.currentStage) {
    case 'p1-define':
      if (!problem.description.trim() || !problem.targetState.trim() || !problem.successCriteria.trim()) {
        return { ok: false, reason: 'P1 需要填写:问题描述 / 目标状态 / 衡量标准' };
      }
      break;
    case 'p2-root-cause':
      if (problem.rootCauses.length === 0) {
        return { ok: false, reason: 'P2 需要至少记录 1 条根因' };
      }
      break;
    case 'p3-countermeasure':
      if (problem.countermeasures.length === 0) {
        return { ok: false, reason: 'P3 需要至少 1 条对策' };
      }
      if (problem.countermeasures.some((c) => !c.scheduledDate)) {
        return { ok: false, reason: '所有对策必须指定执行日期' };
      }
      break;
    case 'd-execute':
      if (problem.countermeasures.every((c) => c.status !== 'done')) {
        return { ok: false, reason: 'D 阶段需要至少一条对策标记完成' };
      }
      break;
    case 'c-check':
      if (problem.checkEntries.length === 0) {
        return { ok: false, reason: 'C 阶段需要至少一条差距记录 (预期 vs 实际)' };
      }
      break;
    case 'a-act':
      return { ok: false, reason: 'A 阶段需要做出出口决定,不能顺序推进' };
  }
  return { ok: true };
}

/** 前进到下一个阶段 */
export function advanceStage(problem: PDCAProblem): PDCAProblem {
  const idx = STAGE_ORDER.indexOf(problem.currentStage);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return problem;
  return {
    ...problem,
    currentStage: STAGE_ORDER[idx + 1],
    stageEnteredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** A 阶段三种出口 - 下一轮时按上一轮差距预生成 P1/P2 草稿 */
export function executeActExit(
  problem: PDCAProblem,
  exit: PDCAActExit,
  opts?: { lessons?: string[]; gapNote?: string; preservedCauses?: PDCARootCause[] },
): PDCAProblem {
  const now = new Date().toISOString();
  const cycleEntry = {
    cycle: problem.currentCycle,
    startedAt: problem.stageEnteredAt,
    endedAt: now,
    exit,
    gapNote: opts?.gapNote,
  };
  const cycleHistory = [...(problem.cycleHistory ?? []), cycleEntry];

  if (exit === 'archived') {
    return {
      ...problem,
      status: 'archived',
      archivedLessons: opts?.lessons ?? [],
      cycleHistory,
      updatedAt: now,
    };
  }

  if (exit === 'next-cycle') {
    // 预生成:延续上一轮未解决的高影响根因,清空对策(等待重新制定)
    const survivingCauses =
      opts?.preservedCauses ??
      problem.rootCauses.filter((c) => c.impact !== 'low').map((c) => ({
        ...c,
        id: uuid(),
        content: `[延续] ${c.content}`,
        createdAt: now,
      }));
    const draftDescription = opts?.gapNote
      ? `${problem.description}\n\n[第 ${problem.currentCycle + 1} 轮起点] ${opts.gapNote}`
      : problem.description;
    return {
      ...problem,
      description: draftDescription,
      currentStage: 'p2-root-cause',
      currentCycle: problem.currentCycle + 1,
      stageEnteredAt: now,
      cycleHistory,
      rootCauses: survivingCauses,
      countermeasures: [],
      checkEntries: [],
      updatedAt: now,
    };
  }

  // adjust-countermeasure: 回到 P3, 保留完成对策, 未完成失效
  return {
    ...problem,
    currentStage: 'p3-countermeasure',
    stageEnteredAt: now,
    cycleHistory,
    countermeasures: problem.countermeasures.map((c) =>
      c.status === 'done' ? c : { ...c, status: 'invalidated' as const },
    ),
    updatedAt: now,
  };
}

/** 计算停滞风险: 当前阶段停留天数 → 红/黄/绿 */
export function computeStallRisk(problem: PDCAProblem): 'red' | 'yellow' | 'green' {
  const daysStalled = (Date.now() - new Date(problem.stageEnteredAt).getTime()) / 86400000;
  if (daysStalled > 30) return 'red';
  if (daysStalled > 14) return 'yellow';
  return 'green';
}

/** 创建 PDCA 问题 */
export function createProblem(input: {
  studentId?: string;
  title: string;
  description: string;
  problemType: PDCAProblem['problemType'];
  lifeDomain: PDCAProblem['lifeDomain'];
  targetState: string;
  successCriteria: string;
  expectedDueAt?: string;
  /** V5.11 · 感性信号六法(至少 1 种) */
  sensorySignals?: SensorySignalMethod[];
}): PDCAProblem {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    studentId: input.studentId,
    title: input.title,
    description: input.description,
    problemType: input.problemType,
    lifeDomain: input.lifeDomain,
    targetState: input.targetState,
    successCriteria: input.successCriteria,
    expectedDueAt: input.expectedDueAt,
    currentStage: 'p1-define',
    currentCycle: 1,
    status: 'active',
    stageEnteredAt: now,
    rootCauses: [],
    countermeasures: [],
    checkEntries: [],
    sensorySignals: input.sensorySignals && input.sensorySignals.length > 0 ? input.sensorySignals : ['most'],
    createdAt: now,
    updatedAt: now,
  };
}

/** 便捷:添加根因 / 对策 / 检查记录 */
export function addRootCause(
  problem: PDCAProblem,
  content: string,
  impact: 'high' | 'medium' | 'low',
  opts?: { informationType?: InformationType; evaluationCriterion?: string },
): PDCAProblem {
  const cause: PDCARootCause = {
    id: uuid(),
    content: content.trim(),
    impact,
    informationType: opts?.informationType,
    evaluationCriterion: opts?.evaluationCriterion,
    createdAt: new Date().toISOString(),
  };
  return {
    ...problem,
    rootCauses: [...problem.rootCauses, cause],
    updatedAt: new Date().toISOString(),
  };
}

/** V5.11 · 更新问题的 MECE 结构与构建路径 */
export function setMeceStructure(
  problem: PDCAProblem,
  structure: MECEStructure,
  buildPath?: MECEBuildPath,
): PDCAProblem {
  return {
    ...problem,
    meceStructure: structure,
    meceBuildPath: buildPath ?? problem.meceBuildPath,
    updatedAt: new Date().toISOString(),
  };
}

/** V5.11 · P1 校验:防止在结论中出现规范信息、评价信息缺少标准等 */
export function validateInformationTypes(problem: PDCAProblem): {
  ok: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  for (const c of problem.rootCauses) {
    if (c.informationType === 'evaluative' && !c.evaluationCriterion?.trim()) {
      warnings.push(`评价信息 "${c.content.slice(0, 18)}…" 缺少评价标准`);
    }
    if (c.informationType === 'normative') {
      warnings.push(`规范信息 "${c.content.slice(0, 18)}…" 应在 P3 对策中处理, 不应出现在 P2 根因结论`);
    }
  }
  return { ok: warnings.length === 0, warnings };
}

/** V5.11 · MECE 校验:并列结构下所有根因应互斥且合计覆盖差距 */
export function validateMeceCompleteness(problem: PDCAProblem): {
  ok: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (problem.meceStructure === 'parallel' && problem.rootCauses.length < 2) {
    warnings.push('并列结构需要至少 2 条互斥的子根因');
  }
  if (problem.meceStructure === 'serial' && problem.rootCauses.length > 3) {
    warnings.push('直列结构一般为单一主因链, 出现多条根因时建议切换为并列型');
  }
  return { ok: warnings.length === 0, warnings };
}

export function addCountermeasure(problem: PDCAProblem, cm: Omit<PDCACountermeasure, 'id' | 'status' | 'createdAt' | 'updatedAt'>): PDCAProblem {
  const now = new Date().toISOString();
  const c: PDCACountermeasure = {
    id: uuid(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...cm,
  };
  return { ...problem, countermeasures: [...problem.countermeasures, c], updatedAt: now };
}

export function updateCountermeasureStatus(
  problem: PDCAProblem,
  cmId: string,
  status: PDCACountermeasure['status'],
): PDCAProblem {
  const now = new Date().toISOString();
  return {
    ...problem,
    countermeasures: problem.countermeasures.map((c) =>
      c.id === cmId
        ? {
            ...c,
            status,
            completedAt: status === 'done' ? now : c.completedAt,
            updatedAt: now,
          }
        : c,
    ),
    updatedAt: now,
  };
}

export function addCheckEntry(problem: PDCAProblem, entry: Omit<PDCACheckEntry, 'id' | 'createdAt'>): PDCAProblem {
  const now = new Date().toISOString();
  return {
    ...problem,
    checkEntries: [
      ...problem.checkEntries,
      { id: uuid(), createdAt: now, ...entry },
    ],
    updatedAt: now,
  };
}

/** 持久化便捷方法 */
export async function saveProblem(problem: PDCAProblem): Promise<void> {
  await putRecord('pdcaProblems', problem);
}

/** 外部工具入口(§30.5 内置清单) */
export const EXTERNAL_TOOLS = [
  {
    id: 'root-cause',
    name: '根因分析(在线因果图)',
    url: 'https://promatheus-ltsc.github.io/root-cause-analysis/#/',
    appliesTo: ['p1-define', 'p2-root-cause'] as PDCAStage[],
    embedType: 'iframe' as const,
  },
  {
    id: 'decision-log',
    name: '决策日志',
    url: 'https://promatheus-ltsc.github.io/personal_review_system/#/form/decision_log',
    appliesTo: ['p3-countermeasure'] as PDCAStage[],
    embedType: 'iframe' as const,
  },
  {
    id: 'emotion-mubu',
    name: '情绪管理方法参考(幕布)',
    url: 'https://mubu.com/doc5oUVxkFqRpz',
    appliesTo: ['d-execute'] as PDCAStage[],
    embedType: 'link' as const,
  },
];

/** ORID 检查模板 */
export const ORID_TEMPLATE = {
  O: '客观事实(预期 vs 实际)',
  R: '感受(我的情绪反应)',
  I: '事实分析(差距背后的原因)',
  D: '下一步行动(时间/地点/方式)',
};

/** 情绪拆解三问模板 (§30.9) */
export const EMOTION_TRIPLE_QUESTIONS = [
  '到底是什么让自己烦躁不安?',
  '具体是什么让自己恐惧担忧?',
  '面对困境, 我能做什么? 不能做什么? 最坏结果是什么?',
];

/** §30.9 对策难度拉伸区自查 - 判断当前对策是否处于"稍稍努力可及"的拉伸区 */
export function checkStretchZone(problem: PDCAProblem): {
  status: 'stretch' | 'comfort' | 'panic' | 'unknown';
  message: string;
} {
  const total = problem.countermeasures.length;
  if (total === 0) return { status: 'unknown', message: '尚无对策' };
  const done = problem.countermeasures.filter((c) => c.status === 'done').length;
  const rate = done / total;
  if (rate === 1 && total > 2) return { status: 'comfort', message: '全部对策完成过于顺利, 可能在舒适区, 建议提高挑战性' };
  if (rate === 0 && problem.currentStage === 'd-execute') return { status: 'panic', message: '执行长期未推进, 可能对策难度过大(困难区), 建议拆分或降级' };
  if (rate > 0 && rate < 1) return { status: 'stretch', message: '正处于拉伸区: 有进展但需持续努力, 保持节奏' };
  return { status: 'unknown', message: '数据不足以判断' };
}

/** §30.5 归档产出物到当前问题(供 iframe 关闭后调用) */
export async function archiveArtifact(a: Omit<PdcaArtifact, 'id' | 'createdAt'>): Promise<PdcaArtifact> {
  const record: PdcaArtifact = { id: uuid(), createdAt: new Date().toISOString(), ...a };
  await putRecord('pdcaArtifacts', record);
  return record;
}

export async function listArtifacts(problemId: string): Promise<PdcaArtifact[]> {
  const all = await getAllRecords('pdcaArtifacts');
  return all.filter((a) => a.problemId === problemId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** §30.5 自定义外部工具注册 */
export async function registerCustomTool(tool: Omit<CustomPdcaTool, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomPdcaTool> {
  const now = new Date().toISOString();
  const record: CustomPdcaTool = { id: uuid(), createdAt: now, updatedAt: now, ...tool };
  await putRecord('customTools', record);
  return record;
}

export async function listCustomTools(): Promise<CustomPdcaTool[]> {
  const all = await getAllRecords('customTools');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** §30.2 每周检查清单 - 自动扫描 D/C 阶段问题, 生成本周待填清单 */
export async function generateWeeklyChecklist(
  problems: PDCAProblem[],
  weekStart?: string,
): Promise<WeeklyChecklist> {
  const now = new Date();
  const week = weekStart ?? getMondayISO(now);
  const entries = problems
    .filter((p) => p.status === 'active' && (p.currentStage === 'd-execute' || p.currentStage === 'c-check' || p.currentStage === 'a-act'))
    .map((p) => ({
      problemId: p.id,
      problemTitle: p.title,
      stage: p.currentStage,
      filled: false,
    }));
  const record: WeeklyChecklist = {
    id: `wc-${week}`,
    weekStart: week,
    entries,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await putRecord('weeklyChecklists', record);
  return record;
}

function getMondayISO(d: Date): string {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

/** §30.6 里程碑拖拽改期(仅前端调用, 更新对策的 scheduledDate) */
export function rescheduleCountermeasure(
  problem: PDCAProblem,
  cmId: string,
  newDate: string,
): PDCAProblem {
  const now = new Date().toISOString();
  return {
    ...problem,
    countermeasures: problem.countermeasures.map((c) =>
      c.id === cmId ? { ...c, scheduledDate: newDate, updatedAt: now } : c,
    ),
    updatedAt: now,
  };
}

/** §33 P2 · PDCA 循环效率分析 - 每轮循环周期与瓶颈识别 */
export interface CycleStats {
  problemId: string;
  problemTitle: string;
  totalCycles: number;
  avgCycleDays: number;
  bottleneckStage: PDCAStage | null;
  lastCycleDays?: number;
}

export function analyzeCycleEfficiency(problems: PDCAProblem[]): CycleStats[] {
  const results: CycleStats[] = [];
  for (const p of problems) {
    const history = p.cycleHistory ?? [];
    if (history.length === 0) continue;
    const durations = history.map((h) => {
      const start = new Date(h.startedAt).getTime();
      const end = new Date(h.endedAt).getTime();
      return Math.max(0, (end - start) / 86400000);
    });
    const avg = durations.reduce((s, v) => s + v, 0) / durations.length;
    // 瓶颈阶段: cycleHistory 未记录逐阶段耗时, 用最后一次 stageEnteredAt 推断
    let bottleneck: PDCAStage | null = null;
    if (p.status === 'active') {
      const stageDays = (Date.now() - new Date(p.stageEnteredAt).getTime()) / 86400000;
      if (stageDays > 14) bottleneck = p.currentStage;
    }
    results.push({
      problemId: p.id,
      problemTitle: p.title,
      totalCycles: history.length,
      avgCycleDays: +avg.toFixed(1),
      bottleneckStage: bottleneck,
      lastCycleDays: durations[durations.length - 1],
    });
  }
  return results;
}

/* ============================================================
 * V5.11 §30.3 P3 · 疯帽匠时间 (Mad Hatter Time)
 * 15% 无约束探索额度: 每个问题最多挂 1 条无关根因的尝试对策
 * 不参与进度统计, 不做完成考核
 * ============================================================ */
export const MAD_HATTER_BUDGET_RATIO = 0.15;
export const MAD_HATTER_MAX_PER_PROBLEM = 1;

/** 检查是否还有疯帽匠时间额度 */
export function canAddMadHatter(problem: PDCAProblem): boolean {
  const existing = problem.countermeasures.filter((c) => c.isMadHatter).length;
  return existing < MAD_HATTER_MAX_PER_PROBLEM;
}

/** V5.11 · 进度统计口径:排除疯帽匠对策 */
export function getEffectiveCountermeasures(problem: PDCAProblem): PDCACountermeasure[] {
  return problem.countermeasures.filter((c) => !c.isMadHatter);
}

/* ============================================================
 * V5.11 §30.9 · 三条反陷阱设计原则文案 + 闭环阻碍分型
 * ============================================================ */
export const ANTI_TRAP_PRINCIPLES = [
  {
    key: 'completion-over-perfection',
    title: '完成比完美更重要',
    body: '闭环允许"先粗后细"——先记录一句话对策 + 执行日期即可推进到 D 阶段, 细节可在循环中迭代。对"不愿把手弄脏"型问题, 对策模板强制包含至少一条"今天就能亲手完成的最小动作"。',
  },
  {
    key: 'anti-ritual',
    title: '反仪式感',
    body: 'PDCA 是解决问题的工具, 而非流程仪式。 触发式流转 + 一句话推进 + 自动引导, 避免把闭环变成一份要交的作业。',
  },
  {
    key: 'mad-hatter',
    title: '疯帽匠时间',
    body: '每个问题的对策清单保留 15% 的"无约束探索"额度——允许挂一条与当前根因无直接关联、纯好奇驱动的尝试性对策(不参与进度统计、不做完成考核), 用以保护创造力、防止方案同质化。',
  },
] as const;

/** V5.11 · 闭环阻碍匹配助手 - 关键词粗判 */
export function detectClosureObstacle(description: string): ClosureObstacleType | undefined {
  const t = description.toLowerCase();
  if (/多方|依赖|等对方|沟通协调|跨部门/.test(t)) return 'multi-party';
  if (/末端|执行者|轮不到我|大公司/.test(t)) return 'org-endpoint';
  if (/只想想|不想动手|战略|懒得/.test(t)) return 'hands-off';
  if (/完美|拖延|再想想|准备/.test(t)) return 'perfectionism';
  return undefined;
}

/* ============================================================
 * V5.11 §30.9 · 九段心法(仅成年人)与产品文案挂载点
 * ============================================================ */
export type NineStageHook =
  | 'self-shape'
  | 'closure'
  | 'switch'
  | 'inner-control'
  | 'restart'
  | 'growth'
  | 'kernel'
  | 'compound'
  | 'vision'
  | 'emergence';

export const NINE_STAGE_MEANING: Record<NineStageHook, { title: string; essence: string; hook: string }> = {
  'self-shape': {
    title: '自我塑造',
    essence: '把自己当产品打造:理解使命 / 环境 / 行动 / 反馈——反馈是冠军的早餐',
    hook: '新用户引导语 · 复盘模板开篇一问',
  },
  closure: { title: '闭环', essence: '感知 → 灰度认知 → 黑白决策 → 行动', hook: '§30 全模块' },
  switch: {
    title: '切换',
    essence: '先用理性控制感性完成训练, 熟练后交给感性自动执行, 事后理性复盘',
    hook: '修复任务熟练度达标自动降频',
  },
  'inner-control': {
    title: '内控',
    essence: '认知开放考虑各维度, 决策清晰果断, 重大决策"不写下理由就不行动"',
    hook: 'P3 高风险对策强制填写决策理由 · 决策日志',
  },
  restart: {
    title: '重启',
    essence: '舍不得旧的(外星人视角) / 不敢开始新的(把事实当已知条件重解)',
    hook: 'Act 对策失败出口 · 问题详情"重启视角"提示',
  },
  growth: { title: '增长', essence: '以 PDCA 为实现手段', hook: '§30 全模块' },
  kernel: {
    title: '内核',
    essence: '寻找可重复的简单动作:大概率 / 可复制 / 可规模',
    hook: '三叉戟主线深耕判定',
  },
  compound: {
    title: '复利',
    essence: '以不可替代性实现复利, 延迟满足 + 持续学习',
    hook: '资产底盘 · 训练收益分析长期视角',
  },
  vision: {
    title: '愿景',
    essence: '核心理念 + 未来蓝图, 十年不变 / 最小后悔 / 以始为终',
    hook: '一句话价值观说明书旁"未来蓝图"选填',
  },
  emergence: {
    title: '涌现',
    essence: '微小叠加变系统力量——长期坚持会在某刻质变',
    hook: '能力中心增长曲线"涌现点"标注',
  },
};

/* ============================================================
 * V5.11 §30.9 · ACE 认知操作系统(PDCA 升维参考)
 * ============================================================ */
export const ACE_TEMPLATE = {
  anticipate: {
    label: 'A · Anticipate 预判',
    body: 'P 阶段融合 SWOT 预判风险(动手前先做压力测试):优势 / 劣势 / 机会 / 威胁',
  },
  connect: {
    label: 'C · Connect 连接',
    body: 'C 阶段关联跨领域数据: 学习时间线 / 训练收益 / 复盘记录',
  },
  evolve: {
    label: 'E · Evolve 进化',
    body: '连续 2 轮以上"部分解决"时, 系统建议强制变异一条对策(换思路重试)',
  },
} as const;

/** V5.11 · ACE E-Evolve 变异触发检测 */
export function shouldSuggestMutation(problem: PDCAProblem): boolean {
  return (problem.partialSolvedStreak ?? 0) >= 2;
}

/** V5.11 · 累计"部分解决"轮次 */
export function bumpPartialSolvedStreak(problem: PDCAProblem, resolved: boolean): PDCAProblem {
  return {
    ...problem,
    partialSolvedStreak: resolved ? 0 : (problem.partialSolvedStreak ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
}
