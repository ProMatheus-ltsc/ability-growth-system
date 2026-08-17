/**
 * 三级能力标签体系
 * 数据来源：PRD §11.2 / §12.2 / §13.2 / §14.2 / §15.2
 * 结构：学科 → 模块 → 能力点(带难度/掌握周期/关联题型)
 */
import type { AbilityTag, GradeLevel, Subject } from './types';

const t = (
  subject: Subject,
  module: string,
  point: string,
  difficulty: 1 | 2 | 3 | 4 | 5,
  cycle: string,
  questionType?: string,
  gradeLevel?: GradeLevel,
): AbilityTag => ({
  path: `${subject}/${module}/${point}`,
  subject,
  module,
  point,
  difficulty,
  cycle,
  questionType,
  gradeLevel,
});

/** 数学 - 小学 */
const MATH_PRIMARY: AbilityTag[] = [
  t('math', '数与运算', '整数运算', 2, '3天', '计算题', 'primary'),
  t('math', '数与运算', '分数运算', 3, '1周', '计算题', 'primary'),
  t('math', '数与运算', '小数运算', 3, '1周', '计算题', 'primary'),
  t('math', '图形与几何', '平面图形认知', 2, '3天', '选择/填空', 'primary'),
  t('math', '图形与几何', '周长与面积', 3, '1周', '应用题', 'primary'),
  t('math', '图形与几何', '立体图形初步', 3, '1周', '应用题', 'primary'),
  t('math', '量与计量', '单位换算', 2, '3天', '填空题', 'primary'),
  t('math', '量与计量', '估算能力', 2, '3天', '选择题', 'primary'),
  t('math', '数据与可能性', '数据收集与整理', 2, '3天', '填空/图表', 'primary'),
  t('math', '数据与可能性', '简单统计图表', 2, '3天', '图表题', 'primary'),
  t('math', '问题解决', '应用题理解', 3, '1周', '应用题', 'primary'),
  t('math', '问题解决', '解题策略', 3, '1周', '应用题', 'primary'),
  t('math', '问题解决', '规律发现', 3, '1周', '选择题', 'primary'),
];

/** 数学 - 初中 */
const MATH_JUNIOR: AbilityTag[] = [
  t('math', '代数运算', '整式运算', 3, '1周', '计算/填空', 'junior'),
  t('math', '代数运算', '方程与方程组', 3, '1周', '解答题', 'junior'),
  t('math', '代数运算', '不等式', 3, '1周', '解答题', 'junior'),
  t('math', '代数运算', '函数基础', 4, '2周', '解答题', 'junior'),
  t('math', '几何推理', '平面几何', 4, '2周', '证明题', 'junior'),
  t('math', '几何推理', '全等与相似', 4, '2周', '证明题', 'junior'),
  t('math', '几何推理', '几何变换', 3, '1周', '选择/证明', 'junior'),
  t('math', '几何推理', '证明能力', 4, '2周', '证明题', 'junior'),
  t('math', '数据统计与概率', '统计量计算', 2, '3天', '填空/计算', 'junior'),
  t('math', '数据统计与概率', '概率计算', 3, '1周', '解答题', 'junior'),
  t('math', '综合应用', '数形结合', 4, '2周', '综合题', 'junior'),
  t('math', '综合应用', '分类讨论', 4, '2周', '综合题', 'junior'),
];

