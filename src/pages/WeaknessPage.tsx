/**
 * 薄弱点视图（阶段三）：把原先分散在三个页面的「哪里弱」合并到一处，内部分三档。
 *
 * - 模块级：训练记录按知识模块汇总，分母 = 训练记录题数
 * - 考点级：labelStats 的考点路径排名，分母 = 题目作答次数（与模块级不同，页面明确标注）
 * - 能力缺口级：由训练记录派生的 gaps（未解决优先）
 *
 * 只读页面：不写入任何 store，不改动已有统计口径。
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, BarChart3, Layers, Tags } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { findGaps, findTrainingsByStudent } from '../services/localDB';
import { buildModuleStats } from '../services/analytics';
import { SUBJECT_LABEL, type AbilityGap, type Subject, type TrainingRecord } from '../domain/types';
import { LabelRankingPage } from './LabelRankingPage';

type WeaknessTab = 'module' | 'label' | 'gap';

const TABS: Array<{ key: WeaknessTab; label: string; icon: typeof Layers }> = [
  { key: 'module', label: '模块级', icon: Layers },
  { key: 'label', label: '考点级', icon: Tags },
  { key: 'gap', label: '能力缺口级', icon: AlertOctagon },
];

const SEVERITY_LABEL: Record<AbilityGap['severity'], string> = {
  light: '轻微',
  medium: '中等',
  serious: '严重',
};

const SEVERITY_CLASS: Record<AbilityGap['severity'], string> = {
  light: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-50 text-amber-700',
  serious: 'bg-red-50 text-red-700',
};

export function WeaknessPage() {
  const { prefs } = useAppSession();
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [gaps, setGaps] = useState<AbilityGap[]>([]);
  const [tab, setTab] = useState<WeaknessTab>('module');

  useEffect(() => {
    void findTrainingsByStudent(prefs.currentStudentId).then(setTrainings);
    void findGaps(prefs.currentStudentId).then(setGaps);
  }, [prefs.currentStudentId]);

  const subjectsInData = useMemo(
    () => Array.from(new Set(trainings.map((t) => t.subject))) as Subject[],
    [trainings],
  );
  const [subject, setSubject] = useState<Subject | null>(null);
  const activeSubject = subject && subjectsInData.includes(subject) ? subject : (subjectsInData[0] ?? null);

  const moduleStats = useMemo(() => {
    const list = activeSubject ? trainings.filter((t) => t.subject === activeSubject) : trainings;
    return buildModuleStats(list)
      .filter((m) => m.masteryScore !== null)
      .sort((a, b) => (a.masteryScore ?? 0) - (b.masteryScore ?? 0) || b.totalQuestions - a.totalQuestions);
  }, [trainings, activeSubject]);

  const openGaps = useMemo(() => {
    const list = activeSubject ? gaps.filter((g) => g.subject === activeSubject) : gaps;
    const order: Record<AbilityGap['severity'], number> = { serious: 0, medium: 1, light: 2 };
    return [...list]
      .filter((g) => g.status !== 'verified')
      .sort((a, b) => order[a.severity] - order[b.severity] || b.occurrenceCount - a.occurrenceCount);
  }, [gaps, activeSubject]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="薄弱点"
        description="三档口径统一入口：模块级 / 考点级 / 能力缺口级，均按薄弱程度从高到低排列"
      />

      <div className="card p-3 text-xs text-slate-500 leading-relaxed">
        三档分母不同，不要横向比较百分比：<b className="text-slate-700">模块级</b>按训练记录题数、
        <b className="text-slate-700">考点级</b>按题目作答次数（云端 labelStats 聚合）、
        <b className="text-slate-700">能力缺口级</b>是按错误类型累计的出现次数。
      </div>

      {subjectsInData.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {subjectsInData.map((s) => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                s === activeSubject ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {SUBJECT_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
              tab === key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'module' && (
        <div className="card p-4 space-y-2">
          {moduleStats.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="尚无模块级数据"
              description="先在训练记录里录入带知识模块的训练，这里会按模块正确率从低到高排列"
            />
          ) : (
            moduleStats.map((m, i) => (
              <div key={`${m.subject}-${m.module}`} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
                <div className="min-w-0">
                  <div className="text-sm text-slate-900 truncate">
                    <span className="text-slate-400 mr-2">#{i + 1}</span>
                    {m.module}
                  </div>
                  <div className="text-xs text-slate-500">
                    {SUBJECT_LABEL[m.subject]} · 训练 {m.sampleCount} 次 · {m.totalQuestions} 题 · 错 {m.totalErrors} 题
                    {m.lastSeenAt ? ` · 最近 ${m.lastSeenAt}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-semibold ${(m.masteryScore ?? 0) < 60 ? 'text-red-600' : (m.masteryScore ?? 0) < 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {m.masteryScore}%
                  </div>
                  <div className="text-[11px] text-slate-400">模块正确率</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'label' && <LabelRankingPage embedded />}

      {tab === 'gap' && (
        <div className="card p-4 space-y-2">
          {openGaps.length === 0 ? (
            <EmptyState
              icon={AlertOctagon}
              title="没有未解决的能力缺口"
              description="训练记录里出现错误后会自动派生缺口；已标记验证的缺口不再列出"
            />
          ) : (
            openGaps.map((g, i) => (
              <div key={g.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
                <div className="min-w-0">
                  <div className="text-sm text-slate-900 truncate">
                    <span className="text-slate-400 mr-2">#{i + 1}</span>
                    {g.abilityPath}
                  </div>
                  <div className="text-xs text-slate-500">
                    {SUBJECT_LABEL[g.subject]} · {g.errorCategory} · 出现 {g.occurrenceCount} 次 · 首次 {g.firstSeenAt}
                  </div>
                </div>
                <span className={`badge shrink-0 ${SEVERITY_CLASS[g.severity]}`}>{SEVERITY_LABEL[g.severity]}</span>
              </div>
            ))
          )}
          <div className="pt-2 text-xs text-slate-400">
            缺口可在 <Link to="/problems" className="text-blue-600 hover:underline">问题中心</Link> 转为 PDCA 跟进。
          </div>
        </div>
      )}
    </div>
  );
}
