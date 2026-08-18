/**
 * 职业选择模块 (PRD V5.8 §31)
 *
 * 三个子测评(简短版):
 *   1. 价值观鉴定 (15 题): 判断/多选/情境迫选
 *   2. MBTI 性格 (28 题):  E/I S/N T/F J/P 各 7 题
 *   3. 能力检测 (20 题):   八维 x 2-3 题, 支持系统数据校准
 * 汇总: 兴趣 x 能力四象限 -> 价值观一票否决 -> 三定 + 双路线
 */
import { v4 as uuid } from 'uuid';
import type {
  AbilityEightDim,
  AbilityGap,
  AbilitySnapshot,
  AnswerCredibilityScore,
  BottomLine,
  CareerAssessment,
  CareerCandidate,
  CareerObservationPoint,
  CareerQuadrant,
  CareerReport,
  CareerVetoOverride,
  ErrorCategory,
  GradeLevel,
  LieScaleResponse,
  MBTIAxis,
  MBTIScore,
  OrgCultureTag,
  RetestReflection,
  TrainingRecord,
  TridentStructure,
  ValueClarificationStep,
  ValueCostTag,
  ValueDimension,
} from '../domain/types';
import { getAllRecords, putRecord } from './localDB';

// ==================== 价值观鉴定 ====================

export interface ValueQuestion {
  id: string;
  type: 'judgement' | 'multi-select-8-3' | 'forced-choice';
  prompt: string;
  optionA?: string;
  optionB?: string;
  options?: string[];
  scoresFor: {
    A?: Partial<Record<ValueDimension, number>>;
    B?: Partial<Record<ValueDimension, number>>;
    yes?: Partial<Record<ValueDimension, number>>;
    no?: Partial<Record<ValueDimension, number>>;
  };
  bottomLineWhenA?: BottomLine;
  bottomLineWhenB?: BottomLine;
}

/** 价值观简短版 15 题(判断 6 + 8选3 三次 + 情境迫选 6) */
export const VALUE_QUESTIONS_SHORT: ValueQuestion[] = [
  { id: 'v1', type: 'judgement', prompt: '过去 3 年, 我曾为没人看见的项目持续投入。', scoresFor: { yes: { growth: 3 }, no: { safety: 1 } } },
  { id: 'v2', type: 'judgement', prompt: '面对高收入但透支健康的机会, 我会毫不犹豫拒绝。', scoresFor: { yes: { safety: 3 }, no: { achievement: 2 } }, bottomLineWhenA: 'health' },
  { id: 'v3', type: 'judgement', prompt: '有明确排名时, 我更有动力。', scoresFor: { yes: { achievement: 3 }, no: { freedom: 1 } } },
  { id: 'v4', type: 'judgement', prompt: '为家人可以推迟自己的事业机会。', scoresFor: { yes: { relationship: 3 }, no: { achievement: 2 } } },
  { id: 'v5', type: 'judgement', prompt: '面对不确定, 我更倾向选择成长而非稳定。', scoresFor: { yes: { growth: 3 }, no: { safety: 2 } } },
  { id: 'v6', type: 'judgement', prompt: '我需要能自主安排时间的工作。', scoresFor: { yes: { freedom: 3 }, no: { achievement: 1 } } },

  // 8 选 3 极端假设(拆成 3 组多选题以便计分)
  {
    id: 'v7',
    type: 'multi-select-8-3',
    prompt: '如果只能保留其中 3 项, 你会保留:',
    options: ['高收入', '大城市平台', '重要的人', '真心喜欢的事', '时间自由', '安全稳定', '社会影响力', '持续成长感'],
    scoresFor: {},
  },

  // 六组冲突迫选(简短版抽 6 组)
  { id: 'v8',  type: 'forced-choice', prompt: '你实际上更倾向?', optionA: '年薪 40 万常年加班透支健康', optionB: '年薪 25 万作息规律健康', scoresFor: { A: { achievement: 3 }, B: { safety: 3 } }, bottomLineWhenB: 'health' },
  { id: 'v9',  type: 'forced-choice', prompt: '你实际上更倾向?', optionA: '事业冲刺 3 年一线打拼', optionB: '陪伴家人在二线安稳发展', scoresFor: { A: { achievement: 3 }, B: { relationship: 3 } }, bottomLineWhenB: 'relationship' },
  { id: 'v10', type: 'forced-choice', prompt: '你实际上更倾向?', optionA: '选择内心真正喜欢但不主流', optionB: '选择被社会认可但一般', scoresFor: { A: { growth: 3 }, B: { safety: 2 } }, bottomLineWhenA: 'authenticity' },
  { id: 'v11', type: 'forced-choice', prompt: '你实际上更倾向?', optionA: '稳定的公务员岗位', optionB: '不确定但可能高回报的创业', scoresFor: { A: { safety: 3 }, B: { achievement: 3 } } },
  { id: 'v12', type: 'forced-choice', prompt: '你实际上更倾向?', optionA: '短期辛苦但长期成长', optionB: '短期轻松长期原地踏步', scoresFor: { A: { growth: 3 }, B: { freedom: 1 } } },
  { id: 'v13', type: 'forced-choice', prompt: '你实际上更倾向?', optionA: '追随内心兴趣选专业', optionB: '按家庭期待选专业', scoresFor: { A: { growth: 3, freedom: 2 }, B: { relationship: 2 } }, bottomLineWhenA: 'authenticity' },

  // 底线确认判断题
  { id: 'v14', type: 'judgement', prompt: '即使薪资翻倍, 我也不会接受长期透支健康的工作。', scoresFor: { yes: { safety: 5 }, no: {} }, bottomLineWhenA: 'health' },
  { id: 'v15', type: 'judgement', prompt: '有些底线是无论回报多高我都不会跨越的。', scoresFor: { yes: { safety: 3 }, no: { achievement: 1 } } },
];

/** 计算价值观排序 + 底线 */
export function scoreValueQuestions(answers: Record<string, string | string[]>): {
  ranked: ValueDimension[];
  bottomLines: BottomLine[];
  highlightTags: string[];
} {
  const scores: Record<ValueDimension, number> = { achievement: 0, growth: 0, safety: 0, relationship: 0, freedom: 0 };
  const bottomLineHits = new Map<BottomLine, number>();

  for (const q of VALUE_QUESTIONS_SHORT) {
    const ans = answers[q.id];
    if (!ans) continue;

    if (q.type === 'judgement' && typeof ans === 'string') {
      const key = ans === 'yes' ? 'yes' : 'no';
      const dims = q.scoresFor[key] ?? {};
      for (const [dim, v] of Object.entries(dims)) {
        scores[dim as ValueDimension] += v ?? 0;
      }
      if (ans === 'yes' && q.bottomLineWhenA) {
        bottomLineHits.set(q.bottomLineWhenA, (bottomLineHits.get(q.bottomLineWhenA) ?? 0) + 1);
      }
    } else if (q.type === 'forced-choice' && typeof ans === 'string') {
      const key = ans === 'A' ? 'A' : 'B';
      const dims = q.scoresFor[key] ?? {};
      for (const [dim, v] of Object.entries(dims)) {
        scores[dim as ValueDimension] += v ?? 0;
      }
      const bl = ans === 'A' ? q.bottomLineWhenA : q.bottomLineWhenB;
      if (bl) bottomLineHits.set(bl, (bottomLineHits.get(bl) ?? 0) + 1);
    } else if (q.type === 'multi-select-8-3' && Array.isArray(ans)) {
      // 8 选 3 计分表(映射选项 → 维度)
      const map: Record<string, ValueDimension> = {
        高收入: 'achievement',
        大城市平台: 'achievement',
        重要的人: 'relationship',
        真心喜欢的事: 'growth',
        时间自由: 'freedom',
        安全稳定: 'safety',
        社会影响力: 'achievement',
        持续成长感: 'growth',
      };
      for (const opt of ans) {
        const dim = map[opt];
        if (dim) scores[dim] += 2;
      }
    }
  }

  const ranked = (Object.entries(scores) as Array<[ValueDimension, number]>)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  const bottomLines = Array.from(bottomLineHits.entries())
    .filter(([, count]) => count >= 2)
    .map(([bl]) => bl)
    .slice(0, 2);
  const highlightTags: string[] = [];
  if (scores.achievement >= 8) highlightTags.push('成就导向');
  if (scores.growth >= 8) highlightTags.push('成长导向');
  if (scores.safety >= 6) highlightTags.push('安全导向');
  if (scores.relationship >= 6) highlightTags.push('关系导向');
  if (scores.freedom >= 6) highlightTags.push('自由导向');

  return { ranked, bottomLines, highlightTags };
}

// ==================== MBTI 性格 ====================

export interface MBTIQuestion {
  id: string;
  axis: MBTIAxis;
  prompt: string;
  optionA: string;
  scoreA: 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';
  optionB: string;
  scoreB: 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';
}

