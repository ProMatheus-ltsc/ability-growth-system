/**
 * 能力路径与错因推断 —— 统一「页面派生」与「脚本/MCP 写入」两套口径
 *
 * 背景（2026-11-11 实测）：
 * - 页面 `deriveGapsFromTraining` 用 `${subject}/${module}` 只到二级；
 * - 脚本 `ability_record` 直接收调用方传入的 `abilityPath`，可以到四级；
 * - 两者 `existingGaps.find` 按字符串精确匹配，于是同一次练习生成两条互不合并的缺口，
 *   问题中心看起来「和实际不符」：一条笼统、一条过细。
 *
 * 本模块给出唯一口径（方案 C）：
 * - **路径只表达「能力位置」**，最多到三级（学科/一级模块/二级考点）；
 * - **错因单独放 `errorCategory`**，绝不塞进路径 —— 否则同一考点会因不同错因裂成多条。
 * - 缺失信息用「有则用、无则退」：没有 `questionType` 就退二级，绝不产出空段。
 */
import type { ErrorCategory, GradeLevel, Subject, TrainingRecord } from '../domain/types';
import { normalizeModule } from '../domain/moduleNormalize';

/**
 * 各学科的能力路径深度上限（2026-11-11 定口径）。
 *
 * - **行测到四级**：`xingce/资料分析/基期与现期/现期计算`
 *   行测考点天然是「模块 → 题型 → 细分考点」，四级才能区分「增长率算错」与
 *   「增长率公式用错」，否则同一题型下所有错因挤在一条缺口里。
 * - **申论三级**：`shenlun/归纳概括/要点全面性`
 *   申论的二级（归纳概括/综合分析…）已是题型，三级就是具体错法，再往下没有稳定分层。
 * - **K12 三级**：数学/物理等按「学科/章节/知识点」组织，四级会把同一知识点拆碎。
 *
 * ⚠️ 改这里必须同步 Python 侧 `mcp/ability/taxonomy.py` 的 `MAX_PATH_DEPTH_BY_SUBJECT`。
 */
export const MAX_PATH_DEPTH_BY_SUBJECT: Record<string, number> = {
  xingce: 4,
  shenlun: 3,
  mianshi: 3,
};

/** 取某学科的路径深度上限；未知学科按三级处理（保守，不制造空段） */
export function maxDepthFor(subject: string): number {
  return MAX_PATH_DEPTH_BY_SUBJECT[subject] ?? 3;
}

/** 一级模块 → 常见二级考点（用于 questionType 缺失时按模块兜底推断） */
const MODULE_SUBTYPES: Record<string, string[]> = {
  资料分析: ['简单计算', '基期与现期', '增长率', '增长量', '比重问题', '平均数问题', '倍数与比值', '综合资料'],
  判断推理: ['图形推理', '定义判断', '类比推理', '逻辑判断'],
  言语理解: ['逻辑填空', '片段阅读', '语句表达'],
  数量关系: ['数字推理', '数学运算', '工程问题', '行程问题', '排列组合'],
  常识判断: ['政治常识', '法律常识', '人文常识', '地理国情', '科技常识'],
  政治理论: ['新思想', '时事政治', '马克思主义'],
  归纳概括: ['段旨提取', '要点全面性', '要点取舍', '条理性', '字数控制', '表达精炼'],
  综合分析: ['题型识别', '启示概括词', '要点全面性', '字数控制', '原因分析'],
  提出对策: ['对策来源', '对策表述', '身份感'],
  贯彻执行: ['文种判断', '格式规范', '行文脉络'],
  大作文: ['论点提炼', '分论点', '论证方法', '谋篇布局'],
};

/**
 * 构建能力路径：按学科决定深度上限（行测四级 / 申论与 K12 三级），**有则用、无则退**。
 *
 * 优先级：显式 `modulePath` → `module` 里已含的层级（`资料分析/基期与现期/现期计算`）→
 * `questionType` → 到二级止步。绝不产生空段，也绝不为凑深度而编造层级。
 *
 * 这条函数同时用于 `deriveGapsFromTraining` 与 `deriveSnapshotFromTraining`，
 * 保证同一记录的缺口与快照落在同一条路径上。
 */
