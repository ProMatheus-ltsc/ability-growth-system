import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Target, CheckCircle2, TrendingUp, CalendarClock, RefreshCw, PlusCircle, CalendarRange, Timer, Star, Flag } from 'lucide-react';
import { ResponsiveGrid } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { findTrainingsInRange, findGaps, findAbilities, findTasks, findReviews, getAllRecords } from '../services/localDB';
import { aggregateBySubject, prioritizeGaps } from '../services/analytics';
import { PageHeader } from '../components/PageHeader';
import { MasteryBar } from '../components/MasteryBar';
import { EmptyState } from '../components/EmptyState';
import { PdcaCalendarBoard } from '../components/PdcaCalendarBoard';
import { GRADE_LEVEL_LABEL, MODULE_VISIBILITY, PLAN_STAGE_LABEL, SUBJECT_LABEL } from '../domain/types';
import type { AbilityGap, GradeLevel, TrainingRecord, AbilitySnapshot, FixTask, ReviewRecord, ExamRegistration, StagePlan } from '../domain/types';

/** V5.11 §7 · 学段差异化文案(小学游戏化 / 公考直白 / K12 中性) */
const GRADE_TONE: Record<GradeLevel, {
  title: string;
  desc: string;
  actionLabel: string;
  focusTitle: string;
  reviewTitle: string;
  metricGap: string;
  metricTrain: string;
  metricAbility: string;
  todayFocusEmpty: string;
  focusPrefix: string;
}> = {
  primary: {
    title: '今天的闯关任务 🌟',
    desc: '小任务闯一闯:练一练 → 找找错在哪 → 把弱项补回来 → 再来一次 → 变得更厉害!',
    actionLabel: '开始小任务',
    focusTitle: '今天要闯的关卡 🎯',
    reviewTitle: '今天的小结 🎈',
    metricGap: '要修理的小怪兽',
    metricTrain: '这个月练了几次',
    metricAbility: '收集到的能力星星',
    todayFocusEmpty: '所有小怪兽都被打败啦, 继续保持! 🎉',
    focusPrefix: '打怪',
  },
  junior: {
    title: '今天该做点什么',
    desc: '练一次 → 看看哪里错了 → 补一补 → 再验证 · 一点一点变强',
    actionLabel: '记一次练习',
    focusTitle: '今天要搞定的事',
    reviewTitle: '今日回顾',
    metricGap: '还没解决的薄弱点',
    metricTrain: '本月练了几次',
    metricAbility: '能力记录数',
    todayFocusEmpty: '目前没有卡住的地方,继续保持 👍',
    focusPrefix: '补齐',
  },
  senior: {
    title: '今日工作台',
    desc: '目标 → 训练 → 错题定位 → 弱项修复 → 验证闭环 · 提高陌生题正确率',
    actionLabel: '记录训练',
    focusTitle: '今日重点',
    reviewTitle: '今日复盘',
    metricGap: '待修复弱项',
    metricTrain: '近 30 天训练',
    metricAbility: '能力快照',
    todayFocusEmpty: '当前没有未修复的弱项,保持节奏',
    focusPrefix: '修复',
  },
  adult: {
    title: '今日工作台',
    desc: '训练 → 反馈 → 能力缺口 → 修复 → 验证 · 数据驱动的能力增长闭环',
    actionLabel: '记录训练',
    focusTitle: '今天的核心任务',
    reviewTitle: '今日复盘',
    metricGap: '待修复能力缺口',
    metricTrain: '近 30 天训练次数',
    metricAbility: '能力快照数量',
    todayFocusEmpty: '当前没有未修复的问题,继续保持',
    focusPrefix: '修复',
  },
};

