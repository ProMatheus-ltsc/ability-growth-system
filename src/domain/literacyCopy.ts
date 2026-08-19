/**
 * V5.12 · 学习素养页对客文案(按学段分档)
 *
 * K12 三档 tone(成年人不开放):
 * - primary(小学 · 习惯养成期):强调"做了没有",不讲方法术语
 * - junior(初中 · 方法形成期):讲"方法能不能稳定",引导对照
 * - senior(高中 · 自主规划期):讲"能不能自主运转",强调五维覆盖
 */
import type { GradeLevel } from './types';

export interface LiteracyCopy {
  pageTitle: string;
  pageDescription: string;
  levelHint: string;
  adultBlockedTitle: string;
  adultBlockedDescription: string;
}

const PRIMARY: LiteracyCopy = {
  pageTitle: '学习习惯 🌱',
  pageDescription: '看看你现在最常做的学习动作有哪些。做得多才算真的会。',
  levelHint: '小学 · 习惯养成期 - 有没有做,比做得多好更重要',
  adultBlockedTitle: '成年人学段不开放本模块',
  adultBlockedDescription: '成年人的能力体系由「问题跟进(PDCA)」和「职业选择」承载',
};

const JUNIOR: LiteracyCopy = {
  pageTitle: '学习素养',
  pageDescription: '五个方面看看你会不会学习:计划、执行、复盘、批判性思考、跟别人协作。',
  levelHint: '初中 · 方法形成期 - 用得稳定了才算掌握',
  adultBlockedTitle: '成年人学段不开放本模块',
  adultBlockedDescription: '成年人的能力体系由「问题跟进(PDCA)」和「职业选择」承载',
};

const SENIOR: LiteracyCopy = {
  pageTitle: '学习素养',
  pageDescription: 'K12 通用能力五维:元认知/时间/信息处理/批判性/协作 · 零新增测评,全部来自现有行为数据。学科能力回答"学得怎么样",学习素养回答"会不会学习"。',
  levelHint: '高中 · 自主规划期 - 能自主运转,不再依赖外部提醒',
  adultBlockedTitle: '成年人学段不开放本模块',
  adultBlockedDescription: '成年人对应的通用能力由「问题跟进(PDCA)」与「职业选择」承载',
};

const ADULT: LiteracyCopy = SENIOR;

export function getLiteracyCopy(grade: GradeLevel): LiteracyCopy {
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