/** MBTI 28 题, 四维度各 7 题 */
export const MBTI_QUESTIONS_SHORT: MBTIQuestion[] = [
  // EI
  { id: 'ei1', axis: 'EI', prompt: '聚会中你更倾向?', optionA: '主动认识新朋友', scoreA: 'E', optionB: '与熟人深入交流', scoreB: 'I' },
  { id: 'ei2', axis: 'EI', prompt: '疲惫时你更需要?', optionA: '找人聊天', scoreA: 'E', optionB: '独处休息', scoreB: 'I' },
  { id: 'ei3', axis: 'EI', prompt: '你思考问题更多是?', optionA: '边说边想', scoreA: 'E', optionB: '想清楚再说', scoreB: 'I' },
  { id: 'ei4', axis: 'EI', prompt: '在会议中你倾向?', optionA: '主动发言', scoreA: 'E', optionB: '认真聆听', scoreB: 'I' },
  { id: 'ei5', axis: 'EI', prompt: '你的社交圈?', optionA: '广泛且多元', scoreA: 'E', optionB: '少数深交', scoreB: 'I' },
  { id: 'ei6', axis: 'EI', prompt: '面对新环境你会?', optionA: '尽快融入', scoreA: 'E', optionB: '先观察一段', scoreB: 'I' },
  { id: 'ei7', axis: 'EI', prompt: '独处时你感觉?', optionA: '有点无聊', scoreA: 'E', optionB: '很享受', scoreB: 'I' },

  // SN
  { id: 'sn1', axis: 'SN', prompt: '你更信任?', optionA: '亲身经验', scoreA: 'S', optionB: '直觉洞察', scoreB: 'N' },
  { id: 'sn2', axis: 'SN', prompt: '面对新任务你先?', optionA: '弄清具体细节', scoreA: 'S', optionB: '把握整体框架', scoreB: 'N' },
  { id: 'sn3', axis: 'SN', prompt: '你更擅长?', optionA: '记住细节', scoreA: 'S', optionB: '发现规律', scoreB: 'N' },
  { id: 'sn4', axis: 'SN', prompt: '别人形容你?', optionA: '踏实务实', scoreA: 'S', optionB: '想象力强', scoreB: 'N' },
  { id: 'sn5', axis: 'SN', prompt: '你更关注?', optionA: '当下问题', scoreA: 'S', optionB: '未来可能', scoreB: 'N' },
  { id: 'sn6', axis: 'SN', prompt: '你欣赏的表达?', optionA: '具体明确', scoreA: 'S', optionB: '富含隐喻', scoreB: 'N' },
  { id: 'sn7', axis: 'SN', prompt: '你更擅长回答?', optionA: '是什么', scoreA: 'S', optionB: '为什么', scoreB: 'N' },

  // TF
  { id: 'tf1', axis: 'TF', prompt: '做决定时你更看重?', optionA: '客观逻辑', scoreA: 'T', optionB: '他人感受', scoreB: 'F' },
  { id: 'tf2', axis: 'TF', prompt: '别人形容你?', optionA: '冷静理性', scoreA: 'T', optionB: '温暖体贴', scoreB: 'F' },
  { id: 'tf3', axis: 'TF', prompt: '面对争论你倾向?', optionA: '据理力争', scoreA: 'T', optionB: '寻求共识', scoreB: 'F' },
  { id: 'tf4', axis: 'TF', prompt: '批评别人时你?', optionA: '直接指出问题', scoreA: 'T', optionB: '委婉照顾感受', scoreB: 'F' },
  { id: 'tf5', axis: 'TF', prompt: '你欣赏的领导?', optionA: '公正果断', scoreA: 'T', optionB: '关怀有温度', scoreB: 'F' },
  { id: 'tf6', axis: 'TF', prompt: '你更关心?', optionA: '事情对不对', scoreA: 'T', optionB: '关系好不好', scoreB: 'F' },
  { id: 'tf7', axis: 'TF', prompt: '判断新政策你更看?', optionA: '数据依据', scoreA: 'T', optionB: '影响的人', scoreB: 'F' },

  // JP
  { id: 'jp1', axis: 'JP', prompt: '你更喜欢?', optionA: '有计划', scoreA: 'J', optionB: '随机应变', scoreB: 'P' },
  { id: 'jp2', axis: 'JP', prompt: '面对 deadline 你?', optionA: '提前完成', scoreA: 'J', optionB: '最后冲刺', scoreB: 'P' },
  { id: 'jp3', axis: 'JP', prompt: '你的桌面?', optionA: '整洁有序', scoreA: 'J', optionB: '灵活散乱', scoreB: 'P' },
  { id: 'jp4', axis: 'JP', prompt: '旅行你会?', optionA: '做好攻略', scoreA: 'J', optionB: '随意探索', scoreB: 'P' },
  { id: 'jp5', axis: 'JP', prompt: '你偏好的工作节奏?', optionA: '明确进度', scoreA: 'J', optionB: '灵活弹性', scoreB: 'P' },
  { id: 'jp6', axis: 'JP', prompt: '面对变化你?', optionA: '希望尽快确定', scoreA: 'J', optionB: '享受不确定', scoreB: 'P' },
  { id: 'jp7', axis: 'JP', prompt: '你更喜欢?', optionA: '做决定', scoreA: 'J', optionB: '保留选项', scoreB: 'P' },
];

export function scoreMBTI(answers: Record<string, 'A' | 'B'>): MBTIScore {
  const counter: Record<string, number> = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  for (const q of MBTI_QUESTIONS_SHORT) {
    const ans = answers[q.id];
    if (!ans) continue;
    const letter = ans === 'A' ? q.scoreA : q.scoreB;
    counter[letter] += 1;
  }
  const type =
    (counter.E >= counter.I ? 'E' : 'I') +
    (counter.S >= counter.N ? 'S' : 'N') +
    (counter.T >= counter.F ? 'T' : 'F') +
    (counter.J >= counter.P ? 'J' : 'P');
  return {
    E: counter.E, I: counter.I,
    S: counter.S, N: counter.N,
    T: counter.T, F: counter.F,
    J: counter.J, P: counter.P,
    type,
  };
}

// ==================== 能力检测 ====================

export interface AbilityQuestion {
  id: string;
  dimension: AbilityEightDim;
  prompt: string;
  scale: 4;
}

export const ABILITY_QUESTIONS_SHORT: AbilityQuestion[] = [
  { id: 'ab1', dimension: 'structure', prompt: '面对全新领域, 我通常先搭框架再填细节', scale: 4 },
  { id: 'ab2', dimension: 'structure', prompt: '我能快速看出零散信息之间的关联', scale: 4 },
  { id: 'ab3', dimension: 'structure', prompt: '整理笔记时我倾向自建知识框架', scale: 4 },

  { id: 'ab4', dimension: 'metacognition', prompt: '我能清楚区分"以为会"和"真的会"', scale: 4 },
  { id: 'ab5', dimension: 'metacognition', prompt: '错题后我会主动分析错因而非死记答案', scale: 4 },
  { id: 'ab6', dimension: 'metacognition', prompt: '我会定期反思学习方法是否有效', scale: 4 },

  { id: 'ab7', dimension: 'endurance', prompt: '长期低反馈的项目我仍能坚持投入', scale: 4 },
  { id: 'ab8', dimension: 'endurance', prompt: '看不到进展时我不会轻易放弃', scale: 4 },

  { id: 'ab9', dimension: 'expression', prompt: '我能把复杂概念讲得让人听懂', scale: 4 },
  { id: 'ab10', dimension: 'expression', prompt: '我常被人请教并能教会他人', scale: 4 },

  { id: 'ab11', dimension: 'logic-tool', prompt: '面对复杂问题我能拆解成可执行步骤', scale: 4 },
  { id: 'ab12', dimension: 'logic-tool', prompt: '我会主动寻找工具提升效率', scale: 4 },

  { id: 'ab13', dimension: 'probability', prompt: '在不确定下我能给出概率化判断', scale: 4 },
  { id: 'ab14', dimension: 'probability', prompt: '面对未知我不会盲目乐观或悲观', scale: 4 },

  { id: 'ab15', dimension: 'emotion-shield', prompt: '压力下我仍能保持逻辑清晰', scale: 4 },
  { id: 'ab16', dimension: 'emotion-shield', prompt: '被质疑时我不会被情绪带偏', scale: 4 },

  { id: 'ab17', dimension: 'cross-domain', prompt: '我能把一个领域的方法用到另一个领域', scale: 4 },
  { id: 'ab18', dimension: 'cross-domain', prompt: '我对跨界结合有敏感度', scale: 4 },

  { id: 'ab19', dimension: 'metacognition', prompt: '我知道自己不知道什么', scale: 4 },
  { id: 'ab20', dimension: 'endurance', prompt: '积累型任务我能保持定量输出', scale: 4 },
];

/** 计算能力八维得分(0-100) */
export function scoreAbility(
  answers: Record<string, 1 | 2 | 3 | 4>,
  systemCalibration?: Partial<Record<AbilityEightDim, number>>,
): {
  scores: Record<AbilityEightDim, number>;
  selfOnly: AbilityEightDim[];
  calibratedFromSystem: AbilityEightDim[];
} {
  const raw: Record<AbilityEightDim, number[]> = {
    structure: [], metacognition: [], endurance: [],
    expression: [], 'logic-tool': [], probability: [],
    'emotion-shield': [], 'cross-domain': [],
  };
  for (const q of ABILITY_QUESTIONS_SHORT) {
    const val = answers[q.id];
    if (val) raw[q.dimension].push(((val - 1) / 3) * 100);
  }

  const scores = {} as Record<AbilityEightDim, number>;
  const selfOnly: AbilityEightDim[] = [];
  const calibratedFromSystem: AbilityEightDim[] = [];
  for (const dim of Object.keys(raw) as AbilityEightDim[]) {
    const selfScore = raw[dim].length ? Math.round(raw[dim].reduce((a, b) => a + b, 0) / raw[dim].length) : 0;
    if (systemCalibration && systemCalibration[dim] !== undefined) {
      scores[dim] = Math.round(systemCalibration[dim]!);
      calibratedFromSystem.push(dim);
    } else {
      scores[dim] = selfScore;
      selfOnly.push(dim);
    }
  }
  return { scores, selfOnly, calibratedFromSystem };
}

// ==================== 四象限 + 一票否决 + 三定 ====================

/** 内置候选职业库(简化, 供 P1 版本使用) */
export const BUILTIN_CAREER_LIBRARY: Array<Omit<CareerCandidate, 'id' | 'quadrant' | 'source' | 'vetoReason'>> = [
  { industry: '信息技术', profession: '软件架构师', position: '技术岗', valueCostTags: ['none'], planB: '技术顾问', planC: '开发工程师' },
  { industry: '信息技术', profession: '产品经理', position: '产品岗', valueCostTags: ['none'], planB: '产品运营', planC: '业务分析师' },
  { industry: '金融', profession: '投行前台', position: '专业岗', valueCostTags: ['health-cost'], planB: '中后台风控', planC: '零售银行' },
  { industry: '金融', profession: '量化研究员', position: '专业岗', valueCostTags: ['none'], planB: '金融科技工程师', planC: '数据分析师' },
  { industry: '教育科技', profession: '教育产品设计', position: '产品岗', valueCostTags: ['none'], planB: '教研教师', planC: '课程运营' },
  { industry: '教育科技', profession: '内容讲师', position: '专业岗', valueCostTags: ['none'], planB: '课程编辑', planC: '教学助理' },
  { industry: '公共部门', profession: '公务员/行政岗', position: '管理岗', valueCostTags: ['none'], planB: '事业单位', planC: '国企后勤' },
  { industry: '医疗健康', profession: '临床医生', position: '专业岗', valueCostTags: ['health-cost'], planB: '医院管理', planC: '医学编辑' },
  { industry: '销售/自媒体', profession: '露脸型自媒体主理人', position: '专业岗', valueCostTags: ['authenticity-cost'], planB: '幕后内容策划', planC: '内容运营' },
  { industry: '销售/零售', profession: '高频即时成交销售', position: '专业岗', valueCostTags: ['dignity-cost', 'unstable-life'], planB: '大客户 KA', planC: '客户成功' },
  { industry: '数据/科研', profession: '数据科学家', position: '专业岗', valueCostTags: ['none'], planB: '数据分析师', planC: '业务分析师' },
  { industry: '管理咨询', profession: '战略咨询顾问', position: '管理岗', valueCostTags: ['health-cost'], planB: '企业内战略', planC: '业务专家' },
];

