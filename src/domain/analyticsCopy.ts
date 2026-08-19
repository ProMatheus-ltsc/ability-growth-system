/**
 * V5.12 · 训练收益页对客文案(按学段分档)
 *
 * 四档 tone:
 * - primary(小学):游戏化 · 用"哪种练法最给力"代替"最有效训练方式"
 * - junior(初中):去术语 · 讲清"什么练法效果好、什么时候要换方法"
 * - senior(高中):保留"陌生题正确率 / 边际收益"但拿掉"系统动力学"
 * - adult (成年人/公考):完整保留领域术语(边际收益递减、恶性回路、迁移杠杆)
 */
import type { GradeLevel } from './types';

export interface AnalyticsCopy {
  pageTitle: string;
  pageDescription: string;
  effEmptyTitle: string;
  effEmptyDescription: string;
  transferEmptyTitle: string;
  transferEmptyDescription: string;
  loopEmptyTitle: string;
  loopEmptyDescription: string;
}

const PRIMARY: AnalyticsCopy = {
  pageTitle: '我的进步 📊',
  pageDescription: '看看哪种练习最给力,哪种最没效果,该换方法啦!',
  effEmptyTitle: '数据还不够',
  effEmptyDescription: '同一种练习至少做 2 次,才能看出哪种最给力',
  transferEmptyTitle: '数据还不够',
  transferEmptyDescription: '这个学科多练几次,系统就能画出你的进步啦',
  loopEmptyTitle: '没有发现坏习惯 🎉',
  loopEmptyDescription: '继续保持',
};

const JUNIOR: AnalyticsCopy = {
  pageTitle: '训练收益',
  pageDescription: '看看什么练法效果好、什么时候要换方法、有没有陷入坏习惯。',
  effEmptyTitle: '数据不足',
  effEmptyDescription: '每种练法至少 2 次记录后才能对比效果',
  transferEmptyTitle: '数据不足',
  transferEmptyDescription: '这个学科的训练还不多,再练一段时间',
  loopEmptyTitle: '没发现坏循环',
  loopEmptyDescription: '继续保持',
};

const SENIOR: AnalyticsCopy = {
  pageTitle: '训练收益',
  pageDescription: '识别最有效的训练方式、收益递减点、以及能力迁移的杠杆点。',
  effEmptyTitle: '数据不足',
  effEmptyDescription: '每种训练方式至少 2 次记录后可分析边际收益',
  transferEmptyTitle: '数据不足',
  transferEmptyDescription: '该学科尚无足够训练累计数据',
  loopEmptyTitle: '未检测到低效反馈回路',
  loopEmptyDescription: '继续保持',
};

const ADULT: AnalyticsCopy = {
  pageTitle: '训练收益 & 阶段报告',
  pageDescription: '识别你的最有效训练方式、边际收益递减点、恶性反馈回路、以及能力迁移杠杆。',
  effEmptyTitle: '数据不足',
  effEmptyDescription: '每种训练方式至少 2 次记录后可分析',
  transferEmptyTitle: '数据不足',
  transferEmptyDescription: '该学科尚无足够训练累计数据',
  loopEmptyTitle: '未检测到恶性反馈回路',
  loopEmptyDescription: '继续保持',
};

export function getAnalyticsCopy(grade: GradeLevel): AnalyticsCopy {
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
