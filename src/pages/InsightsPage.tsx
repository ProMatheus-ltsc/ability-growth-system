import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import { ResponsiveChart } from '@shared/core';
import { Lightbulb, Compass, Cpu, GitBranch, Play, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { MasteryBar } from '../components/MasteryBar';
import { useAppSession } from '../hooks/useAppSession';
import { findGaps, findTrainingsByStudent } from '../services/localDB';
import {
  aggregateSubjectForecasts,
  buildCausalGraph,
  findLeveragePoints,
  forecastGrowth,
  recommendStrategies,
  simulateStrategy,
  type CausalGraph,
  type SimulationInput,
  type SimulationResult,
  type StrategyRecommendation,
} from '../services/insights';
import type { AbilityGap, Subject, TrainingRecord } from '../domain/types';
import { SUBJECT_LABEL } from '../domain/types';
import { getInsightsCopy, type InsightsCopy } from '../domain/insightsCopy';

type Tab = 'strategy' | 'forecast' | 'simulate' | 'causal' | 'leverage';

export function InsightsPage() {
  const { prefs } = useAppSession();
  const [tab, setTab] = useState<Tab>('strategy');
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [gaps, setGaps] = useState<AbilityGap[]>([]);

  useEffect(() => {
    void findTrainingsByStudent(prefs.currentStudentId).then(setTrainings);
    void findGaps(prefs.currentStudentId).then(setGaps);
  }, [prefs.currentStudentId]);

  const copy = getInsightsCopy(prefs.gradeLevel);
  return (
    <div className="space-y-5">
      <PageHeader
        title={copy.pageTitle}
        description={copy.pageDescription}
      />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { k: 'strategy', label: '策略推荐', icon: Lightbulb },
            { k: 'forecast', label: '收益预测', icon: Compass },
            { k: 'simulate', label: 'What-if 模拟', icon: Play },
            { k: 'causal', label: '因果建模', icon: GitBranch },
            { k: 'leverage', label: '迁移杠杆', icon: Cpu },
          ] as Array<{ k: Tab; label: string; icon: typeof Sparkles }>
        ).map((it) => (
          <button
            key={it.k}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
              tab === it.k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
            onClick={() => setTab(it.k)}
          >
            <it.icon size={14} />
            {it.label}
          </button>
        ))}
      </div>

      {tab === 'strategy' && <StrategyTab records={trainings} gaps={gaps} copy={copy} />}
      {tab === 'forecast' && <ForecastTab records={trainings} subjects={prefs.subjects} copy={copy} />}
      {tab === 'simulate' && <SimulationTab records={trainings} subjects={prefs.subjects} />}
      {tab === 'causal' && <CausalTab records={trainings} gaps={gaps} copy={copy} />}
      {tab === 'leverage' && <LeverageTab gaps={gaps} copy={copy} />}
    </div>
  );
}

// ============ 策略推荐 ============