/** 分派四象限 */
export function computeQuadrant(ability: number, interest: number): CareerQuadrant {
  const highA = ability >= 60;
  const highI = interest >= 60;
  if (highA && highI) return 'advantage';
  if (!highA && highI) return 'invest';
  if (highA && !highI) return 'backup';
  return 'avoid';
}

/** 从价值观 + 性格推断兴趣分数(简化模型) */
export function estimateInterestScore(
  candidate: { industry: string; position: string },
  values: ValueDimension[],
  personality: MBTIScore,
): number {
  let score = 50;
  // 价值观加权
  if (values[0] === 'achievement' && (candidate.position === '技术岗' || candidate.position === '专业岗')) score += 10;
  if (values[0] === 'growth' && (candidate.industry.includes('教育') || candidate.industry.includes('科技'))) score += 15;
  if (values[0] === 'freedom' && candidate.industry.includes('自媒体')) score += 20;
  if (values[0] === 'safety' && (candidate.industry.includes('公共') || candidate.industry.includes('医疗'))) score += 15;

  // MBTI 加权
  if (personality.type.startsWith('IN') && candidate.position === '专业岗') score += 10;
  if (personality.type.includes('T') && candidate.position === '技术岗') score += 10;
  if (personality.type.startsWith('E') && candidate.industry.includes('销售')) score += 10;
  if (personality.type.endsWith('J') && candidate.position === '管理岗') score += 10;

  return Math.min(100, Math.max(0, score));
}

/** 从能力八维为候选估算能力分数 */
export function estimateAbilityScore(
  candidate: { industry: string; position: string },
  abilityScores: Record<AbilityEightDim, number>,
): number {
  // 简化: 按岗位映射核心能力维度
  const map: Record<string, AbilityEightDim[]> = {
    技术岗: ['structure', 'logic-tool', 'metacognition'],
    专业岗: ['metacognition', 'endurance', 'probability'],
    产品岗: ['structure', 'cross-domain', 'expression'],
    管理岗: ['expression', 'cross-domain', 'emotion-shield'],
    运营岗: ['expression', 'endurance', 'cross-domain'],
  };
  const dims = map[candidate.position] ?? ['structure', 'metacognition'];
  const avg = dims.reduce((s, d) => s + (abilityScores[d] ?? 50), 0) / dims.length;
  return Math.round(avg);
}

/** 价值代价 → 底线冲突 */
export function isVetoed(tags: ValueCostTag[], bottomLines: BottomLine[]): { vetoed: boolean; reason?: string } {
  const map: Record<ValueCostTag, BottomLine[]> = {
    'health-cost': ['health'],
    'unstable-life': ['safety-boundary'],
    'sacrifice-relation': ['relationship'],
    'authenticity-cost': ['authenticity'],
    'dignity-cost': ['dignity'],
    none: [],
  };
  for (const tag of tags) {
    for (const bl of map[tag]) {
      if (bottomLines.includes(bl)) {
        return { vetoed: true, reason: `与底线价值[${bl}]冲突: ${tag}` };
      }
    }
  }
  return { vetoed: false };
}

/** 生成职业定位报告 */
export function generateCareerReport(assessment: CareerAssessment): CareerReport {
  const now = new Date().toISOString();
  const survivors: CareerCandidate[] = [];
  const vetoed: CareerCandidate[] = [];

  for (const base of BUILTIN_CAREER_LIBRARY) {
    const abilityScore = estimateAbilityScore(base, assessment.ability.scores);
    const interestScore = estimateInterestScore(base, assessment.values.ranked, assessment.personality);
    const quadrant = computeQuadrant(abilityScore, interestScore);
    const cand: CareerCandidate = {
      id: uuid(),
      source: 'builtin',
      quadrant,
      ...base,
    };
    const veto = isVetoed(cand.valueCostTags, assessment.values.bottomLines);
    if (veto.vetoed) {
      vetoed.push({ ...cand, vetoReason: veto.reason });
    } else {
      survivors.push(cand);
    }
  }

  // 双路线倾向: T/N 偏专家; 表达/跨界突出偏管理
  const expertScore =
    (assessment.personality.T > assessment.personality.F ? 20 : 0) +
    (assessment.personality.N > assessment.personality.S ? 20 : 0) +
    (assessment.ability.scores['logic-tool'] ?? 0) * 0.3 +
    (assessment.ability.scores.structure ?? 0) * 0.3;
  const managementScore =
    (assessment.ability.scores.expression ?? 0) * 0.4 +
    (assessment.ability.scores['cross-domain'] ?? 0) * 0.3 +
    (assessment.values.ranked[0] === 'achievement' ? 20 : 0);
  const total = expertScore + managementScore || 1;
  const expertBias = Math.round((expertScore / total) * 100);
  const managementBias = 100 - expertBias;
  const dominant: 'expert' | 'management' | 'balanced' =
    Math.abs(expertBias - managementBias) < 10 ? 'balanced' : expertBias > managementBias ? 'expert' : 'management';

  // 排序: 优势区优先
  const rank = (q: CareerQuadrant) => (q === 'advantage' ? 0 : q === 'backup' ? 1 : q === 'invest' ? 2 : 3);
  survivors.sort((a, b) => rank(a.quadrant) - rank(b.quadrant));

  return {
    id: uuid(),
    assessmentId: assessment.id,
    studentId: assessment.studentId,
    gradeLevel: assessment.gradeLevel,
    generatedAt: now,
    quadrant: survivors[0]?.quadrant ?? 'invest',
    survivors,
    vetoed,
    routes: { expertBias, managementBias, dominant },
    bottomLineNotes: assessment.values.bottomLines.map((bl) => `底线价值: ${bl}`),
    createdAt: now,
  };
}

/** 便捷: 保存测评与报告 */
export async function saveAssessment(assessment: CareerAssessment): Promise<void> {
  await putRecord('careerAssessments', assessment);
}

export async function saveReport(report: CareerReport): Promise<void> {
  await putRecord('careerReports', report);
}

// ==================== 完整版扩展(P2) ====================

/** §31.2 完整版价值观 45 题(简短版 15 题基础上扩展) */
export const VALUE_QUESTIONS_FULL: ValueQuestion[] = [
  ...VALUE_QUESTIONS_SHORT,
  // 额外 30 题:6 组冲突剩余 + 情境判断 + 成就动机细分 + 底线加深
  { id: 'v16', type: 'judgement', prompt: '落后时我担心的是被忽视, 而不是失去成长机会。', scoresFor: { yes: { safety: 2 }, no: { growth: 2 } } },
  { id: 'v17', type: 'judgement', prompt: '如果没人知道我的成绩,只有我自己看到,我仍然会在乎。', scoresFor: { yes: { growth: 2, achievement: 1 }, no: { achievement: 3 } } },
  { id: 'v18', type: 'judgement', prompt: '别人觉得我很好时,我仍在挑毛病。', scoresFor: { yes: { growth: 3 }, no: {} } },
  { id: 'v19', type: 'judgement', prompt: '既然做了, 就想做到靠前。', scoresFor: { yes: { achievement: 3 }, no: {} } },
  { id: 'v20', type: 'judgement', prompt: '有排名对比时我更有动力。', scoresFor: { yes: { achievement: 3 }, no: { freedom: 1 } } },
  { id: 'v21', type: 'forced-choice', prompt: '你更倾向?', optionA: '在大公司做螺丝钉', optionB: '在小公司做核心', scoresFor: { A: { safety: 2 }, B: { growth: 3, achievement: 2 } } },
  { id: 'v22', type: 'forced-choice', prompt: '你更倾向?', optionA: '一份长期确定收入', optionB: '一份高波动高回报', scoresFor: { A: { safety: 3 }, B: { achievement: 3 } }, bottomLineWhenA: 'safety-boundary' },
  { id: 'v23', type: 'forced-choice', prompt: '你更倾向?', optionA: '完成任务优先', optionB: '完美主义优先', scoresFor: { A: { achievement: 2 }, B: { growth: 3 } } },
  { id: 'v24', type: 'forced-choice', prompt: '你更倾向?', optionA: '被人喜欢', optionB: '被人尊重', scoresFor: { A: { relationship: 3 }, B: { achievement: 2 } }, bottomLineWhenB: 'dignity' },
  { id: 'v25', type: 'forced-choice', prompt: '你更倾向?', optionA: '专注做一件事到极致', optionB: '广泛涉猎多领域', scoresFor: { A: { growth: 3 }, B: { freedom: 2 } } },
  { id: 'v26', type: 'judgement', prompt: '我更关注解决问题的过程, 而不是短期结果。', scoresFor: { yes: { growth: 2 }, no: { achievement: 2 } } },
  { id: 'v27', type: 'judgement', prompt: '我可以为长期目标推迟眼前享受。', scoresFor: { yes: { growth: 3 }, no: { freedom: 1 } } },
  { id: 'v28', type: 'judgement', prompt: '我不会因为家人反对而放弃真正想做的事。', scoresFor: { yes: { freedom: 3, growth: 1 }, no: { relationship: 2 } }, bottomLineWhenA: 'authenticity' },
  { id: 'v29', type: 'judgement', prompt: '我能坦然接受收入不高的工作只要它符合我的价值观。', scoresFor: { yes: { growth: 3 }, no: { achievement: 3 } }, bottomLineWhenA: 'authenticity' },
  { id: 'v30', type: 'judgement', prompt: '面对权威, 我倾向保留自己的判断。', scoresFor: { yes: { freedom: 3 }, no: { safety: 2 } } },
  { id: 'v31', type: 'forced-choice', prompt: '你更倾向?', optionA: '在集体中协作', optionB: '独立完成任务', scoresFor: { A: { relationship: 3 }, B: { freedom: 3 } } },
  { id: 'v32', type: 'forced-choice', prompt: '你更倾向?', optionA: '有社会影响力的工作', optionB: '默默无闻但深度参与', scoresFor: { A: { achievement: 3 }, B: { growth: 2 } } },
  { id: 'v33', type: 'judgement', prompt: '我做过让自己特别拧巴但仍坚持的决定。', scoresFor: { yes: { growth: 2 }, no: { safety: 1 } } },
  { id: 'v34', type: 'judgement', prompt: '如果一份工作让我丧失尊严, 无论多好我都不会做。', scoresFor: { yes: { safety: 2 }, no: {} }, bottomLineWhenA: 'dignity' },
  { id: 'v35', type: 'judgement', prompt: '我不会为了收入去做违背良心的事。', scoresFor: { yes: {}, no: {} }, bottomLineWhenA: 'authenticity' },
  { id: 'v36', type: 'judgement', prompt: '为了成长我可以接受短期辛苦。', scoresFor: { yes: { growth: 3 }, no: { safety: 1 } } },
  { id: 'v37', type: 'judgement', prompt: '我对不确定性有较高的容忍度。', scoresFor: { yes: { freedom: 2 }, no: { safety: 3 } } },
  { id: 'v38', type: 'judgement', prompt: '我会优先选择能持续学到东西的机会。', scoresFor: { yes: { growth: 3 }, no: { achievement: 1 } } },
  { id: 'v39', type: 'judgement', prompt: '我会为了工作牺牲和家人的相处时间。', scoresFor: { yes: { achievement: 2 }, no: { relationship: 3 } }, bottomLineWhenB: 'relationship' },
  { id: 'v40', type: 'forced-choice', prompt: '你更倾向?', optionA: '拿到"体面"的头衔', optionB: '拿到匹配的真实报酬', scoresFor: { A: { relationship: 1, achievement: 2 }, B: { achievement: 3 } } },
  { id: 'v41', type: 'forced-choice', prompt: '你更倾向?', optionA: '一份能证明能力的工作', optionB: '一份能证明责任的工作', scoresFor: { A: { achievement: 3 }, B: { safety: 2 } } },
  { id: 'v42', type: 'judgement', prompt: '我倾向以数据/事实做决策, 而不是以感受。', scoresFor: { yes: { growth: 1 }, no: { relationship: 1 } } },
  { id: 'v43', type: 'judgement', prompt: '我曾在没有回报的情况下持续投入超过 6 个月。', scoresFor: { yes: { growth: 3 }, no: { safety: 1 } } },
  { id: 'v44', type: 'judgement', prompt: '如果新工作要求长期夜班, 我会拒绝。', scoresFor: { yes: { safety: 3 }, no: {} }, bottomLineWhenA: 'health' },
  { id: 'v45', type: 'judgement', prompt: '我更看重"过程的诚意", 而非"结果的荣光"。', scoresFor: { yes: { growth: 2 }, no: { achievement: 2 } } },
];

