/**
 * V5.12 · 深度洞察页对客文案(按学段分档)
 *
 * 四档 tone:
 * - primary(小学):游戏化 · 用"给你一个建议"代替"策略推荐"
 * - junior(初中):去术语 · 讲清"接下来练什么、多久见效"
 * - senior(高中):保留"训练策略/收益预测/杠杆点"但去"系统动力学"
 * - adult (成年人/公考):完整术语(因果建模 · What-if · 系统动力学)
 */
import type { GradeLevel } from './types';

export interface InsightsCopy {
  pageTitle: string;
  pageDescription: string;
  strategyEmptyTitle: string;
  strategyEmptyDescription: string;
  forecastEmptyTitle: string;
  forecastEmptyDescription: string;
  causalEmptyTitle: string;
  leverageEmptyTitle: string;
  leverageEmptyDescription: string;
}

const PRIMARY: InsightsCopy = {
  pageTitle: '给你的小建议 💡',
  pageDescription: '看看接下来练什么最合适、大概多久能看到变化',
  strategyEmptyTitle: '数据还不够生成建议',
  strategyEmptyDescription: '再练几次,系统就能告诉你接下来该练什么啦',
  forecastEmptyTitle: '数据还不够',
  forecastEmptyDescription: '这个学科多练两周,才能预测你的进步',
  causalEmptyTitle: '暂时没找到明显的短板',
  leverageEmptyTitle: '暂时没找到关键提升点',
  leverageEmptyDescription: '继续记练习,系统会自动发现哪块补一下会带动全局',
};

const JUNIOR: InsightsCopy = {
  pageTitle: '深度洞察',
  pageDescription: '接下来练什么最有性价比 · 大概多久见效 · 哪块补起来能带动别的科目。',
  strategyEmptyTitle: '数据不足以给出策略',
  strategyEmptyDescription: '记录几次训练后,系统会给出个性化的训练建议',
  forecastEmptyTitle: '数据不足',
  forecastEmptyDescription: '每个学科至少 2 周数据后可预测进步',
  causalEmptyTitle: '还没找到明显能力短板',
  leverageEmptyTitle: '尚未识别关键提升点',
  leverageEmptyDescription: '随着能力缺口积累,系统会标记出补一处能带动多处的能力点',
};

const SENIOR: InsightsCopy = {
  pageTitle: '深度洞察',
  pageDescription: '智能训练策略推荐 · 收益预测 · 能力短板归因 · 迁移杠杆点。基于历史数据的分析。',
  strategyEmptyTitle: '数据不足以生成策略推荐',
  strategyEmptyDescription: '记录几次训练后系统将自动生成个性化训练策略',
  forecastEmptyTitle: '数据不足',
  forecastEmptyDescription: '每个学科至少 2 周数据后可生成预测',
  causalEmptyTitle: '尚无足够能力短板生成因果图',
  leverageEmptyTitle: '尚未识别出可用杠杆点',
  leverageEmptyDescription: '随着能力缺口积累,系统将标记高迁移强度的能力点',
};

const ADULT: InsightsCopy = {
  pageTitle: '深度洞察 · P2',
  pageDescription: '智能训练策略推荐 · 收益预测 · 因果建模 · What-if 模拟 · 迁移杠杆点。基于历史数据的系统动力学分析。',
  strategyEmptyTitle: '数据不足以生成策略推荐',
  strategyEmptyDescription: '记录几次训练后系统将自动生成个性化训练策略',
  forecastEmptyTitle: '数据不足',
  forecastEmptyDescription: '每个学科至少 2 周数据后可生成预测',
  causalEmptyTitle: '尚无足够能力短板生成因果图',
  leverageEmptyTitle: '尚未识别出可用杠杆点',
  leverageEmptyDescription: '随着能力缺口积累,系统将标记高迁移强度的能力点',
};

export function getInsightsCopy(grade: GradeLevel): InsightsCopy {
  switch (grade) {
    case 'primary':
      return PRIMARY;
    case 'junior':
      return JUNIOR;
    case 'senior':
      return SENIOR;
    case 'adult':
    default:
      return ADULT;
  }
}
