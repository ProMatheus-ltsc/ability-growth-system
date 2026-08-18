/**
 * PRD V5.8 §32A A 类外部 AI 接入(信息检索/整理/脱敏筛查, 无推理决策)
 *
 * 覆盖:
 * - §27 岗位表 AI 解析与硬性条件筛查
 * - §27 时政热点素材整理(按月三科映射)
 * - §31.10 职业信息增强(五要素 + Plan B/C)
 * - §31.10 高中专业信息变体
 *
 * 系统只负责: 生成结构化提示词, 解析 AI 返回的 JSON, 落到系统内的现有实体
 * AI 无否决权; 价值代价冲突仍由系统硬过滤
 */
import { v4 as uuid } from 'uuid';
import type {
  AiJobParseResult,
  CareerAssessment,
  CareerCandidate,
  ExamRegistration,
  GradeLevel,
  MBTIScore,
  PoliticsHotspot,
  Subject,
  ValueCostTag,
} from '../domain/types';
import { getAllRecords, putRecord } from './localDB';

// ============ 27 岗位表 AI 解析 ============

export interface JobParsePromptContext {
  batchSourceHint: string;
  hardFilters: {
    education?: string;
    major?: string;
    politicalStatus?: string;
    otherLimits?: string;
  };
}

export function buildJobParsePrompt(ctx: JobParsePromptContext): string {
  const hard = ctx.hardFilters;
  return `你是资深公考报考顾问, 帮我把外部岗位表 CSV/文本解析为结构化岗位信息,
并按硬性条件筛查是否通过。

【输入】: 用户会在下方粘贴岗位表 CSV/文本, 请提取所有岗位。
【硬性筛查条件】(与用户资格对照):
- 学历要求: ${hard.education ?? '不限'}
- 专业限制: ${hard.major ?? '不限'}
- 政治面貌: ${hard.politicalStatus ?? '不限'}
- 其他限制: ${hard.otherLimits ?? '无'}

【输出格式约束】: 严格输出纯 JSON, 无 Markdown 标记。 Schema:
{
  "meta": { "source": "${ctx.batchSourceHint}", "parsedAt": "ISO 8601", "aiModel": "string(可选)" },
  "candidates": [
    {
      "postName": "string",
      "department": "string(可选)",
      "postLevel": "central|province|city|county|town(可选)",
      "headcount": integer(可选),
      "educationLimit": "string",
      "majorLimit": "string",
      "politicalRequirement": "string",
      "otherLimit": "string",
      "hardFilterPassed": true|false,
      "filterFailReasons": ["string"](若未通过)
    }
  ]
}
`;
}