/** §31.3 完整版:六种成就动机细分 - 从答题模式推断 */
export type AchievementMotive =
  | 'ranking' | 'accomplishment' | 'control-safety' | 'perfectionism' | 'external-approval' | 'hybrid';

export const ACHIEVEMENT_MOTIVE_LABEL: Record<AchievementMotive, string> = {
  ranking: '竞争/排名感',
  accomplishment: '成就导向',
  'control-safety': '控制安全感',
  perfectionism: '完美主义',
  'external-approval': '外部认同',
  hybrid: '混合型',
};

export function detectAchievementMotives(answers: Record<string, string | string[]>): AchievementMotive[] {
  const votes: Record<AchievementMotive, number> = {
    ranking: 0, accomplishment: 0, 'control-safety': 0, perfectionism: 0, 'external-approval': 0, hybrid: 0,
  };
  if (answers.v3 === 'yes' || answers.v20 === 'yes') votes.ranking += 2;
  if (answers.v19 === 'yes') votes.accomplishment += 3;
  if (answers.v41 === 'A') votes.accomplishment += 1;
  if (answers.v16 === 'yes' || answers.v22 === 'A') votes['control-safety'] += 2;
  if (answers.v18 === 'yes' || answers.v23 === 'B') votes.perfectionism += 2;
  if (answers.v17 === 'yes') votes['external-approval'] += 3;
  if (answers.v40 === 'A') votes['external-approval'] += 1;
  const top = Object.entries(votes)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .filter(([, s]) => (s as number) > 0)
    .slice(0, 3)
    .map(([k]) => k as AchievementMotive);
  if (top.length >= 2 && top.every((k) => votes[k] >= 2)) return ['hybrid', ...top];
  return top.length > 0 ? top : ['accomplishment'];
}

/** §31.2 完整版 MBTI 93 题:E/I×24 S/N×24 T/F×22 J/P×23 - 生成器,简化版每维度扩展 */
export const MBTI_QUESTIONS_FULL: MBTIQuestion[] = [
  ...MBTI_QUESTIONS_SHORT,
  // 每维度新增 16 题,粘贴到共 93 题
  ...([
    ['EI', '在陌生场合我更喜欢?', '主动打招呼', 'E', '等对方开口', 'I'],
    ['EI', '假期我更喜欢?', '参加聚会', 'E', '独自阅读', 'I'],
    ['EI', '思考问题我倾向?', '和他人讨论', 'E', '独自琢磨', 'I'],
    ['EI', '面对压力我会?', '找人倾诉', 'E', '独处消化', 'I'],
    ['EI', '打电话时我?', '即使有事也乐于寒暄', 'E', '直入主题', 'I'],
    ['EI', '得知新想法时?', '第一时间讲给别人', 'E', '写下来自己消化', 'I'],
    ['EI', '走路我倾向?', '和人一起', 'E', '独自散步', 'I'],
    ['EI', '你的活力主要来自?', '与人交流', 'E', '独处思考', 'I'],
    ['EI', '拍照时?', '会主动入镜', 'E', '习惯拍别人', 'I'],
    ['EI', '在会议中我?', '愿意主持', 'E', '愿意做记录', 'I'],
    ['EI', '午餐时间我?', '愿意约同事', 'E', '愿意独自用餐', 'I'],
    ['EI', '一天工作结束我?', '想找人喝一杯', 'E', '想安静回家', 'I'],
    ['EI', '看电影后我?', '想立刻讨论', 'E', '想自己回味', 'I'],
    ['EI', '你的手机通讯录?', '联系人很多', 'E', '联系人不多但深', 'I'],
    ['EI', '被介绍给陌生人时?', '会主动展开话题', 'E', '会等待对方引导', 'I'],
    ['EI', '思绪太多时?', '说出来会更清晰', 'E', '写下来会更清晰', 'I'],
    ['SN', '接受新信息时我更依赖?', '五官感受', 'S', '直觉洞察', 'N'],
    ['SN', '我更擅长?', '记住具体案例', 'S', '总结抽象规律', 'N'],
    ['SN', '别人形容我?', '实事求是', 'S', '富有想象', 'N'],
    ['SN', '我更喜欢?', '细节手册', 'S', '整体框架', 'N'],
    ['SN', '面对新任务?', '按步骤推进', 'S', '构想终局倒推', 'N'],
    ['SN', '看书我更喜欢?', '实用类', 'S', '哲学思辨类', 'N'],
    ['SN', '解释事情我更喜欢?', '举具体例子', 'S', '打比方类比', 'N'],
    ['SN', '面对模糊问题我?', '要求更多数据', 'S', '直接给假设', 'N'],
    ['SN', '想到未来我?', '想具体的一年内计划', 'S', '想五年后的可能性', 'N'],
    ['SN', '决策时更相信?', '过往经验', 'S', '内心直觉', 'N'],
    ['SN', '我的记忆偏向?', '实景细节', 'S', '整体印象', 'N'],
    ['SN', '我更容易被感动于?', '具体的人物', 'S', '宏大的意义', 'N'],
    ['SN', '别人认为我?', '脚踏实地', 'S', '天马行空', 'N'],
    ['SN', '我更倾向讨论?', '此时此地的问题', 'S', '未来可能性', 'N'],
    ['SN', '面对陌生领域我?', '先掌握基础事实', 'S', '直接理解本质', 'N'],
    ['SN', '你更喜欢作品?', '现实主义', 'S', '象征主义', 'N'],
    ['TF', '做决定时我优先考虑?', '事情本身对不对', 'T', '相关人的感受', 'F'],
    ['TF', '别人形容我?', '公正', 'T', '善解人意', 'F'],
    ['TF', '别人向我倾诉?', '我先分析问题', 'T', '我先共情安慰', 'F'],
    ['TF', '面对矛盾时?', '争论对错', 'T', '找共同点', 'F'],
    ['TF', '接受批评我更看?', '批评是否有理', 'T', '批评者是否善意', 'F'],
    ['TF', '你倾向的领导风格?', '规则清晰', 'T', '关怀人', 'F'],
    ['TF', '写邮件我?', '直接说结论', 'T', '先寒暄再说事', 'F'],
    ['TF', '朋友求助我?', '给出解决方案', 'T', '给予情感支持', 'F'],
    ['TF', '面对不公?', '据理力争', 'T', '照顾各方情绪', 'F'],
    ['TF', '我更关心一份工作?', '专业挑战性', 'T', '同事氛围', 'F'],
    ['TF', '看到无理要求我?', '直接拒绝', 'T', '找委婉理由', 'F'],
    ['TF', '朋友情绪失控时?', '先冷静分析', 'T', '先陪伴倾听', 'F'],
    ['TF', '选餐厅我更看?', '性价比与口味', 'T', '大家的意愿', 'F'],
    ['TF', '判断对错我?', '基于事实', 'T', '基于当事人处境', 'F'],
    ['TF', '开会时我倾向?', '推动结论', 'T', '让每个人发言', 'F'],
    ['JP', '我更喜欢?', '按计划推进', 'J', '灵活应变', 'P'],
    ['JP', '面对开放议题?', '想尽快收敛', 'J', '喜欢发散', 'P'],
    ['JP', '我的桌面?', '整齐分区', 'J', '灵活散乱', 'P'],
    ['JP', '面对期限?', '一开始就动手', 'J', '临近才冲刺', 'P'],
    ['JP', '旅行前?', '做详细攻略', 'J', '定大方向即可', 'P'],
    ['JP', '面对多个方案?', '尽快选一个', 'J', '保留多种可能', 'P'],
    ['JP', '喜欢的日常?', '有明确规律', 'J', '每天不一样', 'P'],
    ['JP', '我的手机应用?', '分组整理', 'J', '不做整理', 'P'],
    ['JP', '朋友迟到我?', '会提前提醒', 'J', '默默调整', 'P'],
    ['JP', '看电影我更喜欢?', '结局明确', 'J', '开放式结局', 'P'],
    ['JP', '安排周末?', '前几天定好', 'J', '当天再说', 'P'],
    ['JP', '面对突发变化?', '需要调整方案', 'J', '当作新机会', 'P'],
    ['JP', '完成任务我?', '按 checklist 打勾', 'J', '灵活跳步', 'P'],
    ['JP', '你倾向的时间感?', '很在意时点', 'J', '看情境节奏', 'P'],
    ['JP', '你的收纳?', '有明确位置', 'J', '看当下方便', 'P'],
    ['JP', '面对未完成任务?', '睡不好', 'J', '可以先放放', 'P'],
  ] as Array<[MBTIAxis, string, string, MBTIQuestion['scoreA'], string, MBTIQuestion['scoreB']]>).map(
    (row, i) => ({
      id: `mbtif${i}`,
      axis: row[0],
      prompt: row[1],
      optionA: row[2],
      scoreA: row[3],
      optionB: row[4],
      scoreB: row[5],
    }),
  ),
];

