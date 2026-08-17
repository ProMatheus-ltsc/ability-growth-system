/**
 * 外部 AI 辅助能力评估 (PRD §30)
 * - 生成标准提示词 (行测/申论/面试/数学/物理)
 * - 解析 AI 返回的 JSON
 * - 校验 Schema + 标签存在性 + 取值范围
 */
import { getAbilityTags } from '../domain/abilityTags';
import type {
  AbilitySnapshot,
  ExternalAIAssessment,
  GradeLevel,
  MasteryLevel,
  StudentProfile,
  Subject,
} from '../domain/types';
import { scoreToLevel } from '../domain/types';

const SUBJECT_ROLE: Record<Subject, string> = {
  math: '资深数学学科教研专家',
  physics: '资深物理学科教研专家',
  xingce: '资深公考行测阅卷与能力诊断专家',
  shenlun: '资深公考申论阅卷专家',
  mianshi: '资深公考面试评委',
  chinese: '资深语文学科教研专家',
  english: '资深英语学科教研专家',
  chemistry: '资深化学学科教研专家',
  biology: '资深生物学科教研专家',
};

const GENERIC_ERROR = '概念错误 / 知识错误 / 方法选择错误 / 审题错误 / 计算错误 / 规范书写错误 / 时间策略错误';
const GENERIC_TRAINING = '课后练习 / 专项训练 / 错题复习 / 陌生题训练 / 限时训练 / 测验考试';

const ERROR_ENUM: Record<Subject, string> = {
  math: '概念错误 / 公式记忆错误 / 计算错误 / 审题错误 / 建模错误 / 逻辑推理错误 / 规范书写错误 / 方法选择错误 / 时间策略错误',
  physics: '概念错误 / 公式记忆错误 / 计算错误 / 审题错误 / 建模错误 / 实验操作错误 / 规范书写错误 / 方向正负号错误 / 时间策略错误',
  xingce: '不会 / 知识 / 方法 / 判断 / 计算操作 / 时间策略',
  shenlun: '漏要点 / 要点提取不准确 / 材料理解错误 / 概括能力不足 / 综合分析不足 / 对策针对性不足 / 逻辑结构问题 / 论证不足 / 语言表达问题 / 格式问题 / 字数控制问题 / 时间控制问题',
  mianshi: '开头套路化 / 逻辑断裂 / 语速过快 / 内容空洞 / 缺乏案例支撑 / 时间超限 / 表达不流畅',
  chinese: GENERIC_ERROR,
  english: GENERIC_ERROR,
  chemistry: GENERIC_ERROR + ' / 实验操作错误',
  biology: GENERIC_ERROR + ' / 实验操作错误',
};

const TRAINING_TYPE_ENUM: Record<Subject, string> = {
  math: '课后练习 / 专项训练 / 错题复习 / 陌生题训练 / 限时训练 / 测验考试',
  physics: '课后练习 / 专项训练 / 错题复习 / 陌生题训练 / 限时训练 / 实验记录 / 测验考试',
  xingce: '普通刷题 / 专项训练 / 错题复习 / 陌生题训练 / 限时训练 / 模拟考试',
  shenlun: '材料阅读 / 归纳概括 / 综合分析 / 对策题 / 应用文 / 大作文 / 全套模拟 / 复盘修改',
  mianshi: '综合分析 / 计划组织 / 人际关系 / 应急应变 / 情境模拟 / 自我认知',
  chinese: GENERIC_TRAINING,
  english: GENERIC_TRAINING,
  chemistry: GENERIC_TRAINING + ' / 实验记录',
  biology: GENERIC_TRAINING + ' / 实验记录',
};

export interface PromptContext {
  student: StudentProfile | null;
  gradeLevel: GradeLevel;
  subject: Subject;
  scenario: string;
}

export function generatePrompt(ctx: PromptContext): string {
  const tags = getAbilityTags(ctx.gradeLevel, ctx.subject);
  const tagList = tags.map((t) => `- ${t.path}`).join('\n');
  const role = SUBJECT_ROLE[ctx.subject];
  const gradeLevelLabel =
    ctx.gradeLevel === 'primary' ? '小学'
      : ctx.gradeLevel === 'junior' ? '初中'
        : ctx.gradeLevel === 'senior' ? '高中'
          : '成年人';

  const errorEnum = ERROR_ENUM[ctx.subject];
  const trainingTypeEnum = TRAINING_TYPE_ENUM[ctx.subject];

  return `你是一位${role},拥有 10 年以上一线教学与阅卷经验。

【输入信息】
- 学生学段：${gradeLevelLabel}
- 学科：${ctx.subject}
- 评估场景：${ctx.scenario}
- 学生标识：${ctx.student?.name ?? '本人'}
- 答题截图：见附件图片

【能力标签体系】
以下是该学生需评估的三级能力标签清单(学科→模块→能力点),共 ${tags.length} 个:
${tagList}

【任务要求】
1. 识别截图中的作答内容
2. 判断每题正误,归因到对应的三级能力标签
3. 评估每个能力点的掌握度(0-100 整数)
4. 判定掌握等级:未掌握(0-25) / 初步(26-60) / 熟练(61-85) / 精通(86-100)
5. 识别错误类型(枚举:${errorEnum})
6. 给出证据描述(具体题号 / 错误步骤 / 表现)
7. 给出改进建议

【输出格式约束】
- 严格输出纯 JSON,不得输出任何 Markdown 标记或额外文字
- 严重程度枚举: 轻微 / 中等 / 严重
- 置信度范围: 0.0-1.0
- training_records 中 training_type 枚举: ${trainingTypeEnum}

【输出 JSON Schema】
{
  "meta": {
    "student_id": "string",
    "grade_level": "${gradeLevelLabel}",
    "subject": "${ctx.subject}",
    "scenario": "${ctx.scenario}",
    "evaluation_time": "ISO 8601",
    "source": "external_ai",
    "ai_model": "string(选填,如 GPT-4o / Claude-3.5-Sonnet)"
  },
  "abilities": [
    {
      "tag_path": "学科/模块/能力点",
      "mastery_score": 0-100,
      "mastery_level": "未掌握/初步/熟练/精通",
      "confidence": 0.0-1.0,
      "evidence": "string",
      "sample_total": integer,
      "sample_correct": integer
    }
  ],
  "issues": [
    {
      "related_ability": "tag_path",
      "issue_type": "错误类型枚举",
      "severity": "轻微/中等/严重",
      "frequency": integer,
      "evidence": "string",
      "suggestion": "string"
    }
  ],
  "training_records": [
    {
      "subject": "${ctx.subject}",
      "module": "string",
      "training_type": "${trainingTypeEnum.split('/')[0].trim()}",
      "total_questions": integer,
      "correct_count": integer,
      "duration_minutes": integer,
      "error_type_distribution": { "错误类型": integer }
    }
  ],
  "summary": {
    "main_bottlenecks": ["string"],
    "priority_fixes": ["string"],
    "next_training_suggestions": ["string"]
  }
}`;
}

