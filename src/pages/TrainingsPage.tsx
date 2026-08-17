import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { PlusCircle, Trash2, Zap, X, Filter } from 'lucide-react';
import { useToast } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { findTrainingsByStudent, putRecord, deleteRecord, getMeta, setMeta } from '../services/localDB';
import { getModules } from '../domain/abilityTags';
import {
  SUBJECT_LABEL,
  SUBJECT_MATRIX,
  TRAINING_TYPE_LABEL,
  ERROR_CATEGORY_LABEL,
  type ErrorCategory,
  type Subject,
  type TrainingRecord,
  type TrainingType,
} from '../domain/types';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';

const RECENT_KEY = 'trainings-recent';

interface RecentDefaults {
  subject: Subject;
  module: string;
  trainingType: TrainingType;
  totalQuestions: number;
  durationMinutes: number;
}

export function TrainingsPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [filterSubject, setFilterSubject] = useState<Subject | 'all'>('all');
  const [recent, setRecent] = useState<RecentDefaults | null>(null);

  const refresh = useCallback(async () => {
    const list = await findTrainingsByStudent(prefs.currentStudentId);
    setRecords(list);
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
    void getMeta<RecentDefaults | null>(RECENT_KEY, null).then(setRecent);
  }, [refresh]);

  const filtered = useMemo(
    () => (filterSubject === 'all' ? records : records.filter((r) => r.subject === filterSubject)),
    [records, filterSubject],
  );

  const handleSave = async (draft: TrainingRecord) => {
    await putRecord('trainings', draft);
    const nextRecent: RecentDefaults = {
      subject: draft.subject,
      module: draft.module,
      trainingType: draft.trainingType,
      totalQuestions: draft.totalQuestions,
      durationMinutes: draft.durationMinutes ?? 30,
    };
    setRecent(nextRecent);
    await setMeta(RECENT_KEY, nextRecent);
    setShowForm(false);
    void refresh();
    showToast('训练记录已保存', 'success');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除该训练记录？')) return;
    await deleteRecord('trainings', id);
    void refresh();
    showToast('记录已删除', 'info');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="训练记录"
        description="记录一次训练：做了什么 · 做得怎么样 · 为什么错。 陌生题正确率比刷题数量更能反映能力增长。"
        actions={
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                setQuickMode(!quickMode);
                setShowForm(true);
              }}
            >
              <Zap size={14} /> {quickMode ? '标准模式' : '快速模式'}
            </button>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> 记录训练
            </button>
          </>
        }
      />

      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Filter size={14} />
        <span>学科筛选:</span>
        <button
          className={`px-2 py-1 rounded ${filterSubject === 'all' ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`}
          onClick={() => setFilterSubject('all')}
        >
          全部
        </button>
        {prefs.subjects.map((s) => (
          <button
            key={s}
            className={`px-2 py-1 rounded ${filterSubject === s ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`}
            onClick={() => setFilterSubject(s)}
          >
            {SUBJECT_LABEL[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={PlusCircle}
          title="还没有训练记录"
          description="完成第一次训练后来这里记录吧。 系统会根据陌生题正确率和错误类型分布诊断你的能力瓶颈。"
          action={
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> 记录第一次训练
            </button>
          }
        />
      ) : (
        <div className="card divide-y divide-slate-100">
          {filtered.map((r) => (
            <RecordItem key={r.id} record={r} onDelete={() => handleDelete(r.id)} />
          ))}
        </div>
      )}

      {showForm && (
        <TrainingForm
          quick={quickMode}
          defaults={recent}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          studentId={prefs.currentStudentId}
          gradeLevel={prefs.gradeLevel}
          availableSubjects={prefs.subjects.length > 0 ? prefs.subjects : SUBJECT_MATRIX[prefs.gradeLevel]}
        />
      )}
    </div>
  );
}

function RecordItem({ record, onDelete }: { record: TrainingRecord; onDelete: () => void }) {
  const correct = record.totalQuestions - record.errorCount;
  const rate = record.totalQuestions === 0 ? 0 : Math.round((correct / record.totalQuestions) * 100);
  return (
    <div className="p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-900">
            {SUBJECT_LABEL[record.subject]} · {record.module}
          </span>
          <span className="badge bg-slate-100 text-slate-600">{TRAINING_TYPE_LABEL[record.trainingType]}</span>
          {record.isUnfamiliar && <span className="badge bg-amber-100 text-amber-700">陌生题</span>}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {record.date} · {record.totalQuestions} 题 · 正确 {correct} / 错 {record.errorCount} · 用时 {record.durationMinutes ?? '-'} 分
        </div>
        {record.errorCategories.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {record.errorCategories.map((c) => (
              <span key={c} className="badge bg-red-50 text-red-600">
                {ERROR_CATEGORY_LABEL[c]}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-lg font-bold text-slate-800">{rate}%</div>
        <div className="text-xs text-slate-400">正确率</div>
      </div>
      <button className="btn-ghost text-red-500 hover:bg-red-50" onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

interface FormProps {
  quick: boolean;
  defaults: RecentDefaults | null;
  studentId?: string;
  gradeLevel: TrainingRecord['gradeLevel'];
  availableSubjects: Subject[];
  onClose: () => void;
  onSave: (record: TrainingRecord) => Promise<void>;
}

function TrainingForm({ quick, defaults, studentId, gradeLevel, availableSubjects, onClose, onSave }: FormProps) {
  const initSubject = defaults?.subject && availableSubjects.includes(defaults.subject) ? defaults.subject : availableSubjects[0];
  const [subject, setSubject] = useState<Subject>(initSubject);
  const moduleOptions = getModules(gradeLevel, subject);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [moduleName, setModuleName] = useState<string>(defaults?.module ?? moduleOptions[0] ?? '');
  const [trainingType, setTrainingType] = useState<TrainingType>(defaults?.trainingType ?? 'topic');
  const [total, setTotal] = useState<number>(defaults?.totalQuestions ?? 15);
  const [errors, setErrors] = useState<number>(0);
  const [duration, setDuration] = useState<number>(defaults?.durationMinutes ?? 30);
  const [categories, setCategories] = useState<ErrorCategory[]>([]);
  const [isUnfamiliar, setIsUnfamiliar] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const errorLibrary = getErrorLibrary(subject);

  const toggleCategory = (c: ErrorCategory) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  useEffect(() => {
    if (!moduleOptions.includes(moduleName) && moduleOptions.length > 0) {
      setModuleName(moduleOptions[0]);
    }
  }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!moduleName) return;
    setSaving(true);
    const now = new Date().toISOString();
    const record: TrainingRecord = {
      id: uuid(),
      studentId,
      date,
      gradeLevel,
      subject,
      module: moduleName,
      trainingType,
      totalQuestions: total,
      correctCount: total - errors,
      errorCount: errors,
      durationMinutes: duration,
      errorCategories: categories,
      isUnfamiliar,
      note: note.trim() || undefined,
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
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            记录训练 · {quick ? '快速模式' : '标准模式'}
          </h2>
          <button className="btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">日期</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">学科 ★</label>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              {availableSubjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">知识模块 ★</label>
            {moduleOptions.length > 0 ? (
              <select className="input" value={moduleName} onChange={(e) => setModuleName(e.target.value)}>
                {moduleOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" value={moduleName} onChange={(e) => setModuleName(e.target.value)} placeholder="输入模块名称" />
            )}
          </div>
          <div>
            <label className="label">训练类型</label>
            <select className="input" value={trainingType} onChange={(e) => setTrainingType(e.target.value as TrainingType)}>
              {(Object.keys(TRAINING_TYPE_LABEL) as TrainingType[]).map((k) => (
                <option key={k} value={k}>
                  {TRAINING_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          {!quick && (
            <>
              <div>
                <label className="label">题目数量 ★</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={total}
                  onChange={(e) => setTotal(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <label className="label">用时(分钟)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={duration}
                  onChange={(e) => setDuration(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </>
          )}

          <div>
            <label className="label">错误数量 ★</label>
            <input
              className="input"
              type="number"
              min={0}
              max={total}
              value={errors}
              onChange={(e) => setErrors(Math.max(0, Math.min(total, Number(e.target.value) || 0)))}
            />
            <div className="text-xs text-slate-400 mt-1">
              正确数量 = {Math.max(0, total - errors)} (自动计算)
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <input
              id="unfamiliar"
              type="checkbox"
              checked={isUnfamiliar}
              onChange={(e) => setIsUnfamiliar(e.target.checked)}
            />
            <label htmlFor="unfamiliar" className="text-sm text-slate-600">
              标记为陌生题(用于计算陌生题正确率)
            </label>
          </div>
        </div>

        <div className="mt-4">
          <label className="label">错误类型 (多选)</label>
          <div className="flex flex-wrap gap-2">
            {errorLibrary.map((c) => (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                className={`badge cursor-pointer px-2 py-1 ${
                  categories.includes(c)
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {ERROR_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        {!quick && (
          <div className="mt-4">
            <label className="label">备注</label>
            <textarea
              className="input min-h-[70px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="选填,例如: 某道题的具体错因、下次改进方向"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving || !moduleName}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function getErrorLibrary(subject: Subject): ErrorCategory[] {
  const base: ErrorCategory[] = ['concept', 'read', 'calc', 'method', 'time'];
  if (subject === 'math') return [...base, 'formula', 'model', 'logic', 'norm'];
  if (subject === 'physics') return [...base, 'formula', 'model', 'experiment', 'direction', 'norm'];
  if (subject === 'xingce') return ['not-know', 'concept', 'method', 'judge', 'calc', 'time'];
  if (subject === 'shenlun')
    return ['point', 'accuracy', 'read', 'structure', 'argument', 'language', 'format', 'wordcount', 'time'];
  if (subject === 'mianshi')
    return ['structure', 'argument', 'language', 'read', 'concept', 'time'];
  return base;
}
