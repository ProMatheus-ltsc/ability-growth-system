import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldAlert, Users } from 'lucide-react';
import { PageHeader } from '../PageHeader';
import {
  ABILITY_LIE_SCALE,
  ABILITY_QUESTIONS_SHORT,
  EXTERNAL_FEEDBACK_CARDS,
  MBTI_LIE_SCALE,
  MBTI_QUESTIONS_SHORT,
  PROJECTION_QUESTIONS,
  VALUE_LIE_SCALE,
  VALUE_QUESTIONS_SHORT,
  checkLieScaleConsistency,
  computeAnswerCredibilityScore,
  createBlankAssessment,
  detectAchievementMotives,
  generateCareerReport,
  generateValueStatement,
  saveAssessment,
  saveReport,
  scoreAbility,
  scoreMBTI,
  scoreValueQuestions,
} from '../../services/careerAssessment';
import type { GradeLevel } from '../../domain/types';

type Section = 'intro' | 'values' | 'mbti' | 'ability' | 'projection' | 'external' | 'submit';

interface Props {
  gradeLevel: GradeLevel;
  studentId?: string;
  onComplete: (reportId: string) => void;
  onCancel: () => void;
}

/** V5.11 · 干扰项在题目中的随机插入位置(固定 seed 保证同一学段每次一致) */
const LIE_POSITIONS_VALUES = [4, 9, 13]; // 15 题主 + 3 干扰
const LIE_POSITIONS_MBTI = [7, 15, 24]; // 28 题主 + 3 干扰
const LIE_POSITIONS_ABILITY = [6, 15]; // 20 题主 + 2 干扰

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
  const [valueAnswers, setValueAnswers] = useState<Record<string, string | string[]>>({});
  const [mbtiAnswers, setMbtiAnswers] = useState<Record<string, 'A' | 'B'>>({});
  const [abilityAnswers, setAbilityAnswers] = useState<Record<string, 1 | 2 | 3 | 4>>({});
  // V5.11 · 投射题(可选)
  const [projectionAnswers, setProjectionAnswers] = useState<Record<string, string[]>>({});
  // V5.11 · 他评校准卡录入(可选)
  const [externalFeedback, setExternalFeedback] = useState<
    Array<{ questionId: string; answer: string; tags: string[] }>
  >([]);
  const [busy, setBusy] = useState(false);

  // V5.11 §31.2 · 记录作答开始时间(用于时长合理性评分)
  const startedAtRef = useRef<string>(new Date().toISOString());

  // 混合主题目 + 干扰项后的显示序列
  const valueMerged = useMemo(
    () => interleave(VALUE_QUESTIONS_SHORT, VALUE_LIE_SCALE, LIE_POSITIONS_VALUES),
    [],
  );
  const mbtiMerged = useMemo(
    () => interleave(MBTI_QUESTIONS_SHORT, MBTI_LIE_SCALE, LIE_POSITIONS_MBTI),
    [],
  );
  const abilityMerged = useMemo(
    () => interleave(ABILITY_QUESTIONS_SHORT, ABILITY_LIE_SCALE, LIE_POSITIONS_ABILITY),
    [],
  );

  // 完成检测:主题目 + 干扰项都必须作答
  const valueDone = useMemo(() => {
    const mainDone = VALUE_QUESTIONS_SHORT.every((q) =>
      q.type === 'multi-select-8-3'
        ? (valueAnswers[q.id] as string[])?.length === 3
        : !!valueAnswers[q.id],
    );
    const lieDone = VALUE_LIE_SCALE.every((l) => !!valueAnswers[l.id]);
    return mainDone && lieDone;
  }, [valueAnswers]);

  const mbtiDone = useMemo(
    () =>
      MBTI_QUESTIONS_SHORT.every((q) => !!mbtiAnswers[q.id]) &&
      MBTI_LIE_SCALE.every((l) => !!mbtiAnswers[l.id]),
    [mbtiAnswers],
  );

  const abilityDone = useMemo(
    () =>
      ABILITY_QUESTIONS_SHORT.every((q) => !!abilityAnswers[q.id]) &&
      ABILITY_LIE_SCALE.every((l) => !!abilityAnswers[l.id]),
    [abilityAnswers],
  );

  const submit = async () => {
    setBusy(true);
    try {
      // 只把主题目参与打分,干扰项排除
      const mainValueAnswers: Record<string, string | string[]> = {};
      for (const q of VALUE_QUESTIONS_SHORT) {
        if (valueAnswers[q.id] !== undefined) mainValueAnswers[q.id] = valueAnswers[q.id];
      }
      const mainMbtiAnswers: Record<string, 'A' | 'B'> = {};
      for (const q of MBTI_QUESTIONS_SHORT) {
        if (mbtiAnswers[q.id] !== undefined) mainMbtiAnswers[q.id] = mbtiAnswers[q.id];
      }
      const mainAbilityAnswers: Record<string, 1 | 2 | 3 | 4> = {};
      for (const q of ABILITY_QUESTIONS_SHORT) {
        if (abilityAnswers[q.id] !== undefined) mainAbilityAnswers[q.id] = abilityAnswers[q.id];
      }

      const values = scoreValueQuestions(mainValueAnswers);
      const personality = scoreMBTI(mainMbtiAnswers);
      const abilityResult = scoreAbility(mainAbilityAnswers);
      const now = new Date().toISOString();

      // V5.11 §31.2 · 干扰项一致性校验
      const lieResponses = [
        ...checkLieScaleConsistency(VALUE_LIE_SCALE, valueAnswers),
        ...checkLieScaleConsistency(MBTI_LIE_SCALE, mbtiAnswers),
        ...checkLieScaleConsistency(ABILITY_LIE_SCALE, abilityAnswers),
      ];
      const totalQ =
        VALUE_QUESTIONS_SHORT.length + VALUE_LIE_SCALE.length +
        MBTI_QUESTIONS_SHORT.length + MBTI_LIE_SCALE.length +
        ABILITY_QUESTIONS_SHORT.length + ABILITY_LIE_SCALE.length;
      const credibility = computeAnswerCredibilityScore({
        lieScaleResponses: lieResponses,
        answers: { ...valueAnswers, ...mbtiAnswers, ...abilityAnswers },
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
      const assessment = {
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

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <PageHeader
        title="职业选择测评"
        description="全部客观题(判断/单选/迫选/多选), 无正确答案。 按第一反应作答, 不要过度思考。"
        actions={
          <button className="btn-ghost" onClick={onCancel}>
            <ArrowLeft size={14} /> 返回列表
          </button>
        }
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
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-lg">简短版 · 71 题 · 约 18-25 分钟</h2>
          <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
            <li><b>价值观鉴定 (15 题 + 3 道干扰项)</b>: 判断/8 选 3/情境迫选/底线确认</li>
            <li><b>MBTI 性格 (28 题 + 3 道干扰项)</b>: 四维度情境二选一</li>
            <li><b>能力检测 (20 题 + 2 道干扰项)</b>: 八维能力自评</li>
            <li><b>可选:投射题 3 组</b>(敬佩/终点/情绪反应) + <b>他评校准卡 3 问</b></li>
          </ul>
          <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded flex items-start gap-2">
            <ShieldAlert size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <b>作答质量保障</b>:干扰项与主量表反向表述, 与你的答案会做一致性交叉校验;
              作答时间过快 / 过慢、极端选项分布也会计入可信度评分(0-100 分)。 请按第一反应作答, 不要刻意迎合。
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
        <MBTISection
          merged={mbtiMerged}
          answers={mbtiAnswers}
          setAnswers={setMbtiAnswers}
          onNext={() => setSection('ability')}
          onBack={() => setSection('values')}
          done={mbtiDone}
        />
      )}

      {section === 'ability' && (
        <AbilitySection
          merged={abilityMerged}
          answers={abilityAnswers}
          setAnswers={setAbilityAnswers}
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
  setAnswers: (a: Record<string, string | string[]>) => void;
  onNext: () => void;
  onBack: () => void;
  done: boolean;
}) {
  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold">价值观鉴定 · 18 题(含 3 道干扰项)</h2>
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
                    onClick={() => setAnswers({ ...answers, [l.id]: v })}
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
                    onClick={() => setAnswers({ ...answers, [q.id]: v })}
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
                    onClick={() => setAnswers({ ...answers, [q.id]: v })}
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
                          let next: string[];
                          if (selected) next = current.filter((x) => x !== opt);
                          else if (current.length >= 3) return;
                          else next = [...current, opt];
                          setAnswers({ ...answers, [q.id]: next });
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
  setAnswers: (a: Record<string, 'A' | 'B'>) => void;
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
                    onClick={() => setAnswers({ ...answers, [l.id]: v })}
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
            <div className="text-sm text-slate-800 mb-2">
              {i + 1}. {q.prompt} <span className="text-xs text-slate-400">({q.axis})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((v) => (
                <button
                  key={v}
                  className={`p-2 rounded border text-sm text-left ${answers[q.id] === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                  onClick={() => setAnswers({ ...answers, [q.id]: v })}
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
  setAnswers: (a: Record<string, 1 | 2 | 3 | 4>) => void;
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
                  onClick={() => setAnswers({ ...answers, [id]: v })}
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
  setAnswers: (a: Record<string, string[]>) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const togglePick = (qid: string, opt: string, maxSelect: number, minSelect: number) => {
    const current = answers[qid] ?? [];
    let next: string[];
    if (current.includes(opt)) {
      next = current.filter((x) => x !== opt);
    } else {
      if (maxSelect === 1) next = [opt];
      else if (current.length >= maxSelect) return;
      else next = [...current, opt];
    }
    if (next.length < minSelect && next.length > 0) {
      // 允许清空, 但不允许介于 0 和 minSelect 之间
    }
    setAnswers({ ...answers, [qid]: next });
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
  items: Array<{ questionId: string; answer: string; tags: string[] }>;
  setItems: (i: Array<{ questionId: string; answer: string; tags: string[] }>) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const AVAILABLE_TAGS = [
    '成就与能力', '成长', '清晰感', '安全边界', '关系', '陪伴',
    '自由', '真实性', '尊严', '收入', '影响力', '陪伴家人',
  ];
  const upsert = (qid: string, patch: Partial<{ answer: string; tags: string[] }>) => {
    const existing = items.find((i) => i.questionId === qid);
    if (!existing) {
      setItems([...items, { questionId: qid, answer: patch.answer ?? '', tags: patch.tags ?? [] }]);
    } else {
      setItems(items.map((i) => (i.questionId === qid ? { ...i, ...patch } : i)));
    }
  };
  const toggleTag = (qid: string, tag: string) => {
    const existing = items.find((i) => i.questionId === qid);
    const tags = existing?.tags ?? [];
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    upsert(qid, { tags: next });
  };
  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold flex items-center gap-2">
        <Users size={16} /> 他评校准卡(线下询问 · 可选)
      </h2>
      <p className="text-xs text-slate-500">
        把以下 3 个问题分享给 2-3 位信任的人, 收集回答后按关键词录入。 用于与自评做交叉。 可以跳过。
      </p>
      {EXTERNAL_FEEDBACK_CARDS.map((c) => {
        const cur = items.find((i) => i.questionId === c.id);
        return (
          <div key={c.id} className="border-b border-slate-100 pb-3">
            <div className="text-sm font-medium text-slate-800">{c.question}</div>
            <div className="text-[10px] text-slate-400 mb-2">{c.hint}</div>
            <textarea
              className="input text-xs min-h-[52px]"
              value={cur?.answer ?? ''}
              onChange={(e) => upsert(c.id, { answer: e.target.value })}
              placeholder="用一段话记录他们的回答"
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {AVAILABLE_TAGS.map((t) => {
                const on = cur?.tags.includes(t);
                return (
                  <button
                    key={t}
                    className={`px-2 py-0.5 rounded text-[10px] ${on ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                    onClick={() => toggleTag(c.id, t)}
                  >
                    {t}
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
