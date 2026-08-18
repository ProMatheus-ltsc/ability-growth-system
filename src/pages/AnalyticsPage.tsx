import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { BarChart3, TrendingUp, Wallet, AlertTriangle, Zap, Route } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { MasteryBar } from '../components/MasteryBar';
import { useAppSession } from '../hooks/useAppSession';
import { findGaps, findTrainingsByStudent } from '../services/localDB';
import {
  analyzeTrainingROI,
  analyzeMarginalYield,
  buildGrowthSeries,
  buildStageReport,
  detectFeedbackLoops,
  prioritizeGaps,
} from '../services/analytics';
import { ALL_TRANSFERS, TRANSFER_STRENGTH_LABEL } from '../domain/abilityTransfer';
import { ERROR_CATEGORY_LABEL, SUBJECT_LABEL } from '../domain/types';
import type { AbilityGap, Subject, TrainingRecord } from '../domain/types';

type Tab = 'roi' | 'stage' | 'marginal' | 'loops' | 'transfer';

export function AnalyticsPage() {
  const { prefs } = useAppSession();
  const [tab, setTab] = useState<Tab>('roi');
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [gaps, setGaps] = useState<AbilityGap[]>([]);
  const [subject, setSubject] = useState<Subject>(prefs.subjects[0] ?? 'math');

  useEffect(() => {
    void findTrainingsByStudent(prefs.currentStudentId).then(setTrainings);
    void findGaps(prefs.currentStudentId).then(setGaps);
  }, [prefs.currentStudentId]);

  const roi = useMemo(() => analyzeTrainingROI(trainings), [trainings]);
  const stageReport = useMemo(() => {
    const now = new Date();
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    return buildStageReport(trainings, gaps, monthAgo.toISOString().slice(0, 10), now.toISOString().slice(0, 10));
  }, [trainings, gaps]);
  const marginal = useMemo(() => analyzeMarginalYield(trainings, subject), [trainings, subject]);
  const feedbackLoops = useMemo(() => detectFeedbackLoops(trainings, gaps), [trainings, gaps]);
  const growthSeries = useMemo(() => buildGrowthSeries(trainings, subject), [trainings, subject]);
  const priorityGaps = useMemo(() => prioritizeGaps(gaps.filter((g) => g.status === 'unresolved')), [gaps]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="训练收益 & 阶段报告"
        description="识别你的最有效训练方式、边际收益递减点、恶性反馈回路、以及能力迁移杠杆。"
      />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { k: 'roi', label: '训练收益' },
            { k: 'stage', label: '阶段报告' },
            { k: 'marginal', label: '投入产出曲线' },
            { k: 'loops', label: '恶性反馈回路' },
            { k: 'transfer', label: '能力迁移杠杆' },
          ] as Array<{ k: Tab; label: string }>
        ).map((it) => (
          <button
            key={it.k}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === it.k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
            onClick={() => setTab(it.k)}
          >
            {it.label}
          </button>
        ))}
      </div>

      {tab === 'roi' && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-2">
            <Wallet size={16} /> 各训练方式单位时间收益
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            对比不同训练方式在你身上的收益率(能力掌握度增量 / 小时)。 "错误修复的单位时间收益最高" 是常见规律。
          </p>
          {roi.length === 0 ? (
            <EmptyState icon={Wallet} title="数据不足" description="每种训练方式至少 2 次记录后可分析" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={roi} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="perHour" fill="#2563eb" name="每小时能力增量" />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 text-sm text-slate-600 space-y-1">
                {roi.slice(0, 3).map((r) => (
                  <div key={r.trainingType}>
                    <b>{r.label}</b>: {r.hours} 小时 → 能力 {r.abilityDelta >= 0 ? '+' : ''}
                    {r.abilityDelta}% (每小时 {r.perHour >= 0 ? '+' : ''}
                    {r.perHour}%)
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'stage' && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-600" />
            <h2 className="font-semibold">近 30 天阶段报告</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="训练次数" value={String(stageReport.trainingsCount)} />
            <StatCard label="累计题量" value={String(stageReport.totalQuestions)} />
            <StatCard label="累计错题" value={String(stageReport.totalErrors)} />
            <StatCard label="总投入(小时)" value={String(stageReport.totalHours)} />
          </div>

          <div>
            <div className="font-medium text-slate-800 mb-2">各学科能力增量</div>
            {Object.keys(stageReport.masteryDelta).length === 0 ? (
              <div className="text-sm text-slate-500">数据不足以计算前后阶段能力对比</div>
            ) : (
              <div className="space-y-1 text-sm">
                {Object.entries(stageReport.masteryDelta).map(([subj, delta]) => (
                  <div key={subj} className="flex items-center gap-2">
                    <span className="w-20 text-slate-600">{SUBJECT_LABEL[subj as Subject]}</span>
                    <span className={delta >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {delta >= 0 ? '+' : ''}
                      {delta}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="font-medium text-slate-800 mb-2">错误复现率 Top5</div>
            <div className="space-y-2">
              {stageReport.errorRecurrence.map((e) => (
                <div key={e.category} className="flex items-center gap-3">
                  <span className="w-32 text-sm text-slate-600">{ERROR_CATEGORY_LABEL[e.category]}</span>
                  <MasteryBar score={Math.round(e.rate * 100)} showLabel={false} className="flex-1" />
                </div>
              ))}
            </div>
          </div>

          {stageReport.topBottlenecks.length > 0 && (
            <div>
              <div className="font-medium text-slate-800 mb-2">主要瓶颈</div>
              <div className="text-sm text-slate-700">
                {stageReport.topBottlenecks.map((b) => (
                  <span key={b} className="badge bg-orange-50 text-orange-700 mr-2">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}

          {stageReport.suggestions.length > 0 && (
            <div className="p-3 rounded bg-blue-50 text-sm text-blue-900">
              <div className="font-medium mb-1">下阶段建议</div>
              <ul className="list-disc list-inside">
                {stageReport.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'marginal' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-600" /> 训练投入-产出曲线
            </h2>
            <select className="input py-1 max-w-[140px]" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              {prefs.subjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-slate-500 mb-3">
            识别收益递减点: 每小时训练带来的能力增长开始明显下降的位置。
            {marginal.diminishingReturnHour && (
              <span className="text-orange-600 ml-2">检测到边际递减点约在第 {marginal.diminishingReturnHour} 小时</span>
            )}
          </p>
          {marginal.points.length === 0 ? (
            <EmptyState icon={TrendingUp} title="数据不足" description="该学科尚无足够训练累计数据" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={marginal.points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="cumulativeHours" tick={{ fontSize: 11 }} label={{ value: '累计小时', position: 'bottom', offset: -5, fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="mastery" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="掌握度" />
                </LineChart>
              </ResponsiveContainer>

              <div className="mt-4">
                <div className="font-medium text-slate-800 mb-2 flex items-center gap-2">
                  周维度增长趋势
                  {growthSeries.some((p) => p.emergence) && (
                    <span className="badge bg-purple-50 text-purple-700 text-[10px]">
                      ✨ 检出涌现点 {growthSeries.filter((p) => p.emergence).length} 个
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={growthSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#2563eb"
                      name="整体正确率"
                      dot={(props: { cx?: number; cy?: number; payload?: { emergence?: boolean } }) => {
                        const { cx = 0, cy = 0, payload } = props;
                        if (payload?.emergence) {
                          return (
                            <g key={`em-${cx}-${cy}`}>
                              <circle cx={cx} cy={cy} r={6} fill="#a855f7" stroke="#fff" strokeWidth={2} />
                              <text x={cx} y={cy - 10} textAnchor="middle" fontSize={10} fill="#7e22ce">
                                涌现
                              </text>
                            </g>
                          );
                        }
                        return <circle key={`d-${cx}-${cy}`} cx={cx} cy={cy} r={3} fill="#2563eb" />;
                      }}
                    />
                    <Line type="monotone" dataKey="unfamiliar" stroke="#f59e0b" name="陌生题正确率" strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
                {growthSeries.some((p) => p.emergence) && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    ✨ 涌现点:比前 5 周均值跃升 ≥ 12 分——九段心法·涌现的产品挂载(长期积累后的非线性跃迁)
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'loops' && (
        <div className="card p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-500" /> 恶性反馈回路
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            同一类错误持续 4 周以上仍在复现且缺乏对应修复动作, 视为恶性反馈回路。 需要打破循环。
          </p>
          {feedbackLoops.length === 0 ? (
            <EmptyState icon={Zap} title="未检测到恶性反馈回路" description="继续保持" />
          ) : (
            <div className="space-y-2">
              {feedbackLoops.map((l) => (
                <div key={l.category} className="border border-red-100 bg-red-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-red-700">{ERROR_CATEGORY_LABEL[l.category]}</span>
                    <span className="text-sm text-red-600">复现率 {Math.round(l.recurrenceRate * 100)}%</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    持续 {l.weeks} 周 · 已尝试 {l.attemptedFixes} 次修复
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'transfer' && (
        <div className="card p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <Route size={16} className="text-emerald-600" /> 能力迁移与杠杆点
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            一项能力提升可通过迁移带动关联能力。 找到"高迁移强度、当前掌握度较低"的能力点作为杠杆点。
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {priorityGaps.slice(0, 5).map((g) => {
              const point = g.abilityPath.split('/').slice(-1)[0];
              const related = ALL_TRANSFERS.filter((e) => e.to.includes(point) || e.from.includes(point)).slice(0, 3);
              return (
                <div key={g.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="font-medium text-slate-800">
                    {point} <span className="text-xs text-slate-400">({SUBJECT_LABEL[g.subject]})</span>
                  </div>
                  {related.length === 0 ? (
                    <div className="text-xs text-slate-400 mt-1">未检索到已知迁移关系</div>
                  ) : (
                    <div className="mt-2 space-y-1 text-xs">
                      {related.map((e, i) => (
                        <div key={i} className="text-slate-600">
                          <span className="badge bg-slate-100 text-slate-700 mr-1">{TRANSFER_STRENGTH_LABEL[e.strength]}</span>
                          {e.from} → {e.to}
                          {e.note && <span className="text-slate-400 ml-1">({e.note})</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 bg-slate-100">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}
