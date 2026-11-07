import { useMemo, useRef, useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Gauge, ShieldAlert, Sparkles, Users, Zap } from 'lucide-react';
import { PageHeader } from '../PageHeader';
import {
  ABILITY_LIE_SCALE,
  ABILITY_QUESTIONS_FULL,
  ABILITY_QUESTIONS_LIKERT,
  ABILITY_QUESTIONS_LIKERT_SHORT,
  ABILITY_QUESTIONS_SHORT,
  EXTERNAL_FEEDBACK_CARDS,
  MBTI_LIE_SCALE,
  MBTI_QUESTIONS_LIKERT,
  MBTI_QUESTIONS_LIKERT_SHORT,
  MBTI_QUESTIONS_SHORT,
  PROJECTION_QUESTIONS,
  VALUE_LIE_SCALE,
  VALUE_QUESTIONS_FULL,
  VALUE_QUESTIONS_SHORT,
  checkLieScaleConsistency,
  computeAnswerCredibilityScore,
  createBlankAssessment,
  deriveAbilityCalibration,
  detectAchievementMotives,
  generateCareerReport,
  generateValueStatement,
  saveAssessment,
  saveReport,
  scoreAbility,
  scoreAbilityLikert,
  scoreMBTI,
  scoreMBTILikert,
  scoreValueQuestions,
} from '../../services/careerAssessment';
import { deriveLiteracyProfile, literacyToAbilityCalibration } from '../../services/literacy';
import { getAllRecords } from '../../services/localDB';
import type { AbilityEightDim, CareerAssessment, GradeLevel } from '../../domain/types';
import { getCareerCopy } from '../../domain/careerCopy';

type AssessmentVersion = 'short' | 'full';
const LIKERT_LABELS = ['强烈不同意', '不同意', '中立', '同意', '强烈同意'] as const;
const LIKERT_VALUES = [-2, -1, 0, 1, 2] as const;
type LikertValue = (typeof LIKERT_VALUES)[number];

type Section = 'intro' | 'values' | 'mbti' | 'ability' | 'projection' | 'external' | 'submit';

interface Props {
  gradeLevel: GradeLevel;
  studentId?: string;
  onComplete: (reportId: string) => void;
  onCancel: () => void;
}

/** V5.11 Bug #015 修复:
 * 干扰项位置改为**每次作答随机生成**,不再固定 [4,9,13] 等位置。
 * 位置分布约束:
 * - 首题不能是干扰项(避免开头就暴露测试意图)
 * - 干扰项之间间隔至少 3 题(避免连续 lie 一眼识破)
 * - 使用作答开始时间戳作为 seed,同一会话内位置一致 (刷新页面重新随机)
 */
function generateLiePositions(totalMain: number, totalLies: number, seed: number): number[] {
  const total = totalMain + totalLies;
  const minGap = 3; // 干扰项之间最小间隔
  const positions: number[] = [];
  // 简易 PRNG: mulberry32
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const candidates: number[] = [];
  for (let i = 2; i < total - 1; i++) candidates.push(i); // 首题+末题避开
  // 洗牌
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const c of candidates) {
    if (positions.every((p) => Math.abs(p - c) >= minGap)) {
      positions.push(c);
      if (positions.length === totalLies) break;
    }
  }
  return positions.sort((a, b) => a - b);
}

/** 把主题目与干扰项按预设位置混合成显示序列 */
function interleave<T, L>(main: T[], lies: L[], positions: number[]): Array<{ kind: 'main' | 'lie'; item: T | L }> {
  const out: Array<{ kind: 'main' | 'lie'; item: T | L }> = [];
  let mainIdx = 0;
  let lieIdx = 0;
  const total = main.length + lies.length;
  const posSet = new Set(positions);
  for (let i = 0; i < total; i++) {
    if (posSet.has(i) && lieIdx < lies.length) {
      out.push({ kind: 'lie', item: lies[lieIdx++] });
    } else if (mainIdx < main.length) {
      out.push({ kind: 'main', item: main[mainIdx++] });
    } else if (lieIdx < lies.length) {
      out.push({ kind: 'lie', item: lies[lieIdx++] });
    }
  }
  return out;
}

