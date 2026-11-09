import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  EmptyState as CoreEmptyState,
  ResponsiveChart,
  ResponsiveGrid,
  StatCard,
  TableScroll,
} from '@shared/core';
import { BarChart3, TrendingUp, Wallet, AlertTriangle, Zap, Route, Target, Clock, Layers } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { MasteryBar } from '../components/MasteryBar';
import { useAppSession } from '../hooks/useAppSession';
import { findGaps, findTrainingsByStudent, getAllRecords } from '../services/localDB';
import {
  aggregateBySubject,
  analyzeTrainingROI,
  analyzeMarginalYield,
  buildGrowthSeries,
  buildModuleStats,
  buildStageReport,
  buildTimeAllocation,
  buildWeeklyDelta,
  computeTargetGap,
  detectFeedbackLoops,
  prioritizeGaps,
  resolveTargetScore,
  selectAggregationRecords,
  timedComplianceRate,
} from '../services/analytics';
import {
  DEFAULT_TIME_WINDOW,
  filterByWindow,
  TIME_WINDOW_LABEL,
  withWindowLabel,
  windowStartDate,
  type TimeWindow,
} from '../services/timeWindow';
import { CausalTab, ForecastTab, LeverageTab, SimulationTab, StrategyTab } from './InsightsPage';
import { ALL_TRANSFERS, TRANSFER_STRENGTH_LABEL } from '../domain/abilityTransfer';
import { ERROR_CATEGORY_LABEL, SUBJECT_LABEL } from '../domain/types';
import type { AbilityGap, ExamRegistration, Subject, TrainingRecord } from '../domain/types';
import { getAnalyticsCopy } from '../domain/analyticsCopy';
import { getInsightsCopy } from '../domain/insightsCopy';

/**
 * 分析中心（阶段三）：原「训练收益」页与「深度洞察」页合并。
 * Tab 划分：概览 / 模块与时间 / 收益与预测 / 策略与因果。
 * 页面头部统一提供「学科选择器 + 时间窗口」，四个 Tab 共用同一份口径：
 * - 掌握度：0.7 × 陌生题正确率 + 0.3 × 整体正确率（模块层只叫「模块正确率」）；
 * - 目标分：只读报名表 targetScore；
 * - 时间窗口：TimeWindow（默认近 30 天），指标标题自动带窗口。
 */
type Tab = 'overview' | 'modules' | 'roi' | 'strategy';

const WINDOW_OPTIONS: TimeWindow[] = ['7d', '30d', '90d', 'all'];

