import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { AlertOctagon, CheckCircle2, PlusCircle, Trash2, X, ListTodo } from 'lucide-react';
import { Timeline, useToast, type TimelineItem } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { findGaps, findTasks, findTrainingsByStudent, putRecord, deleteRecord } from '../services/localDB';
import { calcErrorRecurrence, prioritizeGaps } from '../services/analytics';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { getAbilityTags } from '../domain/abilityTags';
import { INFO_INSUFFICIENT, errorCategoryText, parseAbilityPath } from '../domain/missingInfo';
import {
  ERROR_CATEGORY_LABEL,
  SUBJECT_LABEL,
  type AbilityGap,
  type ErrorCategory,
  type FixTask,
  type GapStatusHistoryItem,
  type Subject,
  type TrainingRecord,
} from '../domain/types';

const GAP_STATUS_LABEL: Record<AbilityGap['status'], string> = {
  unresolved: '未修复',
  'in-progress': '修复中',
  verified: '已验证',
};

const HISTORY_REASON_LABEL: Record<GapStatusHistoryItem['reason'], string> = {
  created: '新建',
  merged: '合并',
  reappeared: '再次出现',
  'task-created': '生成任务',
  manual: '手动流转',
};

export function ProblemCenterPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [gaps, setGaps] = useState<AbilityGap[]>([]);
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [filter, setFilter] = useState<'unresolved' | 'in-progress' | 'verified' | 'all'>('unresolved');
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    const [g, t] = await Promise.all([
      findGaps(prefs.currentStudentId),
      findTrainingsByStudent(prefs.currentStudentId),
    ]);
    setGaps(g);
    setTrainings(t);
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const scoped = filter === 'all' ? gaps : gaps.filter((g) => g.status === filter);
    return prioritizeGaps(scoped);
  }, [filter, gaps]);

  const updateGap = async (gap: AbilityGap, patch: Partial<AbilityGap>) => {
    const now = new Date().toISOString();
    const next: AbilityGap = { ...gap, ...patch, updatedAt: now };
    // 手工状态流转追加 source='manual' 历史
    if (patch.status && patch.status !== gap.status) {
      next.statusHistory = [
        ...(gap.statusHistory ?? []),
        {
          status: patch.status,
          at: now,
          source: 'manual',
          reason: 'manual',
          from: gap.status,
        },
      ];
      if (patch.status === 'verified') next.verifiedAt = now;
    }
    await putRecord('gaps', next);
    void refresh();
  };

  const deleteGap = async (id: string) => {
    if (!window.confirm('确认删除该能力缺口？')) return;
    await deleteRecord('gaps', id);
    void refresh();
    showToast('已删除', 'info');
  };

  /**
   * 从能力缺口一键生成修复任务，并把缺口推进到「修复中」。
   * 这是 PRD 闭环（训练 → 反馈 → 修复 → 验证）里此前缺失的一环。
   */
  const createFixTask = async (gap: AbilityGap) => {
    const now = new Date().toISOString();
    // 同一缺口已有未完成任务时不重复创建
    const existing = await findTasks(prefs.currentStudentId);
    const dup = existing.find(
      (t) => t.relatedGapId === gap.id && t.status !== 'done',
    );
    if (dup) {
      showToast('该问题已有未完成的修复任务', 'info');
      return;
    }
    const task: FixTask = {
      id: uuid(),
      studentId: gap.studentId,
      subject: gap.subject,
      abilityPath: gap.abilityPath,
      relatedGapId: gap.id,
      type: 'fix',
      status: 'pending',
      suggestedAt: now,
      // 默认 3 天内完成，可按练习节奏调整
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now,
    };
    await putRecord('tasks', task);
    if (gap.status === 'unresolved') {
      await putRecord('gaps', {
        ...gap,
        status: 'in-progress',
        updatedAt: now,
        statusHistory: [
          ...(gap.statusHistory ?? []),
          { status: 'in-progress', at: now, source: 'auto', reason: 'task-created', from: gap.status },
        ],
      });
    }
    void refresh();
    showToast('已生成修复任务，可在今日工作台看到', 'success');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="问题中心"
        description="跨学科统一管理未修复的能力缺口。 修复 → 验证 → 能力增长，形成闭环。"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <PlusCircle size={16} /> 手动标记问题
          </button>
        }
      />

      <div className="flex items-center gap-2 text-sm">
        {(['unresolved', 'in-progress', 'verified', 'all'] as const).map((k) => (
          <button
            key={k}
            className={`px-3 py-1.5 rounded-lg ${
              filter === k
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
            onClick={() => setFilter(k)}
          >
            {k === 'unresolved' && '未修复'}
            {k === 'in-progress' && '修复中'}
            {k === 'verified' && '已验证'}
            {k === 'all' && '全部'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={filter === 'unresolved' ? '当前没有未修复的问题' : '没有相关问题'}
          description={filter === 'unresolved' ? '继续保持！(正向反馈)' : '尝试切换筛选条件'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => (
            <GapCard
              key={g.id}
              gap={g}
              recurrence={calcErrorRecurrence(
                trainings.filter((r) => r.subject === g.subject),
                g.errorCategory,
              )}
              onUpdate={(patch) => updateGap(g, patch)}
              onDelete={() => deleteGap(g.id)}
              onCreateTask={() => createFixTask(g)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <QuickGapForm
          onClose={() => setShowForm(false)}
          studentId={prefs.currentStudentId}
          gradeLevel={prefs.gradeLevel}
          availableSubjects={prefs.subjects}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('已保存', 'success');
          }}
        />
      )}
    </div>
  );
}

export function GapCard({
  gap,
  recurrence,
  onUpdate,
  onDelete,
  onCreateTask,
}: {
  gap: AbilityGap;
  recurrence: number;
  onUpdate: (patch: Partial<AbilityGap>) => void;
  onDelete: () => void;
  onCreateTask: () => void;
}) {
  // 历史数据可能缺 abilityPath 或只有一段，直接 split 会在界面上渲染空白/undefined，甚至抛异常
  const path = parseAbilityPath(gap.abilityPath);
  const point = path.point ?? INFO_INSUFFICIENT;
  const moduleText = path.module ?? INFO_INSUFFICIENT;
  const recurrencePct = Number.isFinite(recurrence) ? Math.round(recurrence * 100) : null;
  const severityColor: Record<AbilityGap['severity'], string> = {
    light: 'bg-yellow-50 text-yellow-700',
    medium: 'bg-orange-50 text-orange-700',
    serious: 'bg-red-50 text-red-700',
  };
  const severityLabel: Record<AbilityGap['severity'], string> = {
    light: '轻微',
    medium: '中等',
    serious: '严重',
  };
  const severityColorClass = severityColor[gap.severity] ?? 'bg-slate-100 text-slate-600';
  const severityText = severityLabel[gap.severity] ?? INFO_INSUFFICIENT;
  const sourceCount = (gap.sourceRecordIds ?? []).length;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-slate-900">{point}</span>
            <span className="badge bg-slate-100 text-slate-600">
              {SUBJECT_LABEL[gap.subject] ?? INFO_INSUFFICIENT} · {moduleText}
            </span>
            <span className={`badge ${severityColorClass}`}>{severityText}</span>
            <span className="badge bg-blue-50 text-blue-700">
              复现 {gap.occurrenceCount ?? INFO_INSUFFICIENT} 次
            </span>
          </div>
          {path.missing && (
            <Link
              to="/trainings"
              className="inline-block text-xs text-blue-600 hover:underline mt-2"
            >
              {INFO_INSUFFICIENT}：去关联一次训练记录，补全模块与能力点 →
            </Link>
          )}
          <div className="text-sm text-slate-600 mt-2">
            <span className="text-slate-500">错误类型:</span> {errorCategoryText(gap.errorCategory)}
            <span className="mx-2 text-slate-300">·</span>
            <span className="text-slate-500">最近错误复现率:</span>{' '}
            <b>{recurrencePct === null ? INFO_INSUFFICIENT : `${recurrencePct}%`}</b>
          </div>
          {gap.suggestion && (
            <div className="mt-2 text-sm text-slate-600 bg-blue-50 p-2 rounded">
              💡 {gap.suggestion}
            </div>
          )}
          <div className="mt-3 rounded-lg border border-slate-100 bg-white p-3">
            <div className="text-xs font-medium text-slate-500 mb-2">状态历史</div>
            {gap.statusHistory && gap.statusHistory.length > 0 ? (
              <Timeline items={buildHistoryItems(gap.statusHistory)} />
            ) : (
              <p className="text-sm text-slate-400">
                当前状态（历史缺失）：{GAP_STATUS_LABEL[gap.status] ?? INFO_INSUFFICIENT}
              </p>
            )}
          </div>
          {/* V5.11 Bug #029 修复:四角度证据链 · 来源 · 复现率 · 趋势 · 掌握度 */}
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="rounded bg-slate-50 p-2">
              <div className="text-slate-400">来源</div>
              <div className="text-slate-700 mt-0.5">
                {sourceCount > 0 ? `${sourceCount} 次训练` : '手动标记'}
              </div>
            </div>
            <div className="rounded bg-slate-50 p-2">
              <div className="text-slate-400">复现率</div>
              <div className="text-slate-700 mt-0.5">
                {recurrencePct === null ? INFO_INSUFFICIENT : `${recurrencePct}%`}
              </div>
            </div>
            <div className="rounded bg-slate-50 p-2">
              <div className="text-slate-400">趋势</div>
              <div className="text-slate-700 mt-0.5">
                {gap.occurrenceCount >= 5 ? '📈 高频' : gap.occurrenceCount >= 3 ? '↗ 上升' : '➖ 观察'}
              </div>
            </div>
            <div className="rounded bg-slate-50 p-2">
              <div className="text-slate-400">掌握度</div>
              <div className="text-slate-700 mt-0.5">
                {gap.status === 'verified' ? '✅ 已验证' : gap.status === 'in-progress' ? '⏳ 修复中' : '⚠ 待修复'}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            首次: {formatDay(gap.firstSeenAt)} · 最近: {formatDay(gap.lastSeenAt)}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <select
            className="input text-xs py-1 px-2 w-28"
            value={gap.status}
            onChange={(e) => onUpdate({ status: e.target.value as AbilityGap['status'] })}
          >
            <option value="unresolved">未修复</option>
            <option value="in-progress">修复中</option>
            <option value="verified">已验证</option>
          </select>
          {gap.status !== 'verified' && (
            <button className="btn-secondary text-xs py-1 px-2 w-28 justify-center" onClick={onCreateTask}>
              <ListTodo size={12} /> 修复任务
            </button>
          )}
          <button className="btn-ghost text-red-500 hover:bg-red-50" onClick={onDelete}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** 只取日期部分；缺失或格式异常时统一显示「信息不足」 */
function formatDay(value?: string): string {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : INFO_INSUFFICIENT;
}

/** 只取到分钟；缺失或格式异常时统一显示「信息不足」 */
function formatMinute(value?: string): string {
  return typeof value === 'string' && value.length >= 16
    ? value.slice(0, 16).replace('T', ' ')
    : INFO_INSUFFICIENT;
}

/** 状态历史 → 受控时间线 items（倒序：最新在上） */
function buildHistoryItems(history: GapStatusHistoryItem[]): TimelineItem[] {
  return [...history]
    .reverse()
    .map((h, index) => ({
      id: `${h.at}-${h.reason}-${index}`,
      time: formatMinute(h.at),
      title: GAP_STATUS_LABEL[h.status] ?? INFO_INSUFFICIENT,
      description: `${h.source === 'manual' ? '手动' : '自动'} · ${
        HISTORY_REASON_LABEL[h.reason] ?? INFO_INSUFFICIENT
      }${h.from ? ` · 由「${GAP_STATUS_LABEL[h.from] ?? INFO_INSUFFICIENT}」` : ''}`,
      tone:
        h.status === 'verified'
          ? ('success' as const)
          : h.status === 'in-progress'
            ? ('warning' as const)
            : ('danger' as const),
    }));
}

interface FormProps {
  studentId?: string;
  gradeLevel: AbilityGap['severity'] extends string ? string : never; // 占位
  availableSubjects: Subject[];
  onClose: () => void;
  onSaved: () => void;
}

function QuickGapForm({
  onClose,
  studentId,
  availableSubjects,
  onSaved,
}: {
  studentId?: string;
  gradeLevel: string;
  availableSubjects: Subject[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { prefs } = useAppSession();
  const [subject, setSubject] = useState<Subject>(availableSubjects[0] ?? 'math');
  const tags = getAbilityTags(prefs.gradeLevel, subject);
  const [abilityPath, setAbilityPath] = useState<string>(tags[0]?.path ?? '');
  const [category, setCategory] = useState<ErrorCategory>('concept');
  const [severity, setSeverity] = useState<AbilityGap['severity']>('medium');
  const [suggestion, setSuggestion] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAbilityPath(tags[0]?.path ?? '');
  }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!abilityPath) return;
    setSaving(true);
    const now = new Date().toISOString();
    const gap: AbilityGap = {
      id: uuid(),
      studentId,
      subject,
      abilityPath,
      errorCategory: category,
      severity,
      status: 'unresolved',
      sourceRecordIds: [],
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      suggestion: suggestion.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      statusHistory: [{ status: 'unresolved', at: now, source: 'manual', reason: 'created' }],
    };
    try {
      await putRecord('gaps', gap);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6 modal-clamp [--modal-max:32rem] [--modal-max-h:90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <AlertOctagon size={18} className="text-orange-500" /> 手动标记能力缺口
          </h2>
          <button className="btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">学科</label>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              {availableSubjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">能力点</label>
            {tags.length === 0 ? (
              <input
                className="input"
                value={abilityPath}
                onChange={(e) => setAbilityPath(e.target.value)}
                placeholder="学科/模块/能力点"
              />
            ) : (
              <select className="input" value={abilityPath} onChange={(e) => setAbilityPath(e.target.value)}>
                {tags.map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.module} · {t.point}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">错误类型</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as ErrorCategory)}>
                {(Object.keys(ERROR_CATEGORY_LABEL) as ErrorCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {ERROR_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">严重程度</label>
              <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as AbilityGap['severity'])}>
                <option value="light">轻微</option>
                <option value="medium">中等</option>
                <option value="serious">严重</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">改进建议(选填)</label>
            <textarea
              className="input min-h-[80px]"
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="例如: 重点复习两期比重差三步法"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={save} disabled={saving || !abilityPath}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