/** §31.2 完整版能力检测 60 题 - 每维度 7-8 题 */
export const ABILITY_QUESTIONS_FULL: AbilityQuestion[] = [
  ...ABILITY_QUESTIONS_SHORT,
  ...([
    ['structure', '我能识别一段文本中的核心结构与从属关系', 4],
    ['structure', '看到复杂现象我先画结构图再动手', 4],
    ['structure', '我能把零散经验总结成个人方法论', 4],
    ['structure', '面对信息过载我会先分层再处理', 4],
    ['structure', '我会区分"表象"与"本质"来解释问题', 4],
    ['metacognition', '完成任务后我会主动复盘', 4],
    ['metacognition', '我能明确指出"我不理解什么"', 4],
    ['metacognition', '我能观察自己学习中的偷懒模式', 4],
    ['metacognition', '我能预测自己完成任务需要的时间', 4],
    ['metacognition', '我会根据数据调整学习策略', 4],
    ['endurance', '面对枯燥任务我仍能坚持', 4],
    ['endurance', '哪怕看不到进步我也不会停下', 4],
    ['endurance', '我能持续做一件事超过 100 天', 4],
    ['endurance', '我不会因为一时受挫就整体放弃', 4],
    ['expression', '我能用一分钟把一件事讲清楚', 4],
    ['expression', '被人问到不熟的问题我能大方回应', 4],
    ['expression', '我经常被别人称为"讲得懂"', 4],
    ['expression', '我会根据听众调整表达方式', 4],
    ['logic-tool', '面对陌生软件我能快速上手', 4],
    ['logic-tool', '我经常用工具替代重复劳动', 4],
    ['logic-tool', '我能设计一个简单的自动化流程', 4],
    ['logic-tool', '我会写清晰的操作步骤给别人执行', 4],
    ['probability', '面对不确定我给出的估计比较准确', 4],
    ['probability', '我能用概率语言描述风险', 4],
    ['probability', '我倾向做期望值最优选择', 4],
    ['emotion-shield', '争论中我能保持冷静', 4],
    ['emotion-shield', '被否定时我不会情绪化反应', 4],
    ['emotion-shield', '我能区分情绪与事实', 4],
    ['cross-domain', '我能把两个不相干领域的方法结合', 4],
    ['cross-domain', '我关注多个领域并主动交叉阅读', 4],
    ['cross-domain', '我常常在不同领域间发现共通结构', 4],
    ['cross-domain', '我能用一个领域的经验解释另一个领域', 4],
    ['metacognition', '我知道什么时候该向别人请教', 4],
    ['endurance', '面对长期回报我愿意"忍受寂寞"', 4],
    ['expression', '我能应对突发的公开发言场合', 4],
    ['logic-tool', '我能画出关键流程图', 4],
    ['probability', '我不会被小概率高冲击的坏消息带偏', 4],
    ['emotion-shield', '关键场合我能不被别人的情绪影响判断', 4],
    ['structure', '我能识别一份论证的隐藏假设', 4],
    ['cross-domain', '我能把一个模型迁移到全新问题', 4],
  ] as Array<[AbilityEightDim, string, 4]>).map((row, i) => ({
    id: `abf${i}`,
    dimension: row[0],
    prompt: row[1],
    scale: row[2],
  })),
];

/** §31.4 从现有系统数据自动派生能力校准值 */
export function deriveAbilityCalibration(
  trainings: TrainingRecord[],
  gaps: AbilityGap[],
  abilities: AbilitySnapshot[],
): Partial<Record<AbilityEightDim, number>> {
  const calibration: Partial<Record<AbilityEightDim, number>> = {};
  if (trainings.length === 0) return calibration;

  const totalQ = trainings.reduce((s, r) => s + r.totalQuestions, 0);
  const totalE = trainings.reduce((s, r) => s + r.errorCount, 0);
  const mastery = totalQ === 0 ? 50 : Math.round(((totalQ - totalE) / totalQ) * 100);

  // 结构化 + 逻辑工具:整体掌握度
  calibration.structure = mastery;
  calibration['logic-tool'] = mastery;

  // 元认知:错误复现率下降越明显越好
  const gapVerified = gaps.filter((g) => g.status === 'verified').length;
  const meta = gaps.length === 0 ? 60 : Math.min(100, Math.round((gapVerified / gaps.length) * 100 + 30));
  calibration.metacognition = meta;

  // 积累型耐力:训练频率(近 60 天不同天数)
  const days = new Set(trainings.filter((r) => Date.now() - new Date(r.date).getTime() < 60 * 86400000).map((r) => r.date));
  calibration.endurance = Math.min(100, Math.round((days.size / 60) * 100 + 20));

  // 情绪隔离 & 概率风控:留白, 无自动数据源
  // 表达传授:通过 abilities 中标记为 'external_ai' 的评估
  const externalCount = abilities.filter((a) => a.source === 'external_ai').length;
  if (externalCount >= 3) calibration.expression = 70;

  return calibration;
}

/** §31.6 差异检测: 自评 vs 校准差异 > 15% */
export function detectAbilityDivergence(
  self: Record<AbilityEightDim, number>,
  calibrated: Partial<Record<AbilityEightDim, number>>,
): Array<{ dim: AbilityEightDim; self: number; calibrated: number; delta: number }> {
  const out: Array<{ dim: AbilityEightDim; self: number; calibrated: number; delta: number }> = [];
  for (const dim of Object.keys(self) as AbilityEightDim[]) {
    const c = calibrated[dim];
    if (c === undefined) continue;
    const delta = self[dim] - c;
    if (Math.abs(delta) >= 15) out.push({ dim, self: self[dim], calibrated: c, delta });
  }
  return out;
}

/** §31.6 一票否决解除记录 */
export async function overrideVeto(reportId: string, candidateId: string, reason: string): Promise<CareerVetoOverride> {
  const record: CareerVetoOverride = {
    id: uuid(),
    reportId,
    candidateId,
    reason: reason.trim(),
    confirmedAt: new Date().toISOString(),
  };
  await putRecord('vetoOverrides', record);
  return record;
}

export async function listVetoOverrides(reportId: string): Promise<CareerVetoOverride[]> {
  const all = await getAllRecords('vetoOverrides');
  return all.filter((v) => v.reportId === reportId);
}

/** §31.9 教师班级生涯测评汇总(匿名) */
export interface CareerClassSummary {
  gradeLevel: GradeLevel;
  totalCount: number;
  mbtiDist: Record<string, number>;
  quadrantDist: Record<CareerQuadrant, number>;
  bottomLineDist: Record<BottomLine, number>;
  topBottomLines: BottomLine[];
}

export function summarizeClassCareer(
  assessments: CareerAssessment[],
  reports: CareerReport[],
): CareerClassSummary[] {
  const byGrade = new Map<GradeLevel, { assessments: CareerAssessment[]; reports: CareerReport[] }>();
  for (const a of assessments) {
    const entry = byGrade.get(a.gradeLevel) ?? { assessments: [], reports: [] };
    entry.assessments.push(a);
    byGrade.set(a.gradeLevel, entry);
  }
  for (const r of reports) {
    const entry = byGrade.get(r.gradeLevel) ?? { assessments: [], reports: [] };
    entry.reports.push(r);
    byGrade.set(r.gradeLevel, entry);
  }
  const out: CareerClassSummary[] = [];
  for (const [gradeLevel, { assessments: aList, reports: rList }] of byGrade) {
    const mbtiDist: Record<string, number> = {};
    const blDist: Record<BottomLine, number> = { health: 0, 'safety-boundary': 0, relationship: 0, authenticity: 0, dignity: 0 };
    for (const a of aList) {
      mbtiDist[a.personality.type] = (mbtiDist[a.personality.type] ?? 0) + 1;
      for (const bl of a.values.bottomLines) blDist[bl] += 1;
    }
    const quadrantDist: Record<CareerQuadrant, number> = { advantage: 0, invest: 0, backup: 0, avoid: 0 };
    for (const r of rList) quadrantDist[r.quadrant] += 1;
    const topBottomLines = Object.entries(blDist)
      .sort(([, a], [, b]) => b - a)
      .filter(([, v]) => v > 0)
      .slice(0, 2)
      .map(([k]) => k as BottomLine);
    out.push({
      gradeLevel,
      totalCount: aList.length,
      mbtiDist,
      quadrantDist,
      bottomLineDist: blDist,
      topBottomLines,
    });
  }
  return out;
}

/** §31.7 学段差异化输出策略 */
export function pickReportStrategy(gradeLevel: GradeLevel): {
  showAvoid: boolean;
  showRoutes: boolean;
  emphasize: 'interest' | 'major' | 'position';
} {
  if (gradeLevel === 'junior') return { showAvoid: false, showRoutes: false, emphasize: 'interest' };
  if (gradeLevel === 'senior') return { showAvoid: true, showRoutes: true, emphasize: 'major' };
  return { showAvoid: true, showRoutes: true, emphasize: 'position' };
}

/** §31.10 高中专业变体报告 */
export interface HighSchoolMajorCandidate {
  discipline: string;
  major: string;
  subjectCombination: string;
  employmentOverview: string;
  planB?: string;
  planC?: string;
}

