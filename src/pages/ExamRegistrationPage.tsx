/**
 * 报考信息：只维护「考试时间 + 目标分」，供分析中心目标分差使用。
 * 存储结构沿用 ExamRegistration；编辑已有记录时其余字段原样保留，不破坏历史 targetScore。
 */
import { useCallback, useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Briefcase, PlusCircle, Trash2, X } from 'lucide-react';
import { useToast } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, putRecord, deleteRecord } from '../services/localDB';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import type { ExamRegistration } from '../domain/types';

export function ExamRegistrationPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [list, setList] = useState<ExamRegistration[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExamRegistration | null>(null);

  const refresh = useCallback(async () => {
    const all = await getAllRecords('registrations');
    setList(all.filter((r) => (prefs.currentStudentId ? r.studentId === prefs.currentStudentId : true)));
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (id: string) => {
    if (!window.confirm('确认删除?')) return;
    await deleteRecord('registrations', id);
    void refresh();
    showToast('已删除', 'info');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="报考信息"
        description="只记录考试时间与目标分，用于分析中心计算目标分差；目标分为掌握度口径（0–100），不是卷面分。"
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <PlusCircle size={16} /> 新增报考信息
          </button>
        }
      />

      {list.length === 0 ? (
        <EmptyState icon={Briefcase} title="还没有报考信息" description="填写考试时间与目标分后，分析中心会显示目标分差" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">
                    {r.targetScore !== undefined ? `目标分 ${r.targetScore}%` : '未设置目标分'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">考试时间 {r.examDate}</div>
                  {r.postName && r.postName !== '报考信息' && (
                    <div className="text-xs text-slate-400 mt-0.5">原记录：{r.postName}</div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button className="btn-ghost text-blue-600" onClick={() => { setEditing(r); setShowForm(true); }}>编辑</button>
                  <button className="btn-ghost text-red-500" onClick={() => remove(r.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <RegForm
          initial={editing}
          studentId={prefs.currentStudentId}
          onClose={() => setShowForm(false)}
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

function RegForm({
  initial,
  studentId,
  onClose,
  onSaved,
}: {
  initial: ExamRegistration | null;
  studentId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [examDate, setExamDate] = useState(initial?.examDate ?? '');
  const [targetScore, setTargetScore] = useState(
    initial?.targetScore !== undefined ? String(initial.targetScore) : '',
  );

  const save = async () => {
    if (!examDate) return;
    const trimmed = targetScore.trim();
    const targetValue = trimmed === '' ? undefined : Number(trimmed);
    if (targetValue !== undefined && (!Number.isFinite(targetValue) || targetValue < 0 || targetValue > 100)) {
      window.alert('目标分需为 0-100 的数字（掌握度口径），或留空表示未设置');
      return;
    }
    const now = new Date().toISOString();
    const record: ExamRegistration = {
      ...(initial ?? {}),
      id: initial?.id ?? uuid(),
      studentId: studentId ?? initial?.studentId,
      // 存储层这两个字段必填；新记录用中性默认值，编辑老记录时保留原值
      postName: initial?.postName ?? '报考信息',
      examType: initial?.examType ?? 'national',
      examDate,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    if (targetValue === undefined) delete record.targetScore;
    else record.targetScore = targetValue;
    await putRecord('registrations', record);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 modal-clamp [--modal-max:28rem] [--modal-max-h:90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">{initial ? '编辑' : '新增'}报考信息</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">考试时间 ★</label>
            <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>
          <div>
            <label className="label">目标分（0-100，掌握度口径，可留空）</label>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              placeholder="例: 80，留空表示未设置"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save} disabled={!examDate}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
