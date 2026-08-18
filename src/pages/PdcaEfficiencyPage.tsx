/**
 * P2 · PDCA 循环效率分析 (PRD V5.8 §33)
 * 每轮循环周期统计 · 停滞瓶颈识别 · 成功经验复用推荐
 */
import { useEffect, useMemo, useState } from 'react';
import { Zap, TrendingUp, AlertOctagon, Trophy } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { getAllRecords } from '../services/localDB';
import { analyzeCycleEfficiency } from '../services/pdca';
import { PDCA_STAGE_LABEL, type PDCAProblem } from '../domain/types';

export function PdcaEfficiencyPage() {
  const [problems, setProblems] = useState<PDCAProblem[]>([]);

  useEffect(() => {
    void getAllRecords('pdcaProblems').then(setProblems);
  }, []);

  const stats = useMemo(() => analyzeCycleEfficiency(problems), [problems]);
  const archived = problems.filter((p) => p.status === 'archived');
  const bottlenecks = stats.filter((s) => s.bottleneckStage);
  const avg = stats.length === 0 ? 0 : +(stats.reduce((s, x) => s + x.avgCycleDays, 0) / stats.length).toFixed(1);

  return (
    <div className="space-y-5">
      <PageHeader title="PDCA 循环效率分析" description="每轮循环周期统计 · 停滞瓶颈识别 · 成功经验复用推荐" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatBlock icon={<TrendingUp size={16} />} label="平均循环周期(天)" value={String(avg)} tone="blue" />
        <StatBlock icon={<AlertOctagon size={16} />} label="停滞瓶颈问题数" value={String(bottlenecks.length)} tone="red" />
        <StatBlock icon={<Trophy size={16} />} label="已归档成功经验数" value={String(archived.length)} tone="emerald" />
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Zap size={16} /> 每问题循环统计
        </h2>
        {stats.length === 0 ? (
          <EmptyState icon={Zap} title="尚无循环历史" description="至少完成一次 A 阶段决策后才能统计" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs">
                <th className="text-left py-1">问题</th>
                <th className="text-right py-1">循环数</th>
                <th className="text-right py-1">平均周期(天)</th>
                <th className="text-right py-1">最近一轮(天)</th>
                <th className="text-left py-1">瓶颈阶段</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.problemId} className="border-t border-slate-100">
                  <td className="py-2">{s.problemTitle}</td>
                  <td className="text-right py-2">{s.totalCycles}</td>
                  <td className="text-right py-2">{s.avgCycleDays}</td>
                  <td className="text-right py-2">{s.lastCycleDays?.toFixed(1) ?? '—'}</td>
                  <td className="py-2 text-red-600">{s.bottleneckStage ? PDCA_STAGE_LABEL[s.bottleneckStage] : '无'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Trophy size={16} className="text-yellow-500" /> 成功经验复用池
        </h2>
        {archived.length === 0 ? (
          <EmptyState icon={Trophy} title="尚无归档经验" description="通过 A 阶段选择『已解决,归档』沉淀方法论" />
        ) : (
          <div className="space-y-2">
            {archived.map((p) => (
              <div key={p.id} className="border border-slate-100 rounded p-3 text-sm">
                <div className="font-medium">{p.title}</div>
                <div className="text-xs text-slate-500 mt-1">
                  用 {p.currentCycle} 轮完成 · {p.updatedAt.slice(0, 10)}
                </div>
                {p.archivedLessons && p.archivedLessons.length > 0 && (
                  <ul className="text-xs text-slate-700 mt-2 list-disc list-inside">
                    {p.archivedLessons.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBlock({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  const toneClass: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  };
  return (
    <div className={`rounded-xl p-4 ${toneClass[tone]}`}>
      <div className="flex items-center gap-2 opacity-80 text-xs">{icon} {label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