/** 数学 - 高中 */
const MATH_SENIOR: AbilityTag[] = [
  t('math', '函数分析', '基本初等函数', 3, '1周', '选择/填空', 'senior'),
  t('math', '函数分析', '三角函数', 4, '2周', '解答题', 'senior'),
  t('math', '函数分析', '导数与应用', 4, '2周', '解答题', 'senior'),
  t('math', '函数分析', '函数综合', 5, '1月', '压轴题', 'senior'),
  t('math', '代数与方程', '数列', 4, '2周', '解答题', 'senior'),
  t('math', '代数与方程', '不等式', 4, '2周', '解答题', 'senior'),
  t('math', '代数与方程', '排列组合与二项式', 4, '2周', '选择/填空', 'senior'),
  t('math', '几何', '立体几何', 4, '2周', '解答题', 'senior'),
  t('math', '几何', '解析几何', 5, '1月', '压轴题', 'senior'),
  t('math', '几何', '向量', 3, '1周', '解答题', 'senior'),
  t('math', '概率统计', '古典概型与几何概型', 3, '1周', '解答题', 'senior'),
  t('math', '概率统计', '随机变量分布', 4, '2周', '解答题', 'senior'),
  t('math', '数学思维', '逻辑推理能力', 4, '2周', '选择/填空', 'senior'),
  t('math', '数学思维', '数学建模与应用', 4, '2周', '解答题', 'senior'),
];

/** 物理 - 初中 */
const PHYSICS_JUNIOR: AbilityTag[] = [
  t('physics', '力学基础', '运动描述', 2, '3天', '选择题', 'junior'),
  t('physics', '力学基础', '受力分析', 3, '1周', '作图/计算', 'junior'),
  t('physics', '力学基础', '二力平衡与状态', 3, '1周', '选择题', 'junior'),
  t('physics', '力学基础', '摩擦力判断', 4, '2周', '选择题', 'junior'),
  t('physics', '压强与浮力', '固体压强', 3, '1周', '计算题', 'junior'),
  t('physics', '压强与浮力', '液体压强', 3, '1周', '计算题', 'junior'),
  t('physics', '压强与浮力', '浮力计算与浮沉', 4, '2周', '计算题', 'junior'),
  t('physics', '功与机械能', '做功判断', 3, '1周', '选择题', 'junior'),
  t('physics', '功与机械能', '力臂作图', 3, '1周', '作图题', 'junior'),
  t('physics', '功与机械能', '机械效率', 4, '2周', '计算题', 'junior'),
  t('physics', '热学', '物态变化判别', 3, '1周', '选择题', 'junior'),
  t('physics', '热学', '比热容与热量', 3, '1周', '计算题', 'junior'),
  t('physics', '光学', '光路作图', 3, '1周', '作图题', 'junior'),
  t('physics', '光学', '凸透镜成像', 4, '2周', '选择/实验', 'junior'),
  t('physics', '电学', '串并联电路识别', 3, '1周', '实验/选择', 'junior'),
  t('physics', '电学', '欧姆定律计算', 3, '1周', '计算题', 'junior'),
  t('physics', '电学', '电功率计算', 4, '2周', '计算题', 'junior'),
  t('physics', '实验探究', '控制变量法', 3, '1周', '实验题', 'junior'),
];

/** 物理 - 高中 */
const PHYSICS_SENIOR: AbilityTag[] = [
  t('physics', '力学建模', '牛顿第二定律应用', 4, '2周', '计算题', 'senior'),
  t('physics', '力学建模', '整体法与隔离法', 4, '2周', '计算题', 'senior'),
  t('physics', '力学建模', '临界与极值分析', 5, '1月', '压轴题', 'senior'),
  t('physics', '功能关系', '动能定理应用', 4, '2周', '计算题', 'senior'),
  t('physics', '功能关系', '机械能守恒', 4, '2周', '计算题', 'senior'),
  t('physics', '动量', '动量定理', 3, '1周', '计算题', 'senior'),
  t('physics', '动量', '动量守恒', 4, '2周', '计算题', 'senior'),
  t('physics', '万有引力与天体', '天体运动建模', 4, '2周', '计算题', 'senior'),
  t('physics', '电场与电路', '带电粒子在电场中', 4, '2周', '计算题', 'senior'),
  t('physics', '电场与电路', '闭合电路欧姆定律', 4, '2周', '计算题', 'senior'),
  t('physics', '磁场与电磁感应', '带电粒子在磁场中', 5, '1月', '压轴题', 'senior'),
  t('physics', '磁场与电磁感应', '法拉第电磁感应', 4, '2周', '计算题', 'senior'),
  t('physics', '磁场与电磁感应', '导体棒模型', 5, '1月', '压轴题', 'senior'),
  t('physics', '热学光学近代', '气体状态方程', 4, '2周', '计算题', 'senior'),
  t('physics', '热学光学近代', '几何光学', 3, '1周', '计算题', 'senior'),
  t('physics', '实验探究', '实验方案设计', 4, '2周', '实验题', 'senior'),
  t('physics', '实验探究', '误差分析', 4, '2周', '实验题', 'senior'),
];

