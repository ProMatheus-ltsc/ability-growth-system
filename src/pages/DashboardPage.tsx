import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Target, CheckCircle2, TrendingUp, CalendarClock, RefreshCw, PlusCircle } from 'lucide-react';
import { useAppSession } from '../hooks/useAppSession';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { findTrainingsInRange, findGaps, findAbilities, findTasks, findReviews } from '../services/localDB';
import { aggregateBySubject, prioritizeGaps } from '../services/analytics';
import { PageHeader } from '../components/PageHeader';
import { MasteryBar } from '../components/MasteryBar';
import { EmptyState } from '../components/EmptyState';
import { GRADE_LEVEL_LABEL, SUBJECT_LABEL } from '../domain/types';
import type { AbilityGap, TrainingRecord, AbilitySnapshot, FixTask, ReviewRecord } from '../domain/types';

export function DashboardPage() {
  const { prefs } = useAppSession();
  const { status, refresh } = useSyncStatus();
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [gaps, setGaps] = useState<AbilityGap[]>([]);
  const [abilities, setAbilities] = useState<AbilitySnapshot[]>([]);
  const [tasks, setTasks] = useState<FixTask[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);

  useEffect(() => {
    const load = async () => {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      const from = monthAgo.toISOString().slice(0, 10);
      const [t, g, a, tk, r] = await Promise.all([
        findTrainingsInRange(from),
        findGaps(undefined, 'unresolved'),
        findAbilities(),
        findTasks(undefined, 'pending'),
        findReviews('day'),
      ]);
      setTrainings(t);
      setGaps(g);
      setAbilities(a);
      setTasks(tk);
      setReviews(r);
    };
    void load();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayReview = reviews.find((r) => r.date === today);
  const prioritizedGaps = prioritizeGaps(gaps).slice(0, 3);
  const stats = aggregateBySubject(trainings);
  const totalTrainingsToday = trainings.filter((r) => r.date === today).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`今日工作台 · ${GRADE_LEVEL_LABEL[prefs.gradeLevel]}`}
        description="告诉你今天最值得做什么。 训练 → 反馈 → 错误/问题 → 能力缺口 → 修复 → 验证 → 能力增长。"
        actions={
          <>
            <button className="btn-ghost" onClick={refresh} title="刷新">
              <RefreshCw size={14} />
            </button>
            <Link to="/trainings" className="btn-primary">
              <PlusCircle size={16} /> 记录训练
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodayFocusCard gaps={prioritizedGaps} tasks={tasks} />
        <TodayReviewCard hasReview={!!todayReview} totalTrainingsToday={totalTrainingsToday} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          icon={<Target size={18} />}
          label="待修复能力缺口"
          value={gaps.length}
          tone="orange"
          to="/problems"
        />
        <MetricCard
          icon={<TrendingUp size={18} />}
          label="近30天训练次数"
          value={trainings.length}
          tone="blue"
          to="/trainings"
        />
        <MetricCard
          icon={<CalendarClock size={18} />}
          label="能力快照数量"
          value={abilities.length}
          tone="emerald"
          to="/abilities"
        />
      </div>

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

function TodayFocusCard({ gaps, tasks }: { gaps: AbilityGap[]; tasks: FixTask[] }) {
  const hasContent = gaps.length + tasks.length > 0;
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
          <Target size={16} />
        </div>
        <h2 className="text-base font-semibold text-slate-900">今天的核心任务</h2>
      </div>
      {!hasContent ? (
        <p className="text-sm text-slate-500">当前没有未修复的问题，继续保持！</p>
      ) : (
        <ol className="space-y-3">
          {gaps.slice(0, 3).map((g, i) => (
            <li key={g.id} className="flex items-start gap-2 text-sm">
              <span className="text-blue-600 font-bold w-5">①{i > 0 && ''}</span>
              <div className="flex-1">
                <div className="text-slate-800">修复：{g.abilityPath.split('/').slice(-1)[0]}</div>
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
                  {t.type === 'verify' ? '验证' : '修复'}：{t.abilityPath.split('/').slice(-1)[0]}
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
          <PlusCircle size={14} /> 开始训练
        </Link>
        <Link to="/problems" className="btn-secondary text-sm">
          查看全部
        </Link>
      </div>
    </div>
  );
}

function TodayReviewCard({ hasReview, totalTrainingsToday }: { hasReview: boolean; totalTrainingsToday: number }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <CalendarClock size={16} />
        </div>
        <h2 className="text-base font-semibold text-slate-900">今日复盘</h2>
      </div>
      {hasReview ? (
        <div className="text-sm text-slate-600">今天的复盘已完成 ✅</div>
      ) : (
        <div className="text-sm text-slate-600">
          今日已记录训练 <b className="text-slate-900">{totalTrainingsToday}</b> 次， 只需 2 分钟即可完成日复盘。
        </div>
      )}
      <div className="mt-4">
        <Link to="/reviews" className="btn-primary text-sm">
          {hasReview ? '查看复盘' : '开始复盘'}
        </Link>
      </div>
    </div>
  );
}
