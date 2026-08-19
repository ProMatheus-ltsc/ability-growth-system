/**
 * V5.12 · 训练记录页对客文案(按学段分档)
 *
 * 四档 tone:
 * - primary(小学):游戏化 · 鼓励型 · 只讲"哪里错了"这一件事
 * - junior(初中):简洁清晰 · 少术语 · 强调"再试一次"
 * - senior(高中):方法论 · 强调陌生题正确率、错题分类的价值
 * - adult (成年人/公考):精准专业 · 保留领域术语(能力缺口/错误类型分布)
 */
import type { GradeLevel } from './types';

export interface TrainingsCopy {
  pageTitle: string;
  pageDescription: string;
  addAction: string;
  quickModeOn: string;
  quickModeOff: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction: string;
}

const PRIMARY: TrainingsCopy = {
  pageTitle: '练习记录 📝',
  pageDescription: '每天做了什么练习都写下来。搞懂错题比刷更多题重要哦!',
  addAction: '记一次练习',
  quickModeOn: '标准模式',
  quickModeOff: '快速模式',
  emptyTitle: '还没有练习记录',
  emptyDescription: '把今天做的第一次练习记下来吧,系统会告诉你哪里可以变得更好',
  emptyAction: '记第一次',
};

const JUNIOR: TrainingsCopy = {
  pageTitle: '训练记录',
  pageDescription: '记一下做了什么、错在哪里。看得见错题分布,才能知道要补哪里。',
  addAction: '记一次训练',
  quickModeOn: '标准模式',
  quickModeOff: '快速模式',
  emptyTitle: '还没有训练记录',
  emptyDescription: '记一次练习后,系统会帮你看错误集中在哪些类型',
  emptyAction: '记第一次训练',
};

const SENIOR: TrainingsCopy = {
  pageTitle: '训练记录',
  pageDescription: '记录一次训练:做了什么 · 陌生题正确率 · 错误分类。刷题量不如错题结构。',
  addAction: '记录训练',
  quickModeOn: '标准模式',
  quickModeOff: '快速模式',
  emptyTitle: '还没有训练记录',
  emptyDescription: '录入第一次训练后,系统会按陌生题正确率与错误类型分布定位能力薄弱环节',
  emptyAction: '记录第一次训练',
};

const ADULT: TrainingsCopy = {
  pageTitle: '训练记录',
  pageDescription: '记录一次训练:做了什么 · 做得怎么样 · 为什么错。陌生题正确率比刷题数量更能反映能力增长。',
  addAction: '记录训练',
  quickModeOn: '标准模式',
  quickModeOff: '快速模式',
  emptyTitle: '还没有训练记录',
  emptyDescription: '完成第一次训练后来这里记录吧。系统会根据陌生题正确率和错误类型分布诊断能力瓶颈。',
  emptyAction: '记录第一次训练',
};

export function getTrainingsCopy(grade: GradeLevel): TrainingsCopy {
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
