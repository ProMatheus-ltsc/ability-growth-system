/**
 * 内置任务模板库 + 评语快捷短语库 + 空状态与新手引导文案
 */
import type { ErrorCategory, GradeLevel, Subject, TaskTemplate } from '../domain/types';

const now = new Date().toISOString();

const t = (
  id: string,
  name: string,
  gradeLevel: GradeLevel,
  subject: Subject,
  taskKind: TaskTemplate['taskKind'],
  suggestedQuestions: number,
  timeLimitMinutes: number | undefined,
  description: string,
): TaskTemplate => ({
  id: `builtin-${id}`,
  name,
  gradeLevel,
  subject,
  taskKind,
  suggestedQuestions,
  timeLimitMinutes,
  description,
  builtin: true,
  createdAt: now,
  updatedAt: now,
});

export const BUILTIN_TEMPLATES: TaskTemplate[] = [
  // 公考
  t('xingce-topic', '行测专项训练 · 单模块', 'adult', 'xingce', 'topic', 20, 30, '针对某一模块的专项攻克'),
  t('xingce-timed', '行测限时训练 · 40题', 'adult', 'xingce', 'timed', 40, 40, '模考手感限时训练'),
  t('xingce-exam', '行测全套模考', 'adult', 'xingce', 'exam', 130, 120, '国考行测全真模考'),
  t('shenlun-topic', '申论小题专项 · 归纳概括', 'adult', 'shenlun', 'topic', 1, 25, '200字/25分钟归纳概括'),
  t('shenlun-essay', '申论大作文 · 五段三分', 'adult', 'shenlun', 'subjective', 1, 60, '1000字大作文'),
  t('shenlun-exam', '申论全套模拟', 'adult', 'shenlun', 'exam', 4, 180, '3小时全套申论模拟'),
  t('mianshi-topic', '面试综合分析专项', 'adult', 'mianshi', 'interview', 5, 25, '5道综合分析题录音训练'),
  t('mianshi-mock', '面试全流程模拟', 'adult', 'mianshi', 'interview', 4, 25, '完整4道结构化面试模拟'),

  // 高中数学 / 物理
  t('math-topic-senior', '高中数学函数专项', 'senior', 'math', 'topic', 15, 40, '函数与导数专项训练'),
  t('math-exam-senior', '高中数学月考模拟', 'senior', 'math', 'exam', 22, 120, '标准数学试卷模拟'),
  t('physics-topic-senior', '高中物理力学综合', 'senior', 'physics', 'topic', 12, 45, '力学综合应用专项'),
  t('physics-exp-senior', '高中物理实验探究', 'senior', 'physics', 'experiment', 3, 40, '实验方案设计与数据处理'),

  // 初中
  t('math-topic-junior', '初中数学几何证明专项', 'junior', 'math', 'topic', 10, 35, '全等/相似/圆的性质综合'),
  t('physics-topic-junior', '初中物理电学专项', 'junior', 'physics', 'topic', 15, 40, '欧姆定律与电功率'),

  // 小学
  t('math-topic-primary', '小学数学分数运算闯关', 'primary', 'math', 'topic', 20, 20, '基础运算能力训练'),
];

/** 评语快捷短语库 (可扩展为教师自维护) */
const GENERIC_PHRASES = [
  '解题思路清晰,过程规范',
  '基础概念理解到位,能力稳步提升',
  '建议加强错题复习,巩固薄弱环节',
  '训练量充足,继续保持',
];

