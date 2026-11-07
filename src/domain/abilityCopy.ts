/**
 * V5.12 · 能力中心页对客文案(按学段分档)
 *
 * 四档 tone:
 * - primary(小学):游戏化 · 用"能力值"、"星星"代替"掌握度"
 * - junior(初中):去术语 · 直白讲"哪块强、哪块要练"
 * - senior(高中):方法论 · 强调陌生题正确率与增长趋势
 * - adult (成年人/公考):精准专业 · 雷达 / 涌现点 / 模块掌握度
 */
import type { GradeLevel } from './types';

export interface AbilityCopy {
  pageTitle: string;
  pageDescription: string;
  radarEmptyTitle: string;
  radarEmptyDescription: string;
  growthEmptyTitle: string;
  growthEmptyDescription: string;
  growthShortTitle: string;
  growthShortHint: (weeks: number) => string;
  moduleEmptyTitle: string;
  moduleEmptyDescription: string;
  tagsEmptyTitle: string;
}

const PRIMARY: AbilityCopy = {
  pageTitle: '我的能力 🌟',
  pageDescription: '看看你在各个方面收集了多少能力星星,哪里可以再加把劲',
  radarEmptyTitle: '还没有能力雷达',
  radarEmptyDescription: '完成几次练习后,这里就会亮起来',
  growthEmptyTitle: '还没开始记录',
  growthEmptyDescription: '练习 3 次以上,系统就会画出你的成长曲线,遇到大跃升还会给你贴金星哦',
  growthShortTitle: '再多一点数据就好',
  growthShortHint: (w) => `现在只有 ${w} 周数据,再多练一周就能画曲线啦`,
  moduleEmptyTitle: '还没有模块数据',
  moduleEmptyDescription: '记练习时按模块分类,这里就会自动汇总',
  tagsEmptyTitle: '还没设置能力标签',
};

const JUNIOR: AbilityCopy = {
  pageTitle: '能力中心',
  pageDescription: '看看每项能力现在处在什么水平,哪块要多练。陌生题做得好才是真的会。',
  radarEmptyTitle: '暂无雷达数据',
  radarEmptyDescription: '当前学科还没有配置雷达维度',
  growthEmptyTitle: '还没有训练数据',
  growthEmptyDescription: '完成 3 次以上训练后会画出周度正确率曲线,大幅进步的地方会自动标出来',
  growthShortTitle: '数据还不够',
  growthShortHint: (w) => `当前 ${w} 周有数据,至少需要 2 周才能画趋势`,
  moduleEmptyTitle: '暂无模块数据',
  moduleEmptyDescription: '记录训练后自动汇总各模块',
  tagsEmptyTitle: '尚未定义能力标签',
};

const SENIOR: AbilityCopy = {
  pageTitle: '能力中心',
  pageDescription: '以能力掌握度为核心的多维视图。陌生题正确率是能力增长的核心指标。',
  radarEmptyTitle: '暂无雷达数据',
  radarEmptyDescription: '该学段/学科尚未定义雷达维度权重',
  growthEmptyTitle: '还没有训练数据',
  growthEmptyDescription: '完成 3 次以上训练后, 系统将按周汇总生成正确率曲线, 并自动标注涌现点(比前 5 周均值跃升 ≥ 12 分)',
  growthShortTitle: '需要更多训练数据',
  growthShortHint: (w) => `当前仅 ${w} 周有数据, 至少需要 2 周才能绘制趋势曲线`,
  moduleEmptyTitle: '暂无模块数据',
  moduleEmptyDescription: '记录训练后自动汇总各模块掌握度',
  tagsEmptyTitle: '尚未定义能力标签',
};

const ADULT: AbilityCopy = SENIOR;

export function getAbilityCopy(grade: GradeLevel): AbilityCopy {
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