/** 内置高中专业候选(简化,可扩展) */
export const BUILTIN_HS_MAJORS: HighSchoolMajorCandidate[] = [
  { discipline: '工学', major: '计算机科学与技术', subjectCombination: '物理+化学', employmentOverview: '互联网/软件工程,深造率 40%+', planB: '软件工程', planC: '信息与计算科学' },
  { discipline: '工学', major: '电子信息工程', subjectCombination: '物理+化学', employmentOverview: '通信/芯片/嵌入式', planB: '自动化', planC: '光电信息' },
  { discipline: '理学', major: '数学与应用数学', subjectCombination: '物理+化学', employmentOverview: '教育/深造/金融量化', planB: '统计学', planC: '数据科学' },
  { discipline: '经济', major: '金融学', subjectCombination: '不限', employmentOverview: '银行/券商/深造', planB: '经济学', planC: '会计学' },
  { discipline: '教育', major: '教育学', subjectCombination: '不限', employmentOverview: '教育机构/深造', planB: '学前教育', planC: '心理学' },
  { discipline: '文学', major: '汉语言文学', subjectCombination: '不限', employmentOverview: '媒体/教育/公务员', planB: '新闻传播学', planC: '汉语国际教育' },
];

/** §31 版本化重测 - 计算与上次测评的差异 */
export interface CareerRetestDiff {
  from: CareerAssessment;
  to: CareerAssessment;
  valueRankChanges: Array<{ dim: ValueDimension; oldRank: number; newRank: number }>;
  abilityDeltas: Array<{ dim: AbilityEightDim; delta: number }>;
  mbtiChange: string | null;
  bottomLineChanges: Array<{ added: BottomLine[]; removed: BottomLine[] }>;
}

export function compareAssessments(from: CareerAssessment, to: CareerAssessment): CareerRetestDiff {
  const valueRankChanges = [] as CareerRetestDiff['valueRankChanges'];
  const dims: ValueDimension[] = ['achievement', 'growth', 'safety', 'relationship', 'freedom'];
  for (const dim of dims) {
    const oldR = from.values.ranked.indexOf(dim);
    const newR = to.values.ranked.indexOf(dim);
    if (oldR !== newR) valueRankChanges.push({ dim, oldRank: oldR + 1, newRank: newR + 1 });
  }
  const abilityDeltas: CareerRetestDiff['abilityDeltas'] = [];
  for (const dim of Object.keys(from.ability.scores) as AbilityEightDim[]) {
    const delta = (to.ability.scores[dim] ?? 0) - (from.ability.scores[dim] ?? 0);
    if (Math.abs(delta) >= 5) abilityDeltas.push({ dim, delta });
  }
  const mbtiChange = from.personality.type !== to.personality.type ? `${from.personality.type} → ${to.personality.type}` : null;
  const added = to.values.bottomLines.filter((b) => !from.values.bottomLines.includes(b));
  const removed = from.values.bottomLines.filter((b) => !to.values.bottomLines.includes(b));
  return { from, to, valueRankChanges, abilityDeltas, mbtiChange, bottomLineChanges: [{ added, removed }] };
}

// 静默 uncalled import (为兼容 types 别名)
export type { ErrorCategory };

/** 创建空白测评(用于逐步作答保存) */
export function createBlankAssessment(gradeLevel: GradeLevel, studentId?: string): CareerAssessment {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    studentId,
    gradeLevel,
    version: '1.0',
    values: { ranked: [], bottomLines: [], highlightTags: [] },
    ability: {
      scores: {
        structure: 0, metacognition: 0, endurance: 0,
        expression: 0, 'logic-tool': 0, probability: 0,
        'emotion-shield': 0, 'cross-domain': 0,
      },
      selfOnly: [],
      calibratedFromSystem: [],
    },
    personality: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0, type: '----' },
    clarificationStep: 'free-choice',
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/* ============================================================
 * V5.11 §31.2 · 干扰项(Lie Scale)与作答可信度评分
 * ============================================================ */

/** 干扰项题目定义 - 与正式题混排,反向表述测同一维度 */
export interface LieScaleItem {
  id: string;
  section: 'values' | 'personality' | 'ability';
  /** 关联的正向主量表题 ID 或维度关键字 */
  reverseKey: string;
  originalDimension: string;
  prompt: string;
  /** 反社会期许陷阱题标记 - 每卷含 1 道 */
  isSocialDesirabilityTrap?: boolean;
  /** 期望的反向一致答案(与主量表方向相反) */
  expectedReverseAnswer: string;
}

/** 价值观干扰项(与主题目混排,共 3 道) */
export const VALUE_LIE_SCALE: LieScaleItem[] = [
  {
    id: 'v-ls1',
    section: 'values',
    reverseKey: 'v6', // 我需要能自主安排时间的工作(freedom+)
    originalDimension: 'freedom',
    prompt: '我更喜欢每天有相同的工作节奏, 不希望有太多变化。',
    expectedReverseAnswer: 'no',
  },
  {
    id: 'v-ls2',
    section: 'values',
    reverseKey: 'v14',
    originalDimension: 'safety-health',
    prompt: '为了拿到高薪, 我可以接受长期熬夜或高强度加班。',
    isSocialDesirabilityTrap: true,
    expectedReverseAnswer: 'no',
  },
  {
    id: 'v-ls3',
    section: 'values',
    reverseKey: 'v13',
    originalDimension: 'authenticity',
    prompt: '我从未对任何人说过谎, 也从未违背过自己的承诺。',
    isSocialDesirabilityTrap: true,
    expectedReverseAnswer: 'no',
  },
];

/** MBTI 干扰项(3 道) */
export const MBTI_LIE_SCALE: LieScaleItem[] = [
  {
    id: 'mbti-ls1',
    section: 'personality',
    reverseKey: 'ei1', // 聚会中主动认识 -> E
    originalDimension: 'EI',
    prompt: '在陌生人聚会中, 我喜欢独自呆着, 很少主动找人聊天。',
    expectedReverseAnswer: 'A',
  },
  {
    id: 'mbti-ls2',
    section: 'personality',
    reverseKey: 'jp1', // 计划 vs 应变
    originalDimension: 'JP',
    prompt: '我更喜欢没有计划、每天不一样的生活节奏。',
    expectedReverseAnswer: 'B',
  },
  {
    id: 'mbti-ls3',
    section: 'personality',
    reverseKey: 'tf1', // 客观逻辑 vs 他人感受
    originalDimension: 'TF',
    prompt: '做决定时我总是优先照顾大家的情绪, 不太考虑事情本身的对错。',
    expectedReverseAnswer: 'B',
  },
];

/** 能力干扰项(2 道) */
export const ABILITY_LIE_SCALE: LieScaleItem[] = [
  {
    id: 'ab-ls1',
    section: 'ability',
    reverseKey: 'ab1',
    originalDimension: 'structure',
    prompt: '面对全新领域, 我更倾向于走一步看一步, 而不是先搭框架。',
    expectedReverseAnswer: '1', // 低分
  },
  {
    id: 'ab-ls2',
    section: 'ability',
    reverseKey: 'ab15',
    originalDimension: 'emotion-shield',
    prompt: '压力大的时候我常常会失去逻辑, 变得容易急躁。',
    expectedReverseAnswer: '1',
  },
];

/** V5.11 · 计算作答可信度评分 - 四因素加权(40% + 30% + 20% + 10%) */
export function computeAnswerCredibilityScore(input: {
  lieScaleResponses: LieScaleResponse[];
  answers: Record<string, string | string[] | number>;
  startedAt?: string;
  finishedAt?: string;
  totalQuestions: number;
}): AnswerCredibilityScore {
  const lie = input.lieScaleResponses;
  // 1. 干扰项匹配率(40%)
  const lieMatch = lie.length === 0
    ? 60
    : Math.round((lie.filter((r) => r.isReverseConsistent).length / lie.length) * 100);

  // 2. 同维度内一致性(30%) - 简化: 用干扰项 + 其他题的方向一致度作代理
  const inconsistentCount = lie.filter((r) => !r.isReverseConsistent).length;
  const consistency = lie.length === 0 ? 60 : Math.round(Math.max(0, 100 - inconsistentCount * 20));

  // 3. 作答时间合理性(20%) - 过快(<3s/题) 或过慢(>3x 均值) 扣分
  let timingScore = 80;
  if (input.startedAt && input.finishedAt && input.totalQuestions > 0) {
    const durSec = (new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime()) / 1000;
    const perQ = durSec / input.totalQuestions;
    if (perQ < 3) timingScore = 40;
    else if (perQ < 5) timingScore = 60;
    else if (perQ > 90) timingScore = 60;
    else timingScore = 90;
  }

  // 4. 极端选项分布(10%) - 全选同一选项或连续同一选项超阈值
  let extremeDist = 90;
  const answerValues = Object.values(input.answers).flat().map((v) => String(v));
  if (answerValues.length > 5) {
    const uniq = new Set(answerValues).size;
    if (uniq <= 2 && answerValues.length > 10) extremeDist = 30;
    else {
      // 连续相同 >= 8
      let maxStreak = 1;
      let curStreak = 1;
      for (let i = 1; i < answerValues.length; i++) {
        if (answerValues[i] === answerValues[i - 1]) {
          curStreak += 1;
          maxStreak = Math.max(maxStreak, curStreak);
        } else curStreak = 1;
      }
      if (maxStreak >= 8) extremeDist = 50;
    }
  }

  const totalScore = Math.round(lieMatch * 0.4 + consistency * 0.3 + timingScore * 0.2 + extremeDist * 0.1);

  // 低置信度维度检测 - 若某维度上干扰项出现 2 次以上不一致
  const dimCounts = new Map<string, number>();
  for (const r of lie) {
    if (!r.isReverseConsistent) {
      dimCounts.set(r.originalDimension, (dimCounts.get(r.originalDimension) ?? 0) + 1);
    }
  }
  const lowConfidenceDimensions = Array.from(dimCounts.entries())
    .filter(([, c]) => c >= 2)
    .map(([d]) => d);

  return {
    totalScore,
    lieScaleMatch: lieMatch,
    consistencyScore: consistency,
    timingScore,
    extremeDistScore: extremeDist,
    requiresRetest: totalScore < 70,
    lowConfidenceDimensions: lowConfidenceDimensions.length ? lowConfidenceDimensions : undefined,
  };
}

