/**
 * 问题跟进 · 日历视图 (PRD V5.8 §30.6)
 *
 * 默认月视图 + 跨天事件条(参考用户附件样式):
 * - 顶部: 月份切换 + "今天" + 视图切换(月/周/日) + 生活域筛选 + 公考时间线开关
 * - 事件在日历上以跨天彩条方式渲染, 起始日期左端有色柄, 跨越多列
 * - 三色系: 个人学习 蓝 / 工作项目 绿(浅粉替代) / 生活事务 黄
 * - 完成态 ● + 半透明; 未完成 ○ + 全透明
 * - 点击事件跳转到问题详情
 *
 * 依赖 date-fns 与 clsx (由 shared-core 的 peerDependencies 引入)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import clsx from 'clsx';
import { CalendarDays, ArrowLeft, ChevronLeft, ChevronRight, Filter, Briefcase, X } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { EmptyState } from './EmptyState';
import { getAllRecords, getRecord, putRecord } from '../services/localDB';
import { collectExamTargets } from '../services/planner';
import { rescheduleCountermeasure } from '../services/pdca';
import { useToast } from '@shared/core';
import {
  LIFE_DOMAIN_LABEL,
  PLAN_STAGE_LABEL,
  SUBJECT_LABEL,
  type ExamRegistration,
  type FixTask,
  type LifeDomain,
  type PDCACountermeasure,
  type PDCAProblem,
  type PlanStage,
  type StagePlan,
} from '../domain/types';
import { useAppSession } from '../hooks/useAppSession';

type ViewMode = 'month' | 'week' | 'day';

/** 每条对策抽象为一条日历事件 */
interface CalendarEvent {
  id: string;
  problemId: string;
  problemTitle: string;
  lifeDomain: LifeDomain;
  content: string;
  start: Date;
  end: Date;
  completed: boolean;
  status: PDCACountermeasure['status'];
}

const DOMAIN_STYLE: Record<LifeDomain, { bar: string; light: string; text: string; border: string }> = {
  learning: {
    bar: 'bg-blue-500',
    light: 'bg-blue-100 hover:bg-blue-200',
    text: 'text-blue-800',
    border: 'border-l-blue-500',
  },
  work: {
    bar: 'bg-pink-500',
    light: 'bg-pink-100 hover:bg-pink-200',
    text: 'text-pink-800',
    border: 'border-l-pink-500',
  },
  life: {
    bar: 'bg-amber-500',
    light: 'bg-amber-100 hover:bg-amber-200',
    text: 'text-amber-800',
    border: 'border-l-amber-500',
  },
};

const WEEK_HEADERS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 阶段带配色：与三类生活域事件色分开，避免混淆 */
const STAGE_BAND_STYLE: Record<PlanStage, string> = {
  foundation: 'bg-indigo-200 text-indigo-900 border-l-indigo-500',
  topic: 'bg-teal-200 text-teal-900 border-l-teal-500',
  sprint: 'bg-orange-200 text-orange-900 border-l-orange-500',
  'pre-exam': 'bg-slate-300 text-slate-800 border-l-slate-600',
};

/** 关键节点（只用库里已有数据，不预置任何节假日/培训节点） */
type CalendarNodeKind = 'exam' | 'stage-start' | 'stage-end' | 'check' | 'milestone' | 'task';

interface CalendarNode {
  id: string;
  date: string;
  kind: CalendarNodeKind;
  label: string;
  detail?: string;
  to?: string;
}

const NODE_STYLE: Record<CalendarNodeKind, { dot: string; text: string; label: string }> = {
  exam: { dot: 'bg-red-600', text: 'text-red-700', label: '考试日' },
  'stage-start': { dot: 'bg-indigo-500', text: 'text-indigo-700', label: '阶段开始' },
  'stage-end': { dot: 'bg-slate-500', text: 'text-slate-700', label: '阶段结束' },
  check: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'PDCA 检查点' },
  milestone: { dot: 'bg-slate-400', text: 'text-slate-600', label: '里程碑' },
  task: { dot: 'bg-sky-500', text: 'text-sky-700', label: '待办任务' },
};

/**
 * 可复用日历面板
 * - compact=true 时省略页头/图例,并默认使用月视图(用于工作台内嵌)
 * - fullPage=true 时展示 PageHeader 和"返回问题列表"按钮
 */
export interface PdcaCalendarBoardProps {
  compact?: boolean;
  fullPage?: boolean;
  defaultView?: ViewMode;
  showViewSwitch?: boolean;
  showFilter?: boolean;
  showLegend?: boolean;
  showHeader?: boolean;
  minHeightPerRow?: number;
}

