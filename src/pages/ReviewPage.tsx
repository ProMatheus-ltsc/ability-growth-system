import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { CalendarClock, PlusCircle, Trash2, X, Sparkles } from 'lucide-react';
import { useToast } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { findReviews, findTrainingsInRange, putRecord, deleteRecord } from '../services/localDB';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { prioritizeGaps } from '../services/analytics';
import { findGaps } from '../services/localDB';
import type { AbilityGap, ReviewLevel, ReviewRecord, TrainingRecord } from '../domain/types';

const LEVEL_LABEL: Record<ReviewLevel, string> = { day: '日复盘', week: '周复盘', month: '月度复盘' };

export function ReviewPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [level, setLevel] = useState<ReviewLevel>('day');
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [gaps, setGaps] = useState<AbilityGap[]>([]);

  const refresh = useCallback(async () => {
    setRecords(await findReviews(level, prefs.currentStudentId));
  }, [level, prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const from = new Date();
    from.setDate(from.getDate() - (level === 'day' ? 1 : level === 'week' ? 7 : 30));
    void findTrainingsInRange(from.toISOString().slice(0, 10)).then(setTrainings);
    void findGaps(prefs.currentStudentId, 'unresolved').then(setGaps);
  }, [level, prefs.currentStudentId]);

  const remove = async (id: string) => {
    if (!window.confirm('确认删除该复盘？')) return;
    await deleteRecord('reviews', id);
    void refresh();
    showToast('已删除', 'info');
  };

  const save = async (r: ReviewRecord) => {
    await putRecord('reviews', r);
    setShowForm(false);
    void refresh();
    showToast('复盘已保存', 'success');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="复盘中心"
        description="日 → 周 → 月 三级复盘。 输入 / 产出 / 问题 / 瓶颈 / 决策。"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <PlusCircle size={16} /> 开始{LEVEL_LABEL[level]}
          </button>
        }
      />

      <div className="flex items-center gap-2">
        {(['day', 'week', 'month'] as ReviewLevel[]).map((k) => (
          <button
            key={k}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              level === k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
            onClick={() => setLevel(k)}
          >
            {LEVEL_LABEL[k]}
          </button>
        ))}
      </div>

      {records.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={`还没有${LEVEL_LABEL[level]}`}
          description="开始你的第一次复盘，只需 2 分钟"
          action={
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> 开始复盘
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-slate-900">{r.date}</span>
                  <span className="badge bg-blue-50 text-blue-600">{LEVEL_LABEL[r.level]}</span>
                </div>
                <button className="btn-ghost text-red-500" onClick={() => remove(r.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <ReviewSection label="今天做了什么" content={r.did} />
              <ReviewSection label="发现什么问题" content={r.issues} />
              <ReviewSection label="下一步修复什么" content={r.next} />
              {r.autoSummary && (
                <div className="mt-2 text-xs text-slate-500">
                  自动摘要: 训练 {r.autoSummary.trainingCount} 次 · 共 {r.autoSummary.totalQuestions} 题 · 错 {r.autoSummary.errorCount}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ReviewForm
          level={level}
          studentId={prefs.currentStudentId}
          trainings={trainings}
          gaps={gaps}
          onClose={() => setShowForm(false)}
          onSave={save}
        />
      )}
    </div>
  );
}

function ReviewSection({ label, content }: { label: string; content: string }) {
  if (!content) return null;
  return (
    <div className="mt-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm text-slate-700 whitespace-pre-wrap">{content}</div>
    </div>
  );
}

function ReviewForm({
  level,
  studentId,
  trainings,
  gaps,
  onClose,
  onSave,
}: {
  level: ReviewLevel;
  studentId?: string;
  trainings: TrainingRecord[];
  gaps: AbilityGap[];
  onClose: () => void;
  onSave: (r: ReviewRecord) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const trainingSummary = useMemo(() => {
    if (trainings.length === 0) return '（暂无训练记录）';
    return trainings
      .slice(0, 5)
      .map((t) => `· ${t.subject}/${t.module} ${t.totalQuestions} 题 错 ${t.errorCount}`)
      .join('\n');
  }, [trainings]);

  const suggestedGaps = useMemo(() => prioritizeGaps(gaps).slice(0, 3), [gaps]);

  const [did, setDid] = useState<string>(trainingSummary);
  const [issues, setIssues] = useState<string>('');
  const [next, setNext] = useState<string>(
    suggestedGaps.map((g) => `· 修复: ${g.abilityPath.split('/').slice(-1)[0]}`).join('\n'),
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const record: ReviewRecord = {
      id: uuid(),
      studentId,
      level,
      date: today,
      did: did.trim(),
      issues: issues.trim(),
      next: next.trim(),
      autoSummary: {
        trainingCount: trainings.length,
        totalQuestions: trainings.reduce((s, r) => s + r.totalQuestions, 0),
        errorCount: trainings.reduce((s, r) => s + r.errorCount, 0),
      },
      createdAt: now,
      updatedAt: now,
    };
    try {
      await onSave(record);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 modal-clamp [--modal-max:42rem] [--modal-max-h:90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sparkles size={18} className="text-blue-500" /> {LEVEL_LABEL[level]} · {today}
          </h2>
          <button className="btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="label">❶ 今天做了什么？(已自动带出训练摘要)</div>
            <textarea className="input min-h-[100px]" value={did} onChange={(e) => setDid(e.target.value)} />
          </div>
          <div>
            <div className="label">❷ 今天发现什么问题？</div>
            <textarea
              className="input min-h-[100px]"
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              placeholder="例如: 计算错误 3 次，建模错误 2 次"
            />
          </div>
          <div>
            <div className="label">❸ 下一步修复什么？(基于能力短板优先级自动推荐)</div>
            <textarea className="input min-h-[100px]" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            完成复盘 ✔
          </button>
        </div>
      </div>
    </div>
  );
}
