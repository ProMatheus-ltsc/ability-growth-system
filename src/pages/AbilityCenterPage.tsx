import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { EmptyState as CoreEmptyState, ResponsiveChart, ResponsiveGrid, TableScroll } from '@shared/core';
import { BarChart3, Radar as RadarIcon, TrendingUp, ChevronRight, Tags } from 'lucide-react';
import { useAppSession } from '../hooks/useAppSession';
import { findAbilities, findTrainingsByStudent, getAllRecords } from '../services/localDB';
import {
  aggregateBySubject,
  buildGrowthSeries,
  buildModuleStats,
  buildRadarSlices,
  buildTimeAllocation,
  resolveTargetPlan,
} from '../services/analytics';
import {
  DEFAULT_TIME_WINDOW,
  filterByWindow,
  TIME_WINDOW_LABEL,
  withWindowLabel,
  type TimeWindow,
} from '../services/timeWindow';
import { PageHeader } from '../components/PageHeader';
import { MasteryBar } from '../components/MasteryBar';
import { EmptyState } from '../components/EmptyState';
import { AbilityRadar } from '../components/RadarChart';
import { getAbilityTags, getModules } from '../domain/abilityTags';
import { normalizeAbilityPath } from '../domain/moduleNormalize';
import type { AbilitySnapshot, ExamRegistration, Subject, TrainingRecord } from '../domain/types';
import { SUBJECT_LABEL } from '../domain/types';
import { getAbilityCopy } from '../domain/abilityCopy';
import { WeaknessPanels } from './WeaknessPage';

const WINDOW_OPTIONS: TimeWindow[] = ['7d', '30d', '90d', 'all'];

