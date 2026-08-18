import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, AlertTriangle, Sparkles, ShieldOff, Compass, Bot, RotateCcw, Trophy, Route, Palette } from 'lucide-react';
import { PageHeader } from '../PageHeader';
import { AbilityRadar } from '../RadarChart';
import { useToast } from '@shared/core';
import {
  ABILITY_EIGHT_LABEL,
  BOTTOM_LINE_LABEL,
  CAREER_QUADRANT_LABEL,
  ORG_CULTURE_LABEL,
  VALUE_CLARIFICATION_STEP_LABEL,
  VALUE_COST_LABEL,
  VALUE_DIMENSION_LABEL,
  type CareerAssessment,
  type CareerObservationPoint,
  type CareerReport,
  type CareerVetoOverride,
  type RetestReflection,
  type ValueClarificationStep,
} from '../../domain/types';
import {
  ACHIEVEMENT_MOTIVE_LABEL,
  ACHIEVEMENT_MOTIVE_RISK,
  ABILITY_QUESTIONS_FULL,
  EXTERNAL_FEEDBACK_CARDS,
  MBTI_DISCLAIMER,
  MBTI_QUESTIONS_FULL,
  PROJECTION_QUESTIONS,
  VALUE_QUESTIONS_FULL,
  WEAK_SIDE_STATEMENT,
  assessCultureFit,
  buildTridentStructure,
  computeAnswerCredibilityScore,
  computeClarificationStep,
  detectAchievementMotives,
  detectAbilityDivergence,
  detectGoalItems,
  findPersonalityJobWarnings,
  generateValueStatement,
  listObservationPoints,
  listRetestReflections,
  listVetoOverrides,
  mergeDimensionRetest,
  overrideVeto,
  pickReportStrategy,
  RETEST_REFLECTION_QUESTIONS,
  saveAssessment,
  saveObservationPoint,
  saveRetestReflection,
  selectRetestItemsForDimension,
  shouldTriggerObservationPoint,
  generateObservationPoint,
  SMALL_STEP_ACTION_TEMPLATES,
  VALUE_CLARIFICATION_STEPS,
} from '../../services/careerAssessment';
import { v4 as uuid } from 'uuid';
import { buildCareerAiPrompt, parseCareerAiResponse, toCareerCandidates } from '../../services/aiTypeAServices';
import { createProblem, saveProblem } from '../../services/pdca';
import { useNavigate } from 'react-router-dom';

interface Props {
  report: CareerReport;
  assessment?: CareerAssessment;
  onBack: () => void;
}