/** 解析 AI 返回的 JSON, 返回校验后的结构与告警 */
export interface ParseReport {
  data: ExternalAIAssessment | null;
  errors: string[];
  warnings: string[];
  unmatchedTags: string[];
}

const LEVEL_MAP: Record<string, MasteryLevel> = {
  未掌握: 'unmastered',
  初步: 'basic',
  熟练: 'proficient',
  精通: 'expert',
};

export function parseAIResponse(raw: string, ctx: PromptContext): ParseReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unmatchedTags: string[] = [];

  let json: Record<string, unknown>;
  try {
    // 去除可能的 markdown 代码块标记
    const cleaned = raw.trim().replace(/^```json\n?|\n?```$/g, '');
    json = JSON.parse(cleaned);
  } catch {
    return { data: null, errors: ['JSON 格式错误,无法解析'], warnings, unmatchedTags };
  }

  const meta = json.meta as ExternalAIAssessment['meta'] | undefined;
  const abilities = (json.abilities as ExternalAIAssessment['abilities'] | undefined) ?? [];
  const issues = (json.issues as ExternalAIAssessment['issues'] | undefined) ?? [];
  const summary = json.summary as ExternalAIAssessment['summary'] | undefined;
  const training_records = json.training_records as ExternalAIAssessment['training_records'];

  if (!meta) errors.push('meta 字段缺失');
  if (!summary) warnings.push('summary 字段缺失');

  const knownTagPaths = new Set(getAbilityTags(ctx.gradeLevel, ctx.subject).map((t) => t.path));
  for (const a of abilities) {
    if (typeof a.mastery_score !== 'number' || a.mastery_score < 0 || a.mastery_score > 100) {
      errors.push(`能力 ${a.tag_path}: 掌握度超范围`);
    }
    if (!knownTagPaths.has(a.tag_path)) {
      unmatchedTags.push(a.tag_path);
    }
    // 若 mastery_level 为中文,映射为英文枚举 (类型兼容)
    const mapped = LEVEL_MAP[a.mastery_level as unknown as string];
    if (mapped) {
      (a as { mastery_level: MasteryLevel }).mastery_level = mapped;
    } else if (!(['unmastered', 'basic', 'proficient', 'expert'] as string[]).includes(a.mastery_level)) {
      (a as { mastery_level: MasteryLevel }).mastery_level = scoreToLevel(a.mastery_score);
    }
  }

  if (unmatchedTags.length > 0) {
    warnings.push(`${unmatchedTags.length} 个标签未匹配到已定义体系,可能需要手动映射或跳过`);
  }

  if (errors.length > 0) return { data: null, errors, warnings, unmatchedTags };

  const data: ExternalAIAssessment = {
    meta: {
      student_id: meta?.student_id ?? ctx.student?.id ?? 'unknown',
      grade_level: meta?.grade_level ?? ctx.gradeLevel,
      subject: (meta?.subject ?? ctx.subject) as Subject,
      scenario: meta?.scenario ?? ctx.scenario,
      evaluation_time: meta?.evaluation_time ?? new Date().toISOString(),
      source: 'external_ai',
      ai_model: meta?.ai_model,
    },
    abilities,
    issues,
    training_records,
    summary: summary ?? { main_bottlenecks: [], priority_fixes: [], next_training_suggestions: [] },
  };
  return { data, errors, warnings, unmatchedTags };
}

/** 将 AI 评估转换为 AbilitySnapshot 列表, 供直接入库 */
export function toAbilitySnapshots(assessment: ExternalAIAssessment, ctx: PromptContext): AbilitySnapshot[] {
  const now = new Date().toISOString();
  return assessment.abilities.map((a) => ({
    id: `${assessment.meta.evaluation_time}-${a.tag_path}-${Math.random().toString(36).slice(2, 8)}`,
    studentId: ctx.student?.id,
    subject: ctx.subject,
    abilityPath: a.tag_path,
    score: a.mastery_score,
    level: (a.mastery_level as MasteryLevel) ?? scoreToLevel(a.mastery_score),
    confidence: a.confidence ?? 0.8,
    source: 'external_ai',
    sampleTotal: a.sample_total,
    sampleCorrect: a.sample_correct,
    evidence: a.evidence,
    evaluationTime: assessment.meta.evaluation_time,
    createdAt: now,
  }));
}