/** V5.11 · 校验干扰项回答与主量表是否一致 */
export function checkLieScaleConsistency(
  items: LieScaleItem[],
  answers: Record<string, string | string[] | number | undefined>,
): LieScaleResponse[] {
  return items.map((item) => {
    const raw = answers[item.id];
    const ans = raw === undefined ? '' : Array.isArray(raw) ? raw.join(',') : String(raw);
    return {
      itemId: item.id,
      section: item.section,
      originalDimension: item.originalDimension,
      reverseKey: item.reverseKey,
      answer: ans,
      isReverseConsistent: ans === item.expectedReverseAnswer,
    };
  });
}

/* ============================================================
 * V5.11 §31.3 · 价值澄清五步进度 + 3 个月观察点
 * ============================================================ */
export const VALUE_CLARIFICATION_STEPS: Array<{
  step: ValueClarificationStep;
  order: number;
  triggerWhen: string;
  description: string;
}> = [
  { step: 'free-choice', order: 1, triggerWhen: '进入测评', description: '迫选题无默认答案 · 无对错暗示' },
  { step: 'full-consider', order: 2, triggerWhen: '完成 15+ 题', description: '行为事实 + 极端假设 + 冲突迫选多视角输入' },
  { step: 'cherish-share', order: 3, triggerWhen: '生成一句话价值观说明书', description: '可分享导出' },
  { step: 'take-action', order: 4, triggerWhen: '完成 3 张小步实践卡片或决策三问卡片', description: '价值观 → 行动 → 验证' },
  { step: 'lifestyle', order: 5, triggerWhen: '3 个月观察点行为一致 或 6-12 月重测迭代', description: '价值观固化为生活方式' },
];

/** V5.11 · 计算五步澄清当前所处步骤 */
export function computeClarificationStep(input: {
  assessment: CareerAssessment;
  observationPoints?: CareerObservationPoint[];
  hasValueStatement?: boolean;
  smallStepActionsCount?: number;
}): ValueClarificationStep {
  const { assessment, observationPoints = [], hasValueStatement, smallStepActionsCount = 0 } = input;
  const anyObsValidated = observationPoints.some((op) =>
    op.layerConsistency.filter((l) => l.consistent).length >= 3,
  );
  if (anyObsValidated || assessment.version === '2.0') return 'lifestyle';
  if (smallStepActionsCount >= 3) return 'take-action';
  if (hasValueStatement || (assessment.values.valueStatement?.trim().length ?? 0) > 0) return 'cherish-share';
  if (assessment.values.ranked.length >= 3) return 'full-consider';
  return 'free-choice';
}

/** V5.11 · 生成 3 个月观察点(基于评估创建时间) */
export function generateObservationPoint(
  assessment: CareerAssessment,
  layerActuals: Array<{ layer: ValueDimension; observedBehavior: string; consistent: boolean }>,
): CareerObservationPoint {
  const now = new Date().toISOString();
  const layerConsistency = layerActuals.map((la) => ({
    layer: la.layer,
    consistent: la.consistent,
    note: la.observedBehavior,
  }));

  const smallStepActions = assessment.values.ranked.slice(0, 3).map((dim) => ({
    id: uuid(),
    valueDim: dim,
    action: SMALL_STEP_ACTION_TEMPLATES[dim]?.[0] ?? '本月主动做一件与该价值一致的小事',
    status: 'pending' as const,
  }));

  return {
    id: uuid(),
    assessmentId: assessment.id,
    studentId: assessment.studentId,
    triggeredAt: now,
    layerConsistency,
    smallStepActions,
    createdAt: now,
  };
}

/** V5.11 · 每层价值观对应的小步实践卡片模板(3 个候选) */
export const SMALL_STEP_ACTION_TEMPLATES: Record<ValueDimension, string[]> = {
  achievement: [
    '完成一次可展示的能力输出(作品 / 报告 / 演讲)',
    '主动申请或承担一项能带来外部认可的任务',
    '为自己设定一个可衡量的月度里程碑',
  ],
  growth: [
    '选一个陌生领域, 完成一个 3 小时的入门学习',
    '主动请教一位比自己厉害的人',
    '花 1 小时复盘上个月的成长盲点',
  ],
  safety: [
    '梳理并明确一个健康或财务的下限线',
    '整理未来 3 个月的稳定性备份计划',
    '做一次体检 / 财务快照记录',
  ],
  relationship: [
    '主动约一位重要的人吃一次饭',
    '给家人 / 朋友写一段话表达感谢',
    '陪伴家人完成一件他 / 她一直想做的小事',
  ],
  freedom: [
    '尝试一段不被安排、只属于自己的时间',
    '拒绝一件让自己感到被过度束缚的事',
    '探索一个从未涉足的兴趣',
  ],
};

/** V5.11 · 是否应触发 3 个月观察点(距首次测评满 90 天) */
export function shouldTriggerObservationPoint(assessment: CareerAssessment): boolean {
  const daysSince = (Date.now() - new Date(assessment.createdAt).getTime()) / 86400000;
  return daysSince >= 90;
}

/** V5.11 · 保存观察点 */
export async function saveObservationPoint(op: CareerObservationPoint): Promise<void> {
  await putRecord('careerObservationPoints', op);
}

