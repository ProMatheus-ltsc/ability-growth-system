import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { ResponsiveChart } from '@shared/core';
import { Lightbulb, Compass, Cpu, GitBranch } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { MasteryBar } from '../components/MasteryBar';
import {
  aggregateSubjectForecasts,
  buildCausalGraph,
  findLeveragePoints,
  forecastGrowth,
  recommendStrategies,
  type CausalGraph,
  type StrategyRecommendation,
} from '../services/insights';
import type { AbilityGap, Subject, TrainingRecord } from '../domain/types';
import { SUBJECT_LABEL } from '../domain/types';
import type { InsightsCopy } from '../domain/insightsCopy';

// 说明（阶段三）：原「深度洞察」页面已并入分析中心，本文件仅保留各 Tab 组件，
// 由 src/pages/AnalyticsPage.tsx 组合为「收益与预测 / 策略与因果」。/insights 路由重定向到 /analytics。

// ============ 策略推荐 ============

export function StrategyTab({ records, gaps, copy }: { records: TrainingRecord[]; gaps: AbilityGap[]; copy: InsightsCopy }) {
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

export function ForecastTab({
  records,
  subjects,
  copy,
  targetScore,
}: {
  records: TrainingRecord[];
  subjects: Subject[];
  copy: InsightsCopy;
  /** 统一目标分（报名 targetScore）；未设置时不画目标线，也不再使用写死的 85/95 */
  targetScore?: number;
}) {
  const summaries = useMemo(
    () => aggregateSubjectForecasts(records, subjects, targetScore),
    [records, subjects, targetScore],
  );
  const [subject, setSubject] = useState<Subject>(subjects[0] ?? 'math');
  const detail = useMemo(() => forecastGrowth(records, subject, targetScore), [records, subject, targetScore]);
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
          当前掌握度 <b>{detail.currentMastery}%</b> · 周增长率 <b>{detail.weeklyGrowthRate}%</b> ·{' '}
          {detail.targetScore === null
            ? '未设置目标分（报名记录未填 targetScore）'
            : detail.weeksToTargetScore === null
              ? `暂无法估算达到目标分 ${detail.targetScore}% 的周数`
              : `达到目标分 ${detail.targetScore}% 需 ${detail.weeksToTargetScore} 周`}
        </div>
        <ResponsiveChart minHeight="15rem" maxHeight="17.5rem">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            {targetScore !== undefined && (
              <ReferenceLine
                y={targetScore}
                stroke="#f59e0b"
                strokeDasharray="3 3"
                label={{ value: `目标线 ${targetScore}%`, fontSize: 10 }}
              />
            )}
            <Line type="monotone" dataKey="mastery" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="预测掌握度" />
          </LineChart>
        </ResponsiveContainer>
        </ResponsiveChart>
      </div>
    </div>
  );
}

// ============ 错因关联（原「因果建模」）============

export function CausalTab({ records, gaps, copy }: { records: TrainingRecord[]; gaps: AbilityGap[]; copy: InsightsCopy }) {
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
        <GitBranch size={16} className="text-purple-600" /> 错误 → 能力缺口 → 训练方式 关联链
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        将过去的错误类型映射到能力短板, 再匹配到最适合的训练方式。 这是系统动力学的浓缩视图。
      </p>
      <p className="text-xs text-amber-600 mb-4">
        说明：这里展示的是错因共现关联（同一批训练里同时出现），反映相关性而非因果推断。
      </p>
      <div className="cq-grid cq-cols-3 gap-3">
        <ColumnBlock title="错误类型" tone="red" items={errors.map((n) => n.label)} />
        <ColumnBlock title="能力短板" tone="orange" items={abilities.map((n) => n.label)} />
        <ColumnBlock title="建议训练" tone="emerald" items={Array.from(new Set(trainings.map((n) => n.label)))} />
      </div>
      <div className="mt-4 text-xs text-slate-500">共 {graph.edges.length} 条关联边; 权重反映错误历史发生频次</div>
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

export function LeverageTab({ gaps, copy }: { gaps: AbilityGap[]; copy: InsightsCopy }) {
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
