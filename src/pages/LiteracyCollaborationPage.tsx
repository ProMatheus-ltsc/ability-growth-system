/**
 * §18A.3 讲题 / 小组任务 / 互助修复 专项行为录入
 */
import { useCallback, useEffect, useState } from 'react';
import { Users2, PlusCircle, Trash2, X, CheckCircle2 } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { deleteRecord } from '../services/localDB';
import { listCollaborationEvents, recordCollaborationEvent } from '../services/literacy';
import { SUBJECT_LABEL, type CollaborationEvent, type Subject } from '../domain/types';

const KIND_LABEL: Record<CollaborationEvent['kind'], string> = {
  explain: '讲题给他人',
  'group-task': '小组任务角色',
  'help-fix': '互助修复',
};

export function LiteracyCollaborationPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [list, setList] = useState<CollaborationEvent[]>([]);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    setList(await listCollaborationEvents(prefs.currentStudentId));
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (id: string) => {
    if (!window.confirm('确认删除?')) return;
    await deleteRecord('collaborationEvents', id);
    void refresh();
    showToast('已删除', 'info');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="协作沟通行为记录"
        description="§18A.3 · 讲题 / 小组任务 / 互助修复 行为专项录入(用于素养五维中的协作沟通评估)"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <PlusCircle size={16} /> 录入行为
          </button>
        }
      />

      {list.length === 0 ? (
        <EmptyState icon={Users2} title="尚无协作行为记录" description="讲题、参与小组任务、帮助他人修复能力缺口都可以记录" />
      ) : (
        <div className="space-y-2">
          {list.map((e) => (
            <div key={e.id} className="card p-3 text-sm flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="badge bg-blue-50 text-blue-700">{KIND_LABEL[e.kind]}</span>
                  <span className="text-xs text-slate-500">{e.date}</span>
                  {e.subject && <span className="badge bg-slate-100 text-slate-600">{SUBJECT_LABEL[e.subject]}</span>}
                  {e.passedVerification && (
                    <span className="badge bg-emerald-50 text-emerald-700">
                      <CheckCircle2 size={10} className="inline mr-0.5" /> 对方通过验证
                    </span>
                  )}
                </div>
                <div className="text-slate-700 mt-1">{e.content}</div>
                {e.targetPeer && <div className="text-xs text-slate-500 mt-1">对象: {e.targetPeer}</div>}
              </div>
              <button className="btn-ghost text-red-500" onClick={() => remove(e.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <EventForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('已保存', 'success');
          }}
          studentId={prefs.currentStudentId}
          subjects={prefs.subjects}
        />
      )}
    </div>
  );
}

function EventForm({
  onClose,
  onSaved,
  studentId,
  subjects,
}: {
  onClose: () => void;
  onSaved: () => void;
  studentId?: string;
  subjects: Subject[];
}) {
  const [kind, setKind] = useState<CollaborationEvent['kind']>('explain');
  const [subject, setSubject] = useState<Subject | ''>('');
  const [content, setContent] = useState('');
  const [target, setTarget] = useState('');
  const [passed, setPassed] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    await recordCollaborationEvent({
      studentId,
      date: new Date().toISOString().slice(0, 10),
      kind,
      subject: subject || undefined,
      targetPeer: target.trim() || undefined,
      content: content.trim(),
      passedVerification: passed,
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">录入协作行为</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">行为类型</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as CollaborationEvent['kind'])}>
              <option value="explain">{KIND_LABEL.explain}</option>
              <option value="group-task">{KIND_LABEL['group-task']}</option>
              <option value="help-fix">{KIND_LABEL['help-fix']}</option>
            </select>
          </div>
          <div>
            <label className="label">学科(可选)</label>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as Subject | '')}>
              <option value="">不指定</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">具体内容</label>
            <textarea
              className="input min-h-[80px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="例:给张三讲解了函数图象平移变换,他能独立复述"
            />
          </div>
          <div>
            <label className="label">对象(选填)</label>
            <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={passed} onChange={(e) => setPassed(e.target.checked)} />
            对方后续通过陌生题验证
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={submit} disabled={!content.trim()}>保存</button>
        </div>
      </div>
    </div>
  );
}