export const QUICK_PHRASES: Record<Subject, string[]> = {
  math: [
    '解题思路清晰,推导过程规范',
    '计算过程存在低级失误,需加强训练',
    '概念理解有偏差,建议重温教材',
    '建模能力待提升,多做实际情境应用题',
    '规范书写不足,注意步骤完整性',
  ],
  physics: [
    '受力分析完整,建模方向正确',
    '公式使用条件混淆,注意适用范围',
    '实验方案设计有创新',
    '误差分析不充分,注意有效数字',
    '单位换算存在错误,细节把控不足',
  ],
  xingce: [
    '答题节奏合理,时间控制得当',
    '资料分析速算意识强,方法灵活',
    '数量关系依赖蒙题,建议巩固基础',
    '判断推理力度排序有偏差',
    '言语理解主题词把握精准',
  ],
  shenlun: [
    '要点覆盖不全,注意材料后半段',
    '表述精准度待提升,尽量抄材料原句',
    '逻辑层次清晰,分类合理',
    '字数控制有效,省格子技巧到位',
    '大作文分论点提炼不足,建议多方向对偶',
  ],
  mianshi: [
    '开头引入自然,避免套路化',
    '内容充实,案例支撑到位',
    '逻辑断裂,注意分论点衔接',
    '语速控制得当,表达流畅',
    '政治素养基调准确,时政积累充足',
  ],
  chinese: GENERIC_PHRASES,
  english: GENERIC_PHRASES,
  chemistry: GENERIC_PHRASES,
  biology: GENERIC_PHRASES,
};

/** 空状态引导文案 (PRD §29.6) */
export const EMPTY_STATE_HINTS: Record<string, { title: string; description: string; cta?: string }> = {
  trainings: {
    title: '还没有训练记录',
    description: '完成第一次训练后来这里记录吧',
    cta: '记录第一次训练',
  },
  abilities: {
    title: '完成 3 次以上训练后,能力图谱将在这里展示',
    description: '陌生题正确率是能力增长的核心指标',
    cta: '去记录训练',
  },
  problems: {
    title: '当前没有未修复的问题,继续保持!',
    description: '正向反馈:能力缺口越少,能力增长越稳定',
  },
  reviews: {
    title: '开始你的第一次复盘,只需 2 分钟',
    description: '日 → 周 → 月 三级复盘,形成能力增长闭环',
    cta: '开始复盘',
  },
  students: {
    title: '还没有学生,添加第一个学生开始管理',
    description: '教师端支持批量导入 (CSV/表格粘贴)',
    cta: '添加学生',
  },
  assignments: {
    title: '还没有下发过任务,从模板开始吧',
    description: '内置任务模板库覆盖各学段各学科',
    cta: '从模板创建任务',
  },
};

/** PRD §29.5 快捷键 */
export const KEYBOARD_SHORTCUTS = [
  { key: 'Ctrl/Cmd + N', label: '新建训练记录', scope: '全局' },
  { key: 'Ctrl/Cmd + R', label: '开始日复盘', scope: '全局' },
  { key: 'Ctrl/Cmd + M', label: '快速标记错误', scope: '训练页面' },
  { key: 'Ctrl/Cmd + Enter', label: '保存并继续', scope: '表单页' },
  { key: 'Tab', label: '下一字段', scope: '表单页' },
  { key: 'Esc', label: '取消/关闭弹窗', scope: '全局' },
];

const GENERIC_TAGS: ErrorCategory[] = ['concept', 'read', 'method', 'norm', 'time'];

/** 常用问题标签(按学科) 用于批改与评价 */
export const PROBLEM_TAG_LIBRARY: Record<Subject, ErrorCategory[]> = {
  math: ['concept', 'formula', 'calc', 'read', 'model', 'logic', 'method', 'time'],
  physics: ['concept', 'formula', 'calc', 'read', 'model', 'experiment', 'direction', 'time'],
  xingce: ['not-know', 'concept', 'method', 'judge', 'calc', 'time'],
  shenlun: ['point', 'accuracy', 'read', 'structure', 'argument', 'language', 'format', 'wordcount', 'time'],
  mianshi: ['structure', 'argument', 'language', 'read', 'concept', 'time'],
  chinese: [...GENERIC_TAGS, 'language', 'structure'],
  english: [...GENERIC_TAGS, 'language'],
  chemistry: [...GENERIC_TAGS, 'formula', 'calc', 'experiment'],
  biology: [...GENERIC_TAGS, 'concept', 'experiment'],
};