/** 行测 */
const XINGCE: AbilityTag[] = [
  t('xingce', '言语理解', '语境分析能力', 3, '1周', '逻辑填空', 'adult'),
  t('xingce', '言语理解', '词语辨析能力', 3, '2周', '逻辑填空', 'adult'),
  t('xingce', '言语理解', '关联词定位', 3, '1周', '主旨概括', 'adult'),
  t('xingce', '言语理解', '主题词筛选', 3, '1周', '主旨概括', 'adult'),
  t('xingce', '言语理解', '意图判断', 4, '2周', '意图判断', 'adult'),
  t('xingce', '判断推理', '图形分类识别', 3, '1周', '图形推理', 'adult'),
  t('xingce', '判断推理', '样式叠加规律', 4, '2周', '图形推理', 'adult'),
  t('xingce', '判断推理', '空间重构', 5, '1月', '空间类', 'adult'),
  t('xingce', '判断推理', '翻译推理', 3, '1周', '逻辑判断', 'adult'),
  t('xingce', '判断推理', '削弱题型识别', 4, '2周', '可能性推理', 'adult'),
  t('xingce', '判断推理', '加强题型识别', 4, '2周', '可能性推理', 'adult'),
  t('xingce', '判断推理', '前提假设识别', 5, '1月', '前提型', 'adult'),
  t('xingce', '资料分析', '特征数字法', 4, '2周', '计算加速', 'adult'),
  t('xingce', '资料分析', '有效数字法', 3, '1周', '除法/乘法', 'adult'),
  t('xingce', '资料分析', '基本增长率', 2, '3天', '前期/变化量', 'adult'),
  t('xingce', '资料分析', '隔年增长率', 4, '2周', '隔年综合', 'adult'),
  t('xingce', '资料分析', '两期比重差', 4, '2周', '比重比较', 'adult'),
  t('xingce', '数量关系', '代入排除法', 3, '1周', '多题型', 'adult'),
  t('xingce', '数量关系', '赋值法', 3, '1周', '工程/利润', 'adult'),
  t('xingce', '数量关系', '行程问题', 4, '2周', '行程题', 'adult'),
  t('xingce', '数量关系', '排列组合', 5, '1月', '排列组合', 'adult'),
  t('xingce', '常识判断', '时政热点', 3, '1周', '时政题', 'adult'),
  t('xingce', '常识判断', '法律', 4, '1月', '法律题', 'adult'),
];

/** 申论 */
const SHENLUN: AbilityTag[] = [
  t('shenlun', '材料处理能力', '三遍法', 3, '2周', '全题型', 'adult'),
  t('shenlun', '材料处理能力', '关键词圈画', 2, '1周', '归纳概括', 'adult'),
  t('shenlun', '材料处理能力', '规范词替换', 3, '长期', '归纳/对策', 'adult'),
  t('shenlun', '归纳概括', '抄材料主线', 3, '1周', '归纳概括', 'adult'),
  t('shenlun', '归纳概括', '全面性', 3, '2周', '归纳概括', 'adult'),
  t('shenlun', '归纳概括', '准确性', 4, '1月', '归纳概括', 'adult'),
  t('shenlun', '归纳概括', '条理性', 3, '2周', '归纳概括', 'adult'),
  t('shenlun', '综合分析', '观点明确', 3, '1周', '词句理解', 'adult'),
  t('shenlun', '综合分析', '分析深入', 4, '2周', '综合分析', 'adult'),
  t('shenlun', '提出对策', '针对性', 4, '2周', '对策题', 'adult'),
  t('shenlun', '提出对策', '可行性', 4, '2周', '对策题', 'adult'),
  t('shenlun', '贯彻执行', '格式规范', 3, '2周', '应用文', 'adult'),
  t('shenlun', '贯彻执行', '内容完整', 3, '2周', '应用文', 'adult'),
  t('shenlun', '大作文', '短句式标题', 3, '2周', '大作文', 'adult'),
  t('shenlun', '大作文', '对偶式标题', 4, '1月', '大作文', 'adult'),
  t('shenlun', '大作文', '五段三分结构', 4, '1月', '大作文', 'adult'),
  t('shenlun', '大作文', '三方向提炼', 4, '2周', '大作文', 'adult'),
];