export function buildAbilityPath(record: TrainingRecord): string {
  const subject = record.subject;
  const limit = maxDepthFor(subject);
  const rawModule = String(record.module ?? '').trim();

  // 1) 显式 modulePath（脚本写入时可能有）：归一化前两段，保留更深层级，再按学科截断
  const modulePath = String((record as TrainingRecord & { modulePath?: string }).modulePath ?? '').trim();
  if (modulePath) {
    const parts = modulePath.split('/').filter(Boolean);
    const body = parts[0] === subject ? parts.slice(1) : parts;
    if (body.length > 0) {
      const head = normalizeModule(body[0], subject, record.gradeLevel as GradeLevel);
      return [subject, head, ...body.slice(1)].filter(Boolean).slice(0, limit).join('/');
    }
  }

  // 2) module 本身写成多级路径（`资料分析/基期与现期/现期计算`）
  const segs = rawModule.split('/').map((s) => s.trim()).filter(Boolean);
  const head = normalizeModule(segs[0] ?? rawModule, subject, record.gradeLevel as GradeLevel);
  if (!head) return subject;
  if (segs.length >= 2) {
    return [subject, head, ...segs.slice(1)].slice(0, limit).join('/');
  }

  // 3) 用 questionType 作下一段（跳过「整卷」这类卷型，它们不是考点）
  const qt = String(record.questionType ?? '').trim();
  if (qt && qt !== '整卷' && qt !== '行测整卷') {
    const known = MODULE_SUBTYPES[head];
    if (!known || known.some((k) => qt.includes(k) || k.includes(qt))) {
      return [subject, head, qt].slice(0, limit).join('/');
    }
  }

  // 4) 到二级止步
  return [subject, head].slice(0, limit).join('/');
}

/** 按模块 + 题型 + 备注推断错因；显式 errorCategories 优先 */
export function inferErrorCategory(record: TrainingRecord): ErrorCategory {
  const explicit = record.errorCategories ?? [];
  if (explicit.length > 0) return explicit[0];

  const module = normalizeModule(String(record.module ?? ''), record.subject, record.gradeLevel as GradeLevel);
  const qt = String(record.questionType ?? '');
  const note = String(record.note ?? '');

  // 读题/理解类信号
  if (/未定位|定位不到|看错|读错|审题|忽略|没注意|依据不成立|只抓|未识别|题型识别/.test(note)) return 'read';
  // 方法类信号
  if (/方法|技巧|不会|思路|规律|口诀/.test(note) || /图形推理|逻辑填空|类比推理|定义判断/.test(qt + module)) return 'method';
  // 公式类
  if (/公式|列式|基期|现期|增长率|增长量|比重|倍数|平均数/.test(qt + note)) return 'formula';
  // 计算类
  if (/算错|计算|口算|直除|估算|精度/.test(note) || /简单计算|数学运算/.test(qt)) return 'calc';
  // 申论要点类
  if (/要点|概括|归纳|采分|遗漏|不全/.test(qt + note)) return 'point';
  // 结构/字数
  if (/字数|条理|结构|逻辑层次/.test(note)) return 'structure';
  // 知识型
  if (/常识|政治|时政|新思想|法律/.test(module)) return 'not-know';

  return 'concept';
}

/**
 * 推断一条记录的全部错因（用于 errorCategories 为空时的兜底）。
 * 最多两个，避免一个问题被拆成四五个标签。
 */
export function inferErrorCategories(record: TrainingRecord): ErrorCategory[] {
  const explicit = record.errorCategories ?? [];
  if (explicit.length > 0) return explicit;
  const first = inferErrorCategory(record);
  const note = String(record.note ?? '');
  const second: ErrorCategory | null =
    first !== 'read' && /未定位|看错|审题|忽略/.test(note) ? 'read' : null;
  return second ? [first, second] : [first];
}