export function AnalyticsPage() {
  const { prefs } = useAppSession();
  const [tab, setTab] = useState<Tab>('overview');
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [gaps, setGaps] = useState<AbilityGap[]>([]);
  const [registrations, setRegistrations] = useState<ExamRegistration[]>([]);
  const [subject, setSubject] = useState<Subject>(prefs.subjects[0] ?? 'math');
  const [windowKey, setWindowKey] = useState<TimeWindow>(DEFAULT_TIME_WINDOW);

  useEffect(() => {
    void findTrainingsByStudent(prefs.currentStudentId).then(setTrainings);
    void findGaps(prefs.currentStudentId).then(setGaps);
    void getAllRecords('registrations').then((list) =>
      setRegistrations(
        prefs.currentStudentId ? list.filter((r) => r.studentId === prefs.currentStudentId) : list,
      ),
    );
  }, [prefs.currentStudentId]);

  // 统一时间窗口：所有 Tab 共用
  const windowedTrainings = useMemo(() => filterByWindow(trainings, windowKey), [trainings, windowKey]);
  // A1 口径：整卷+模块不重复计入（用于学科级指标）
  const aggregationTrainings = useMemo(() => selectAggregationRecords(windowedTrainings), [windowedTrainings]);

  const targetScore = useMemo(
    () => resolveTargetScore(registrations, prefs.currentStudentId),
    [registrations, prefs.currentStudentId],
  );
  const stats = aggregateBySubject(windowedTrainings);
  const subjectStats = stats.find((s) => s.subject === subject);

  const weeklyDelta = useMemo(() => buildWeeklyDelta(aggregationTrainings, subject), [aggregationTrainings, subject]);
  const timed = useMemo(() => timedComplianceRate(aggregationTrainings), [aggregationTrainings]);
  // 目标分差只按当前选中学科统计（与页头学科切换保持一致）
  const targetGap = useMemo(
    () => computeTargetGap(subjectStats ? [subjectStats] : [], targetScore),
    [subjectStats, targetScore],
  );
  const moduleStats = useMemo(() => buildModuleStats(windowedTrainings), [windowedTrainings]);
  const weakestModule = useMemo(() => {
    const list = moduleStats
      .filter((m) => m.subject === subject && m.correctRate !== null)
      .sort((a, b) => (a.correctRate ?? 100) - (b.correctRate ?? 100));
    return list[0] ?? null;
  }, [moduleStats, subject]);

  const roi = useMemo(() => analyzeTrainingROI(aggregationTrainings), [aggregationTrainings]);
  const marginal = useMemo(() => analyzeMarginalYield(aggregationTrainings, subject), [aggregationTrainings, subject]);
  const feedbackLoops = useMemo(() => detectFeedbackLoops(aggregationTrainings, gaps), [aggregationTrainings, gaps]);
  const growthSeries = useMemo(() => buildGrowthSeries(windowedTrainings, subject), [windowedTrainings, subject]);
  const timeAllocation = useMemo(
    () => buildTimeAllocation(windowedTrainings.filter((r) => r.subject === subject)),
    [windowedTrainings, subject],
  );
  const priorityGaps = useMemo(() => prioritizeGaps(gaps.filter((g) => g.status === 'unresolved')), [gaps]);
  const stageReport = useMemo(() => {
    const start = windowStartDate(windowKey) ?? '1970-01-01';
    const today = new Date().toISOString().slice(0, 10);
    return buildStageReport(aggregationTrainings, gaps, start, today);
  }, [aggregationTrainings, gaps, windowKey]);

  const copy = getAnalyticsCopy(prefs.gradeLevel);
  const insightsCopy = getInsightsCopy(prefs.gradeLevel);

  return (
    <div className="space-y-5">
      <PageHeader
        title="分析中心"
        description="掌握度、目标分、时间窗口全站唯一口径；原来分散在「训练收益 / 深度洞察」的看板集中在这里。"
      />

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

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { k: 'overview', label: '概览' },
            { k: 'modules', label: '模块与时间' },
            { k: 'roi', label: '收益与预测' },
            { k: 'strategy', label: '策略与因果' },
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

      {tab === 'overview' && (
        <>
          {/* 结论区四张卡：全站唯一渲染点（工作台/能力中心不再重复渲染） */}
          <ResponsiveGrid minItemWidth="220px" gap="1rem">
            <StatCard
              label={withWindowLabel(`本周 vs 上周 · ${SUBJECT_LABEL[subject]}`, windowKey)}
              value={
                weeklyDelta?.deltaCorrectRate == null
                  ? '—'
                  : `${weeklyDelta.deltaCorrectRate > 0 ? '+' : ''}${weeklyDelta.deltaCorrectRate}pt`
              }
              hint={
                weeklyDelta === null
                  ? '该周暂无整卷记录'
                  : weeklyDelta.previousWeek === null
                    ? '暂无上周对比'
                    : `本周正确率 ${weeklyDelta.currentAcc}% · 上周 ${weeklyDelta.previousAcc}%`
              }
              accentClassName={
                weeklyDelta?.deltaCorrectRate == null
                  ? 'text-slate-600'
                  : weeklyDelta.deltaCorrectRate > 0
                    ? 'text-emerald-600'
                    : weeklyDelta.deltaCorrectRate < 0
                      ? 'text-red-500'
                      : 'text-slate-600'
              }
            />
            <StatCard
              label={withWindowLabel('限时达标率', windowKey)}
              value={timed.rate === null ? '—' : `${timed.rate}%`}
              hint={
                timed.sampleSize === 0
                  ? timed.inferredSamples > 0
                    ? `仅有推断基准 ${timed.inferredSamples} 条，未参与计算`
                    : '暂无时间基准（缺失不计入分母）'
                  : `真实基准 ${timed.sampleSize} 条${timed.inferredSamples > 0 ? ` · 推断基准 ${timed.inferredSamples} 条已排除` : ''}`
              }
              accentClassName={
                timed.rate === null ? 'text-slate-600' : timed.rate >= 80 ? 'text-emerald-600' : 'text-orange-600'
              }
            />
            {targetGap === null ? (
              <Link to="/registrations" className="block rounded-xl" title="去填写报考信息">
                <StatCard
                  label="目标分差"
                  value="—"
                  hint="未设置目标分，去填写报考信息 →"
                  accentClassName="text-blue-600"
                />
              </Link>
            ) : (
              <StatCard
                label="目标分差"
                value={
                  targetGap.current === null
                    ? '暂无样本'
                    : targetGap.reached
                      ? '已达标'
                      : `差 ${targetGap.gap} 分`
                }
                hint={
                  targetGap.current === null
                    ? `目标 ${targetGap.target}% · 有效样本 0 题（缺失不当 0 分）`
                    : `有效样本 ${targetGap.sampleQuestions} 题 · 当前 ${targetGap.current}% · 目标 ${targetGap.target}%（掌握度口径，非卷面分）`
                }
                accentClassName={targetGap.reached ? 'text-emerald-600' : 'text-orange-600'}
              />
            )}
            <StatCard
              label={`最弱模块 · ${SUBJECT_LABEL[subject]}`}
              value={weakestModule === null ? '—' : weakestModule.module}
              hint={
                weakestModule === null
                  ? '暂无模块样本'
                  : `模块正确率 ${weakestModule.masteryScore}% · 累计 ${weakestModule.totalQuestions} 题`
              }
              accentClassName="text-orange-600"
            />
          </ResponsiveGrid>

          <div className="card p-4 text-xs text-slate-500 leading-relaxed">
            <b className="text-slate-700">口径说明</b>：掌握度 = 0.7 × 陌生题正确率 + 0.3 × 整体正确率（无陌生题样本退化为整体正确率）；
            模块层不套用该加权，统一称「模块正确率」；目标分只读报名记录 targetScore；时间窗口全站共用
            {TIME_WINDOW_LABEL[windowKey]}。
          </div>

          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-blue-600" />
              <h2 className="font-semibold text-slate-900">{withWindowLabel('阶段报告', windowKey)}</h2>
            </div>
            <ResponsiveGrid minItemWidth="160px" gap="0.75rem">
              <StatCard label="训练次数" value={String(stageReport.trainingsCount)} />
              <StatCard label="累计题量" value={String(stageReport.totalQuestions)} />
              <StatCard label="累计错题" value={String(stageReport.totalErrors)} />
              <StatCard label="总投入(小时)" value={String(stageReport.totalHours)} />
            </ResponsiveGrid>

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
        </>
      )}

      {tab === 'modules' && (
        <>
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Layers size={16} className="text-purple-600" />
              <h2 className="font-semibold text-slate-900">{withWindowLabel(`模块正确率 · ${SUBJECT_LABEL[subject]}`, windowKey)}</h2>
              <span className="text-xs text-slate-400">模块口径：纯正确率，不做陌生题加权</span>
            </div>
            {moduleStats.filter((m) => m.subject === subject).length === 0 ? (
              <EmptyState icon={Layers} title="暂无模块数据" description="录入训练后可查看各模块正确率" />
            ) : (
              <TableScroll label="模块正确率">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="py-2">模块</th>
                      <th className="py-2 text-right">模块正确率</th>
                      <th className="py-2 text-right">题量</th>
                      <th className="py-2 text-right">错题</th>
                      <th className="py-2 text-right">每题均时</th>
                      <th className="py-2 text-right">最近训练</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moduleStats
                      .filter((m) => m.subject === subject)
                      .map((m) => (
                        <tr key={m.module} className="border-b border-slate-50">
                          <td className="py-2 text-slate-700">{m.module}</td>
                          <td className="py-2 text-right text-slate-600">{m.masteryScore === null ? '暂无' : `${m.masteryScore}%`}</td>
                          <td className="py-2 text-right text-slate-600">{m.totalQuestions}</td>
                          <td className="py-2 text-right text-slate-600">{m.totalErrors}</td>
                          <td className="py-2 text-right text-slate-600">
                            {m.avgMinutesPerQuestion === null ? '—' : `${m.avgMinutesPerQuestion} 分`}
                          </td>
                          <td className="py-2 text-right text-slate-400 text-xs">{m.lastSeenAt?.slice(0, 10) ?? '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-blue-600" />
              <h2 className="font-semibold text-slate-900">{withWindowLabel(`模块时间分配 · ${SUBJECT_LABEL[subject]}`, windowKey)}</h2>
              <span className="text-xs text-slate-400">整卷与模块并存时保留模块明细，不重复计时</span>
            </div>
            {timeAllocation.length === 0 ? (
              <CoreEmptyState title="暂无用时数据" description="录入训练时填写用时后展示模块时间分配" />
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
              <TrendingUp size={16} className="text-emerald-600" />
              <h2 className="font-semibold text-slate-900">{withWindowLabel(`增长曲线 · ${SUBJECT_LABEL[subject]}`, windowKey)}</h2>
              {growthSeries.some((p) => p.emergence) && (
                <span className="badge bg-purple-50 text-purple-700 text-[10px]">
                  ✨ 涌现点 {growthSeries.filter((p) => p.emergence).length} 个
                </span>
              )}
            </div>
            {growthSeries.length === 0 ? (
              <EmptyState icon={TrendingUp} title="暂无增长数据" description="完成两周以上训练后可查看增长曲线" />
            ) : (
              <ResponsiveChart minHeight="13rem" maxHeight="15rem">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={growthSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="score" stroke="#2563eb" name="整体正确率" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="unfamiliar" stroke="#f59e0b" name="陌生题正确率" strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </ResponsiveChart>
            )}
          </div>
        </>
      )}

      {tab === 'roi' && (
        <>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-2">
              <Wallet size={16} /> {withWindowLabel('各训练方式单位时间收益', windowKey)}
            </h2>
            <p className="text-sm text-slate-500 mb-3">
              对比不同训练方式在你身上的收益率(能力掌握度增量 / 小时)。 "错误修复的单位时间收益最高" 是常见规律。
            </p>
            {roi.length === 0 ? (
              <EmptyState icon={Wallet} title={copy.effEmptyTitle} description={copy.effEmptyDescription} />
            ) : (
              <>
                <ResponsiveChart minHeight="15rem" maxHeight="17.5rem">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={roi} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="perHour" fill="#2563eb" name="每小时能力增量" />
                    </BarChart>
                  </ResponsiveContainer>
                </ResponsiveChart>
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

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-600" /> {withWindowLabel('训练投入-产出曲线', windowKey)}
              </h2>
              <span className="text-xs text-slate-500">{SUBJECT_LABEL[subject]}</span>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              识别收益递减点: 每小时训练带来的能力增长开始明显下降的位置。
              {marginal.diminishingReturnHour && (
                <span className="text-orange-600 ml-2">检测到边际递减点约在第 {marginal.diminishingReturnHour} 小时</span>
              )}
            </p>
            {marginal.points.length === 0 ? (
              <EmptyState icon={TrendingUp} title={copy.transferEmptyTitle} description={copy.transferEmptyDescription} />
            ) : (
              <ResponsiveChart minHeight="15rem" maxHeight="17.5rem">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={marginal.points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="cumulativeHours"
                      tick={{ fontSize: 11 }}
                      label={{ value: '累计小时', position: 'bottom', offset: -5, fontSize: 11 }}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="mastery" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="掌握度" />
                  </LineChart>
                </ResponsiveContainer>
              </ResponsiveChart>
            )}
          </div>

          <ForecastTab records={windowedTrainings} subjects={prefs.subjects} copy={insightsCopy} targetScore={targetScore} />
          <SimulationTab records={windowedTrainings} subjects={prefs.subjects} targetScore={targetScore} />
        </>
      )}

      {tab === 'strategy' && (
        <>
          <StrategyTab records={aggregationTrainings} gaps={gaps} copy={insightsCopy} />
          <CausalTab records={aggregationTrainings} gaps={gaps} copy={insightsCopy} />

          <div className="card p-5">
            <h2 className="font-semibold flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-red-500" /> 恶性反馈回路
            </h2>
            <p className="text-sm text-slate-500 mb-3">
              同一类错误持续 4 周以上仍在复现且缺乏对应修复动作, 视为恶性反馈回路。 需要打破循环。
            </p>
            {feedbackLoops.length === 0 ? (
              <EmptyState icon={Zap} title={copy.loopEmptyTitle} description={copy.loopEmptyDescription} />
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

          <LeverageTab gaps={gaps} copy={insightsCopy} />

          <div className="card p-5">
            <h2 className="font-semibold flex items-center gap-2 mb-3">
              <Route size={16} className="text-emerald-600" /> 能力迁移与杠杆点
            </h2>
            <p className="text-sm text-slate-500 mb-3">
              一项能力提升可通过迁移带动关联能力。 找到"高迁移强度、当前掌握度较低"的能力点作为杠杆点。
            </p>
            {priorityGaps.length === 0 ? (
              <EmptyState icon={Target} title="暂无待修复缺口" description="问题中心登记缺口后可计算迁移杠杆" />
            ) : (
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
                              <span className="badge bg-slate-100 text-slate-700 mr-1">
                                {TRANSFER_STRENGTH_LABEL[e.strength]}
                              </span>
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
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-semibold flex items-center gap-2 mb-3">
              <BarChart3 size={16} className="text-slate-500" /> 错误复现率
            </h2>
            <div className="space-y-2">
              {stageReport.errorRecurrence.length === 0 ? (
                <div className="text-sm text-slate-500">暂无错误分类数据</div>
              ) : (
                stageReport.errorRecurrence.map((e) => (
                  <div key={e.category} className="flex items-center gap-3">
                    <span className="w-32 text-sm text-slate-600">{ERROR_CATEGORY_LABEL[e.category]}</span>
                    <MasteryBar score={Math.round(e.rate * 100)} showLabel={false} className="flex-1" />
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {subjectStats === undefined && (
        <div className="text-xs text-slate-400">
          当前学科在{TIME_WINDOW_LABEL[windowKey]}内无训练记录，切换时间窗口或学科查看。
        </div>
      )}
    </div>
  );
}
