import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { BarChart3, Radar as RadarIcon, TrendingUp, ChevronRight } from 'lucide-react';
import { useAppSession } from '../hooks/useAppSession';
import { findAbilities, findTrainingsByStudent } from '../services/localDB';
import { aggregateBySubject, buildGrowthSeries, buildRadarSlices } from '../services/analytics';
import { PageHeader } from '../components/PageHeader';
import { MasteryBar } from '../components/MasteryBar';
import { EmptyState } from '../components/EmptyState';
import { AbilityRadar } from '../components/RadarChart';
import { getAbilityTags, getModules } from '../domain/abilityTags';
import type { AbilitySnapshot, Subject, TrainingRecord } from '../domain/types';
import { SUBJECT_LABEL } from '../domain/types';

export function AbilityCenterPage() {
  const { prefs } = useAppSession();
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [abilities, setAbilities] = useState<AbilitySnapshot[]>([]);
  const [subject, setSubject] = useState<Subject>(prefs.subjects[0] ?? 'math');

  useEffect(() => {
    void findTrainingsByStudent(prefs.currentStudentId).then(setTrainings);
    void findAbilities(prefs.currentStudentId).then(setAbilities);
  }, [prefs.currentStudentId]);

  const radarSlices = useMemo(
    () => buildRadarSlices(trainings, abilities, prefs.gradeLevel, subject),
    [trainings, abilities, prefs.gradeLevel, subject],
  );

  const growth = useMemo(() => buildGrowthSeries(trainings, subject), [trainings, subject]);

  const moduleMastery = useMemo(() => {
    const modules = getModules(prefs.gradeLevel, subject);
    return modules.map((m) => {
      const scoped = trainings.filter((r) => r.subject === subject && r.module === m);
      const total = scoped.reduce((s, r) => s + r.totalQuestions, 0);
      const err = scoped.reduce((s, r) => s + r.errorCount, 0);
      const score = total === 0 ? null : Math.round(((total - err) / total) * 100);
      return { module: m, score, samples: total };
    });
  }, [prefs.gradeLevel, subject, trainings]);

  const abilityCards = useMemo(() => {
    const tags = getAbilityTags(prefs.gradeLevel, subject);
    const bySnapshotPath = new Map<string, AbilitySnapshot>();
    for (const a of abilities) {
      if (a.subject !== subject) continue;
      const prev = bySnapshotPath.get(a.abilityPath);
      if (!prev || a.evaluationTime > prev.evaluationTime) bySnapshotPath.set(a.abilityPath, a);
    }
    return tags.map((t) => ({ tag: t, snapshot: bySnapshotPath.get(t.path) }));
  }, [prefs.gradeLevel, subject, abilities]);

  const stats = aggregateBySubject(trainings);
  const subjectStats = stats.find((s) => s.subject === subject);

  return (
    <div className="space-y-5">
      <PageHeader
        title="能力中心"
        description="以能力掌握度为核心的多维视图。 陌生题正确率是能力增长的核心指标。"
      />

      <div className="flex flex-wrap items-center gap-2">
        {prefs.subjects.map((s) => (
          <button
            key={s}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              subject === s
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
            onClick={() => setSubject(s)}
          >
            {SUBJECT_LABEL[s]}
          </button>
        ))}
      </div>

      {subjectStats && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <StatBlock label="综合掌握度" value={`${subjectStats.masteryScore}%`} tone="blue" />
          <StatBlock label="陌生题正确率" value={`${Math.round(subjectStats.unfamiliarCorrectRate * 100)}%`} tone="emerald" />
          <StatBlock label="累计题量" value={subjectStats.totalQuestions} tone="slate" />
          <StatBlock label="累计错题" value={subjectStats.totalErrors} tone="orange" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <RadarIcon size={16} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900">能力雷达图</h2>
          </div>
          {radarSlices.length === 0 ? (
            <EmptyState icon={RadarIcon} title="暂无雷达数据" description="该学段/学科尚未定义雷达维度权重" />
          ) : (
            <AbilityRadar slices={radarSlices} />
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-emerald-600" />
            <h2 className="font-semibold text-slate-900">能力增长曲线</h2>
          </div>
          {growth.length === 0 ? (
            <EmptyState icon={TrendingUp} title="需要更多训练" description="至少 2 周的训练数据后可查看趋势" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={growth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-purple-600" />
          <h2 className="font-semibold text-slate-900">各模块掌握度</h2>
        </div>
        {moduleMastery.every((m) => m.score === null) ? (
          <EmptyState icon={BarChart3} title="暂无模块数据" description="记录训练后自动汇总各模块掌握度" />
        ) : (
          <div className="space-y-3">
            {moduleMastery.map((m) => (
              <div key={m.module} className="flex items-center gap-3">
                <div className="w-32 text-sm text-slate-700 shrink-0">{m.module}</div>
                {m.score === null ? (
                  <div className="flex-1 text-xs text-slate-400">无数据</div>
                ) : (
                  <MasteryBar score={m.score} className="flex-1" />
                )}
                <div className="text-xs text-slate-400 w-16 text-right">{m.samples} 题</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <ChevronRight size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-900">三级能力标签明细</h2>
          <span className="text-xs text-slate-400">共 {abilityCards.length} 项</span>
        </div>
        {abilityCards.length === 0 ? (
          <EmptyState icon={BarChart3} title="尚未定义能力标签" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto">
            {abilityCards.map(({ tag, snapshot }) => (
              <div key={tag.path} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-slate-700">
                    {tag.module} <span className="text-slate-400">·</span> {tag.point}
                  </div>
                  <span className="text-xs text-orange-500">{'★'.repeat(tag.difficulty)}</span>
                </div>
                {snapshot ? (
                  <MasteryBar score={snapshot.score} />
                ) : (
                  <div className="text-xs text-slate-400">未测评 · 掌握周期 {tag.cycle}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBlock({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  const toneMap: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    orange: 'text-orange-600 bg-orange-50',
    slate: 'text-slate-600 bg-slate-100',
  };
  return (
    <div className={`rounded-xl p-4 ${toneMap[tone]}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