/** V5.11 · 列出某测评的观察点 */
export async function listObservationPoints(assessmentId: string): Promise<CareerObservationPoint[]> {
  const all = await getAllRecords('careerObservationPoints');
  return all
    .filter((op) => op.assessmentId === assessmentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ============================================================
 * V5.11 §31.3 · 事后反思 2 问(重测前置)
 * ============================================================ */
export const RETEST_REFLECTION_QUESTIONS = [
  {
    id: 'q1',
    text: '自上次测评以来, 最放不下的一个顾虑是什么?',
    tagOptions: ['成就与能力', '成长与清晰', '安全与健康', '关系与陪伴', '自由度', '收入压力', '身份认同', '家人期待'],
  },
  {
    id: 'q2',
    text: '哪一次选择至今不后悔, 核心原因是什么?',
    tagOptions: ['价值观匹配', '长期成长', '守护健康', '陪伴家人', '避免透支', '保留选择空间', '真实自我', '尊严'],
  },
] as const;

export async function saveRetestReflection(r: RetestReflection): Promise<void> {
  await putRecord('careerRetestReflections', r);
}

export async function listRetestReflections(assessmentId: string): Promise<RetestReflection[]> {
  const all = await getAllRecords('careerRetestReflections');
  return all.filter((r) => r.assessmentId === assessmentId);
}

/* ============================================================
 * V5.11 §31.6 · 三叉戟职业发展结构
 * ============================================================ */
export function buildTridentStructure(
  report: CareerReport,
  assessment: CareerAssessment,
): TridentStructure | undefined {
  if (assessment.gradeLevel !== 'adult') return undefined;
  const top = report.survivors[0];
  if (!top) return undefined;

  const now = new Date();
  const createdAt = new Date(assessment.createdAt);
  const yearsSince = (now.getTime() - createdAt.getTime()) / (365 * 86400000);
  let phase: TridentStructure['mainline']['phase'] = 'foundation';
  let phaseLabel = '筑基期';
  let timeRange = '0-1 年';
  if (yearsSince > 3) {
    phase = 'leverage';
    phaseLabel = '杠杆跃迁期';
    timeRange = '3-5 年';
  } else if (yearsSince > 1) {
    phase = 'asset';
    phaseLabel = '资产化期';
    timeRange = '1-3 年';
  }

  // 副线试错:从其他象限的备选或培养区各挑 1 条
  const sidelineCandidates = report.survivors.slice(1, 3).map((s) => ({
    id: uuid(),
    profession: `${s.industry} · ${s.profession}`,
    testCycle: '0-6 个月低成本试错',
    status: 'exploring' as const,
  }));

  return {
    mainline: {
      profession: `${top.industry} · ${top.profession}`,
      phase,
      phaseLabel,
      timeRange,
    },
    sidelines: sidelineCandidates,
    assetBase: {
      skillAssets: (Object.keys(assessment.ability.scores) as AbilityEightDim[])
        .filter((d) => assessment.ability.scores[d] >= 60)
        .map((d) => d),
      methodAssets: ['已解决问题库(§30)', '决策日志(§30.5)'],
      workDataAssets: ['训练记录(§4)', '复盘记录(§22)', '外部作品链接(可自定义)'],
      targetYears: '3-5 年',
    },
  };
}

/* ============================================================
 * V5.11 §31.6 · 组织文化契合度(定性提示)
 * ============================================================ */
export const CULTURE_TAG_LIBRARY: Record<string, OrgCultureTag[]> = {
  '公务员/行政岗': ['hierarchical', 'process-driven', 'slow-stable', 'obedience'],
  投行前台: ['high-competition', 'result-driven', 'hierarchical'],
  软件架构师: ['flat', 'result-driven', 'question-encouraged'],
  产品经理: ['flat', 'result-driven', 'question-encouraged'],
  内容讲师: ['flat', 'process-driven', 'question-encouraged'],
  临床医生: ['hierarchical', 'process-driven', 'high-competition'],
  数据科学家: ['flat', 'result-driven'],
  战略咨询顾问: ['high-competition', 'result-driven', 'flat'],
};

/** V5.11 · 根据用户价值观 + 岗位文化生成契合提示(不打分,仅定性) */
export function assessCultureFit(
  candidate: CareerCandidate,
  topValues: ValueDimension[],
): { cultureTags: OrgCultureTag[]; frictionNotes: string[] } {
  const cultureTags = CULTURE_TAG_LIBRARY[candidate.profession] ?? [];
  const frictionNotes: string[] = [];
  const has = (tag: OrgCultureTag) => cultureTags.includes(tag);
  if (topValues.includes('growth') && (has('hierarchical') || has('obedience'))) {
    frictionNotes.push('你的"成长 & 清晰"倾向与"等级分明 / 按资历晋升"的文化存在摩擦——成长节奏更多由组织决定');
  }
  if (topValues.includes('freedom') && has('obedience')) {
    frictionNotes.push('你重视"自由度", 但该岗位强调服从与流程, 灵活性受限');
  }
  if (topValues.includes('safety') && has('high-competition')) {
    frictionNotes.push('你重视"安全边界", 但该岗位竞争高压, 需评估身心承受度');
  }
  if (topValues.includes('relationship') && has('high-competition')) {
    frictionNotes.push('你重视"关系 & 陪伴", 但该岗位可能要求高投入, 与家人陪伴时间可能承压');
  }
  return { cultureTags, frictionNotes };
}

/* ============================================================
 * V5.11 §31.3 · 一句话价值观说明书(未来蓝图选填)
 * ============================================================ */
export function generateValueStatement(assessment: CareerAssessment): string {
  const [l1, l2] = assessment.values.ranked;
  const bl = assessment.values.bottomLines;
  const bottomTxt = bl.length > 0 ? `底线是不越过 [${bl.join(' / ')}]` : '';
  const dimLabel: Record<ValueDimension, string> = {
    achievement: '成就 & 能力',
    growth: '成长 & 清晰',
    safety: '安全边界 & 健康',
    relationship: '关系 & 陪伴',
    freedom: '自由度',
  };
  return `我优先看重 ${dimLabel[l1]}, 其次是 ${dimLabel[l2] ?? '(尚未澄清)'}${bottomTxt ? '; ' + bottomTxt : ''}。`;
}

/* ============================================================
 * V5.11 §31.2 · 目标 vs 价值观辨别
 * ============================================================ */
const GOAL_KEYWORDS = ['万', 'W', '元', '年薪', '职位', 'CEO', 'C 位', '房', '车', '博士', '证书', '排名'];

export function detectGoalItems(rankedText: string[]): string[] {
  return rankedText.filter((t) => GOAL_KEYWORDS.some((kw) => t.includes(kw)));
}

/* ============================================================
 * V5.11 §31.5 · MBTI 免责声明与性格-职业冲突预警
 * ============================================================ */
export const MBTI_DISCLAIMER = `MBTI 结果反映的是当下的思维习惯偏好, 不是能力上限、更不是命运判决。 性格可变、场合可切换; 报告仅作为职业方向的参考视角, 不用于筛选、评级或匹配度打分(继承"不做匹配度评分"原则)。`;

/** V5.11 · MBTI 类型 → 需要警惕的岗位模式 */
export const PERSONALITY_JOB_WARNING: Record<string, Array<{ pattern: string; reason: string }>> = {
  INFP: [
    { pattern: '高频即时成交销售', reason: '需要大量拒绝陌生人、快速切换情绪, 与内向直觉高度冲突' },
    { pattern: '露脸型自媒体主理人', reason: '内在真实性强、抗拒表演化人设消费, 易造成认同耗竭' },
  ],
  INFJ: [
    { pattern: '高频即时成交销售', reason: '需要大量情绪切换与短期冲量, 易触发深度耗竭' },
    { pattern: '公开叫卖型直播', reason: '与内在真实性强的价值观易冲突' },
  ],
  INTP: [
    { pattern: '重复流程管理岗', reason: '缺乏结构化探索空间, 与逻辑工具+跨界整合的优势不匹配' },
  ],
  INTJ: [
    { pattern: '规则严格、少决策自由的行政末端', reason: '与内控/长期规划偏好冲突' },
  ],
  ISTJ: [
    { pattern: '大幅创新型自媒体', reason: '与稳定规则型偏好冲突, 频繁转型易内耗' },
  ],
  ISFJ: [
    { pattern: '高压冲刺型销售', reason: '关系型价值观易被短期业绩压力挤压' },
  ],
  ESFP: [
    { pattern: '长期独处型研究岗', reason: '缺乏外部反馈, 与外向感觉型的能量补给冲突' },
  ],
  ENFP: [
    { pattern: '严格重复的行政末端', reason: '缺乏探索空间, 易失去动机与热情' },
  ],
  ENTP: [
    { pattern: '规则严苛少创新的管理岗', reason: '缺乏探索与辩论空间, 与直觉发散偏好冲突' },
  ],
};

export function findPersonalityJobWarnings(mbtiType: string): Array<{ pattern: string; reason: string }> {
  return PERSONALITY_JOB_WARNING[mbtiType] ?? [];
}

/* ============================================================
 * V5.11 §31.3 · 成就动机风险提示 + 弱者体系说明
 * ============================================================ */
export const ACHIEVEMENT_MOTIVE_RISK: Record<string, string> = {
  ranking: '⚠️ 竞争/排名感主导者:警惕"为排名透支健康"。 当排名目标与健康底线冲突时, 系统会触发否决预警(§31.6)。',
  perfectionism: '⚠️ 完美主义主导者:警惕"高标准内耗"。 若阶段目标长期高于实际水平 50% 以上, 建议下调阶段目标。',
  'external-approval': '⚠️ 外部认同主导者:警惕"以外部反馈定义自我价值"。 建议每季度做一次"没人看见时你还会做吗"的自省。',
  'control-safety': '⚠️ 控制安全感主导者:警惕"为回避不确定性错过成长机会"。 建议在小范围试错中培养对模糊的容忍度。',
  accomplishment: '✅ 成就导向:注意持续复利, 避免陷入"短期冲刺 → 长期倦怠"的循环。',
};

/** V5.11 · 弱者体系:元认知维度的产品文案挂载 */
export const WEAK_SIDE_STATEMENT = `元认知的"弱者体系"思维:主动承认自身信息劣势, 不与强者拼信息, 转而依靠 [赔率](期望值思维,与"概率风控"维度联动) 与 [时间](长期积累,与"积累型耐力"维度联动) 构建决策优势。`;

/* ============================================================
 * V5.11 §31.3 · 投射与外部信号题(敬佩投射 / 终点投射 / 情绪反应)
 * ============================================================ */
export interface ProjectionQuestion {
  id: string;
  type: 'admire' | 'ending' | 'anger' | 'external-card';
  prompt: string;
  options: Array<{ text: string; valueDim?: ValueDimension; tags?: string[] }>;
  minSelect: number;
  maxSelect: number;
}

/** 敬佩投射 · 终点投射 · 情绪反应(反向揭示) · 他评校准卡 */
export const PROJECTION_QUESTIONS: ProjectionQuestion[] = [
  {
    id: 'pj-admire',
    type: 'admire',
    prompt: '你最敬佩的人身上, 最打动你的品质是?(敬佩对象是价值观的镜子)',
    minSelect: 1,
    maxSelect: 4,
    options: [
      { text: '有能力做出让人尊敬的事', valueDim: 'achievement', tags: ['成就与能力'] },
      { text: '持续学习不肯止步', valueDim: 'growth', tags: ['成长'] },
      { text: '有边界、不透支', valueDim: 'safety', tags: ['安全边界'] },
      { text: '把家庭朋友照顾好', valueDim: 'relationship', tags: ['关系'] },
      { text: '活得自在不被约束', valueDim: 'freedom', tags: ['自由'] },
      { text: '真诚不做作', valueDim: 'growth', tags: ['真实性'] },
      { text: '内心通透明白自己在做什么', valueDim: 'growth', tags: ['清晰感'] },
      { text: '有原则、不轻易妥协', valueDim: 'safety', tags: ['尊严'] },
    ],
  },
  {
    id: 'pj-ending',
    type: 'ending',
    prompt: '你希望 80 岁时, 别人提起你最先想到的是?',
    minSelect: 1,
    maxSelect: 1,
    options: [
      { text: '做出了有影响力的事', valueDim: 'achievement', tags: ['成就'] },
      { text: '培养出了优秀的人', valueDim: 'relationship', tags: ['关系'] },
      { text: '活得清醒通透', valueDim: 'growth', tags: ['清晰感'] },
      { text: '家庭幸福美满', valueDim: 'relationship', tags: ['陪伴'] },
      { text: '从未违背过自己', valueDim: 'growth', tags: ['真实性'] },
    ],
  },
  {
    id: 'pj-anger',
    type: 'anger',
    prompt: '以下社会现象中, 最让你愤怒的是?(愤怒指向被触犯的价值, 与正向排序交叉验证)',
    minSelect: 2,
    maxSelect: 2,
    options: [
      { text: '论资排辈压过实力', valueDim: 'achievement', tags: ['成就'] },
      { text: '造假者名利双收', valueDim: 'growth', tags: ['真实性'] },
      { text: '靠关系抢走机会', valueDim: 'achievement', tags: ['公平'] },
      { text: '虐待弱者', valueDim: 'safety', tags: ['尊严'] },
      { text: '背信弃义', valueDim: 'relationship', tags: ['关系'] },
      { text: '庸碌却安稳的一生', valueDim: 'growth', tags: ['成长'] },
    ],
  },
];

/** 他评校准卡(线下引导, 用户询问后手动录入) */
export const EXTERNAL_FEEDBACK_CARDS = [
  { id: 'ec1', question: '你觉得我最看重什么?', hint: '让 2-3 位信任的人回答, 观察高频关键词' },
  { id: 'ec2', question: '你最佩服我做出的哪个决定?', hint: '决策背后的价值动机' },
  { id: 'ec3', question: '你觉得我做什么时候最有活力?', hint: '真实的能量来源, 与自评做交叉' },
];

/* ============================================================
 * V5.11 §31.2 · 单维度部分重测
 * ============================================================ */
export interface DimensionRetestItems {
  dimension: string;
  section: 'values' | 'personality' | 'ability';
  itemIds: string[];
  count: number;
}

/** V5.11 · 针对低置信度维度筛选 5-8 题作部分重测 */
export function selectRetestItemsForDimension(
  dimension: string,
  section: 'values' | 'personality' | 'ability',
): DimensionRetestItems {
  let itemIds: string[] = [];
  if (section === 'values') {
    // 找到 scoresFor 影响该维度的题目
    itemIds = VALUE_QUESTIONS_FULL
      .filter((q) => {
        const bag = { ...q.scoresFor.A, ...q.scoresFor.B, ...q.scoresFor.yes, ...q.scoresFor.no };
        return dimension in bag;
      })
      .slice(0, 8)
      .map((q) => q.id);
  } else if (section === 'personality') {
    itemIds = MBTI_QUESTIONS_FULL
      .filter((q) => q.axis === dimension)
      .slice(0, 8)
      .map((q) => q.id);
  } else if (section === 'ability') {
    itemIds = ABILITY_QUESTIONS_FULL
      .filter((q) => q.dimension === dimension)
      .slice(0, 8)
      .map((q) => q.id);
  }
  return { dimension, section, itemIds, count: itemIds.length };
}

/** V5.11 · 单维度重测后合并回原答案 */
export function mergeDimensionRetest(
  original: Record<string, string | string[] | number>,
  retest: Record<string, string | string[] | number>,
  itemIds: string[],
): Record<string, string | string[] | number> {
  const merged = { ...original };
  for (const id of itemIds) {
    if (id in retest) merged[id] = retest[id];
  }
  return merged;
}
