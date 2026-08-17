/**
 * 能力迁移矩阵 - PRD §12B / §15B
 * 描述能力之间的迁移强度: 强 / 中 / 弱 / 无
 * 用于能力关联分析 (PRD §18.5)
 */

export type TransferStrength = 'strong' | 'medium' | 'weak' | 'none';

export interface TransferEdge {
  from: string;
  to: string;
  strength: TransferStrength;
  note?: string;
}

export const TRANSFER_STRENGTH_LABEL: Record<TransferStrength, string> = {
  strong: '强迁移',
  medium: '中迁移',
  weak: '弱迁移',
  none: '无显著迁移',
};

/** 初中物理 → 高中物理 学段纵向迁移 */
const PHYSICS_JUNIOR_TO_SENIOR: TransferEdge[] = [
  { from: '初中-受力分析', to: '高中-牛顿定律建模', strength: 'strong', note: '受力思路直接延伸为系统拆分' },
  { from: '初中-二力平衡', to: '高中-共点力系平衡', strength: 'strong', note: '平衡思维直接升级' },
  { from: '初中-机械能守恒', to: '高中-动能定理', strength: 'strong', note: '定性守恒升级为定量方程' },
  { from: '初中-欧姆定律', to: '高中-闭合电路欧姆定律', strength: 'strong', note: '电路拓扑判断直接复用' },
  { from: '初中-安培定则', to: '高中-安培力/洛伦兹力', strength: 'strong', note: '右手→左手定则思维相通' },
  { from: '初中-控制变量法', to: '高中-实验方案设计', strength: 'strong', note: '实验方法论直接延续' },
  { from: '初中-图象法', to: '高中-v-t/s-t图象', strength: 'strong', note: '读斜率/面积/交点跨维度一致' },
  { from: '初中-隐含条件辨析', to: '高中-临界极值分析', strength: 'medium', note: '对隐含条件敏感度延伸' },
];

/** 物理 ↔ 数学 跨学科迁移 */
const PHYSICS_MATH: TransferEdge[] = [
  { from: '物理-图象法', to: '数学-导数与单调性', strength: 'strong', note: '斜率=变化率' },
  { from: '物理-列方程组', to: '数学-多元方程与代数变形', strength: 'strong' },
  { from: '物理-力的三角形', to: '数学-正弦余弦定理', strength: 'strong' },
  { from: '物理-建模与情境抽象', to: '数学-应用题建模', strength: 'strong' },
  { from: '物理-临界极值', to: '数学-函数极值/不等式', strength: 'strong' },
  { from: '物理-矢量合成分解', to: '数学-向量与坐标', strength: 'strong' },
  { from: '数学-不等式与判别式', to: '物理-非弹性碰撞可能性判断', strength: 'strong' },
];

/** 物理内部跨模块迁移 */
const PHYSICS_INTERNAL: TransferEdge[] = [
  { from: '力学-受力分析', to: '电磁-带电粒子在电磁场受力', strength: 'strong' },
  { from: '力学-牛顿定律', to: '磁场-导体棒模型', strength: 'strong' },
  { from: '功能关系', to: '电磁-导体棒能量转化', strength: 'strong' },
  { from: '动量守恒', to: '电磁-带电粒子碰撞', strength: 'strong' },
  { from: '图象法(力学)', to: '电磁-i-t/Φ-t图象', strength: 'strong' },
  { from: '实验-变量控制', to: '实验-创新实验方案评估', strength: 'medium' },
  { from: '光学-波动模型', to: '磁场-电磁波', strength: 'medium' },
];

/** 行测/申论/面试迁移 */
const XINGCE_SHENLUN: TransferEdge[] = [
  { from: '逻辑判断-削弱/加强', to: '申论-观点论证/反驳', strength: 'strong' },
  { from: '言语-主旨概括', to: '申论-归纳概括', strength: 'strong' },
  { from: '资料分析-信息提取', to: '申论-材料信息提取', strength: 'medium' },
  { from: '逻辑判断-论证结构', to: '申论-材料逻辑梳理', strength: 'medium' },
  { from: '常识-时政积累', to: '申论-大作文素材', strength: 'medium' },
];

const XINGCE_SHENLUN_TO_MIANSHI: TransferEdge[] = [
  { from: '逻辑判断+申论综合分析', to: '面试-综合分析', strength: 'strong' },
  { from: '申论-思维体系', to: '面试-计划组织/应变', strength: 'strong' },
  { from: '申论-政策理解', to: '面试-政治素养', strength: 'strong' },
  { from: '言语-语言表达', to: '面试-语言表达', strength: 'medium' },
];

const XINGCE_INTERNAL: TransferEdge[] = [
  { from: '图形推理-规律识别', to: '数量-数列规律', strength: 'medium' },
  { from: '数量-代入排除', to: '资料-选项代入', strength: 'strong' },
  { from: '资料-敏感数字/速算', to: '数量-尾数法/估算', strength: 'strong' },
  { from: '言语-关键词定位', to: '逻辑-论证结构分析', strength: 'medium' },
];

export const ALL_TRANSFERS: TransferEdge[] = [
  ...PHYSICS_JUNIOR_TO_SENIOR,
  ...PHYSICS_MATH,
  ...PHYSICS_INTERNAL,
  ...XINGCE_SHENLUN,
  ...XINGCE_SHENLUN_TO_MIANSHI,
  ...XINGCE_INTERNAL,
];

/** 能力迁移总览矩阵(简化) */
export interface MatrixCell {
  from: string;
  to: string;
  strength: TransferStrength;
}

export const PHYSICS_MATRIX: MatrixCell[] = [
  { from: '初物力学', to: '高物力学', strength: 'strong' },
  { from: '初物力学', to: '高物电磁', strength: 'medium' },
  { from: '初物力学', to: '高物实验', strength: 'medium' },
  { from: '初物电学', to: '高物电磁', strength: 'strong' },
  { from: '初物电学', to: '高物实验', strength: 'medium' },
  { from: '高物力学', to: '高物电磁', strength: 'strong' },
  { from: '高物力学', to: '高物实验', strength: 'strong' },
  { from: '高物力学', to: '数学', strength: 'strong' },
  { from: '高物电磁', to: '高物实验', strength: 'strong' },
  { from: '高物电磁', to: '数学', strength: 'strong' },
  { from: '数学', to: '高物力学', strength: 'strong' },
  { from: '数学', to: '高物电磁', strength: 'strong' },
];

export const GONGKAO_MATRIX: MatrixCell[] = [
  { from: '行测言语', to: '申论', strength: 'strong' },
  { from: '行测言语', to: '行测判断', strength: 'medium' },
  { from: '行测判断', to: '申论', strength: 'strong' },
  { from: '行测判断', to: '面试', strength: 'strong' },
  { from: '行测判断', to: '行测数量', strength: 'medium' },
  { from: '行测资料', to: '行测数量', strength: 'strong' },
  { from: '行测资料', to: '申论', strength: 'medium' },
  { from: '行测数量', to: '行测资料', strength: 'strong' },
  { from: '行测数量', to: '行测判断', strength: 'medium' },
  { from: '申论', to: '面试', strength: 'strong' },
  { from: '申论', to: '行测判断', strength: 'medium' },
  { from: '面试', to: '申论', strength: 'medium' },
];

/** 寻找一个能力的强迁移源头(用于推荐修复路径) */
export function findStrongTransferSources(target: string): TransferEdge[] {
  return ALL_TRANSFERS.filter((e) => e.to.includes(target) && e.strength === 'strong');
}