export function AbilityCenterPage() {
  const { prefs } = useAppSession();
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [abilities, setAbilities] = useState<AbilitySnapshot[]>([]);
  const [registrations, setRegistrations] = useState<ExamRegistration[]>([]);
  const [subject, setSubject] = useState<Subject>(prefs.subjects[0] ?? 'math');
  // 统一时间窗口（验收缺陷 #6）：全站同一套 TimeWindow，指标标题自动带窗口
  const [windowKey, setWindowKey] = useState<TimeWindow>(DEFAULT_TIME_WINDOW);

  useEffect(() => {
    void findTrainingsByStudent(prefs.currentStudentId).then(setTrainings);
    void findAbilities(prefs.currentStudentId).then(setAbilities);
    void getAllRecords('registrations').then((list) =>
      setRegistrations(
        prefs.currentStudentId ? list.filter((r) => r.studentId === prefs.currentStudentId) : list,
      ),
    );
  }, [prefs.currentStudentId]);

  const windowedTrainings = useMemo(() => filterByWindow(trainings, windowKey), [trainings, windowKey]);

  // 目标分：报名表中当前学科的计划（老记录回退到未分科目标分）
  const targetScore = useMemo(
    () => resolveTargetPlan(registrations, prefs.currentStudentId, subject)?.targetScore,
    [registrations, prefs.currentStudentId, subject],
  );

  const radarSlices = useMemo(
    () => buildRadarSlices(windowedTrainings, abilities, prefs.gradeLevel, subject, targetScore),
    [windowedTrainings, abilities, prefs.gradeLevel, subject, targetScore],
  );

  const growth = useMemo(
    () => buildGrowthSeries(windowedTrainings, subject),
    [windowedTrainings, subject],
  );

  const moduleStats = useMemo(() => buildModuleStats(windowedTrainings), [windowedTrainings]);

  // 无样本模块保留「暂无」，按一级模块合并统计结果
  const moduleMastery = useMemo(() => {
    const modules = getModules(prefs.gradeLevel, subject);
    const byModule = new Map(
      moduleStats.filter((s) => s.subject === subject).map((s) => [s.module, s] as const),
    );
    return modules.map((m) => {
      const stat = byModule.get(m);
      return { module: m, score: stat?.masteryScore ?? null, samples: stat?.totalQuestions ?? 0 };
    });
  }, [moduleStats, prefs.gradeLevel, subject]);

  const timeAllocation = useMemo(
    () => buildTimeAllocation(windowedTrainings.filter((r) => r.subject === subject)),
    [windowedTrainings, subject],
  );

  const abilityCards = useMemo(() => {
    const tags = getAbilityTags(prefs.gradeLevel, subject);
    // 归一化能力路径后建索引，保证二级/一级粒度的历史快照都能对上标签
    const bySnapshotPath = new Map<string, AbilitySnapshot>();
    for (const a of abilities) {
      if (a.subject !== subject) continue;
      const key = normalizeAbilityPath(a.abilityPath, subject, prefs.gradeLevel);
      const prev = bySnapshotPath.get(key);
      if (!prev || a.evaluationTime > prev.evaluationTime) bySnapshotPath.set(key, a);
    }
    // 一级模块的最近快照（用于给同模块下的未测能力点提供兜底参考）
    const byModule = new Map<string, AbilitySnapshot>();
    for (const [key, snap] of bySnapshotPath) {
      const parts = key.split('/');
      const module = parts[1];
      if (!module) continue;
      const prev = byModule.get(module);
      if (!prev || snap.evaluationTime > prev.evaluationTime) byModule.set(module, snap);
    }
    return tags.map((t) => {
      const exact = bySnapshotPath.get(t.path);
      const moduleSnap = byModule.get(t.module);
      return { tag: t, snapshot: exact, moduleSnapshot: exact ? undefined : moduleSnap };
    });
  }, [prefs.gradeLevel, subject, abilities]);

  const stats = aggregateBySubject(windowedTrainings);
  const subjectStats = stats.find((s) => s.subject === subject);

  const copy = getAbilityCopy(prefs.gradeLevel);
  return (
    <div className="space-y-5">
      <PageHeader title={copy.pageTitle} description={copy.pageDescription} />

      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-400">时间窗口</span>
          {WINDOW_OPTIONS.map((w) => (
            <button
              key={w}
              className={`px-2 py-1 rounded-md ${
                windowKey === w ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}
              onClick={() => setWindowKey(w)}
            >
              {TIME_WINDOW_LABEL[w]}
            </button>
          ))}
        </div>
      </div>

      {subjectStats && (
        <ResponsiveGrid minItemWidth="160px" gap="0.75rem">
          <StatBlock
            label={withWindowLabel('综合掌握度', windowKey)}
            value={subjectStats.totalQuestions === 0 ? '无数据' : `${subjectStats.masteryScore}%`}
            tone="blue"
          />
          <StatBlock
            label={
              subjectStats.unfamiliarCorrectRate === null
                ? withWindowLabel('陌生题正确率(无样本)', windowKey)
                : withWindowLabel('陌生题正确率', windowKey)
            }
            value={
              subjectStats.unfamiliarCorrectRate === null
                ? '—'
                : `${Math.round(subjectStats.unfamiliarCorrectRate * 100)}%`
            }
            tone="emerald"
          />
          <StatBlock label={withWindowLabel('累计题量', windowKey)} value={subjectStats.totalQuestions} tone="slate" />
          <StatBlock label={withWindowLabel('累计错题', windowKey)} value={subjectStats.totalErrors} tone="orange" />
        </ResponsiveGrid>
      )}

      <p className="text-xs text-slate-400">
        掌握度口径：0.7 × 陌生题正确率 + 0.3 × 整体正确率（无陌生题样本时退化为整体正确率）；目标分只读报名记录，未设置则不画目标线。
        本周进步 / 限时达标 / 目标分差等结论卡统一在「分析中心 · 概览」。
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <RadarIcon size={16} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900">{withWindowLabel('能力雷达图', windowKey)}</h2>
            {targetScore === undefined && <span className="text-xs text-slate-400">未设置目标分</span>}
          </div>
          {radarSlices.length === 0 ? (
            <EmptyState icon={RadarIcon} title={copy.radarEmptyTitle} description={copy.radarEmptyDescription} />
          ) : (
            <AbilityRadar slices={radarSlices} />
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-emerald-600" />
            <h2 className="font-semibold text-slate-900">{withWindowLabel('能力增长曲线', windowKey)}</h2>
            {growth.some((p) => p.emergence) && (
              <span className="badge bg-purple-50 text-purple-700 text-[10px] ml-auto">
                ✨ 涌现点 {growth.filter((p) => p.emergence).length} 个
              </span>
            )}
          </div>
          {growth.length === 0 ? (
            <EmptyState icon={TrendingUp} title={copy.growthEmptyTitle} description={copy.growthEmptyDescription} />
          ) : growth.length < 2 ? (
            <EmptyState
              icon={TrendingUp}
              title={copy.growthShortTitle}
              description={copy.growthShortHint(growth.length)}
            />
          ) : (
            <>
              <ResponsiveChart minHeight="15rem" maxHeight="17.5rem">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={(props: { cx?: number; cy?: number; payload?: { emergence?: boolean } }) => {
                        const { cx = 0, cy = 0, payload } = props;
                        if (payload?.emergence) {
                          return (
                            <g key={`em-${cx}-${cy}`}>
                              <circle cx={cx} cy={cy} r={7} fill="#a855f7" stroke="#fff" strokeWidth={2} />
                              <text x={cx} y={cy - 12} textAnchor="middle" fontSize={10} fill="#7e22ce" fontWeight={700}>
                                ✨
                              </text>
                            </g>
                          );
                        }
                        return <circle key={`d-${cx}-${cy}`} cx={cx} cy={cy} r={3} fill="#2563eb" />;
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ResponsiveChart>
              {growth.some((p) => p.emergence) && (
                <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  ✨ <b className="text-purple-700">涌现点</b>:比前 5 周均值跃升 ≥ 12 分——九段心法·涌现的产品挂载, 微小叠加转变成系统力量。 单次循环平淡, 长期坚持会在某刻质变。
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-purple-600" />
          <h2 className="font-semibold text-slate-900">{withWindowLabel('各模块正确率', windowKey)}</h2>
          <span className="text-xs text-slate-400">模块口径：纯正确率，不复用学科加权掌握度公式</span>
        </div>
        {moduleMastery.every((m) => m.score === null) ? (
          <EmptyState icon={BarChart3} title={copy.moduleEmptyTitle} description={copy.moduleEmptyDescription} />
        ) : (
          <div className="space-y-3">
            {moduleMastery.map((m) => (
              <div key={m.module} className="flex items-center gap-3">
                <div className="w-32 text-sm text-slate-700 shrink-0">{m.module}</div>
                {m.score === null ? (
                  <div className="flex-1 text-xs text-slate-400">暂无</div>
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
          <BarChart3 size={16} className="text-blue-600" />
          <h2 className="font-semibold text-slate-900">{withWindowLabel('模块时间分配', windowKey)}</h2>
          <span className="text-xs text-slate-400">仅统计有有效用时的记录</span>
        </div>
        {timeAllocation.length === 0 ? (
          <CoreEmptyState title="暂无用时数据" description="录入训练时填写用时后，这里会按模块展示时间分配" />
        ) : (
          <TableScroll label="模块时间分配">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2">模块</th>
                  <th className="py-2 text-right">累计用时</th>
                  <th className="py-2 text-right">占比</th>
                  <th className="py-2 text-right">每题均时</th>
                  <th className="py-2 text-right">训练次数</th>
                </tr>
              </thead>
              <tbody>
                {timeAllocation.map((t) => (
                  <tr key={t.module} className="border-b border-slate-50">
                    <td className="py-2 text-slate-700">{t.module}</td>
                    <td className="py-2 text-right text-slate-600">{t.totalMinutes} 分</td>
                    <td className="py-2 text-right text-slate-600">{t.share}%</td>
                    <td className="py-2 text-right text-slate-600">
                      {t.avgMinutesPerQuestion === null ? '—' : `${t.avgMinutesPerQuestion} 分`}
                    </td>
                    <td className="py-2 text-right text-slate-600">{t.sessionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <ChevronRight size={16} className="text-slate-500" />
          <h2 className="font-semibold text-slate-900">三级能力标签明细</h2>
          <span className="text-xs text-slate-400">共 {abilityCards.length} 项</span>
        </div>
        {abilityCards.length === 0 ? (
          <EmptyState icon={BarChart3} title={copy.tagsEmptyTitle} />
        ) : (
          <ResponsiveGrid minItemWidth="280px" gap="0.5rem" className="max-h-[500px] overflow-y-auto">
            {abilityCards.map(({ tag, snapshot, moduleSnapshot }) => (
              <div key={tag.path} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-slate-700">
                    {tag.module} <span className="text-slate-400">·</span> {tag.point}
                  </div>
                  <span className="text-xs text-orange-500">{'★'.repeat(tag.difficulty)}</span>
                </div>
                {snapshot ? (
                  <MasteryBar score={snapshot.score} />
                ) : moduleSnapshot ? (
                  <div>
                    <MasteryBar score={moduleSnapshot.score} />
                    <div className="text-[10px] text-slate-400 mt-1">
                      参考同模块整体掌握度（该考点暂无单独测评）
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">未测评 · 掌握周期 {tag.cycle}</div>
                )}
              </div>
            ))}
          </ResponsiveGrid>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Tags size={16} className="text-orange-500" />
          <h2 className="font-semibold text-slate-900">薄弱点诊断</h2>
          <span className="text-xs text-slate-400">模块级 / 考点级 / 能力缺口级</span>
        </div>
        <WeaknessPanels subject={subject} />
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