/** 面试 */
const MIANSHI: AbilityTag[] = [
  t('mianshi', '综合分析', '社会现象分析', 4, '2周', '现象类', 'adult'),
  t('mianshi', '综合分析', '政策理解', 4, '2周', '政策类', 'adult'),
  t('mianshi', '综合分析', '名言警句阐释', 3, '2周', '名言类', 'adult'),
  t('mianshi', '计划组织', '调研类', 3, '2周', '调研类', 'adult'),
  t('mianshi', '计划组织', '宣传类', 3, '2周', '宣传类', 'adult'),
  t('mianshi', '人际关系', '与领导/同事关系', 3, '2周', '人际关系', 'adult'),
  t('mianshi', '应急应变', '突发事件处理', 4, '2周', '应急应变', 'adult'),
  t('mianshi', '应急应变', '舆情应对', 4, '2周', '应急应变', 'adult'),
  t('mianshi', '通用能力', '政治素养', 3, '2周', '全题型', 'adult'),
  t('mianshi', '通用能力', '逻辑思维', 4, '2周', '全题型', 'adult'),
  t('mianshi', '通用能力', '语言表达', 3, '2周', '全题型', 'adult'),
  t('mianshi', '通用能力', '举止仪表', 2, '2周', '全题型', 'adult'),
];

const EMPTY: AbilityTag[] = [];

/** 三级能力标签库(v1)
 *  已填充: math (primary/junior/senior/adult), physics (junior/senior), xingce/shenlun/mianshi (adult)
 *  预留(P2): 语文/英语/化学/生物 全学段 + 各种学段-学科的边缘组合;
 *  预留组合允许用户自建模块并录入训练,能力标签库随版本迭代补充。
 */
export const ABILITY_TAGS: Record<`${GradeLevel}-${Subject}`, AbilityTag[]> = {
  'primary-math': MATH_PRIMARY,
  'primary-physics': EMPTY,
  'primary-xingce': EMPTY,
  'primary-shenlun': EMPTY,
  'primary-mianshi': EMPTY,
  'primary-chinese': EMPTY,
  'primary-english': EMPTY,
  'primary-chemistry': EMPTY,
  'primary-biology': EMPTY,
  'junior-math': MATH_JUNIOR,
  'junior-physics': PHYSICS_JUNIOR,
  'junior-xingce': EMPTY,
  'junior-shenlun': EMPTY,
  'junior-mianshi': EMPTY,
  'junior-chinese': EMPTY,
  'junior-english': EMPTY,
  'junior-chemistry': EMPTY,
  'junior-biology': EMPTY,
  'senior-math': MATH_SENIOR,
  'senior-physics': PHYSICS_SENIOR,
  'senior-xingce': EMPTY,
  'senior-shenlun': EMPTY,
  'senior-mianshi': EMPTY,
  'senior-chinese': EMPTY,
  'senior-english': EMPTY,
  'senior-chemistry': EMPTY,
  'senior-biology': EMPTY,
  'adult-math': MATH_SENIOR,
  'adult-physics': EMPTY,
  'adult-xingce': XINGCE,
  'adult-shenlun': SHENLUN,
  'adult-mianshi': MIANSHI,
  'adult-chinese': EMPTY,
  'adult-english': EMPTY,
  'adult-chemistry': EMPTY,
  'adult-biology': EMPTY,
};

