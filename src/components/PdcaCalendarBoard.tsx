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
import { CalendarDays, ArrowLeft, ChevronLeft, ChevronRight, Filter, Briefcase } from 'lucide-react';
import { PageHeader } from './PageHeader';
import { EmptyState } from './EmptyState';
import { getAllRecords, getRecord, putRecord } from '../services/localDB';
import { rescheduleCountermeasure } from '../services/pdca';
import { useToast } from '@shared/core';
import {
  LIFE_DOMAIN_LABEL,
  type ExamRegistration,
  type LifeDomain,
  type PDCACountermeasure,
  type PDCAProblem,
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
  const [view, setView] = useState<ViewMode>(defaultView);
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [domainFilter, setDomainFilter] = useState<Set<LifeDomain>>(new Set(['learning', 'work', 'life']));
  const [showExamLine, setShowExamLine] = useState(true);

  const compactRowHeight = compact ? 64 : undefined;
  const rowMinHeight = minHeightPerRow ?? compactRowHeight;

  const loadData = async () => {
    const [p, r] = await Promise.all([getAllRecords('pdcaProblems'), getAllRecords('registrations')]);
    setProblems(
      p.filter((it) => (prefs.currentStudentId ? it.studentId === prefs.currentStudentId : true))
        .filter((it) => it.status === 'active'),
    );
    setRegistrations(r);
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

  const upcomingExam = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return registrations
      .filter((r) => r.examDate >= today)
      .sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
  }, [registrations]);

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
          description="在一张时间表上看清所有问题什么时候做什么、做到哪了。 与公考备考时间线并存展示。"
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
        <div className="card p-3 bg-gradient-to-r from-purple-50 via-blue-50 to-pink-50 border-purple-100 flex items-center gap-3 text-sm">
          <Briefcase size={16} className="text-purple-600" />
          <span className="text-slate-700">
            <b>{upcomingExam.postName}</b> {upcomingExam.examDate} · 倒计时{' '}
            <span className="text-red-600 font-bold">
              {Math.max(0, Math.ceil((new Date(upcomingExam.examDate).getTime() - Date.now()) / 86400000))}
            </span>{' '}
            天
          </span>
          <Link to="/registrations" className="text-blue-600 text-xs hover:underline ml-auto">
            管理报考信息 →
          </Link>
        </div>
      )}

      {/* 日历本体 */}
      {view === 'month' && <MonthView anchor={anchor} events={events} dragRef={dragRef} onDrop={handleDrop} rowMinHeight={rowMinHeight} compact={compact} />}
      {view === 'week' && <WeekView anchor={anchor} events={events} dragRef={dragRef} onDrop={handleDrop} rowMinHeight={rowMinHeight} compact={compact} />}
      {view === 'day' && <DayView anchor={anchor} events={events} />}

      {showLegend && (
        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
          <span>图例:</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded-sm bg-blue-500" /> 个人学习</span>
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

function MonthView({
  anchor,
  events,
  dragRef,
  onDrop,
  rowMinHeight,
  compact,
}: { anchor: Date; events: CalendarEvent[]; rowMinHeight?: number; compact?: boolean } & DragCtx) {
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
          <MonthRow key={rowIdx} row={row} events={events} anchorMonth={anchor} dragRef={dragRef} onDrop={onDrop} rowMinHeight={rowMinHeight} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function MonthRow({
  row,
  events,
  anchorMonth,
  dragRef,
  onDrop,
  rowMinHeight,
  compact,
}: { row: Date[]; events: CalendarEvent[]; anchorMonth: Date; rowMinHeight?: number; compact?: boolean } & DragCtx) {
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
  const bottomPadding = compact ? 3 : 6;
  const rowHeight = rowMinHeight ?? dateHeaderHeight + laneHeight * laneCount + bottomPadding;

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
            className={clsx(
              'border border-slate-100 rounded-md px-1 pt-1',
              compact ? 'min-h-[56px]' : 'min-h-[96px]',
              !inMonth && 'bg-slate-50/60 text-slate-400',
              inMonth && 'bg-white',
              isToday && 'ring-1 ring-blue-400',
            )}
          >
            <div className="flex items-center justify-between text-xs">
              <span className={clsx(isToday && 'text-blue-600 font-bold')}>{day.getDate()}</span>
              {extra > 0 && <span className="text-[10px] text-slate-400">+{extra}</span>}
            </div>
          </div>
        );
      })}

      {/* 事件条 absolute 覆盖到日期格子之上 */}
      {lanes.map((lane, laneIdx) =>
        lane.map((item) => {
          const leftPct = (item.startCol / 7) * 100;
          const widthPct = (item.span / 7) * 100;
          const top = dateHeaderHeight + laneIdx * laneHeight;
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
  dragRef,
  onDrop,
  rowMinHeight,
  compact,
}: { anchor: Date; events: CalendarEvent[]; rowMinHeight?: number; compact?: boolean } & DragCtx) {
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  const end = endOfWeek(anchor, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end });

  const weekEvents = events.filter((e) => e.end >= start && e.start <= end);
  if (weekEvents.length === 0) {
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
      <MonthRow row={days} events={events} anchorMonth={anchor} dragRef={dragRef} onDrop={onDrop} rowMinHeight={rowMinHeight} compact={compact} />
    </div>
  );
}

// ==================== 日视图 ====================

function DayView({ anchor, events }: { anchor: Date; events: CalendarEvent[] }) {
  const dayEvents = events.filter((e) => isWithinInterval(anchor, { start: e.start, end: e.end }));
  const key = format(anchor, 'yyyy-MM-dd');

  if (dayEvents.length === 0) {
    return <EmptyState icon={CalendarDays} title={`${key} 当天没有对策安排`} description="切换日期或到问题详情页添加对策" />;
  }

  return (
    <div className="card p-4 space-y-3">
      <h2 className="font-semibold">{key} · 共 {dayEvents.length} 项对策</h2>
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