export function CareerAssessmentFlow({ gradeLevel, studentId, onComplete, onCancel }: Props) {
  const [section, setSection] = useState<Section>('intro');
  // V5.12 · 测评版本选择:简短(71 题) / 完整(141 题带李克特与权重)
  const [version, setVersion] = useState<AssessmentVersion>('short');
  const [valueAnswers, setValueAnswers] = useState<Record<string, string | string[]>>({});
  const [mbtiAnswers, setMbtiAnswers] = useState<Record<string, 'A' | 'B'>>({});
  // V5.12 · 完整版李克特 5 档作答(-2 强烈不同意 → +2 强烈同意)
  const [mbtiLikertAnswers, setMbtiLikertAnswers] = useState<Record<string, LikertValue>>({});
  const [abilityAnswers, setAbilityAnswers] = useState<Record<string, 1 | 2 | 3 | 4>>({});
  // V5.12 · 能力检测完整版李克特 5 档
  const [abilityLikertAnswers, setAbilityLikertAnswers] = useState<Record<string, LikertValue>>({});
  // V5.11 · 投射题(可选)
  const [projectionAnswers, setProjectionAnswers] = useState<Record<string, string[]>>({});
  // V5.11 · 他评校准卡录入(可选);V5.12 · 改为纯勾选,answer 可空
  const [externalFeedback, setExternalFeedback] = useState<
    Array<{ questionId: string; answer?: string; selectedOptions?: string[]; tags: string[] }>
  >([]);
  const [busy, setBusy] = useState(false);

  // V5.11 §31.2 · 记录作答开始时间(用于时长合理性评分)
  const startedAtRef = useRef<string>(new Date().toISOString());

  // V5.11 Bug #015 修复:每次作答会话使用不同 seed 生成干扰项位置,避免"位置固定"被识别
  const liePositionSeedRef = useRef<number>(Date.now());
  // V5.12 · 简短版/完整版整体切换:
  // - 价值观:15→45(简短保留 15+3 干扰)
  // - MBTI/能力两个版本都改用李克特 5 档,只是题库大小不同(24/93 · 24/72)
  const activeValueQuestions = version === 'full' ? VALUE_QUESTIONS_FULL : VALUE_QUESTIONS_SHORT;
  const activeAbilityQuestions = version === 'full' ? ABILITY_QUESTIONS_FULL : ABILITY_QUESTIONS_SHORT;
  const activeMbtiLikertQuestions = version === 'full' ? MBTI_QUESTIONS_LIKERT : MBTI_QUESTIONS_LIKERT_SHORT;
  const activeAbilityLikertQuestions = version === 'full' ? ABILITY_QUESTIONS_LIKERT : ABILITY_QUESTIONS_LIKERT_SHORT;
  const valueMerged = useMemo(
    () =>
      interleave(
        activeValueQuestions,
        VALUE_LIE_SCALE,
        generateLiePositions(activeValueQuestions.length, VALUE_LIE_SCALE.length, liePositionSeedRef.current ^ 0x11),
      ),
    [activeValueQuestions],
  );
  const mbtiMerged = useMemo(
    () =>
      interleave(
        MBTI_QUESTIONS_SHORT,
        MBTI_LIE_SCALE,
        generateLiePositions(MBTI_QUESTIONS_SHORT.length, MBTI_LIE_SCALE.length, liePositionSeedRef.current ^ 0x22),
      ),
    [],
  );
  const abilityMerged = useMemo(
    () =>
      interleave(
        activeAbilityQuestions,
        ABILITY_LIE_SCALE,
        generateLiePositions(activeAbilityQuestions.length, ABILITY_LIE_SCALE.length, liePositionSeedRef.current ^ 0x33),
      ),
    [activeAbilityQuestions],
  );

  // 完成检测:主题目 + 干扰项都必须作答
  const valueDone = useMemo(() => {
    const mainDone = activeValueQuestions.every((q) =>
      q.type === 'multi-select-8-3'
        ? (valueAnswers[q.id] as string[])?.length === 3
        : !!valueAnswers[q.id],
    );
    const lieDone = VALUE_LIE_SCALE.every((l) => !!valueAnswers[l.id]);
    return mainDone && lieDone;
  }, [valueAnswers, activeValueQuestions]);

  // V5.12 · MBTI/能力两个版本都用李克特:每题(含中立 0)都需作答
  const mbtiDone = useMemo(
    () => activeMbtiLikertQuestions.every((q) => mbtiLikertAnswers[q.id] !== undefined),
    [activeMbtiLikertQuestions, mbtiLikertAnswers],
  );

  const abilityDone = useMemo(
    () => activeAbilityLikertQuestions.every((q) => abilityLikertAnswers[q.id] !== undefined),
    [activeAbilityLikertQuestions, abilityLikertAnswers],
  );

  const submit = async () => {
    setBusy(true);
    try {
      // 只把主题目参与打分,干扰项排除
      const mainValueAnswers: Record<string, string | string[]> = {};
      for (const q of activeValueQuestions) {
        if (valueAnswers[q.id] !== undefined) mainValueAnswers[q.id] = valueAnswers[q.id];
      }
      const values = scoreValueQuestions(mainValueAnswers);
      // V5.12 · 简短版 & 完整版都走加权 Likert 算法(简短版传入 24 题 subset)
      const personality = scoreMBTILikert(mbtiLikertAnswers, activeMbtiLikertQuestions);

      // V5.12 · 从训练记录 + 素养 + 能力缺口 派生系统校准数据,融合到能力雷达
      const [allTrainings, allGaps, allAbilities, allReviews] = await Promise.all([
        getAllRecords('trainings') as Promise<import('../../domain/types').TrainingRecord[]>,
        getAllRecords('gaps') as Promise<import('../../domain/types').AbilityGap[]>,
        getAllRecords('abilities') as Promise<import('../../domain/types').AbilitySnapshot[]>,
        getAllRecords('reviews') as Promise<import('../../domain/types').ReviewRecord[]>,
      ]);
      const trainingCalibration = deriveAbilityCalibration(allTrainings, allGaps, allAbilities);
      const literacyProfile = deriveLiteracyProfile(gradeLevel, allTrainings, allReviews, allGaps);
      const literacyCalibration = literacyToAbilityCalibration(literacyProfile);
      // 合并两种校准:同维度取平均;仅一方有则用该方
      const merged: Partial<Record<AbilityEightDim, number>> = {};
      const allDims: AbilityEightDim[] = ['structure', 'metacognition', 'endurance', 'expression',
        'logic-tool', 'probability', 'emotion-shield', 'cross-domain'];
      for (const d of allDims) {
        const t = trainingCalibration[d];
        const l = literacyCalibration[d];
        if (typeof t === 'number' && typeof l === 'number') merged[d] = Math.round((t + l) / 2);
        else if (typeof t === 'number') merged[d] = t;
        else if (typeof l === 'number') merged[d] = l;
      }
      // V5.12 · 无系统数据 → 传 undefined,让 scoreAbilityLikert 完全走自评
      const systemCalibration: Partial<Record<AbilityEightDim, number>> | undefined =
        Object.keys(merged).length > 0 ? merged : undefined;

      const abilityLikertResult = scoreAbilityLikert(
        abilityLikertAnswers,
        activeAbilityLikertQuestions,
        systemCalibration,
      );
      const abilityResult = {
        scores: abilityLikertResult.scores,
        selfOnly: (Object.keys(abilityLikertResult.scores) as AbilityEightDim[])
          .filter((d) => !(abilityLikertResult.calibratedFromSystem ?? []).includes(d)),
        calibratedFromSystem: abilityLikertResult.calibratedFromSystem ?? [],
        confidence: abilityLikertResult.confidence,
        topStrengths: abilityLikertResult.topStrengths,
        developAreas: abilityLikertResult.developAreas,
        levelBucket: abilityLikertResult.levelBucket,
        patterns: abilityLikertResult.patterns,
        consistencyNote: abilityLikertResult.consistencyNote,
      };
      const now = new Date().toISOString();

      // V5.11 §31.2 · 干扰项一致性校验(MBTI/能力干扰题已在李克特版本移除,仅价值观保留)
      const lieResponses = checkLieScaleConsistency(VALUE_LIE_SCALE, valueAnswers);
      const totalQ =
        activeValueQuestions.length + VALUE_LIE_SCALE.length +
        activeMbtiLikertQuestions.length +
        activeAbilityLikertQuestions.length;
      const credibility = computeAnswerCredibilityScore({
        lieScaleResponses: lieResponses,
        answers: { ...valueAnswers, ...mbtiLikertAnswers, ...abilityLikertAnswers },
        startedAt: startedAtRef.current,
        finishedAt: now,
        totalQuestions: totalQ,
      });

      // V5.11 §31.3 · 六种成就动机推断
      const achievementMotives = detectAchievementMotives(mainValueAnswers);

      // V5.11 §31.3 · 投射题结果(标签汇总)
      const projectionInsights = PROJECTION_QUESTIONS
        .filter((q) => (projectionAnswers[q.id] ?? []).length > 0)
        .map((q) => {
          const picks = projectionAnswers[q.id] ?? [];
          const tags = q.options.filter((o) => picks.includes(o.text)).flatMap((o) => o.tags ?? []);
          return { questionId: q.id, selectedOptions: picks, tags: Array.from(new Set(tags)) };
        });

      const base = createBlankAssessment(gradeLevel, studentId);
      const assessment: CareerAssessment = {
        ...base,
        values: {
          ...values,
          achievementMotives,
          projectionInsights: projectionInsights.length > 0 ? projectionInsights : undefined,
          externalFeedback: externalFeedback.length > 0 ? externalFeedback : undefined,
        },
        ability: abilityResult,
        personality,
        credibilityScore: credibility,
        lieScaleResponses: lieResponses,
        startedAt: startedAtRef.current,
        finishedAt: now,
        updatedAt: now,
      };
      // V5.11 · 一句话价值观说明书(先算再写回)
      assessment.values.valueStatement = generateValueStatement(assessment);

      await saveAssessment(assessment);
      const report = generateCareerReport(assessment);
      await saveReport(report);
      onComplete(report.id);
    } finally {
      setBusy(false);
    }
  };

  const copy = getCareerCopy(gradeLevel);
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <PageHeader
        title={copy.flowTitle}
        description={copy.flowDescription}
        actions={
          <button className="btn-ghost" onClick={onCancel}>
            <ArrowLeft size={14} /> 返回列表
          </button>
        }
      />

      {/* V5.11 优化点 #002 修复 · V5.12 简短/完整版统一按李克特题库统计 */}
      <AssessmentProgressBar
        section={section}
        valueMerged={valueMerged}
        mbtiLikertQuestions={activeMbtiLikertQuestions}
        abilityLikertQuestions={activeAbilityLikertQuestions}
        valueAnswers={valueAnswers}
        mbtiLikertAnswers={mbtiLikertAnswers}
        abilityLikertAnswers={abilityLikertAnswers}
      />

      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        {(['intro', 'values', 'mbti', 'ability', 'projection', 'external', 'submit'] as Section[]).map((s, i) => (
          <span
            key={s}
            className={`px-2 py-1 rounded ${section === s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            {i + 1}.{' '}
            {s === 'intro' ? '开始' :
              s === 'values' ? '价值观' :
              s === 'mbti' ? 'MBTI' :
              s === 'ability' ? '能力检测' :
              s === 'projection' ? '投射题(可选)' :
              s === 'external' ? '他评校准(可选)' : '提交'}
          </span>
        ))}
      </div>

      {section === 'intro' && (
        <div className="card p-6 space-y-4">
          {/* V5.12 · 整体版本选择:简短 71 题 vs 完整 206 题 */}
          <div className="text-sm text-slate-600 font-semibold flex items-center gap-2">
            <Gauge size={16} className="text-blue-600" /> 选择测评版本
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <VersionCard
              active={version === 'short'}
              onClick={() => setVersion('short')}
              icon={<Zap size={18} className="text-emerald-600" />}
              title="简短版 · 66 题"
              subtitle="约 12-15 分钟 · 快速定位(李克特精简)"
              features={[
                '价值观鉴定 15 题 + 3 干扰',
                'MBTI 24 题 · 5 档李克特 · 每维含 1 反向题',
                '能力检测 24 题 · 8 维 × 3 题 · 每维含 1 反向',
                '与完整版共享加权算法 + 反向题一致性调和',
                'Top 3 优势 + 待发展 + 边缘型标注',
              ]}
            />
            <VersionCard
              active={version === 'full'}
              onClick={() => setVersion('full')}
              icon={<Sparkles size={18} className="text-purple-600" />}
              title="完整版 · 213 题(推荐)"
              subtitle="约 60-80 分钟 · 精准诊断"
              features={[
                '价值观鉴定 45 题 + 3 干扰(含 30 题成就动机细分)',
                'MBTI 93 题 · 5 档李克特 · 每题带权重',
                '能力检测 72 题 · 每维 9 题(3 反向)加权',
                '每维置信度 + Top 3 优势 + 待发展 + 跨维度模式',
                '输出边缘型标注(如 IxTJ)+ "系统思维者"等诊断',
              ]}
              highlight
            />
          </div>

          <div className="border-t pt-3">
            <h3 className="font-semibold text-sm">测评组成 · 当前选择:{version === 'full' ? `完整版 ${activeValueQuestions.length + VALUE_LIE_SCALE.length + MBTI_QUESTIONS_LIKERT.length + ABILITY_QUESTIONS_LIKERT.length} 题` : `简短版 ${activeValueQuestions.length + VALUE_LIE_SCALE.length + MBTI_QUESTIONS_LIKERT_SHORT.length + ABILITY_QUESTIONS_LIKERT_SHORT.length} 题`}</h3>
            <ul className="text-sm text-slate-600 list-disc list-inside space-y-1 mt-2">
              {version === 'full' ? (
                <>
                  <li className="text-purple-700">
                    <b>价值观鉴定完整版 (45 题 + 3 干扰)</b>: 15 主题 + 30 题成就动机 & 冲突迫选深化
                  </li>
                  <li className="text-purple-700">
                    <b>MBTI 性格完整版 (93 题 · 李克特 5 档 · 30% 反向)</b>: 加权评分 + 一致性调和
                  </li>
                  <li className="text-purple-700">
                    <b>能力检测完整版 (72 题 · 每维 9 题 · 30% 反向 · 加权)</b>: 输出 Top 3 优势 + 待发展 + 跨维度模式识别
                  </li>
                </>
              ) : (
                <>
                  <li><b>价值观鉴定 (15 题 + 3 道干扰项)</b>: 判断/8 选 3/情境迫选/底线确认</li>
                  <li className="text-emerald-700">
                    <b>MBTI 性格简短版 (24 题 · 李克特 5 档 · 每维 1 反向)</b>: 与完整版共享加权算法
                  </li>
                  <li className="text-emerald-700">
                    <b>能力检测简短版 (24 题 · 8 维 × 3 题 · 每维 1 反向)</b>: Top 3 + 待发展 + 加权评分
                  </li>
                </>
              )}
              <li><b>可选:投射题 3 组</b>(敬佩/终点/情绪反应) + <b>他评校准卡 3 问</b></li>
            </ul>
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded flex items-start gap-2">
            <ShieldAlert size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <b>作答质量保障</b>:干扰项与主量表反向表述, 与你的答案会做一致性交叉校验;
              作答时间过快 / 过慢、极端选项分布也会计入可信度评分(0-100 分)。 请按第一反应作答, 不要刻意迎合。
              {version === 'full' && (
                <div className="mt-1 text-purple-700">
                  <b>完整版专属</b>:即使正反向作答出现少量矛盾,加权算法会自动依据题目权重推算真实倾向,并在报告标注置信度。
                </div>
              )}
            </div>
          </div>
          <button className="btn-primary" onClick={() => setSection('values')}>
            开始价值观鉴定 <ArrowRight size={14} />
          </button>
        </div>
      )}

      {section === 'values' && (
        <ValueSection
          merged={valueMerged}
          answers={valueAnswers}
          setAnswers={setValueAnswers}
          onNext={() => setSection('mbti')}
          onBack={() => setSection('intro')}
          done={valueDone}
        />
      )}

      {section === 'mbti' && (
        <MBTILikertSection
          questions={activeMbtiLikertQuestions}
          title={
            version === 'full'
              ? 'MBTI 性格 · 完整版 · 93 题(含 30% 反向题)'
              : 'MBTI 性格 · 简短版 · 24 题(每维 6 题 · 含 1 反向)'
          }
          answers={mbtiLikertAnswers}
          setAnswers={setMbtiLikertAnswers}
          onNext={() => setSection('ability')}
          onBack={() => setSection('values')}
          done={mbtiDone}
        />
      )}

      {section === 'ability' && (
        <AbilityLikertSection
          questions={activeAbilityLikertQuestions}
          title={
            version === 'full'
              ? '能力检测 · 完整版 · 72 题(含 30% 反向题)'
              : '能力检测 · 简短版 · 24 题(每维 3 题 · 含 1 反向)'
          }
          answers={abilityLikertAnswers}
          setAnswers={setAbilityLikertAnswers}
          onNext={() => setSection('projection')}
          onBack={() => setSection('mbti')}
          done={abilityDone}
        />
      )}

      {section === 'projection' && (
        <ProjectionSection
          answers={projectionAnswers}
          setAnswers={setProjectionAnswers}
          onNext={() => setSection('external')}
          onBack={() => setSection('ability')}
          onSkip={() => setSection('external')}
        />
      )}

      {section === 'external' && (
        <ExternalFeedbackSection
          items={externalFeedback}
          setItems={setExternalFeedback}
          onNext={() => setSection('submit')}
          onBack={() => setSection('projection')}
          onSkip={() => setSection('submit')}
        />
      )}

      {section === 'submit' && (
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <CheckCircle2 className="text-emerald-500" /> 所有作答已完成
          </h2>
          <p className="text-sm text-slate-600">
            系统将自动汇总生成职业定位报告(兴趣×能力四象限 + 三定输出 + 双路线 + 作答可信度评分)。
          </p>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setSection('external')}>
              <ArrowLeft size={14} /> 返回修改
            </button>
            <button className="btn-primary" disabled={busy} onClick={submit}>
              {busy ? '生成中...' : '生成报告'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 子测评组件(支持干扰项混排) ====================

type ValueQ = (typeof VALUE_QUESTIONS_SHORT)[number];
type ValueL = (typeof VALUE_LIE_SCALE)[number];
type MBTIQ = (typeof MBTI_QUESTIONS_SHORT)[number];
type MBTIL = (typeof MBTI_LIE_SCALE)[number];
type AbilityQ = (typeof ABILITY_QUESTIONS_SHORT)[number];
type AbilityL = (typeof ABILITY_LIE_SCALE)[number];

function ValueSection({
  merged,
  answers,
  setAnswers,
  onNext,
  onBack,
  done,
}: {
  merged: Array<{ kind: 'main' | 'lie'; item: ValueQ | ValueL }>;
  answers: Record<string, string | string[]>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>;
  onNext: () => void;
  onBack: () => void;
  done: boolean;
}) {
  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold">价值观鉴定 · {merged.length} 题(含 3 道干扰项)</h2>
      {merged.map((row, i) => {
        if (row.kind === 'lie') {
          const l = row.item as ValueL;
          return (
            <div key={l.id} className="border-b border-slate-100 pb-3">
              <div className="text-sm text-slate-800 mb-2">{i + 1}. {l.prompt}</div>
              <div className="flex gap-2">
                {(['yes', 'no'] as const).map((v) => (
                  <button
                    key={v}
                    className={`px-3 py-1.5 rounded border text-sm ${answers[l.id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                    onClick={() => setAnswers((prev) => ({ ...prev, [l.id]: v }))}
                  >
                    {v === 'yes' ? '是' : '否'}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        const q = row.item as ValueQ;
        return (
          <div key={q.id} className="border-b border-slate-100 pb-3">
            <div className="text-sm text-slate-800 mb-2">{i + 1}. {q.prompt}</div>
            {q.type === 'judgement' && (
              <div className="flex gap-2">
                {(['yes', 'no'] as const).map((v) => (
                  <button
                    key={v}
                    className={`px-3 py-1.5 rounded border text-sm ${answers[q.id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  >
                    {v === 'yes' ? '是' : '否'}
                  </button>
                ))}
              </div>
            )}
            {q.type === 'forced-choice' && (
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map((v) => (
                  <button
                    key={v}
                    className={`p-2 rounded border text-sm text-left ${answers[q.id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  >
                    {v}: {v === 'A' ? q.optionA : q.optionB}
                  </button>
                ))}
              </div>
            )}
            {q.type === 'multi-select-8-3' && (
              <div>
                <div className="text-xs text-slate-500 mb-1">选择 3 项 (已选 {((answers[q.id] as string[]) ?? []).length})</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {q.options?.map((opt) => {
                    const current = (answers[q.id] as string[]) ?? [];
                    const selected = current.includes(opt);
                    return (
                      <button
                        key={opt}
                        className={`p-2 rounded border text-sm ${selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                        onClick={() => {
                          setAnswers((prev) => {
                            const curArr = (prev[q.id] as string[]) ?? [];
                            const isSelected = curArr.includes(opt);
                            let next: string[];
                            if (isSelected) next = curArr.filter((x) => x !== opt);
                            else if (curArr.length >= 3) return prev;
                            else next = [...curArr, opt];
                            return { ...prev, [q.id]: next };
                          });
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex justify-between">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> 上一步
        </button>
        <button className="btn-primary" disabled={!done} onClick={onNext}>
          进入 MBTI <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function MBTISection({
  merged,
  answers,
  setAnswers,
  onNext,
  onBack,
  done,
}: {
  merged: Array<{ kind: 'main' | 'lie'; item: MBTIQ | MBTIL }>;
  answers: Record<string, 'A' | 'B'>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, 'A' | 'B'>>>;
  onNext: () => void;
  onBack: () => void;
  done: boolean;
}) {
  return (
    <div className="card p-5 space-y-3">
      <h2 className="font-semibold">MBTI 性格 · 31 题(含 3 道干扰项)</h2>
      <p className="text-xs text-slate-500">情境题, 无正确答案。 按你实际的反应选择。</p>
      {merged.map((row, i) => {
        if (row.kind === 'lie') {
          const l = row.item as MBTIL;
          return (
            <div key={l.id} className="border-b border-slate-100 pb-3">
              <div className="text-sm text-slate-800 mb-2">{i + 1}. {l.prompt}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(['A', 'B'] as const).map((v) => (
                  <button
                    key={v}
                    className={`p-2 rounded border text-sm text-left ${answers[l.id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                    onClick={() => setAnswers((prev) => ({ ...prev, [l.id]: v }))}
                  >
                    {v}: {v === 'A' ? '符合我' : '不符合我'}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        const q = row.item as MBTIQ;
        return (
          <div key={q.id} className="border-b border-slate-100 pb-3">
            {/* V5.11 Bug #014 修复: 去掉 (EI)/(SN)/(TF)/(JP) 维度标签, 避免暴露测试意图 */}
            <div className="text-sm text-slate-800 mb-2">
              {i + 1}. {q.prompt}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((v) => (
                <button
                  key={v}
                  className={`p-2 rounded border text-sm text-left ${answers[q.id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                >
                  {v}: {v === 'A' ? q.optionA : q.optionB}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex justify-between">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> 上一步
        </button>
        <button className="btn-primary" disabled={!done} onClick={onNext}>
          进入能力检测 <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function AbilitySection({
  merged,
  answers,
  setAnswers,
  onNext,
  onBack,
  done,
}: {
  merged: Array<{ kind: 'main' | 'lie'; item: AbilityQ | AbilityL }>;
  answers: Record<string, 1 | 2 | 3 | 4>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, 1 | 2 | 3 | 4>>>;
  onNext: () => void;
  onBack: () => void;
  done: boolean;
}) {
  const labels = ['非常不符合', '不太符合', '基本符合', '非常符合'];
  return (
    <div className="card p-5 space-y-3">
      <h2 className="font-semibold">能力检测 · 22 题(含 2 道干扰项)</h2>
      <p className="text-xs text-slate-500">"按以往的自己"评估自己在各能力维度的表现。</p>
      {merged.map((row, i) => {
        const isLie = row.kind === 'lie';
        const id = isLie ? (row.item as AbilityL).id : (row.item as AbilityQ).id;
        const prompt = isLie ? (row.item as AbilityL).prompt : (row.item as AbilityQ).prompt;
        return (
          <div key={id} className="border-b border-slate-100 pb-3">
            <div className="text-sm text-slate-800 mb-2">{i + 1}. {prompt}</div>
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as const).map((v) => (
                <button
                  key={v}
                  className={`p-2 rounded border text-xs ${answers[id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                  onClick={() => setAnswers((prev) => ({ ...prev, [id]: v }))}
                >
                  {labels[v - 1]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex justify-between">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> 上一步
        </button>
        <button className="btn-primary" disabled={!done} onClick={onNext}>
          进入投射题(可选) <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function ProjectionSection({
  answers,
  setAnswers,
  onNext,
  onBack,
  onSkip,
}: {
  answers: Record<string, string[]>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const togglePick = (qid: string, opt: string, maxSelect: number, _minSelect: number) => {
    setAnswers((prev) => {
      const curArr = prev[qid] ?? [];
      let next: string[];
      if (curArr.includes(opt)) {
        next = curArr.filter((x) => x !== opt);
      } else {
        if (maxSelect === 1) next = [opt];
        else if (curArr.length >= maxSelect) return prev;
        else next = [...curArr, opt];
      }
      return { ...prev, [qid]: next };
    });
  };

  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold">投射题 · 敬佩 / 终点 / 情绪反应(可选)</h2>
      <p className="text-xs text-slate-500">
        投射与他评结果作为"旁证信号"——与自陈排序显著错位的维度会标注"内心倾向与自评存在张力"。 可以跳过。
      </p>
      {PROJECTION_QUESTIONS.map((q) => (
        <div key={q.id} className="border-b border-slate-100 pb-3">
          <div className="text-sm text-slate-800 mb-1">{q.prompt}</div>
          <div className="text-[10px] text-slate-400 mb-2">
            {q.minSelect === q.maxSelect
              ? `请选 ${q.minSelect} 项`
              : `请选 ${q.minSelect}-${q.maxSelect} 项`}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {q.options.map((opt) => {
              const selected = (answers[q.id] ?? []).includes(opt.text);
              return (
                <button
                  key={opt.text}
                  className={`p-2 rounded border text-sm text-left ${selected ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-600'}`}
                  onClick={() => togglePick(q.id, opt.text, q.maxSelect, q.minSelect)}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex justify-between">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> 上一步
        </button>
        <div className="flex gap-2">
          <button className="btn-ghost text-slate-500" onClick={onSkip}>
            跳过
          </button>
          <button className="btn-primary" onClick={onNext}>
            下一步 <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ExternalFeedbackSection({
  items,
  setItems,
  onNext,
  onBack,
  onSkip,
}: {
  items: Array<{ questionId: string; answer?: string; selectedOptions?: string[]; tags: string[] }>;
  setItems: (
    i: Array<{ questionId: string; answer?: string; selectedOptions?: string[]; tags: string[] }>,
  ) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  /**
   * V5.12 · 他评校准卡改为纯勾选
   * - 每题预置 8 个候选描述,每个候选携带 tag 集合
   * - 用户勾选 1-3 项即可,自动汇总 tags,无需手动录入文字
   * - answer 字段保留兼容(为空)
   */
  const toggleOption = (qid: string, optionText: string, optionTags: string[]) => {
    const existing = items.find((i) => i.questionId === qid);
    const selected = existing?.selectedOptions ?? [];
    const nextSelected = selected.includes(optionText)
      ? selected.filter((t) => t !== optionText)
      : [...selected, optionText];
    // 汇总所有选中项的 tags(去重)
    const card = EXTERNAL_FEEDBACK_CARDS.find((c) => c.id === qid);
    const tags = Array.from(
      new Set(
        (card?.options ?? [])
          .filter((o) => nextSelected.includes(o.text))
          .flatMap((o) => o.tags),
      ),
    );
    if (!existing) {
      setItems([...items, { questionId: qid, selectedOptions: nextSelected, tags }]);
    } else {
      setItems(
        items.map((i) =>
          i.questionId === qid ? { ...i, selectedOptions: nextSelected, tags } : i,
        ),
      );
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold flex items-center gap-2">
        <Users size={16} /> 他评校准卡(线下询问 · 可选)
      </h2>
      <p className="text-xs text-slate-500">
        把以下 3 个问题分享给 2-3 位信任的人,把他们的回答对照下方选项勾选即可。 用于与自评做交叉。 可以跳过。
      </p>
      {EXTERNAL_FEEDBACK_CARDS.map((c) => {
        const cur = items.find((i) => i.questionId === c.id);
        const selectedCount = cur?.selectedOptions?.length ?? 0;
        return (
          <div key={c.id} className="border-b border-slate-100 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">{c.question}</div>
                <div className="text-[10px] text-slate-400 mb-2">{c.hint}</div>
              </div>
              {selectedCount > 0 && (
                <span className="badge bg-purple-100 text-purple-700 text-[10px] flex-shrink-0">
                  已选 {selectedCount}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {c.options.map((opt) => {
                const on = cur?.selectedOptions?.includes(opt.text) ?? false;
                return (
                  <button
                    key={opt.text}
                    className={`text-left p-2 rounded border text-xs transition-all ${
                      on
                        ? 'border-purple-400 bg-purple-50 text-purple-800'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                    onClick={() => toggleOption(c.id, opt.text, opt.tags)}
                  >
                    <div className="flex items-start gap-1.5">
                      <span
                        className={`flex-shrink-0 w-3.5 h-3.5 rounded border mt-0.5 flex items-center justify-center ${
                          on ? 'border-purple-500 bg-purple-500' : 'border-slate-300'
                        }`}
                      >
                        {on && <CheckCircle2 size={10} className="text-white" />}
                      </span>
                      <span>{opt.text}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-0.5 pl-5">
                      {opt.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[9px] px-1 py-0 rounded bg-slate-100 text-slate-500"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex justify-between">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> 上一步
        </button>
        <div className="flex gap-2">
          <button className="btn-ghost text-slate-500" onClick={onSkip}>
            跳过
          </button>
          <button className="btn-primary" onClick={onNext}>
            进入提交 <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}


// V5.11 优化点 #002 修复 · V5.12 简短版切换为李克特后统一按 Likert 题库统计
function AssessmentProgressBar(props: {
  section: Section;
  valueMerged: Array<{ kind: 'main' | 'lie'; item: unknown }>;
  mbtiLikertQuestions: typeof MBTI_QUESTIONS_LIKERT;
  abilityLikertQuestions: typeof ABILITY_QUESTIONS_LIKERT;
  valueAnswers: Record<string, string | string[]>;
  mbtiLikertAnswers: Record<string, LikertValue>;
  abilityLikertAnswers: Record<string, LikertValue>;
}) {
  const {
    valueMerged, mbtiLikertQuestions, abilityLikertQuestions,
    valueAnswers, mbtiLikertAnswers, abilityLikertAnswers,
  } = props;
  const mbtiTotal = mbtiLikertQuestions.length;
  const abilityTotal = abilityLikertQuestions.length;
  const total = valueMerged.length + mbtiTotal + abilityTotal;
  const mbtiAnswered = mbtiLikertQuestions.filter((q) => mbtiLikertAnswers[q.id] !== undefined).length;
  const abilityAnswered = abilityLikertQuestions.filter((q) => abilityLikertAnswers[q.id] !== undefined).length;
  const answered = Object.keys(valueAnswers).length + mbtiAnswered + abilityAnswered;
  const pct = total === 0 ? 0 : Math.min(100, Math.round((answered / total) * 100));
  return (
    <div className="card p-3 sticky top-0 z-20 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
        <span>整体进度</span>
        <span>
          <b className="text-blue-600">{answered}</b> / {total} 题 · {pct}%
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}


// ============ V5.12 · 版本选择卡片 ============
function VersionCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
  features,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-all ${
        active
          ? highlight
            ? 'border-purple-500 bg-purple-50/50 ring-2 ring-purple-200 shadow-sm'
            : 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-200 shadow-sm'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="font-semibold text-slate-900">{title}</span>
        {highlight && <span className="badge bg-purple-100 text-purple-700 text-[10px]">推荐</span>}
      </div>
      <div className="text-xs text-slate-500 mb-2">{subtitle}</div>
      <ul className="text-xs text-slate-600 space-y-0.5 list-disc list-inside">
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </button>
  );
}


// ============ V5.12 · MBTI 完整版李克特量表 ============
function MBTILikertSection({
  questions,
  title,
  answers,
  setAnswers,
  onNext,
  onBack,
  done,
}: {
  questions: typeof MBTI_QUESTIONS_LIKERT;
  title: string;
  answers: Record<string, LikertValue>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, LikertValue>>>;
  onNext: () => void;
  onBack: () => void;
  done: boolean;
}) {
  const totalCount = questions.length;
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const pct = totalCount === 0 ? 0 : Math.round((answeredCount / totalCount) * 100);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <div className="text-xs text-slate-500">
          已答 <b className="text-purple-700">{answeredCount}</b> / {totalCount} · {pct}%
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-slate-500 bg-purple-50/40 border border-purple-100 rounded p-3">
        <b>作答建议</b>:每题按你的真实感受选择。 反向题(如"独处让我感到无聊而不是放松")的判分会自动翻转;
        <b>作答一致性会加权反哺</b>——即使少量题目矛盾,权重算法会推断你的真实倾向。 中立选项(0)会算作半权,建议只在真的没有倾向时选择。
      </div>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="border-b border-slate-100 pb-3">
            <div className="text-sm text-slate-800 mb-2 flex items-start gap-2">
              <span className="text-slate-400 font-mono flex-shrink-0">{i + 1}.</span>
              <span>{q.prompt}</span>
              {q.reversed && (
                <span className="badge bg-amber-50 text-amber-600 text-[10px] ml-auto">反向</span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {LIKERT_VALUES.map((v, idx) => {
                const selected = answers[q.id] === v;
                return (
                  <button
                    key={v}
                    className={`px-1 py-1.5 text-[11px] rounded border transition-all ${
                      selected
                        ? v < 0
                          ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                          : v > 0
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-medium'
                            : 'border-slate-400 bg-slate-100 text-slate-700 font-medium'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  >
                    {LIKERT_LABELS[idx]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> 上一步
        </button>
        <button className="btn-primary" disabled={!done} onClick={onNext}>
          进入能力检测 <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}



// ============ V5.12 · 能力检测李克特量表(简短/完整共享) ============
function AbilityLikertSection({
  questions,
  title,
  answers,
  setAnswers,
  onNext,
  onBack,
  done,
}: {
  questions: typeof ABILITY_QUESTIONS_LIKERT;
  title: string;
  answers: Record<string, LikertValue>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, LikertValue>>>;
  onNext: () => void;
  onBack: () => void;
  done: boolean;
}) {
  const totalCount = questions.length;
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const pct = totalCount === 0 ? 0 : Math.round((answeredCount / totalCount) * 100);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <div className="text-xs text-slate-500">
          已答 <b className="text-purple-700">{answeredCount}</b> / {totalCount} · {pct}%
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-slate-500 bg-purple-50/40 border border-purple-100 rounded p-3">
        <b>作答建议</b>:按你以往真实表现选择,不是"我希望自己"。 反向题的判分会自动翻转;
        <b>作答一致性会加权反哺</b>——即使少量矛盾,权重算法会推断真实能力。 完成后报告将输出:
        每维置信度 · Top 3 优势 · 待发展项 · 跨维度模式识别(如"系统思维者"、"冷静决策者")。
      </div>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="border-b border-slate-100 pb-3">
            <div className="text-sm text-slate-800 mb-2 flex items-start gap-2">
              <span className="text-slate-400 font-mono flex-shrink-0">{i + 1}.</span>
              <span>{q.prompt}</span>
              {q.reversed && (
                <span className="badge bg-amber-50 text-amber-600 text-[10px] ml-auto">反向</span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {LIKERT_VALUES.map((v, idx) => {
                const selected = answers[q.id] === v;
                return (
                  <button
                    key={v}
                    className={`px-1 py-1.5 text-[11px] rounded border transition-all ${
                      selected
                        ? v < 0
                          ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                          : v > 0
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-medium'
                            : 'border-slate-400 bg-slate-100 text-slate-700 font-medium'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  >
                    {LIKERT_LABELS[idx]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={14} /> 上一步
        </button>
        <button className="btn-primary" disabled={!done} onClick={onNext}>
          进入投射题(可选) <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