export function getAbilityTags(gradeLevel: GradeLevel, subject: Subject): AbilityTag[] {
  return ABILITY_TAGS[`${gradeLevel}-${subject}`] ?? [];
}

export function getModules(gradeLevel: GradeLevel, subject: Subject): string[] {
  const tags = getAbilityTags(gradeLevel, subject);
  return Array.from(new Set(tags.map((it) => it.module)));
}

/** 雷达图维度权重(PRD §12A/§15A) */
export interface RadarDimension {
  key: string;
  label: string;
  weight: number;
  modules: string[];
}

export const RADAR_DIMENSIONS: Partial<Record<`${GradeLevel}-${Subject}`, RadarDimension[]>> = {
  'junior-physics': [
    { key: 'mechanics', label: '力学', weight: 30, modules: ['力学基础', '压强与浮力', '功与机械能'] },
    { key: 'electric', label: '电学', weight: 25, modules: ['电学'] },
    { key: 'experiment', label: '实验与作图', weight: 15, modules: ['实验探究'] },
    { key: 'thermal', label: '热学', weight: 10, modules: ['热学'] },
    { key: 'optical', label: '光学', weight: 10, modules: ['光学'] },
    { key: 'other', label: '声/电磁/能源', weight: 10, modules: [] },
  ],
  'senior-physics': [
    { key: 'mechanics', label: '力学建模', weight: 25, modules: ['力学建模'] },
    { key: 'energy', label: '功能与动量', weight: 15, modules: ['功能关系', '动量'] },
    { key: 'electromagnetic', label: '电磁学', weight: 25, modules: ['电场与电路', '磁场与电磁感应'] },
    { key: 'experiment', label: '实验与数据', weight: 15, modules: ['实验探究'] },
    { key: 'modeling', label: '建模与数学', weight: 10, modules: [] },
    { key: 'thermal-optical', label: '热学与光学', weight: 6, modules: ['热学光学近代'] },
    { key: 'modern', label: '万有引力与近代', weight: 4, modules: ['万有引力与天体'] },
  ],
  'adult-xingce': [
    { key: 'judge', label: '判断推理', weight: 25, modules: ['判断推理'] },
    { key: 'material', label: '资料分析', weight: 25, modules: ['资料分析'] },
    { key: 'language', label: '言语理解', weight: 20, modules: ['言语理解'] },
    { key: 'common', label: '常识判断', weight: 12, modules: ['常识判断'] },
    { key: 'politics', label: '政治理论', weight: 10, modules: [] },
    { key: 'quantity', label: '数量关系', weight: 8, modules: ['数量关系'] },
  ],
  'adult-shenlun': [
    { key: 'essay', label: '大作文', weight: 35, modules: ['大作文'] },
    { key: 'summarize', label: '归纳概括', weight: 20, modules: ['归纳概括'] },
    { key: 'analyze', label: '综合分析', weight: 18, modules: ['综合分析'] },
    { key: 'proposal', label: '提出对策', weight: 15, modules: ['提出对策'] },
    { key: 'apply', label: '贯彻执行', weight: 12, modules: ['贯彻执行'] },
  ],
  'adult-mianshi': [
    { key: 'analyze', label: '综合分析', weight: 25, modules: ['综合分析'] },
    { key: 'logic', label: '逻辑思维', weight: 20, modules: ['通用能力'] },
    { key: 'expression', label: '语言表达', weight: 18, modules: [] },
    { key: 'emergency', label: '应变+人际', weight: 17, modules: ['应急应变', '人际关系'] },
    { key: 'politics', label: '政治素养', weight: 12, modules: [] },
    { key: 'manner', label: '举止仪表', weight: 8, modules: [] },
  ],
};

export function getRadarDimensions(gradeLevel: GradeLevel, subject: Subject): RadarDimension[] {
  return RADAR_DIMENSIONS[`${gradeLevel}-${subject}`] ?? [];
}