export function parseJobResponse(raw: string): AiJobParseResult | null {
  try {
    const cleaned = raw.trim().replace(/^```json\n?|\n?```$/g, '');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function importParsedJobsAsRegistrations(
  data: AiJobParseResult,
  onlyPassed: boolean = true,
  studentId?: string,
): Promise<number> {
  const now = new Date().toISOString();
  let count = 0;
  for (const c of data.candidates) {
    if (onlyPassed && !c.hardFilterPassed) continue;
    const record: ExamRegistration = {
      id: uuid(),
      studentId,
      postName: c.postName,
      department: c.department,
      postLevel: c.postLevel,
      examType: 'national',
      examDate: '',
      headcount: c.headcount,
      educationLimit: c.educationLimit,
      majorLimit: c.majorLimit,
      note: [c.politicalRequirement, c.otherLimit, ...(c.filterFailReasons ?? [])].filter(Boolean).join(' · '),
      createdAt: now,
      updatedAt: now,
    };
    await putRecord('registrations', record);
    count++;
  }
  return count;
}

// ============ 27 时政热点素材整理 ============

export function buildPoliticsHotspotPrompt(yearMonth: string): string {
  return `你是资深公考时政热点研究员, 请整理 ${yearMonth} 的月度时政热点(共 8-12 条),
并给出对公考三科(行测常识/申论/面试)的适用映射。

【输出格式约束】: 严格纯 JSON, 无 Markdown。 Schema:
{
  "yearMonth": "${yearMonth}",
  "items": [
    {
      "title": "string",
      "summary": "string(200 字内)",
      "mappedToXingce": "string(如何在行测常识题中出现的一句话)",
      "mappedToShenlun": "string(如何作为申论素材/论据的一句话)",
      "mappedToMianshi": "string(如何在面试综合分析题中出现的一句话)",
      "source": "string(可选出处)"
    }
  ]
}
`;
}

export interface PoliticsHotspotResponse {
  yearMonth: string;
  items: Array<{
    title: string;
    summary: string;
    mappedToXingce?: string;
    mappedToShenlun?: string;
    mappedToMianshi?: string;
    source?: string;
  }>;
}

export function parsePoliticsHotspotResponse(raw: string): PoliticsHotspotResponse | null {
  try {
    const cleaned = raw.trim().replace(/^```json\n?|\n?```$/g, '');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function importPoliticsHotspots(data: PoliticsHotspotResponse, aiModel?: string): Promise<number> {
  const now = new Date().toISOString();
  let count = 0;
  for (const it of data.items) {
    const record: PoliticsHotspot = {
      id: uuid(),
      yearMonth: data.yearMonth,
      title: it.title,
      summary: it.summary,
      mappedToXingce: it.mappedToXingce,
      mappedToShenlun: it.mappedToShenlun,
      mappedToMianshi: it.mappedToMianshi,
      source: it.source,
      aiModel,
      createdAt: now,
    };
    await putRecord('politicsHotspots', record);
    count++;
  }
  return count;
}

export async function listPoliticsHotspots(yearMonth?: string): Promise<PoliticsHotspot[]> {
  const all = await getAllRecords('politicsHotspots');
  return all
    .filter((r) => (yearMonth ? r.yearMonth === yearMonth : true))
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
}

// ============ 31.10 职业信息 AI 拓展 ============

export interface CareerAiPromptContext {
  gradeLevel: GradeLevel;
  personality: MBTIScore;
  valuesRanked: string[];
  bottomLines: string[];
  abilityTop3: string[];
  scenario: 'career' | 'college-major';
}

export function buildCareerAiPrompt(assessment: CareerAssessment, scenario: 'career' | 'college-major'): string {
  const topAbility = (Object.entries(assessment.ability.scores) as Array<[string, number]>)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k, v]) => `${k}(${v})`)
    .join(', ');

  const stageContext =
    scenario === 'college-major' ? '高中选科与专业预决策'
      : assessment.gradeLevel === 'adult' ? '成年人转型或晋升'
        : assessment.gradeLevel === 'junior' ? '初中生涯启蒙'
          : '高中选科';

  return `你是一位资深职业规划顾问与劳动力市场分析师, 拥有 15 年跨行业职业咨询经验。

【用户画像】(系统自动注入, 已脱敏)
- 性格特征: MBTI ${assessment.personality.type}
- 能力雷达: Top3 ${topAbility}
- 价值倾向: ${assessment.values.ranked.slice(0, 3).join(' > ')}
  底线价值判定: ${assessment.values.bottomLines.length > 0 ? assessment.values.bottomLines.join(', ') : '无明确底线'}
- 决策场景: ${stageContext}

【任务要求】
1. 基于画像检索适配${scenario === 'college-major' ? '大学专业' : '职业'}
2. 生成 3-5 个推荐候选, 按综合匹配度降序, 每个候选包含五要素:
   ${scenario === 'college-major'
      ? '① 学科门类 ② 大学专业名称 ③ 选科要求组合 ④ 就业去向概览 ⑤ 相邻专业备选 / 保底专业备选'
      : '① 目标行业 ② 具体职业名称 ③ 推荐岗位 ④ 预期薪资范围 ⑤ 两条备选路线'}
3. 为每个候选预判价值代价风险标签, 若与底线价值存在潜在冲突必须如实标注

【输出格式约束】
- 严格输出纯 JSON, 无 Markdown 标记
- 薪资单位: 千/月(k), min ≤ max; 候选数量 3-5 个; 置信度 0.0-1.0
- position 枚举: 技术岗/产品岗/管理岗/专业岗/运营岗/其他
- value_cost_tags 枚举: 健康透支型/生存不稳型/关系牺牲型/违背真实型/尊严损耗型/无明显代价

【输出 JSON Schema】
{
  "meta": { "stage_context": "...", "generation_time": "ISO 8601", "source": "external_ai", "ai_model": "..." },
  "candidates": [{
    "rank": 1,
    "industry": "${scenario === 'college-major' ? '学科门类' : '目标行业'}",
    "profession": "${scenario === 'college-major' ? '大学专业名称' : '具体职业'}",
    "position": "${scenario === 'college-major' ? '选科组合(如: 物理+化学)' : '技术岗/产品岗/管理岗/专业岗/运营岗/其他'}",
    "salary_range": { "min_k": 15, "max_k": 30, "region_basis": "...", "experience_basis": "...", "confidence": 0.8 },
    "value_cost_tags": ["无明显代价"],
    "match_reason": { "personality_fit": "...", "ability_fit": "...", "value_fit": "...", "interest_fit": "..." },
    "plan_b": { "direction": "...", "rationale": "..." },
    "plan_c": { "direction": "...", "rationale": "..." }
  }],
  "market_notes": "行业/专业趋势补充说明(≤100 字)"
}`;
}

export interface CareerAiCandidate {
  rank: number;
  industry: string;
  profession: string;
  position: string;
  salary_range?: {
    min_k: number;
    max_k: number;
    region_basis?: string;
    experience_basis?: string;
    confidence?: number;
  };
  value_cost_tags: string[];
  match_reason?: {
    personality_fit?: string;
    ability_fit?: string;
    value_fit?: string;
    interest_fit?: string;
  };
  plan_b?: { direction: string; rationale: string };
  plan_c?: { direction: string; rationale: string };
}

export interface CareerAiResponse {
  meta: { stage_context: string; generation_time: string; source: string; ai_model?: string };
  candidates: CareerAiCandidate[];
  market_notes?: string;
}

export function parseCareerAiResponse(raw: string): CareerAiResponse | null {
  try {
    const cleaned = raw.trim().replace(/^```json\n?|\n?```$/g, '');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/** 将 AI 候选转换为 CareerCandidate, 并做价值代价 → BottomLine 冲突校验 */
export function toCareerCandidates(
  data: CareerAiResponse,
  bottomLines: import('../domain/types').BottomLine[],
): CareerCandidate[] {
  const mapCost: Record<string, ValueCostTag> = {
    健康透支型: 'health-cost',
    生存不稳型: 'unstable-life',
    关系牺牲型: 'sacrifice-relation',
    违背真实型: 'authenticity-cost',
    尊严损耗型: 'dignity-cost',
    无明显代价: 'none',
  };
  const costToBL: Record<ValueCostTag, import('../domain/types').BottomLine[]> = {
    'health-cost': ['health'],
    'unstable-life': ['safety-boundary'],
    'sacrifice-relation': ['relationship'],
    'authenticity-cost': ['authenticity'],
    'dignity-cost': ['dignity'],
    none: [],
  };
  return data.candidates.map((c) => {
    const tags: ValueCostTag[] = (c.value_cost_tags ?? []).map((t) => mapCost[t] ?? 'none');
    // 冲突判断
    let vetoReason: string | undefined;
    for (const t of tags) {
      for (const bl of costToBL[t]) {
        if (bottomLines.includes(bl)) {
          vetoReason = `与底线价值[${bl}]冲突: ${t}`;
          break;
        }
      }
    }
    return {
      id: uuid(),
      source: 'external_ai',
      industry: c.industry,
      profession: c.profession,
      position: c.position,
      quadrant: 'invest',
      valueCostTags: tags.length > 0 ? tags : ['none'],
      planB: c.plan_b?.direction,
      planC: c.plan_c?.direction,
      reasoning: c.match_reason
        ? {
            personality: c.match_reason.personality_fit,
            ability: c.match_reason.ability_fit,
            value: c.match_reason.value_fit,
            interest: c.match_reason.interest_fit,
          }
        : undefined,
      vetoReason,
      aiConfidence: c.salary_range?.confidence,
    };
  });
}