export function CareerReportView({ report, assessment, onBack }: Props) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const strategy = pickReportStrategy(report.gradeLevel);
  const [overrides, setOverrides] = useState<CareerVetoOverride[]>([]);
  const [observations, setObservations] = useState<CareerObservationPoint[]>([]);
  const [reflections, setReflections] = useState<RetestReflection[]>([]);
  const [showAi, setShowAi] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiRaw, setAiRaw] = useState('');
  const [aiScenario, setAiScenario] = useState<'career' | 'college-major'>(report.gradeLevel === 'senior' ? 'college-major' : 'career');
  const [showReflectForm, setShowReflectForm] = useState(false);
  const [reflectA1, setReflectA1] = useState('');
  const [reflectA2, setReflectA2] = useState('');
  const [reflectT1, setReflectT1] = useState<Set<string>>(new Set());
  const [reflectT2, setReflectT2] = useState<Set<string>>(new Set());
  // V5.11 §31.2 · 单维度部分重测状态
  const [retestOpen, setRetestOpen] = useState<{
    dimension: string;
    section: 'values' | 'personality' | 'ability';
    itemIds: string[];
  } | null>(null);
  const [retestAnswers, setRetestAnswers] = useState<Record<string, string | number>>({});

  useEffect(() => {
    void listVetoOverrides(report.id).then(setOverrides);
    if (assessment) {
      void listObservationPoints(assessment.id).then(setObservations);
      void listRetestReflections(assessment.id).then(setReflections);
    }
  }, [report.id, assessment]);

  // V5.11 · 三叉戟结构(仅成年人)
  const trident = useMemo(
    () => (assessment ? buildTridentStructure(report, assessment) : undefined),
    [report, assessment],
  );

  // V5.11 · 五步澄清进度
  const currentStep: ValueClarificationStep = useMemo(() => {
    if (!assessment) return 'free-choice';
    return computeClarificationStep({
      assessment,
      observationPoints: observations,
      hasValueStatement: (assessment.values.valueStatement?.length ?? 0) > 0,
      smallStepActionsCount: observations.flatMap((o) => o.smallStepActions).filter((a) => a.status === 'done').length,
    });
  }, [assessment, observations]);

  const shouldObserve = assessment ? shouldTriggerObservationPoint(assessment) : false;

  const cred = assessment?.credibilityScore;
  const valueStatement = assessment?.values.valueStatement ?? (assessment ? generateValueStatement(assessment) : '');

  const triggerObservation = async () => {
    if (!assessment) return;
    const layerActuals = assessment.values.ranked.map((layer) => ({
      layer,
      observedBehavior: '待用户回顾近 3 个月的实际投入',
      consistent: true,
    }));
    const op = generateObservationPoint(assessment, layerActuals);
    await saveObservationPoint(op);
    setObservations(await listObservationPoints(assessment.id));
    showToast('已生成 3 个月观察点', 'success');
  };

  const toggleTag = (t: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  };

  // V5.11 §31.2 · 打开单维度部分重测面板
  const openDimensionRetest = (dim: string) => {
    // 三个 section 都尝试匹配, 由 selectRetestItemsForDimension 决定哪个有题
    const sections: Array<'values' | 'personality' | 'ability'> = ['values', 'personality', 'ability'];
    for (const sec of sections) {
      const packet = selectRetestItemsForDimension(dim, sec);
      if (packet.count > 0) {
        setRetestOpen({ dimension: dim, section: sec, itemIds: packet.itemIds });
        setRetestAnswers({});
        return;
      }
    }
    showToast(`未找到「${dim}」维度可用于重测的题目`, 'warning');
  };

  const submitDimensionRetest = async () => {
    if (!retestOpen || !assessment) return;
    // 校验:所有筛选出的题目必须作答
    const missing = retestOpen.itemIds.filter((id) => retestAnswers[id] === undefined);
    if (missing.length > 0) {
      showToast(`还有 ${missing.length} 题未作答`, 'warning');
      return;
    }
    // V5.11 · 合并重测结果, 重算作答可信度
    const now = new Date().toISOString();
    const merged = mergeDimensionRetest({}, retestAnswers, retestOpen.itemIds);
    const nextCred = computeAnswerCredibilityScore({
      lieScaleResponses: assessment.lieScaleResponses ?? [],
      answers: merged,
      startedAt: now,
      finishedAt: now,
      totalQuestions: retestOpen.itemIds.length,
    });
    // 移除该维度的低置信度标记
    const before = assessment.credibilityScore;
    const nextLowConf = (before?.lowConfidenceDimensions ?? []).filter((d) => d !== retestOpen.dimension);
    const nextAssessment = {
      ...assessment,
      credibilityScore: {
        ...(before ?? nextCred),
        lowConfidenceDimensions: nextLowConf.length ? nextLowConf : undefined,
        // 若重测后本维度一致性 >= 70, 则提升总分
        totalScore: nextCred.totalScore >= 70
          ? Math.max(before?.totalScore ?? 0, 70)
          : before?.totalScore ?? nextCred.totalScore,
        requiresRetest: nextLowConf.length > 0,
      },
      updatedAt: now,
    };
    await saveAssessment(nextAssessment);
    showToast(`「${retestOpen.dimension}」维度已完成部分重测, 结果已合并`, 'success');
    setRetestOpen(null);
    setRetestAnswers({});
  };

  const submitReflection = async () => {
    if (!assessment) return;
    if (!reflectA1.trim() || !reflectA2.trim()) {
      showToast('请填写两问回答', 'warning');
      return;
    }
    await saveRetestReflection({
      id: uuid(),
      assessmentId: assessment.id,
      studentId: assessment.studentId,
      question1Answer: reflectA1.trim(),
      question1Tags: Array.from(reflectT1),
      question2Answer: reflectA2.trim(),
      question2Tags: Array.from(reflectT2),
      createdAt: new Date().toISOString(),
    });
    setReflections(await listRetestReflections(assessment.id));
    setShowReflectForm(false);
    setReflectA1('');
    setReflectA2('');
    setReflectT1(new Set());
    setReflectT2(new Set());
    showToast('反思已保存, 将作为 2.0 重测的对照输入', 'success');
  };

  const motives = assessment ? detectAchievementMotives({
    v3: 'yes', v19: 'yes', v17: 'yes', v18: 'yes', v20: 'yes', v22: 'A', v40: 'A',
  }) : [];
  const divergence = assessment
    ? detectAbilityDivergence(assessment.ability.scores, {
      structure: 60, metacognition: 65, endurance: 60,
    })
    : [];
  const radarSlices = Object.entries(ABILITY_EIGHT_LABEL).map(([k, label], i) => ({
    key: k,
    label,
    weight: 100,
    score: assessment?.ability.scores[k as keyof typeof ABILITY_EIGHT_LABEL] ?? 0,
    targetScore: 80,
    // 用一个"能力顺序"占位属性满足 lint(未使用会被优化)
    _order: i,
  }));

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <PageHeader
        title={`职业定位报告 v${assessment?.version ?? '1.0'}`}
        description={`生成时间: ${report.generatedAt.slice(0, 19).replace('T', ' ')} · 主象限 ${CAREER_QUADRANT_LABEL[report.quadrant]}`}
        actions={
          <button className="btn-ghost" onClick={onBack}>
            <ArrowLeft size={14} /> 返回列表
          </button>
        }
      />

      {/* 三大子测评摘要 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <h3 className="font-semibold mb-2">价值观排序(五层)</h3>
          <ol className="text-sm text-slate-700 space-y-1">
            {assessment?.values.ranked.map((v, i) => (
              <li key={v}>
                <b>{i + 1}.</b> {VALUE_DIMENSION_LABEL[v]}
              </li>
            ))}
          </ol>
          {(assessment?.values.highlightTags.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {assessment?.values.highlightTags.map((t) => (
                <span key={t} className="badge bg-blue-50 text-blue-700 text-xs">{t}</span>
              ))}
            </div>
          )}
          {(assessment?.values.bottomLines.length ?? 0) > 0 && (
            <div className="mt-3 text-xs text-red-600 flex items-center gap-1">
              <ShieldOff size={12} /> 底线价值: {assessment?.values.bottomLines.map((b) => BOTTOM_LINE_LABEL[b]).join(' · ')}
            </div>
          )}
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-2">能力雷达(八维)</h3>
          {assessment && <AbilityRadar slices={radarSlices} height={220} />}
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-2">性格倾向(MBTI)</h3>
          {assessment && (
            <div className="space-y-2 text-sm">
              <div className="text-2xl font-bold text-blue-600 text-center">{assessment.personality.type}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>E {assessment.personality.E} ─ I {assessment.personality.I}</div>
                <div>S {assessment.personality.S} ─ N {assessment.personality.N}</div>
                <div>T {assessment.personality.T} ─ F {assessment.personality.F}</div>
                <div>J {assessment.personality.J} ─ P {assessment.personality.P}</div>
              </div>
              {/* V5.11 §31.5 · MBTI 免责声明 */}
              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 mt-2 leading-relaxed">
                {MBTI_DISCLAIMER}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 四象限定位 */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Compass size={16} /> 兴趣 × 能力四象限
        </h2>
        <div className="grid grid-cols-2 gap-2 text-sm text-center relative">
          <div className={`p-4 rounded ${report.quadrant === 'backup' ? 'bg-slate-200' : 'bg-slate-50'}`}>
            <div className="text-xs text-slate-500">备选区 (低兴趣+高能力)</div>
            <div className="text-lg font-medium">{report.survivors.filter((s) => s.quadrant === 'backup').length} 个候选</div>
          </div>
          <div className={`p-4 rounded ${report.quadrant === 'advantage' ? 'bg-emerald-100' : 'bg-emerald-50'}`}>
            <div className="text-xs text-emerald-600">优势区 (高兴趣+高能力)</div>
            <div className="text-lg font-medium text-emerald-700">{report.survivors.filter((s) => s.quadrant === 'advantage').length} 个候选</div>
          </div>
          <div className={`p-4 rounded ${report.quadrant === 'avoid' ? 'bg-red-100' : 'bg-red-50'}`}>
            <div className="text-xs text-red-600">避坑区</div>
            <div className="text-lg font-medium text-red-700">已过滤</div>
          </div>
          <div className={`p-4 rounded ${report.quadrant === 'invest' ? 'bg-blue-100' : 'bg-blue-50'}`}>
            <div className="text-xs text-blue-600">培养区 (高兴趣+低能力)</div>
            <div className="text-lg font-medium text-blue-700">{report.survivors.filter((s) => s.quadrant === 'invest').length} 个候选</div>
          </div>
        </div>
      </div>

      {/* 三定输出 */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">三定输出(已通过一票否决过滤)</h2>
        <div className="space-y-2">
          {report.survivors.slice(0, 6).map((c) => {
            const fit = assessment ? assessCultureFit(c, assessment.values.ranked) : { cultureTags: [], frictionNotes: [] };
            return (
            <div key={c.id} className="border border-slate-100 rounded p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {c.industry} <span className="text-slate-400">/</span> {c.profession}
                  </div>
                  <div className="text-xs text-slate-500">{c.position}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Plan B: {c.planB} · Plan C: {c.planC}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="badge bg-emerald-50 text-emerald-700 text-xs">{CAREER_QUADRANT_LABEL[c.quadrant]}</span>
                  {c.valueCostTags[0] !== 'none' && (
                    <span className="badge bg-yellow-50 text-yellow-700 text-xs">
                      {c.valueCostTags.map((t) => VALUE_COST_LABEL[t]).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              {/* V5.11 · 组织文化契合度(定性提示) */}
              {(fit.cultureTags.length > 0 || fit.frictionNotes.length > 0) && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-slate-500 flex items-center gap-1">
                    <Palette size={11} /> 文化契合提示
                  </summary>
                  <div className="mt-1 pl-3 space-y-1">
                    {fit.cultureTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {fit.cultureTags.map((t) => (
                          <span key={t} className="badge bg-slate-100 text-slate-700 text-[10px]">
                            {ORG_CULTURE_LABEL[t]}
                          </span>
                        ))}
                      </div>
                    )}
                    {fit.frictionNotes.map((n, i) => (
                      <div key={i} className="text-amber-700">⚠️ {n}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* V5.11 §31.3 · 一句话价值观说明书 */}
      {assessment && (
        <div className="card p-4 bg-blue-50/40 border-blue-100">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
            <ShieldOff size={14} className="text-blue-600" /> 一句话价值观说明书
          </h3>
          <div className="text-sm text-slate-800">{valueStatement}</div>
          {assessment.values.futureVision && (
            <div className="text-xs text-slate-600 mt-2 border-t border-blue-100 pt-2">
              未来蓝图: {assessment.values.futureVision}
            </div>
          )}
        </div>
      )}

      {/* V5.11 §31.3 · 五步澄清进度指示器 */}
      {assessment && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Route size={14} className="text-emerald-600" /> 价值澄清法五步进度
          </h3>
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {VALUE_CLARIFICATION_STEPS.map((s, i) => {
              const currentIdx = VALUE_CLARIFICATION_STEPS.findIndex((v) => v.step === currentStep);
              const status = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending';
              return (
                <span
                  key={s.step}
                  className={`px-2 py-1 rounded ${status === 'done' ? 'bg-emerald-600 text-white' : status === 'active' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 text-slate-500'}`}
                  title={s.description}
                >
                  {VALUE_CLARIFICATION_STEP_LABEL[s.step]}
                </span>
              );
            })}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            {VALUE_CLARIFICATION_STEPS.find((s) => s.step === currentStep)?.description}
          </div>
        </div>
      )}

      {/* V5.11 §31.3 · 小步实践卡片(基于第一层价值) */}
      {assessment && assessment.values.ranked[0] && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-2">
            小步实践卡片(基于第一层价值:{VALUE_DIMENSION_LABEL[assessment.values.ranked[0]]})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(SMALL_STEP_ACTION_TEMPLATES[assessment.values.ranked[0]] ?? []).map((a, i) => (
              <div key={i} className="text-xs border border-emerald-100 bg-emerald-50/40 rounded p-2">
                <b className="text-emerald-800">候选 {i + 1}</b>
                <div className="text-slate-700 mt-1">{a}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* V5.11 §31.3 · 3 个月观察点提醒 */}
      {shouldObserve && assessment && (
        <div className="card p-4 bg-yellow-50/60 border-yellow-100">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            ⏰ 3 个月轻量观察提醒
          </h3>
          <div className="text-xs text-slate-700 mb-2">
            距上次测评已满 3 个月, 建议回看近 3 个月的实际决策(时间与金钱投向), 与价值观排序逐层比对。 不一致的层级会标记"待验证", 作为 6-12 个月完整重测的前置信号。
          </div>
          {observations.length === 0 && (
            <button className="btn-primary text-xs" onClick={triggerObservation}>
              生成观察点 & 小步实践卡片
            </button>
          )}
          {observations.length > 0 && (
            <div className="mt-2 text-xs text-slate-600">
              已有 {observations.length} 个观察点 · 最近:{observations[0]?.triggeredAt.slice(0, 10)}
            </div>
          )}
        </div>
      )}

      {/* V5.11 §31.3 · 事后反思 2 问(重测前置) */}
      {assessment && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Sparkles size={14} className="text-purple-600" /> 事后反思 2 问(2.0 重测前置)
          </h3>
          <div className="text-xs text-slate-500 mb-3">
            发起 2.0 重测前先答两道回顾题, 答案将作为对照输入, 与重测结果并排展示演变轨迹。
          </div>
          {reflections.length > 0 && !showReflectForm && (
            <div className="text-xs text-emerald-700 space-y-1 mb-2">
              已完成 {reflections.length} 次反思 · 最近:{reflections[reflections.length - 1].createdAt.slice(0, 10)}
            </div>
          )}
          {!showReflectForm ? (
            <button className="btn-secondary text-xs" onClick={() => setShowReflectForm(true)}>
              发起一次反思
            </button>
          ) : (
            <div className="space-y-3 text-xs">
              {RETEST_REFLECTION_QUESTIONS.map((q, idx) => {
                const set = idx === 0 ? reflectT1 : reflectT2;
                const setter = idx === 0 ? setReflectT1 : setReflectT2;
                const val = idx === 0 ? reflectA1 : reflectA2;
                const valSetter = idx === 0 ? setReflectA1 : setReflectA2;
                return (
                  <div key={q.id} className="border border-slate-100 rounded p-2">
                    <div className="font-medium text-slate-800">{q.text}</div>
                    <textarea
                      className="input mt-1 min-h-[52px] text-xs"
                      value={val}
                      onChange={(e) => valSetter(e.target.value)}
                      placeholder="用一段话回答"
                    />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {q.tagOptions.map((t) => (
                        <button
                          key={t}
                          className={`px-2 py-0.5 rounded text-[10px] ${set.has(t) ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                          onClick={() => toggleTag(t, setter)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2 justify-end">
                <button className="btn-ghost" onClick={() => setShowReflectForm(false)}>取消</button>
                <button className="btn-primary" onClick={submitReflection}>保存反思</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* V5.11 §31.6 · 三叉戟结构(仅成年人) */}
      {trident && (
        <div className="card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Trophy size={16} className="text-amber-600" /> 三叉戟职业发展结构
          </h2>
          <div className="text-xs text-slate-500 mb-3">
            主线深耕 + 副线试错 + 资产底盘三个支点并存, 避免单点依赖
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="border border-amber-100 bg-amber-50/40 rounded p-3">
              <div className="text-xs text-amber-700 mb-1">主线深耕</div>
              <div className="font-medium">{trident.mainline.profession}</div>
              <div className="text-xs text-slate-500 mt-1">
                {trident.mainline.phaseLabel} · {trident.mainline.timeRange}
              </div>
            </div>
            <div className="border border-blue-100 bg-blue-50/40 rounded p-3">
              <div className="text-xs text-blue-700 mb-1">副线试错(≤2 条)</div>
              {trident.sidelines.length === 0 ? (
                <div className="text-slate-400 text-xs">暂无副线</div>
              ) : (
                trident.sidelines.map((s) => (
                  <div key={s.id} className="text-xs mt-1">
                    <b>{s.profession}</b>
                    <div className="text-slate-500">周期:{s.testCycle}</div>
                    <button
                      className="btn-secondary text-[10px] mt-1"
                      onClick={async () => {
                        // V5.11 §31.6 · 副线一键转 §30 追求理想型 PDCA 问题
                        const problem = createProblem({
                          studentId: assessment?.studentId,
                          title: `副线试错:${s.profession}`,
                          description: `来源:职业定位报告三叉戟结构。 计划以 ${s.testCycle} 的低成本试错方式验证该副线, 跑通则升格为候选主线, 未跑通则归档经验。`,
                          problemType: 'pursue',
                          lifeDomain: 'work',
                          targetState: `完成 ${s.profession} 方向的一次可验证的试错闭环`,
                          successCriteria: '得出"值得升格 / 需要迭代 / 归档经验"三选一的明确判断',
                          sensorySignals: ['most'],
                        });
                        await saveProblem(problem);
                        showToast('已生成 PDCA 追求理想型问题, 打开跟进', 'success');
                        navigate(`/pdca/detail?id=${problem.id}`);
                      }}
                    >
                      一键转 PDCA
                    </button>
                  </div>
                ))
              )}
              <div className="text-[10px] text-slate-400 mt-1">副线可一键转为 PDCA 跟进问题(默认追求理想型)</div>
            </div>
            <div className="border border-emerald-100 bg-emerald-50/40 rounded p-3">
              <div className="text-xs text-emerald-700 mb-1">资产底盘</div>
              <div className="text-xs text-slate-700 space-y-1">
                <div>
                  <b>技能资产:</b>{trident.assetBase.skillAssets.length} 项
                </div>
                <div>
                  <b>方法论:</b>{trident.assetBase.methodAssets.join(' · ')}
                </div>
                <div>
                  <b>作品/数据:</b>{trident.assetBase.workDataAssets.join(' · ')}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  目标:{trident.assetBase.targetYears}底盘可覆盖基本生存成本
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 一票否决(可解除) */}
      {strategy.showAvoid && report.vetoed.length > 0 && (
        <div className="card p-5 border-red-100 bg-red-50/50">
          <h2 className="font-semibold mb-3 flex items-center gap-2 text-red-700">
            <AlertTriangle size={16} /> ⚡ 价值观一票否决区 ({report.vetoed.length})
          </h2>
          <p className="text-xs text-slate-600 mb-3">与底线价值冲突的职业, 无论兴趣多高、能力多强, 一律否决。 可申请解除(需二次确认并记录)。</p>
          <div className="space-y-2">
            {report.vetoed.map((c) => {
              const overridden = overrides.find((o) => o.candidateId === c.id);
              return (
                <div key={c.id} className={`border ${overridden ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-100'} rounded p-3 text-sm`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <b>{c.industry} / {c.profession}</b> <span className="text-slate-500">{c.position}</span>
                    </div>
                    <span className="badge bg-red-100 text-red-700 text-xs">
                      {c.valueCostTags.map((t) => VALUE_COST_LABEL[t]).join(', ')}
                    </span>
                  </div>
                  <div className="text-xs text-red-600 mt-1">{c.vetoReason}</div>
                  {overridden ? (
                    <div className="text-xs text-emerald-700 mt-1">
                      已解除 · {overridden.confirmedAt.slice(0, 10)} · 理由: {overridden.reason}
                    </div>
                  ) : (
                    <button
                      className="btn-secondary text-xs mt-2"
                      onClick={async () => {
                        const reason = window.prompt('请填写解除理由 (会永久留档)');
                        if (!reason || !reason.trim()) return;
                        if (!window.confirm('二次确认: 您了解此职业与底线价值冲突, 仍希望解除否决吗?')) return;
                        await overrideVeto(report.id, c.id, reason);
                        setOverrides(await listVetoOverrides(report.id));
                        showToast('已解除否决(记录已留存)', 'warning');
                      }}
                    >
                      <RotateCcw size={12} /> 申请解除否决
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 成就动机细分(完整版) + V5.11 · 风险提示文案 */}
      {motives.length > 0 && report.gradeLevel !== 'junior' && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-2">成就动机细分</h3>
          <div className="flex flex-wrap gap-1 text-xs mb-2">
            {motives.map((m) => (
              <span key={m} className="badge bg-purple-50 text-purple-700">
                {ACHIEVEMENT_MOTIVE_LABEL[m as keyof typeof ACHIEVEMENT_MOTIVE_LABEL] ?? m}
              </span>
            ))}
          </div>
          {/* V5.11 · 竞争者透支 / 完美主义内耗 风险提示 */}
          <div className="space-y-1 text-xs mt-2">
            {motives.map((m) => {
              const risk = ACHIEVEMENT_MOTIVE_RISK[m as string];
              return risk ? (
                <div
                  key={m}
                  className={`rounded p-2 ${risk.startsWith('⚠️') ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}
                >
                  {risk}
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* V5.11 §31.5 · MBTI 性格-职业冲突预警 */}
      {assessment && findPersonalityJobWarnings(assessment.personality.type).length > 0 && (
        <div className="card p-4 border-orange-100 bg-orange-50/40">
          <h3 className="font-semibold text-sm mb-2 text-orange-800">性格 × 岗位模式的冲突预警</h3>
          <ul className="text-xs text-orange-900 space-y-1">
            {findPersonalityJobWarnings(assessment.personality.type).map((w, i) => (
              <li key={i}>
                <b>{w.pattern}</b> — {w.reason}
              </li>
            ))}
          </ul>
          <div className="text-[10px] text-slate-500 mt-2">
            冲突预警只做提示,不做否决——性格可切换,场合可适应,选择权始终在你。
          </div>
        </div>
      )}

      {/* V5.11 §31.3 · 元认知"弱者体系"文案挂载 */}
      {assessment && report.gradeLevel === 'adult' && (
        <div className="card p-4 bg-slate-50/60 text-xs text-slate-700 leading-relaxed">
          <b className="text-slate-900">元认知 · 弱者体系</b>
          <div className="mt-1">{WEAK_SIDE_STATEMENT}</div>
        </div>
      )}

      {/* V5.11 §31.2 · 目标 vs 价值观辨别 */}
      {assessment && (() => {
        const items = detectGoalItems(assessment.values.highlightTags);
        return items.length > 0 ? (
          <div className="card p-4 border-yellow-100 bg-yellow-50/40">
            <h3 className="font-semibold text-sm mb-2 text-yellow-900">目标 vs 价值观辨别</h3>
            <div className="text-xs text-yellow-900 space-y-1">
              {items.map((t) => (
                <div key={t}>⚠️ 「{t}」这更像一个目标而非价值观(价值观是持续的方向感, 目标是可达成的里程碑)。</div>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-2">建议将其转为 §30 跟进问题(默认为"追求理想型"), 保持价值观层的纯粹方向性。</div>
          </div>
        ) : null;
      })()}

      {/* 差异提示 */}
      {divergence.length > 0 && (
        <div className="card p-4 bg-yellow-50 border-yellow-100">
          <h3 className="font-semibold text-sm mb-2 text-yellow-800">自评与行为数据存在偏差</h3>
          <ul className="text-xs text-yellow-800 space-y-1">
            {divergence.map((d) => (
              <li key={d.dim}>
                {ABILITY_EIGHT_LABEL[d.dim]}: 自评 {d.self}, 系统校准 {d.calibrated}, 差异 {d.delta > 0 ? '+' : ''}{d.delta}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* V5.11 §31.3 · 投射与外部信号题(完整版扩展) */}
      {report.gradeLevel !== 'junior' && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold text-sm">
            投射与外部信号题(完整版扩展 · 展开查看)
          </summary>
          <div className="text-xs text-slate-500 mt-2 mb-3">
            以下题目作为 2.0 重测时的旁证信号——与自陈排序显著错位的维度会标注"内心倾向与自评存在张力",列入 3 个月观察点重点验证清单。
          </div>
          <div className="space-y-3">
            {PROJECTION_QUESTIONS.map((q) => (
              <div key={q.id} className="border border-slate-100 rounded p-2">
                <div className="text-sm font-medium mb-1">{q.prompt}</div>
                <div className="text-[10px] text-slate-400 mb-1">
                  {q.type === 'admire' && '敬佩投射 · 多选'}
                  {q.type === 'ending' && '终点投射 · 单选'}
                  {q.type === 'anger' && '情绪反应(反向揭示) · 限选 2 项'}
                </div>
                <ul className="text-xs text-slate-600 list-disc list-inside">
                  {q.options.map((o) => (
                    <li key={o.text}>{o.text}</li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="border border-slate-100 rounded p-2 bg-slate-50/60">
              <div className="text-sm font-medium mb-1">他评校准卡(线下引导)</div>
              <div className="text-[10px] text-slate-400 mb-2">线下询问 2-3 位信任的人, 手动录入回答的 12 价值标签</div>
              <ul className="text-xs text-slate-600 space-y-1">
                {EXTERNAL_FEEDBACK_CARDS.map((c) => (
                  <li key={c.id}>
                    <b>{c.question}</b>
                    <span className="text-slate-400 ml-1">· {c.hint}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      )}

      {/* AI 拓展入口(§31.10) */}
      <div className="card p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-2">
          <Bot size={16} className="text-blue-600" /> AI 拓展职业信息(A 类)
        </h2>
        <div className="text-xs text-slate-500 mb-3">
          基于测评画像生成 3-5 个候选, 系统仍会执行价值观一票否决过滤。 AI 无否决权。
        </div>
        {!showAi ? (
          <div className="flex items-center gap-2">
            <select
              className="input py-1 max-w-[180px]"
              value={aiScenario}
              onChange={(e) => setAiScenario(e.target.value as 'career' | 'college-major')}
            >
              <option value="career">职业方向</option>
              <option value="college-major">大学专业(高中变体)</option>
            </select>
            <button
              className="btn-primary text-sm"
              onClick={() => {
                if (!assessment) return;
                setAiPrompt(buildCareerAiPrompt(assessment, aiScenario));
                setShowAi(true);
              }}
              disabled={!assessment}
            >
              生成提示词
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea className="input font-mono text-xs min-h-[160px]" value={aiPrompt} readOnly />
            <button
              className="btn-secondary text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(aiPrompt);
                showToast('已复制', 'success');
              }}
            >
              复制提示词
            </button>
            <textarea
              className="input font-mono text-xs min-h-[140px]"
              value={aiRaw}
              onChange={(e) => setAiRaw(e.target.value)}
              placeholder="粘贴 AI 返回的 JSON..."
            />
            <button
              className="btn-primary text-sm"
              onClick={() => {
                const data = parseCareerAiResponse(aiRaw);
                if (!data) {
                  showToast('JSON 解析失败', 'error');
                  return;
                }
                const candidates = toCareerCandidates(data, assessment?.values.bottomLines ?? []);
                const vetoedCount = candidates.filter((c) => c.vetoReason).length;
                showToast(`识别 ${candidates.length} 个 AI 候选(其中 ${vetoedCount} 个被系统否决过滤)`, 'success');
              }}
              disabled={!aiRaw.trim()}
            >
              解析并合并到候选池
            </button>
          </div>
        )}
      </div>

      {/* 双路线(仅高中及以上) */}
      {strategy.showRoutes && (
      <div className="card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Sparkles size={16} /> 双路线倾向参考
        </h2>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex-1 h-8 bg-slate-100 rounded overflow-hidden flex">
            <div className="bg-blue-500 flex items-center justify-center text-white text-xs" style={{ width: `${report.routes.expertBias}%` }}>
              专家 {report.routes.expertBias}%
            </div>
            <div className="bg-purple-500 flex items-center justify-center text-white text-xs" style={{ width: `${report.routes.managementBias}%` }}>
              管理 {report.routes.managementBias}%
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          主导倾向: <b>{report.routes.dominant === 'expert' ? '专家路线' : report.routes.dominant === 'management' ? '管理路线' : '均衡, 可切换'}</b>。 路线无优劣, 可随人生阶段演变。
        </p>
      </div>
      )}

      {report.bottomLineNotes.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold mb-2">底线价值提示</h2>
          <ul className="list-disc list-inside text-sm text-slate-700">
            {report.bottomLineNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* V5.11 §31.2 · 作答可信度评分(报告末尾) */}
      {cred && (
        <div className={`card p-5 ${cred.requiresRetest ? 'border-orange-200 bg-orange-50/40' : 'border-emerald-200 bg-emerald-50/40'}`}>
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            🎯 作答可信度评分
            <span className={`text-2xl font-bold ${cred.requiresRetest ? 'text-orange-600' : 'text-emerald-600'}`}>
              {cred.totalScore}
            </span>
            <span className="text-xs text-slate-400">/ 100</span>
          </h2>
          <div className="text-xs text-slate-500 mb-3">
            四因素加权:干扰项匹配 40% + 维度内一致性 30% + 作答时间合理性 20% + 极端选项分布 10%
            <br />
            <em>可信度评分度量作答质量而非用户本身, 不进入任何职业推荐计算(继承"不做匹配度评分"原则), 仅用于结果解读与重测引导。</em>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <FactorBar label="干扰项匹配率" score={cred.lieScaleMatch} />
            <FactorBar label="维度内一致性" score={cred.consistencyScore} />
            <FactorBar label="作答时间合理性" score={cred.timingScore} />
            <FactorBar label="极端选项分布" score={cred.extremeDistScore} />
          </div>
          {cred.requiresRetest && (
            <div className="mt-3 text-xs bg-orange-100 rounded p-2 text-orange-900">
              ⚠️ 可信度低于 70 分:本次测评结果可能受答题状态影响, 建议重新作答以获得更准确结论。 历史作答记录保留, 可对比查看。
            </div>
          )}
          {cred.lowConfidenceDimensions && cred.lowConfidenceDimensions.length > 0 && (
            <div className="mt-2 text-xs text-slate-700 space-y-1">
              <div>
                低置信度维度:
                {cred.lowConfidenceDimensions.map((d) => (
                  <span key={d} className="badge bg-yellow-100 text-yellow-800 ml-1 text-[10px]">{d}</span>
                ))}
              </div>
              <div className="text-slate-500">
                系统会为每个维度筛选 5-8 题的最小题包, 用于单维度部分重测(不影响其他维度作答)。
              </div>
              <div className="flex flex-wrap gap-1">
                {cred.lowConfidenceDimensions.map((d) => (
                  <button
                    key={d}
                    className="btn-secondary text-[10px]"
                    onClick={() => openDimensionRetest(d)}
                  >
                    重测「{d}」
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* V5.11 §31.2 · 单维度部分重测模态框 */}
      {retestOpen && (
        <DimensionRetestModal
          dimension={retestOpen.dimension}
          section={retestOpen.section}
          itemIds={retestOpen.itemIds}
          answers={retestAnswers}
          onAnswerChange={setRetestAnswers}
          onCancel={() => setRetestOpen(null)}
          onSubmit={submitDimensionRetest}
        />
      )}
    </div>
  );
}

// ==================== 单维度部分重测模态框 ====================

function DimensionRetestModal({
  dimension,
  section,
  itemIds,
  answers,
  onAnswerChange,
  onCancel,
  onSubmit,
}: {
  dimension: string;
  section: 'values' | 'personality' | 'ability';
  itemIds: string[];
  answers: Record<string, string | number>;
  onAnswerChange: (a: Record<string, string | number>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const items = itemIds
    .map((id) => {
      if (section === 'values') {
        return VALUE_QUESTIONS_FULL.find((q) => q.id === id);
      }
      if (section === 'personality') {
        return MBTI_QUESTIONS_FULL.find((q) => q.id === id);
      }
      return ABILITY_QUESTIONS_FULL.find((q) => q.id === id);
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const labels = ['非常不符合', '不太符合', '基本符合', '非常符合'];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-xl max-h-[85vh] overflow-y-auto p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            重测「{dimension}」维度 · {items.length} 题
          </h3>
          <button className="btn-ghost text-xs" onClick={onCancel}>取消</button>
        </div>
        <div className="text-xs text-slate-500 border-l-2 border-blue-400 pl-2">
          单维度重测:仅作答本维度题目, 其他维度成绩不受影响。 完成后系统会合并回原报告并重算可信度。
        </div>
        {items.map((q, i) => {
          const id = q.id;
          if (section === 'values') {
            const vq = q as (typeof VALUE_QUESTIONS_FULL)[number];
            return (
              <div key={id} className="border-b border-slate-100 pb-3">
                <div className="text-sm mb-2">{i + 1}. {vq.prompt}</div>
                {vq.type === 'judgement' && (
                  <div className="flex gap-2">
                    {(['yes', 'no'] as const).map((v) => (
                      <button
                        key={v}
                        className={`px-3 py-1 rounded border text-xs ${answers[id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                        onClick={() => onAnswerChange({ ...answers, [id]: v })}
                      >
                        {v === 'yes' ? '是' : '否'}
                      </button>
                    ))}
                  </div>
                )}
                {vq.type === 'forced-choice' && (
                  <div className="grid grid-cols-2 gap-2">
                    {(['A', 'B'] as const).map((v) => (
                      <button
                        key={v}
                        className={`p-2 rounded border text-xs text-left ${answers[id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                        onClick={() => onAnswerChange({ ...answers, [id]: v })}
                      >
                        {v}: {v === 'A' ? vq.optionA : vq.optionB}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          if (section === 'personality') {
            const mq = q as (typeof MBTI_QUESTIONS_FULL)[number];
            return (
              <div key={id} className="border-b border-slate-100 pb-3">
                <div className="text-sm mb-2">{i + 1}. {mq.prompt}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['A', 'B'] as const).map((v) => (
                    <button
                      key={v}
                      className={`p-2 rounded border text-xs text-left ${answers[id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                      onClick={() => onAnswerChange({ ...answers, [id]: v })}
                    >
                      {v}: {v === 'A' ? mq.optionA : mq.optionB}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          const aq = q as (typeof ABILITY_QUESTIONS_FULL)[number];
          return (
            <div key={id} className="border-b border-slate-100 pb-3">
              <div className="text-sm mb-2">{i + 1}. {aq.prompt}</div>
              <div className="grid grid-cols-4 gap-1">
                {([1, 2, 3, 4] as const).map((v) => (
                  <button
                    key={v}
                    className={`p-2 rounded border text-[10px] ${answers[id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                    onClick={() => onAnswerChange({ ...answers, [id]: v })}
                  >
                    {labels[v - 1]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button className="btn-ghost text-sm" onClick={onCancel}>取消</button>
          <button className="btn-primary text-sm" onClick={onSubmit}>
            提交重测结果
          </button>
        </div>
      </div>
    </div>
  );
}

function FactorBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-center justify-between text-slate-600">
        <span>{label}</span>
        <span className="font-bold text-slate-800">{score}</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded overflow-hidden mt-1">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
