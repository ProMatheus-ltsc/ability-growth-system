/**
 * V5.12 · 职业选择模块对客文案(按学段分档)
 *
 * 三档 tone:
 * - junior(初中):兴趣发现型,轻松鼓励,不用行业术语
 * - senior(高中):方向探索型,理性清晰,少量结构化词汇
 * - adult (成年人/公考):职业定位型,专业精准,保留领域术语
 *
 * primary(小学)不开放本模块;若入口传入,统一回退到 junior 文案。
 */
import type { GradeLevel } from './types';

export interface CareerCopy {
  /** 页面主标题 */
  pageTitle: string;
  /** 页面副标题(简介) */
  pageDescription: string;
  /** 入口横幅(顶部信息条) */
  entryBanner: string;
  /** 空态标题 */
  emptyTitle: string;
  /** 空态描述 */
  emptyDescription: string;
  /** 开始按钮文案 */
  startAction: string;
  /** 测评弹窗主标题 */
  flowTitle: string;
  /** 测评弹窗副标题 */
  flowDescription: string;
  /** 报告 § 一 标题 */
  reportSectionOne: string;
  /** 报告 § 一 副标题提示 */
  reportSectionOneHint: string;
  /** 报告 § 三 大标题 */
  reportQuadrantTitle: string;
  /** 报告"三定"块标题 */
  reportPickTitle: string;
  /** 报告"双路线"块标题 */
  reportRoutesTitle: string;
  /** 报告 § 三 小节副标题提示 */
  reportSectionThreeHint: string;
}

const JUNIOR: CareerCopy = {
  pageTitle: '职业选择',
  pageDescription: '看看你现在最喜欢什么、最适合做什么。测评没有对错,凭第一感觉答就好。',
  entryBanner: '这次会问你 66 个问题,大约 12-15 分钟。回答越诚实,推荐越贴近真实的你。',
  emptyTitle: '还没做过测评',
  emptyDescription: '第一次测?放轻松,把它当成一次和自己的对话',
  startAction: '开始探索',
  flowTitle: '兴趣与能力小测',
  flowDescription: '全部是选项题,没有正确答案。别想太多,选第一反应就好。',
  reportSectionOne: '你是这样的一个人',
  reportSectionOneHint: '喜欢什么 / 擅长什么 / 什么样的性格',
  reportQuadrantTitle: '兴趣 × 能力 地图',
  reportPickTitle: '几个可以试试看的方向',
  reportRoutesTitle: '你更像哪种人',
  reportSectionThreeHint: '看看这些方向哪些让你眼睛一亮',
};

const SENIOR: CareerCopy = {
  pageTitle: '职业选择',
  pageDescription: '结合你的兴趣、能力和价值观,梳理适合的发展方向,支撑填志愿与生涯规划。',
  entryBanner: '共 66 题,约 12-15 分钟。反向题与一致性算法会帮你更精准地定位,尽量按第一反应作答。',
  emptyTitle: '尚未完成测评',
  emptyDescription: '在相对安静的环境下作答,结果会更接近真实的自己',
  startAction: '开始测评',
  flowTitle: '职业选择测评',
  flowDescription: '判断 / 单选 / 迫选 / 多选题,无对错。请按第一反应作答,不必反复琢磨。',
  reportSectionOne: '个人画像速览',
  reportSectionOneHint: '价值观 / 能力 / 性格 三合一',
  reportQuadrantTitle: '兴趣 × 能力 四象限',
  reportPickTitle: '推荐方向(已过滤价值观冲突)',
  reportRoutesTitle: '专家 vs 管理 倾向',
  reportSectionThreeHint: '四象限定位 → 三个候选方向 → 双路线参考',
};

const ADULT: CareerCopy = {
  pageTitle: '职业选择',
  pageDescription: '价值观 · 能力 · 性格 三合一测评。兴趣×能力四象限定位 + 价值观一票否决 + 三定输出 + 双路线参考。',
  entryBanner: 'V5.12 简短版:价值观 15 + 3 干扰 / MBTI 24 题 · 李克特 / 能力 24 题 · 李克特 = 66 题,约 12-15 分钟。反向题 + 加权算法 + 一致性调和,与完整版同源。',
  emptyTitle: '尚未完成任何测评',
  emptyDescription: '首次测评建议在放松状态下按第一反应作答, 不做过度思考',
  startAction: '开始测评',
  flowTitle: '职业选择测评',
  flowDescription: '全部客观题(判断/单选/迫选/多选), 无正确答案。按第一反应作答, 不要过度思考。',
  reportSectionOne: '画像速览',
  reportSectionOneHint: '价值观 / 能力 / 性格 三合一',
  reportQuadrantTitle: '兴趣 × 能力四象限',
  reportPickTitle: '三定输出(已通过一票否决过滤)',
  reportRoutesTitle: '双路线倾向参考',
  reportSectionThreeHint: '四象限 → 三定 → 双路线',
};

export function getCareerCopy(grade: GradeLevel): CareerCopy {
  switch (grade) {
    case 'junior':
      return JUNIOR;
    case 'senior':
      return SENIOR;
    case 'adult':
      return ADULT;
    case 'primary':
    default:
      // 小学不开放本模块;若被误调用,回退到最轻的初中文案
      return JUNIOR;
  }
}