export function DashboardPage() {
  const { prefs } = useAppSession();
  const { status, refresh } = useSyncStatus();
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [gaps, setGaps] = useState<AbilityGap[]>([]);
  const [abilities, setAbilities] = useState<AbilitySnapshot[]>([]);
  const [tasks, setTasks] = useState<FixTask[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [registrations, setRegistrations] = useState<ExamRegistration[]>([]);
  const [stagePlans, setStagePlans] = useState<StagePlan[]>([]);

  useEffect(() => {
    const load = async () => {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const from = monthAgo.toISOString().slice(0, 10);
      const [t, g, a, tk, r, regs, sp] = await Promise.all([
        findTrainingsInRange(from),
        findGaps(undefined, 'unresolved'),
        findAbilities(),
        findTasks(undefined, 'pending'),
        findReviews('day'),
        getAllRecords('registrations'),
        getAllRecords('stagePlans'),
      ]);
      setTrainings(t);
      setGaps(g);
      setAbilities(a);
      setTasks(tk);
      setReviews(r);
      setRegistrations(regs);
      setStagePlans(sp);
    };
    void load();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayReview = reviews.find((r) => r.date === today);
  const prioritizedGaps = prioritizeGaps(gaps).slice(0, 3);
  const stats = aggregateBySubject(trainings);
  const totalTrainingsToday = trainings.filter((r) => r.date === today).length;
  const visibility = MODULE_VISIBILITY[prefs.gradeLevel];
  const tone = GRADE_TONE[prefs.gradeLevel];

  // V5.11 §7 · 公考倒计时(仅公考学段) - 最近一次未过考的考试
  const upcomingExam = useMemo(() => {
    return registrations
      .filter((r) => r.examDate >= today)
      .sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
  }, [registrations, today]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${tone.title} · ${GRADE_LEVEL_LABEL[prefs.gradeLevel]}`}
        description={tone.desc}
        actions={
          <>
            <button className="btn-ghost" onClick={refresh} title="刷新">
              <RefreshCw size={14} />
            </button>
            <Link to="/trainings" className="btn-primary">
              <PlusCircle size={16} /> {tone.actionLabel}
            </Link>
          </>
        }
      />

      {/* V5.11 §7 · 公考倒计时(仅公考学段, 常驻置顶) */}
      {visibility.examRegistration && upcomingExam && (
        <div className="card p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center">
                <Flag size={18} />
              </div>
              <div>
                <div className="text-xs text-purple-700">下一场公考</div>
                {/* V5.11 Bug #019/优化点 #005 修复:岗位名与日期换行分隔,避免粘连 */}
                <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                  <div>{upcomingExam.postName}</div>
                  <div className="text-xs font-normal text-slate-500 mt-0.5">
                    考试日期:{upcomingExam.examDate}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-purple-700">
                {Math.max(0, Math.ceil((new Date(upcomingExam.examDate).getTime() - Date.now()) / 86400000))}
              </div>
              <div className="text-xs text-slate-500">天</div>
            </div>
          </div>
        </div>
      )}

      {/* 时间线总览:一进来就能看到当月安排 */}
      {visibility.pdca ? (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <CalendarRange size={16} className="text-blue-600" /> 本月时间线安排
            </h2>
            <Link to="/pdca-calendar" className="text-xs text-blue-600 hover:underline">
              打开完整视图 →
            </Link>
          </div>
          <PdcaCalendarBoard
            compact
            defaultView="month"
            showViewSwitch={false}
            showFilter={false}
            showLegend={false}
          />
        </div>
      ) : (
        <TimelineSummary registrations={registrations} stagePlans={stagePlans} />
      )}

      <TodayFocusCard gaps={prioritizedGaps} tasks={tasks} tone={tone} />

      <ResponsiveGrid minItemWidth="220px" gap="1rem">
        <MetricCard
          icon={prefs.gradeLevel === 'primary' ? <Star size={18} /> : <Target size={18} />}
          label={tone.metricGap}
          value={gaps.length}
          tone="orange"
          to="/problems"
        />
        <MetricCard
          icon={<TrendingUp size={18} />}
          label={tone.metricTrain}
          value={trainings.length}
          tone="blue"
          to="/trainings"
        />
        <MetricCard
          icon={prefs.gradeLevel === 'primary' ? <Star size={18} /> : <CalendarClock size={18} />}
          label={tone.metricAbility}
          value={abilities.length}
          tone="emerald"
          to="/abilities"
        />
      </ResponsiveGrid>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900">近期能力变化</h2>
          <Link to="/abilities" className="text-sm text-blue-600 hover:underline">
            查看全部
          </Link>
        </div>
        {stats.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="还没有训练记录"
            description="完成 3 次以上训练后，能力图谱与增长曲线将在这里展示"
            action={
              <Link to="/trainings" className="btn-primary">
                <PlusCircle size={16} /> 去记录第一次训练
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {stats.map((s) => (
              <div key={s.subject} className="flex items-center gap-3">
                <div className="w-24 text-sm text-slate-700">{SUBJECT_LABEL[s.subject]}</div>
                <MasteryBar score={s.masteryScore} className="flex-1" />
                <span className="text-xs text-slate-400 w-24 text-right">
                  {s.totalQuestions} 题 · 错 {s.totalErrors}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 flex items-center justify-between text-sm">
        <span className="text-slate-600">
          云端同步状态：{status.isOnline ? '在线' : '未连接'} · 待同步 {status.pendingChanges} 条
        </span>
        <Link to="/sync" className="text-blue-600 hover:underline">
          管理云端备份 →
        </Link>
      </div>
    </div>
  );
}

function TimelineSummary({ registrations, stagePlans }: { registrations: ExamRegistration[]; stagePlans: StagePlan[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcomingExam = registrations
    .filter((r) => r.examDate >= today)
    .sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
  const activeStage = stagePlans
    .filter((s) => s.startDate <= today && s.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const nextStage = stagePlans
    .filter((s) => s.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  const hasContent = !!upcomingExam || !!activeStage || !!nextStage;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Timer size={16} className="text-blue-600" /> 学习时间线
        </h2>
        <Link to="/timeline" className="text-xs text-blue-600 hover:underline">
          管理时间线 →
        </Link>
      </div>
      {!hasContent ? (
        <EmptyState icon={CalendarClock} title="尚未设置里程碑" description="到「学习时间线」设定目标日期即可" />
      ) : (
        <div className="space-y-2 text-sm">
          {upcomingExam && (
            <div className="flex items-center justify-between bg-purple-50 rounded p-2">
              <div>
                <b>{upcomingExam.postName}</b>
                <span className="text-xs text-slate-500 ml-2">{upcomingExam.examDate}</span>
              </div>
              <span className="text-red-600 font-bold">
                倒计时 {Math.max(0, Math.ceil((new Date(upcomingExam.examDate).getTime() - Date.now()) / 86400000))} 天
              </span>
            </div>
          )}
          {activeStage && (
            <div className="flex items-center justify-between bg-blue-50 rounded p-2">
              <div>
                当前阶段: <b>{PLAN_STAGE_LABEL[activeStage.stage]}</b>
                <span className="text-xs text-slate-500 ml-2">
                  {activeStage.startDate} → {activeStage.endDate}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                重点: {activeStage.focusModules.slice(0, 2).join(' / ')}
              </span>
            </div>
          )}
          {nextStage && (
            <div className="text-xs text-slate-500">
              {/* V5.11 Bug #036 修复:占位符改中文 */}
              下一阶段: <b>{PLAN_STAGE_LABEL[nextStage.stage]}</b> 起于 {nextStage.startDate}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'blue' | 'orange' | 'emerald';
  to: string;
}) {
  const toneClass: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <Link to={to} className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneClass[tone]}`}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
        </div>
      </div>
    </Link>
  );
}

function TodayFocusCard({
  gaps,
  tasks,
  tone,
}: {
  gaps: AbilityGap[];
  tasks: FixTask[];
  tone: (typeof GRADE_TONE)[GradeLevel];
}) {
  const hasContent = gaps.length + tasks.length > 0;
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
          <Target size={16} />
        </div>
        <h2 className="text-base font-semibold text-slate-900">{tone.focusTitle}</h2>
      </div>
      {!hasContent ? (
        <p className="text-sm text-slate-500">{tone.todayFocusEmpty}</p>
      ) : (
        <ol className="space-y-3">
          {gaps.slice(0, 3).map((g, i) => (
            <li key={g.id} className="flex items-start gap-2 text-sm">
              <span className="text-blue-600 font-bold w-5">①{i > 0 && ''}</span>
              <div className="flex-1">
                <div className="text-slate-800">
                  {tone.focusPrefix}: {g.abilityPath.split('/').slice(-1)[0]}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {SUBJECT_LABEL[g.subject]} · 复现 {g.occurrenceCount} 次
                </div>
              </div>
            </li>
          ))}
          {tasks.slice(0, 2).map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-sm">
              <span className="text-emerald-600 font-bold w-5"><CheckCircle2 size={14} /></span>
              <div className="flex-1">
                <div className="text-slate-800">
                  {t.type === 'verify' ? '验证' : tone.focusPrefix}: {t.abilityPath.split('/').slice(-1)[0]}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {SUBJECT_LABEL[t.subject]}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4 flex gap-2">
        <Link to="/trainings" className="btn-primary text-sm">
          <PlusCircle size={14} /> {tone.actionLabel}
        </Link>
        <Link to="/problems" className="btn-secondary text-sm">
          查看全部
        </Link>
      </div>
    </div>
  );
}