function StrategyTab({ records, gaps, copy }: { records: TrainingRecord[]; gaps: AbilityGap[]; copy: InsightsCopy }) {
  const recs: StrategyRecommendation[] = useMemo(() => recommendStrategies(records, gaps), [records, gaps]);
  if (recs.length === 0) {
    return <EmptyState icon={Lightbulb} title={copy.strategyEmptyTitle} description={copy.strategyEmptyDescription} />;
  }
  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        <Lightbulb size={16} className="text-amber-500" /> 个性化训练策略推荐
      </h2>
      <div className="space-y-3">
        {recs.map((r, i) => (
          <div key={i} className="border border-slate-100 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{r.label}</span>
                  <span className="badge bg-slate-100 text-slate-600">优先级 {r.weight}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">依据: {r.reason}</div>
                <div className="text-sm text-slate-700 mt-2">👉 {r.actionable}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ 收益预测 ============

function ForecastTab({ records, subjects, copy }: { records: TrainingRecord[]; subjects: Subject[]; copy: InsightsCopy }) {
  const summaries = useMemo(() => aggregateSubjectForecasts(records, subjects), [records, subjects]);
  const [subject, setSubject] = useState<Subject>(subjects[0] ?? 'math');
  const detail = useMemo(() => forecastGrowth(records, subject), [records, subject]);
  const chart = useMemo(() => {
    const arr: Array<{ w: number; label: string; mastery: number }> = [];
    for (let i = 0; i <= 12; i++) {
      const m = Math.min(100, Math.max(0, detail.currentMastery + detail.weeklyGrowthRate * i));
      arr.push({ w: i, label: i === 0 ? '现在' : `+${i}周`, mastery: +m.toFixed(1) });
    }
    return arr;
  }, [detail]);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-semibold mb-3">全学科增长预测</h2>
        {summaries.every((s) => s.weeklyRate === 0) ? (
          <EmptyState icon={Compass} title={copy.forecastEmptyTitle} description={copy.forecastEmptyDescription} />
        ) : (
          <div className="space-y-3">
            {summaries.map((s) => (
              <div key={s.subject}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-16 text-sm text-slate-700">{s.label}</span>
                  <MasteryBar score={s.currentMastery} className="flex-1" />
                  <span className="text-xs text-slate-500 w-40 text-right">
                    每周 {s.weeklyRate >= 0 ? '+' : ''}
                    {s.weeklyRate}% · 4 周后 → {s.forecast4w}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{SUBJECT_LABEL[subject]} · 12 周走势预测</h2>
          <select className="input py-1 max-w-[140px]" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {SUBJECT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="text-sm text-slate-600 mb-3">
          当前掌握度 <b>{detail.currentMastery}%</b> · 周增长率 <b>{detail.weeklyGrowthRate}%</b> · 达到熟练需 {detail.weeksToTarget.proficient ?? '—'} 周 · 达到精通需 {detail.weeksToTarget.expert ?? '—'} 周
        </div>
        <ResponsiveChart minHeight="15rem" maxHeight="17.5rem">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <ReferenceLine y={85} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '熟练线', fontSize: 10 }} />
            <ReferenceLine y={95} stroke="#10b981" strokeDasharray="3 3" label={{ value: '精通线', fontSize: 10 }} />
            <Line type="monotone" dataKey="mastery" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="预测掌握度" />
          </LineChart>
        </ResponsiveContainer>
        </ResponsiveChart>
      </div>
    </div>
  );
}

// ============ What-if 模拟 ============

function SimulationTab({ records, subjects }: { records: TrainingRecord[]; subjects: Subject[] }) {
  const [subject, setSubject] = useState<Subject>(subjects[0] ?? 'math');
  const [hoursPerWeek, setHoursPerWeek] = useState(6);
  const [weeks, setWeeks] = useState(8);
  const [ratios, setRatios] = useState<SimulationInput['focusRatio']>({
    topic: 30,
    review: 40,
    unfamiliar: 20,
    timed: 10,
  });
  const [result, setResult] = useState<SimulationResult | null>(null);

  const run = () => {
    setResult(simulateStrategy(records, subject, { hoursPerWeek, weeks, focusRatio: ratios }));
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3 cq">
        <h2 className="font-semibold flex items-center gap-2">
          <Play size={16} className="text-blue-600" /> 个性化训练策略模拟 (What-if)
        </h2>
        <p className="text-sm text-slate-500">
          假设每周投入 X 小时,按特定训练结构分配,N 周后能力将达到什么水平?
        </p>

        <div className="cq-grid cq-cols-4 gap-3">
          <div>
            <label className="label">学科</label>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">每周投入(小时)</label>
            <input className="input" type="number" min={1} max={40} value={hoursPerWeek} onChange={(e) => setHoursPerWeek(+e.target.value || 0)} />
          </div>
          <div>
            <label className="label">模拟周期(周)</label>
            <input className="input" type="number" min={1} max={52} value={weeks} onChange={(e) => setWeeks(+e.target.value || 0)} />
          </div>
        </div>

        <div>
          <div className="label">训练结构分配(比例, 自动归一化)</div>
          <div className="cq-grid cq-cols-4 gap-3">
            {(['topic', 'review', 'unfamiliar', 'timed'] as const).map((k) => (
              <div key={k}>
                <label className="label text-xs">
                  {k === 'topic' && '专项训练'}
                  {k === 'review' && '错题复习'}
                  {k === 'unfamiliar' && '陌生题'}
                  {k === 'timed' && '限时训练'}
                </label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={ratios[k]}
                  onChange={(e) => setRatios({ ...ratios, [k]: +e.target.value || 0 })}
                />
              </div>
            ))}
          </div>
        </div>

        <button className="btn-primary" onClick={run}>
          <Play size={14} /> 运行模拟
        </button>
      </div>

      {result && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">模拟结果</h2>
            <span className="text-sm text-slate-500">
              初始 {result.currentMastery}% → {weeks} 周后 <b>{result.finalMastery}%</b>
            </span>
          </div>
          <ResponsiveChart minHeight="14rem" maxHeight="16.25rem">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[{ week: 0, mastery: result.currentMastery }, ...result.trajectory]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: '周', position: 'bottom', offset: -5, fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <ReferenceLine y={85} stroke="#f59e0b" strokeDasharray="3 3" />
              <ReferenceLine y={95} stroke="#10b981" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="mastery" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
          </ResponsiveChart>
          {result.notes.length > 0 && (
            <div className="mt-3 text-sm text-slate-600 space-y-1">
              {result.notes.map((n) => (
                <div key={n}>💡 {n}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ 因果建模 ============

function CausalTab({ records, gaps, copy }: { records: TrainingRecord[]; gaps: AbilityGap[]; copy: InsightsCopy }) {
  const graph: CausalGraph = useMemo(() => buildCausalGraph(records, gaps), [records, gaps]);
  if (graph.nodes.length === 0) {
    return <EmptyState icon={GitBranch} title={copy.causalEmptyTitle} />;
  }

  const errors = graph.nodes.filter((n) => n.kind === 'error');
  const abilities = graph.nodes.filter((n) => n.kind === 'ability');
  const trainings = graph.nodes.filter((n) => n.kind === 'training');

  return (
    <div className="card p-5 cq">
      <h2 className="font-semibold flex items-center gap-2 mb-3">
        <GitBranch size={16} className="text-purple-600" /> 错误 → 能力缺口 → 训练方式 因果链
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        将过去的错误类型映射到能力短板, 再匹配到最适合的训练方式。 这是系统动力学的浓缩视图。
      </p>
      <div className="cq-grid cq-cols-3 gap-3">
        <ColumnBlock title="错误类型" tone="red" items={errors.map((n) => n.label)} />
        <ColumnBlock title="能力短板" tone="orange" items={abilities.map((n) => n.label)} />
        <ColumnBlock title="建议训练" tone="emerald" items={Array.from(new Set(trainings.map((n) => n.label)))} />
      </div>
      <div className="mt-4 text-xs text-slate-500">共 {graph.edges.length} 条因果边; 权重反映错误历史发生频次</div>
    </div>
  );
}

function ColumnBlock({ title, tone, items }: { title: string; tone: 'red' | 'orange' | 'emerald'; items: string[] }) {
  const toneMap: Record<string, string> = {
    red: 'bg-red-50 text-red-700 border-red-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };
  return (
    <div className={`rounded-lg border p-3 ${toneMap[tone]}`}>
      <div className="text-xs font-medium opacity-80 mb-2">{title}</div>
      <div className="space-y-1 text-sm">
        {items.map((it) => (
          <div key={it}>{it}</div>
        ))}
      </div>
    </div>
  );
}

// ============ 迁移杠杆 ============

function LeverageTab({ gaps, copy }: { gaps: AbilityGap[]; copy: InsightsCopy }) {
  const leverages = useMemo(() => findLeveragePoints(gaps), [gaps]);
  if (leverages.length === 0) {
    return <EmptyState icon={Cpu} title={copy.leverageEmptyTitle} description={copy.leverageEmptyDescription} />;
  }
  return (
    <div className="card p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-3">
        <Cpu size={16} className="text-emerald-600" /> 能力迁移杠杆点
      </h2>
      <p className="text-sm text-slate-500 mb-3">
        修复这些能力可通过强/中迁移带动多个关联能力, 单位时间收益最高。
      </p>
      <div className="space-y-2">
        {leverages.map((l, i) => (
          <div key={i} className="border border-slate-100 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <b>{l.ability}</b> <span className="text-xs text-slate-500">({SUBJECT_LABEL[l.subject]})</span>
              </div>
              <span className="badge bg-emerald-50 text-emerald-700">杠杆分 {l.score} · 覆盖 {l.totalReach}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {l.transfers.map((t, j) => (
                <span key={j} className="badge bg-slate-100 text-slate-700 text-xs">
                  → {t.target} ({t.strength})
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