export function PdcaCalendarBoard({
  compact = false,
  fullPage = false,
  defaultView = 'month',
  showViewSwitch = true,
  showFilter = true,
  showLegend = true,
  showHeader = false,
  minHeightPerRow,
}: PdcaCalendarBoardProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { prefs } = useAppSession();
  const [problems, setProblems] = useState<PDCAProblem[]>([]);
  const dragRef = useRef<{ eventId: string; problemId: string } | null>(null);
  const [registrations, setRegistrations] = useState<ExamRegistration[]>([]);
  const [stagePlans, setStagePlans] = useState<StagePlan[]>([]);
  const [tasks, setTasks] = useState<FixTask[]>([]);
  const [view, setView] = useState<ViewMode>(defaultView);
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [domainFilter, setDomainFilter] = useState<Set<LifeDomain>>(new Set(['learning', 'work', 'life']));
  const [showExamLine, setShowExamLine] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const compactRowHeight = compact ? 64 : undefined;
  const rowMinHeight = minHeightPerRow ?? compactRowHeight;

  const loadData = async () => {
    const [p, r, s, t] = await Promise.all([
      getAllRecords('pdcaProblems'),
      getAllRecords('registrations'),
      getAllRecords('stagePlans'),
      getAllRecords('tasks'),
    ]);
    const sid = prefs.currentStudentId;
    const byStudent = <T extends { studentId?: string }>(list: T[]) => (sid ? list.filter((it) => it.studentId === sid) : list);
    setProblems(byStudent(p).filter((it) => it.status === 'active'));
    setRegistrations(byStudent(r));
    setStagePlans(byStudent(s));
    setTasks(byStudent(t));
  };

  useEffect(() => {
    void loadData();
  }, [prefs.currentStudentId]);

  /** §30.6 里程碑拖拽改期 */
  const handleDrop = async (targetDate: string) => {
    const drag = dragRef.current;
    if (!drag) return;
    const problem = await getRecord('pdcaProblems', drag.problemId);
    if (!problem) return;
    const updated = rescheduleCountermeasure(problem, drag.eventId, targetDate);
    await putRecord('pdcaProblems', updated);
    dragRef.current = null;
    showToast(`已改期到 ${targetDate}`, 'success');
    void loadData();
  };

  const events: CalendarEvent[] = useMemo(() => {
    const list: CalendarEvent[] = [];
    for (const problem of problems) {
      if (!domainFilter.has(problem.lifeDomain)) continue;
      for (const cm of problem.countermeasures) {
        if (cm.status === 'invalidated') continue;
        if (!cm.scheduledDate) continue;
        // 结束日期: 若 completedAt 存在则用它, 否则一条事件默认 1 天;
        // 对于跨天可扩展存 rangeEnd 字段(后续需求可加)
        const start = new Date(cm.scheduledDate);
        const rawEnd = cm.completedAt ? new Date(cm.completedAt.slice(0, 10)) : start;
        const end = rawEnd < start ? start : rawEnd;
        list.push({
          id: cm.id,
          problemId: problem.id,
          problemTitle: problem.title,
          lifeDomain: problem.lifeDomain,
          content: cm.content,
          start,
          end,
          completed: cm.status === 'done',
          status: cm.status,
        });
      }
    }
    return list;
  }, [problems, domainFilter]);

  const today = new Date().toISOString().slice(0, 10);
  // 考试节点与时间线页同源：都来自 registrations，不在这里另设日期来源
  const examTargets = useMemo(() => collectExamTargets(registrations), [registrations]);
  const futureExams = useMemo(() => examTargets.filter((t) => t.date >= today), [examTargets, today]);
  const upcomingExam = futureExams[0];
  const followingExam = futureExams[1];

  /** 关键节点：考试日 / 阶段起止 / PDCA 检查与里程碑 / 任务到期；全部来自已有数据 */
  const nodes: CalendarNode[] = useMemo(() => {
    const list: CalendarNode[] = [];
    for (const t of examTargets) {
      list.push({ id: `exam-${t.date}`, date: t.date, kind: 'exam', label: t.label });
    }
    for (const s of stagePlans) {
      const name = `${PLAN_STAGE_LABEL[s.stage]}${s.subject ? ` · ${SUBJECT_LABEL[s.subject]}` : ''}`;
      list.push({
        id: `${s.id}-start`,
        date: s.startDate,
        kind: 'stage-start',
        label: `${name} 开始`,
        detail: s.focusModules.join('、') || undefined,
      });
      list.push({ id: `${s.id}-end`, date: s.endDate, kind: 'stage-end', label: `${name} 结束` });
    }
    for (const p of problems) {
      if (p.expectedDueAt) {
        list.push({
          id: `due-${p.id}`,
          date: p.expectedDueAt.slice(0, 10),
          kind: 'milestone',
          label: `里程碑：${p.title}`,
          to: `/pdca/detail?id=${p.id}`,
        });
      }
      for (const c of p.checkEntries ?? []) {
        list.push({
          id: `check-${c.id}`,
          date: c.createdAt.slice(0, 10),
          kind: 'check',
          label: `检查点：${p.title}`,
          detail: c.nextAction,
          to: `/pdca/detail?id=${p.id}`,
        });
      }
    }
    for (const t of tasks) {
      if (!t.dueAt) continue;
      list.push({
        id: `task-${t.id}`,
        date: t.dueAt.slice(0, 10),
        kind: 'task',
        label: `待办：${t.abilityPath}`,
        detail: t.type === 'fix' ? '修复任务' : '验证任务',
        to: '/problems',
      });
    }
    return list;
  }, [examTargets, stagePlans, problems, tasks]);

  /** 当前视图覆盖的日期范围，用于窄屏阶段摘要 */
  const visibleRange = useMemo(() => {
    if (view === 'month') {
      return { start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }), end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }) };
    }
    if (view === 'week') {
      return { start: startOfWeek(anchor, { weekStartsOn: 0 }), end: endOfWeek(anchor, { weekStartsOn: 0 }) };
    }
    return { start: anchor, end: anchor };
  }, [anchor, view]);

  const visibleStages = useMemo(
    () =>
      stagePlans
        .filter(
          (s) => new Date(`${s.endDate}T00:00:00`) >= visibleRange.start && new Date(`${s.startDate}T00:00:00`) <= visibleRange.end,
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [stagePlans, visibleRange],
  );

  const selectedDay = useMemo(() => {
    if (!selectedDate) return null;
    return {
      stages: stagePlans
        .filter((s) => s.startDate <= selectedDate && s.endDate >= selectedDate)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
      nodes: nodes.filter((n) => n.date === selectedDate),
      items: events.filter((e) => format(e.start, 'yyyy-MM-dd') <= selectedDate && format(e.end, 'yyyy-MM-dd') >= selectedDate),
    };
  }, [selectedDate, stagePlans, nodes, events]);

  const toggleDomain = (d: LifeDomain) => {
    setDomainFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const goPrev = () => setAnchor(shift(anchor, view, -1));
  const goNext = () => setAnchor(shift(anchor, view, 1));
  const goToday = () => setAnchor(new Date());

  return (
    <div className="space-y-3">
      {(fullPage || showHeader) && (
        <PageHeader
          title="问题跟进 · 日历视图"
          description="阶段区间、考试日、PDCA 检查点与对策排期同屏展示。阶段来自时间线的阶段规划，考试日来自报考信息，均为只读展示。"
          actions={
            fullPage ? (
              <button className="btn-ghost" onClick={() => navigate('/pdca')}>
                <ArrowLeft size={14} /> 返回问题列表
              </button>
            ) : undefined
          }
        />
      )}

      <div className={clsx('card flex flex-wrap items-center gap-2 text-sm', compact ? 'p-2' : 'p-3 gap-3')}>
        {showViewSwitch && (
          <div className="flex items-center gap-1 border border-slate-200 rounded overflow-hidden">
            {(['month', 'week', 'day'] as ViewMode[]).map((m) => (
              <button
                key={m}
                className={clsx(
                  'px-3 py-1',
                  view === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
                onClick={() => setView(m)}
              >
                {m === 'month' ? '月' : m === 'week' ? '周' : '日'}
              </button>
            ))}
          </div>
        )}

        <button className="btn-ghost" onClick={goPrev}><ChevronLeft size={16} /></button>
        <span className="text-slate-700 font-medium min-w-[100px] text-center">{renderAnchor(anchor, view)}</span>
        <button className="btn-ghost" onClick={goNext}><ChevronRight size={16} /></button>
        <button className="btn-secondary text-xs px-3 py-1" onClick={goToday}>今天</button>

        {showFilter && (
          <>
            <span className="mx-2 text-slate-300">|</span>
            <Filter size={14} className="text-slate-400" />
            <span className="text-slate-500">筛选:</span>
            {(['learning', 'work', 'life'] as LifeDomain[]).map((d) => (
              <button
                key={d}
                className={clsx(
                  'px-2 py-1 rounded border text-xs',
                  domainFilter.has(d)
                    ? clsx(DOMAIN_STYLE[d].light, DOMAIN_STYLE[d].text, 'border-transparent')
                    : 'border-slate-200 text-slate-400',
                )}
                onClick={() => toggleDomain(d)}
              >
                {LIFE_DOMAIN_LABEL[d]}
              </button>
            ))}
            <label className="flex items-center gap-1 text-xs text-slate-500 ml-2 cursor-pointer">
              <input type="checkbox" checked={showExamLine} onChange={(e) => setShowExamLine(e.target.checked)} />
              公考时间线
            </label>
          </>
        )}
      </div>

      {/* 公考备考时间线色带 */}
      {showExamLine && upcomingExam && (
        <div className="card p-3 bg-gradient-to-r from-purple-50 via-blue-50 to-pink-50 border-purple-100 flex flex-wrap items-center gap-3 text-sm">
          <Briefcase size={16} className="text-purple-600" />
          <span className="text-slate-700">
            <b>{upcomingExam.label}</b> {upcomingExam.date} · 倒计时{' '}
            <span className="text-red-600 font-bold">
              {Math.max(0, Math.ceil((new Date(`${upcomingExam.date}T00:00:00`).getTime() - Date.now()) / 86400000))}
            </span>{' '}
            天
          </span>
          {followingExam && (
            <span className="text-xs text-slate-500">
              下一场 {followingExam.date}（{followingExam.label}）
            </span>
          )}
          <Link to="/registrations" className="text-blue-600 text-xs hover:underline ml-auto">
            管理报考信息 →
          </Link>
        </div>
      )}

      {/* 日历本体 */}
      {view === 'month' && (
        <MonthView
          anchor={anchor}
          events={events}
          stagePlans={stagePlans}
          nodes={nodes}
          dragRef={dragRef}
          onDrop={handleDrop}
          rowMinHeight={rowMinHeight}
          compact={compact}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      )}
      {view === 'week' && (
        <WeekView
          anchor={anchor}
          events={events}
          stagePlans={stagePlans}
          nodes={nodes}
          dragRef={dragRef}
          onDrop={handleDrop}
          rowMinHeight={rowMinHeight}
          compact={compact}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      )}
      {view === 'day' && (
        <DayView anchor={anchor} events={events} stagePlans={stagePlans} nodes={nodes} />
      )}

      {/* 窄屏降级：阶段带只保留色条，这里用文字补全阶段跨度 */}
      {visibleStages.length > 0 && (
        <div className="sm:hidden card p-3 text-xs text-slate-600 space-y-1">
          <div className="text-slate-400">本视图内的阶段（窄屏用清单补全色条信息）</div>
          {visibleStages.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className={clsx('inline-block w-3 h-2 rounded-sm', STAGE_BAND_STYLE[s.stage].split(' ')[0])} />
              <span className="font-medium">
                {PLAN_STAGE_LABEL[s.stage]}
                {s.subject ? ` · ${SUBJECT_LABEL[s.subject]}` : ''}
              </span>
              <span className="text-slate-500">
                {s.startDate} → {s.endDate}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 当天详情：阶段 / 关键节点 / 已有对策任务 */}
      {selectedDate && selectedDay && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">{selectedDate} 当天安排</h3>
            <button className="btn-ghost text-xs" onClick={() => setSelectedDate(null)}>
              <X size={14} /> 收起
            </button>
          </div>
          {selectedDay.stages.length === 0 && selectedDay.nodes.length === 0 && selectedDay.items.length === 0 && (
            <div className="text-sm text-slate-500">当天没有登记阶段、节点或对策。</div>
          )}
          {selectedDay.stages.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-1">阶段</div>
              <div className="flex flex-wrap gap-2">
                {selectedDay.stages.map((s) => (
                  <span
                    key={s.id}
                    className={clsx('text-xs px-2 py-1 rounded border-l-2', STAGE_BAND_STYLE[s.stage])}
                    title={s.focusModules.join('、')}
                  >
                    {PLAN_STAGE_LABEL[s.stage]}
                    {s.subject ? ` · ${SUBJECT_LABEL[s.subject]}` : ''}（{s.startDate} → {s.endDate}）
                  </span>
                ))}
              </div>
            </div>
          )}
          {selectedDay.nodes.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-1">关键节点</div>
              <div className="space-y-1">
                {selectedDay.nodes.map((n) => (
                  <div key={n.id} className="text-sm flex items-start gap-2">
                    <span className={clsx('mt-1.5 inline-block w-2 h-2 rounded-full shrink-0', NODE_STYLE[n.kind].dot)} />
                    <div>
                      <span className={clsx('text-xs', NODE_STYLE[n.kind].text)}>{NODE_STYLE[n.kind].label}</span>
                      <span className="ml-2 text-slate-700">{n.label}</span>
                      {n.detail && <span className="ml-2 text-xs text-slate-400">{n.detail}</span>}
                      {n.to && (
                        <Link to={n.to} className="ml-2 text-xs text-blue-600 hover:underline">
                          查看 →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectedDay.items.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-1">对策排期</div>
              <div className="space-y-1">
                {selectedDay.items.map((e) => (
                  <Link
                    key={e.id}
                    to={`/pdca/detail?id=${e.problemId}`}
                    className={clsx('block text-sm rounded px-2 py-1 border-l-2', DOMAIN_STYLE[e.lifeDomain].light, DOMAIN_STYLE[e.lifeDomain].text, DOMAIN_STYLE[e.lifeDomain].border)}
                  >
                    {e.completed ? '●' : '○'} {e.content}
                    <span className="ml-2 text-xs opacity-70">{e.problemTitle}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showLegend && (
        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
          <span>图例:</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-2 rounded-sm bg-indigo-200 border-l-2 border-indigo-500" /> 阶段区间</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-red-600" /> 考试日</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> PDCA 检查点</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-slate-400" /> 里程碑</span>
          <span className="ml-4 flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded-sm bg-blue-500" /> 个人学习</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded-sm bg-pink-500" /> 工作项目</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded-sm bg-amber-500" /> 生活事务</span>
          <span className="ml-4">● 已完成 &nbsp; ○ 待执行</span>
        </div>
      )}
    </div>
  );
}

// ==================== 月视图 (跨天事件条式) ====================

interface DragCtx {
  dragRef: React.MutableRefObject<{ eventId: string; problemId: string } | null>;
  onDrop: (targetDate: string) => void;
}

interface LayerProps {
  stagePlans: StagePlan[];
  nodes: CalendarNode[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

function MonthView({
  anchor,
  events,
  stagePlans,
  nodes,
  dragRef,
  onDrop,
  rowMinHeight,
  compact,
  selectedDate,
  onSelectDate,
}: { anchor: Date; events: CalendarEvent[]; rowMinHeight?: number; compact?: boolean } & DragCtx & LayerProps) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // 分行为 6 行 x 7 列
  const rows: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));

  return (
    <div className="card p-3">
      {/* 星期表头 */}
      <div className="grid grid-cols-7 text-center text-xs text-slate-500 mb-1">
        {WEEK_HEADERS.map((h) => (
          <div key={h} className="py-2">
            {h}
          </div>
        ))}
      </div>

      {/* 6 行日历,每一行都是相对定位, 事件条 absolute 定位跨列 */}
      <div className="space-y-1">
        {rows.map((row, rowIdx) => (
          <MonthRow
            key={rowIdx}
            row={row}
            events={events}
            stagePlans={stagePlans}
            nodes={nodes}
            anchorMonth={anchor}
            dragRef={dragRef}
            onDrop={onDrop}
            rowMinHeight={rowMinHeight}
            compact={compact}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
          />
        ))}
      </div>
    </div>
  );
}

interface StageBandItem {
  plan: StagePlan;
  startCol: number;
  span: number;
  /** 本行是否覆盖阶段真实起点/终点，用于标「始」「终」 */
  showsStart: boolean;
  showsEnd: boolean;
}

/** 与事件条相同的贪心分轨：按传入顺序（时间升序）避免重叠遮挡 */
function packBands<T extends { startCol: number; span: number }>(items: T[], maxLanes: number) {
  const lanes: T[][] = [];
  const overflow: T[] = [];
  for (const item of items) {
    let placed = false;
    for (const lane of lanes) {
      const conflict = lane.some((existing) => {
        const a2 = existing.startCol + existing.span - 1;
        const b2 = item.startCol + item.span - 1;
        return !(a2 < item.startCol || b2 < existing.startCol);
      });
      if (!conflict) {
        lane.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      if (lanes.length < maxLanes) lanes.push([item]);
      else overflow.push(item);
    }
  }
  return { lanes, overflow };
}

function MonthRow({
  row,
  events,
  stagePlans,
  nodes,
  anchorMonth,
  dragRef,
  onDrop,
  rowMinHeight,
  compact,
  selectedDate,
  onSelectDate,
}: { row: Date[]; events: CalendarEvent[]; anchorMonth: Date; rowMinHeight?: number; compact?: boolean } & DragCtx & LayerProps) {
  const rowStart = row[0];
  const rowEnd = row[6];

  const rowEvents = useMemo(() => {
    // 每个事件与本行的相交区间; 跨行会被拆到不同行
    const list: Array<{
      event: CalendarEvent;
      startCol: number; // 0-6
      span: number; // 1-7
    }> = [];
    for (const e of events) {
      const start = e.start < rowStart ? rowStart : e.start;
      const end = e.end > rowEnd ? rowEnd : e.end;
      if (start > rowEnd || end < rowStart) continue;
      const startCol = differenceInCalendarDays(start, rowStart);
      const span = differenceInCalendarDays(end, start) + 1;
      list.push({ event: e, startCol, span });
    }
    return list;
  }, [events, rowStart, rowEnd]);

  // 阶段带：跨周/跨月时按行裁切，每行都画一段，保证连续不断开
  const stageBands = useMemo<StageBandItem[]>(() => {
    const list: StageBandItem[] = [];
    for (const plan of stagePlans) {
      const s = new Date(`${plan.startDate}T00:00:00`);
      const e = new Date(`${plan.endDate}T00:00:00`);
      if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) continue;
      if (e < rowStart || s > rowEnd) continue;
      const start = s < rowStart ? rowStart : s;
      const end = e > rowEnd ? rowEnd : e;
      list.push({
        plan,
        startCol: differenceInCalendarDays(start, rowStart),
        span: differenceInCalendarDays(end, start) + 1,
        showsStart: s >= rowStart,
        showsEnd: e <= rowEnd,
      });
    }
    return list.sort((a, b) => a.plan.startDate.localeCompare(b.plan.startDate));
  }, [stagePlans, rowStart, rowEnd]);

  // 考试日：单日红色节点
  const examBands = useMemo(() => {
    const rowStartKey = format(rowStart, 'yyyy-MM-dd');
    const rowEndKey = format(rowEnd, 'yyyy-MM-dd');
    return nodes
      .filter((n) => n.kind === 'exam' && n.date >= rowStartKey && n.date <= rowEndKey)
      .map((n) => ({
        node: n,
        startCol: differenceInCalendarDays(new Date(`${n.date}T00:00:00`), rowStart),
      }));
  }, [nodes, rowStart, rowEnd]);

  // 桌面端允许阶段无限分层（不遮挡）；紧凑模式只留 1 层，其余用「+N」提示
  const { lanes: stageLanes, overflow: stageOverflow } = packBands(stageBands, compact ? 1 : Number.MAX_SAFE_INTEGER);
  const usedStageLanes = stageLanes.filter((l) => l.length > 0);

  // 布局:同一日期内多个事件竖向堆叠; 每个事件占一"轨道"。
  // 简易分配: 从上往下扫,若与已占轨道无冲突则复用,否则新增轨道。
  const laneCount = 4; // 每天格子最多显示 4 条事件, 超出 "+N" 折叠
  const lanes: Array<Array<typeof rowEvents[number]>> = Array.from({ length: laneCount }, () => []);
  const overflow: Record<number, number> = {}; // 列 → 折叠条数

  for (const item of rowEvents) {
    let placed = false;
    for (const lane of lanes) {
      const conflict = lane.some((existing) => {
        const a1 = existing.startCol;
        const a2 = existing.startCol + existing.span - 1;
        const b1 = item.startCol;
        const b2 = item.startCol + item.span - 1;
        return !(a2 < b1 || b2 < a1);
      });
      if (!conflict) {
        lane.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (let c = item.startCol; c < item.startCol + item.span && c < 7; c++) {
        overflow[c] = (overflow[c] ?? 0) + 1;
      }
    }
  }

  const laneHeight = compact ? 16 : 22; // px
  const dateHeaderHeight = compact ? 18 : 26;
  const stageHeight = compact ? 13 : 17;
  const examHeight = compact ? 14 : 18;
  const examLaneHeight = examBands.length > 0 ? examHeight : 0;
  const stageBlockHeight = usedStageLanes.length * stageHeight;
  const usedEventLanes = lanes.filter((l) => l.length > 0).length;
  const baseTop = dateHeaderHeight + examLaneHeight + stageBlockHeight;
  const bottomPadding = compact ? 3 : 6;
  const computedHeight = baseTop + laneHeight * usedEventLanes + bottomPadding;
  const rowHeight = Math.max(rowMinHeight ?? 0, computedHeight);

  // 检查点 / 里程碑 / 任务到期：在日期格内用小圆点提示，点开当天看详情
  const nodeDots = useMemo(() => {
    const map = new Map<string, CalendarNodeKind[]>();
    for (const n of nodes) {
      if (n.kind === 'exam') continue;
      const list = map.get(n.date) ?? [];
      if (!list.includes(n.kind)) list.push(n.kind);
      map.set(n.date, list);
    }
    return map;
  }, [nodes]);

  return (
    <div className="grid grid-cols-7 relative" style={{ minHeight: rowHeight }}>
      {row.map((day, colIdx) => {
        const isToday = isSameDay(day, new Date());
        const inMonth = isSameMonth(day, anchorMonth);
        const extra = overflow[colIdx] ?? 0;
        const dateKey = format(day, 'yyyy-MM-dd');
        return (
          <div
            key={day.toISOString()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(dateKey)}
            onClick={() => onSelectDate(dateKey)}
            className={clsx(
              'border border-slate-100 rounded-md px-1 pt-1 cursor-pointer',
              compact ? 'min-h-[56px]' : 'min-h-[96px]',
              !inMonth && 'bg-slate-50/60 text-slate-400',
              inMonth && 'bg-white',
              isToday && 'ring-1 ring-blue-400',
              selectedDate === dateKey && 'ring-2 ring-blue-500',
            )}
          >
            <div className="flex items-center justify-between text-xs">
              <span className={clsx(isToday && 'text-blue-600 font-bold')}>{day.getDate()}</span>
              {extra > 0 && <span className="text-[10px] text-slate-400">+{extra}</span>}
            </div>
            {(nodeDots.get(dateKey) ?? []).length > 0 && (
              <div className="flex items-center gap-0.5 mt-0.5">
                {(nodeDots.get(dateKey) ?? []).slice(0, 4).map((kind) => (
                  <span key={kind} className={clsx('inline-block w-1.5 h-1.5 rounded-full', NODE_STYLE[kind].dot)} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 考试日节点条（只读，点击穿透到日期格） */}
      {examBands.map(({ node, startCol }) => {
        const leftPct = (startCol / 7) * 100;
        return (
          <div
            key={node.id}
            className="absolute z-10 pointer-events-none overflow-hidden truncate rounded-sm bg-red-600 text-white text-[10px] font-medium px-1"
            style={{
              left: `calc(${leftPct}% + 2px)`,
              width: `calc(${100 / 7}% - 4px)`,
              top: dateHeaderHeight,
              height: examHeight - 3,
              lineHeight: `${examHeight - 3}px`,
            }}
          >
            <span className="hidden sm:inline">■ {node.label}</span>
            <span className="sm:hidden">考</span>
          </div>
        );
      })}

      {/* 阶段带（按行裁切，跨行连续；只读，点击穿透到日期格） */}
      {usedStageLanes.map((lane, laneIdx) =>
        lane.map((item) => {
          const leftPct = (item.startCol / 7) * 100;
          const widthPct = (item.span / 7) * 100;
          const top = dateHeaderHeight + examLaneHeight + laneIdx * stageHeight;
          const label = `${PLAN_STAGE_LABEL[item.plan.stage]}${item.plan.subject ? ` · ${SUBJECT_LABEL[item.plan.subject]}` : ''}`;
          return (
            <div
              key={item.plan.id}
              className={clsx(
                'absolute pointer-events-none overflow-hidden truncate rounded-sm border-l-2',
                STAGE_BAND_STYLE[item.plan.stage],
                compact ? 'text-[9px] px-1' : 'text-[10px] px-1.5',
              )}
              style={{
                left: `calc(${leftPct}% + 2px)`,
                width: `calc(${widthPct}% - 4px)`,
                top,
                height: stageHeight - 2,
                lineHeight: `${stageHeight - 2}px`,
              }}
            >
              {item.showsStart && !compact && <span className="mr-0.5 rounded-sm bg-white/70 px-0.5">始</span>}
              <span className="hidden sm:inline">{label}</span>
              {item.showsEnd && !compact && <span className="ml-0.5 rounded-sm bg-white/70 px-0.5">终</span>}
            </div>
          );
        }),
      )}

      {stageOverflow.length > 0 && (
        <span className="absolute text-[9px] text-slate-400 pointer-events-none" style={{ right: 2, bottom: 2 }}>
          +{stageOverflow.length} 阶段
        </span>
      )}

      {/* 事件条 absolute 覆盖到日期格子之上 */}
      {lanes.map((lane, laneIdx) =>
        lane.map((item) => {
          const leftPct = (item.startCol / 7) * 100;
          const widthPct = (item.span / 7) * 100;
          const top = baseTop + laneIdx * laneHeight;
          const style = DOMAIN_STYLE[item.event.lifeDomain];
          return (
            <Link
              key={item.event.id}
              to={`/pdca/detail?id=${item.event.problemId}`}
              draggable
              onDragStart={() => {
                dragRef.current = { eventId: item.event.id, problemId: item.event.problemId };
              }}
              className={clsx(
                'absolute overflow-hidden truncate rounded-sm border-l-2 text-[11px] px-1.5 py-0.5 leading-4 cursor-grab active:cursor-grabbing',
                style.light,
                style.text,
                style.border,
                item.event.completed && 'opacity-70',
              )}
              style={{
                left: `calc(${leftPct}% + 3px)`,
                width: `calc(${widthPct}% - 6px)`,
                top,
                height: laneHeight - 4,
              }}
              title={`${item.event.problemTitle} · ${item.event.content} (拖拽改期)`}
            >
              <span className="mr-1">{item.event.completed ? '●' : '○'}</span>
              {item.event.content}
            </Link>
          );
        }),
      )}
    </div>
  );
}

// ==================== 周视图 ====================

function WeekView({
  anchor,
  events,
  stagePlans,
  nodes,
  dragRef,
  onDrop,
  rowMinHeight,
  compact,
  selectedDate,
  onSelectDate,
}: { anchor: Date; events: CalendarEvent[]; rowMinHeight?: number; compact?: boolean } & DragCtx & LayerProps) {
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  const end = endOfWeek(anchor, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end });
  const startKey = format(start, 'yyyy-MM-dd');
  const endKey = format(end, 'yyyy-MM-dd');

  const weekEvents = events.filter((e) => e.end >= start && e.start <= end);
  const hasStage = stagePlans.some((s) => s.startDate <= endKey && s.endDate >= startKey);
  const hasExam = nodes.some((n) => n.kind === 'exam' && n.date >= startKey && n.date <= endKey);
  if (weekEvents.length === 0 && !hasStage && !hasExam) {
    return (
      <div className="card p-3">
        <div className="grid grid-cols-7 text-center text-xs text-slate-500 mb-1">
          {WEEK_HEADERS.map((h, i) => (
            <div key={h} className="py-2">
              {h} · {format(days[i], 'M/d')}
            </div>
          ))}
        </div>
        <EmptyState icon={CalendarDays} title="本周没有对策里程碑" description="切换周次或到问题详情页添加对策与执行日期" />
      </div>
    );
  }

  return (
    <div className="card p-3">
      <div className="grid grid-cols-7 text-center text-xs text-slate-500 mb-1">
        {WEEK_HEADERS.map((h, i) => {
          const isToday = isSameDay(days[i], new Date());
          return (
            <div key={h} className={clsx('py-2', isToday && 'text-blue-600 font-bold')}>
              {h} · {format(days[i], 'M/d')}
            </div>
          );
        })}
      </div>
      <MonthRow
        row={days}
        events={events}
        stagePlans={stagePlans}
        nodes={nodes}
        anchorMonth={anchor}
        dragRef={dragRef}
        onDrop={onDrop}
        rowMinHeight={rowMinHeight}
        compact={compact}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />
    </div>
  );
}

// ==================== 日视图 ====================

function DayView({
  anchor,
  events,
  stagePlans,
  nodes,
}: {
  anchor: Date;
  events: CalendarEvent[];
  stagePlans: StagePlan[];
  nodes: CalendarNode[];
}) {
  const dayEvents = events.filter((e) => isWithinInterval(anchor, { start: e.start, end: e.end }));
  const key = format(anchor, 'yyyy-MM-dd');
  const dayStages = stagePlans.filter((s) => s.startDate <= key && s.endDate >= key);
  const dayNodes = nodes.filter((n) => n.date === key);

  if (dayEvents.length === 0 && dayStages.length === 0 && dayNodes.length === 0) {
    return <EmptyState icon={CalendarDays} title={`${key} 当天没有安排`} description="切换日期或到问题详情页添加对策" />;
  }

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">
        {key} · 共 {dayEvents.length} 项对策
        {dayStages.length > 0 && ` · ${dayStages.length} 个阶段`}
        {dayNodes.length > 0 && ` · ${dayNodes.length} 个节点`}
      </h2>
      {dayStages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dayStages.map((s) => (
            <span key={s.id} className={clsx('text-xs px-2 py-1 rounded border-l-2', STAGE_BAND_STYLE[s.stage])}>
              {PLAN_STAGE_LABEL[s.stage]}
              {s.subject ? ` · ${SUBJECT_LABEL[s.subject]}` : ''}（{s.startDate} → {s.endDate}）
            </span>
          ))}
        </div>
      )}
      {dayNodes.length > 0 && (
        <div className="space-y-1">
          {dayNodes.map((n) => (
            <div key={n.id} className="text-sm flex items-start gap-2">
              <span className={clsx('mt-1.5 inline-block w-2 h-2 rounded-full shrink-0', NODE_STYLE[n.kind].dot)} />
              <div>
                <span className={clsx('text-xs', NODE_STYLE[n.kind].text)}>{NODE_STYLE[n.kind].label}</span>
                <span className="ml-2 text-slate-700">{n.label}</span>
                {n.detail && <span className="ml-2 text-xs text-slate-400">{n.detail}</span>}
                {n.to && (
                  <Link to={n.to} className="ml-2 text-xs text-blue-600 hover:underline">
                    查看 →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {dayEvents.map((n) => {
        const style = DOMAIN_STYLE[n.lifeDomain];
        return (
          <Link
            key={n.id}
            to={`/pdca/detail?id=${n.problemId}`}
            className={clsx('block border-l-4 rounded p-3 text-sm', style.light, style.text, style.border)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-medium">
                  {n.completed ? '●' : '○'} {n.content}
                </div>
                <div className="text-xs opacity-80 mt-1">{n.problemTitle}</div>
              </div>
              <span className="text-xs">→</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ==================== 工具函数 ====================

function shift(anchor: Date, view: ViewMode, delta: number): Date {
  if (view === 'month') return addMonths(anchor, delta);
  if (view === 'week') return addDays(anchor, delta * 7);
  return addDays(anchor, delta);
}

function renderAnchor(anchor: Date, view: ViewMode): string {
  if (view === 'month') return format(anchor, 'yyyy 年 M 月');
  if (view === 'week') {
    const start = startOfWeek(anchor, { weekStartsOn: 0 });
    const end = endOfWeek(anchor, { weekStartsOn: 0 });
    return `${format(start, 'M/d')} - ${format(end, 'M/d')}`;
  }
  return format(anchor, 'yyyy-MM-dd');
}
