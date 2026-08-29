import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { PlusCircle, Send, Trash2, X, ClipboardList, Sparkles } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { getAllRecords, putRecord, deleteRecord } from '../../services/localDB';
import { BUILTIN_TEMPLATES } from '../../services/taskTemplates';
import { GRADE_LEVEL_LABEL, SUBJECT_LABEL } from '../../domain/types';
import type { Assignment, AssignmentProgress, GradeLevel, StudentProfile, Subject, TaskTemplate } from '../../domain/types';

export function AssignmentsPage() {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [progress, setProgress] = useState<AssignmentProgress[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState<TaskTemplate | null>(null);
  const [showTplForm, setShowTplForm] = useState(false);

  const refresh = useCallback(async () => {
    const [tpls, asgs, progs, studs] = await Promise.all([
      getAllRecords('templates'),
      getAllRecords('assignments'),
      getAllRecords('assignmentProgress'),
      getAllRecords('students'),
    ]);
    const merged = [...BUILTIN_TEMPLATES.filter((b) => !tpls.some((t) => t.id === b.id)), ...tpls];
    setTemplates(merged);
    setAssignments(asgs.sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
    setProgress(progs);
    setStudents(studs);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeAssignment = async (id: string) => {
    if (!window.confirm('确认删除该任务?')) return;
    await deleteRecord('assignments', id);
    void refresh();
  };

  const persistTemplate = async (tpl: TaskTemplate) => {
    await putRecord('templates', tpl);
    showToast('模板已保存', 'success');
    setShowTplForm(false);
    void refresh();
  };

  const dispatch = async (assignment: Assignment) => {
    await putRecord('assignments', assignment);
    const now = new Date().toISOString();
    for (const sid of assignment.assigneeStudentIds) {
      const prog: AssignmentProgress = {
        id: uuid(),
        assignmentId: assignment.id,
        studentId: sid,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await putRecord('assignmentProgress', prog);
    }
    showToast(`任务已下发给 ${assignment.assigneeStudentIds.length} 名学生`, 'success');
    setShowForm(false);
    void refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="批量任务下发"
        description="任务模板库 + 差异化下发。 学段/学科自动过滤。 支持复用上次下发范围。"
        actions={
          <button className="btn-primary" onClick={() => setShowTplForm(true)}>
            <PlusCircle size={14} /> 新建模板
          </button>
        }
      />

      <div className="card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <ClipboardList size={16} /> 任务模板库
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              className="text-left border border-slate-200 hover:border-blue-400 rounded-lg p-3 transition-colors"
              onClick={() => {
                setSelectedTpl(tpl);
                setShowForm(true);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-slate-900 flex items-center gap-1">
                    {tpl.builtin && <Sparkles size={12} className="text-orange-500" />}
                    {tpl.name}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {GRADE_LEVEL_LABEL[tpl.gradeLevel]} · {SUBJECT_LABEL[tpl.subject]}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {tpl.suggestedQuestions} 题 · {tpl.timeLimitMinutes ?? '不限时'} 分钟
                  </div>
                  {tpl.description && <div className="text-xs text-slate-500 mt-1">{tpl.description}</div>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">已下发任务</h2>
        {assignments.length === 0 ? (
          <EmptyState icon={Send} title="还没有下发过任务" description="点击上方模板一键下发" />
        ) : (
          <div className="space-y-2">
            {assignments.map((a) => {
              const stats = a.assigneeStudentIds.map((sid) => {
                const p = progress.find((pp) => pp.assignmentId === a.id && pp.studentId === sid);
                return { sid, status: p?.status ?? 'pending' };
              });
              const submitted = stats.filter((s) => s.status === 'submitted').length;
              const overdue = new Date(a.dueAt) < new Date();
              return (
                <div key={a.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">{a.title}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {SUBJECT_LABEL[a.subject]} · {a.totalQuestions} 题 · 截止 {a.dueAt}
                        {overdue && <span className="badge bg-red-50 text-red-600 ml-2">已过期</span>}
                      </div>
                      <div className="text-xs text-slate-600 mt-2">
                        提交 {submitted}/{a.assigneeStudentIds.length} · 学生:{' '}
                        {a.assigneeStudentIds
                          .map((sid) => students.find((s) => s.id === sid)?.name ?? sid)
                          .slice(0, 5)
                          .join(', ')}
                      </div>
                    </div>
                    <button className="btn-ghost text-red-500" onClick={() => removeAssignment(a.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && selectedTpl && (
        <DispatchForm
          template={selectedTpl}
          students={students}
          onClose={() => setShowForm(false)}
          onDispatch={dispatch}
        />
      )}

      {showTplForm && <TemplateForm onClose={() => setShowTplForm(false)} onSave={persistTemplate} />}
    </div>
  );
}

function DispatchForm({
  template,
  students,
  onClose,
  onDispatch,
}: {
  template: TaskTemplate;
  students: StudentProfile[];
  onClose: () => void;
  onDispatch: (a: Assignment) => Promise<void>;
}) {
  const eligible = useMemo(
    () => students.filter((s) => s.gradeLevel === template.gradeLevel && s.subjects.includes(template.subject)),
    [students, template],
  );
  const [selected, setSelected] = useState<string[]>(eligible.map((s) => s.id));
  const [title, setTitle] = useState(template.name);
  const [total, setTotal] = useState(template.suggestedQuestions);
  const [timeLimit, setTimeLimit] = useState(template.timeLimitMinutes ?? 30);
  const [dueDays, setDueDays] = useState(3);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (selected.length === 0) return;
    const now = new Date();
    const due = new Date();
    due.setDate(due.getDate() + dueDays);
    const nowIso = now.toISOString();
    const asg: Assignment = {
      id: uuid(),
      templateId: template.id,
      title,
      gradeLevel: template.gradeLevel,
      subject: template.subject,
      taskKind: template.taskKind,
      module: template.moduleHint,
      totalQuestions: total,
      timeLimitMinutes: timeLimit,
      dueAt: due.toISOString().slice(0, 10),
      assigneeStudentIds: selected,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await onDispatch(asg);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 modal-clamp [--modal-max:32rem] [--modal-max-h:90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">下发任务</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">任务标题</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">题量</label>
              <input className="input" type="number" min={1} value={total} onChange={(e) => setTotal(+e.target.value || 0)} />
            </div>
            <div>
              <label className="label">时限(分)</label>
              <input className="input" type="number" min={0} value={timeLimit} onChange={(e) => setTimeLimit(+e.target.value || 0)} />
            </div>
            <div>
              <label className="label">完成期限(天)</label>
              <input className="input" type="number" min={1} value={dueDays} onChange={(e) => setDueDays(+e.target.value || 1)} />
            </div>
          </div>

          <div>
            <div className="label">下发学生({eligible.length} 位可选,已选 {selected.length})</div>
            {eligible.length === 0 ? (
              <div className="text-sm text-slate-500 p-3 bg-slate-50 rounded">
                没有匹配学段/学科的学生
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-lg p-2 space-y-1">
                {eligible.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                    <span className="text-sm">{s.name}</span>
                    <span className="text-xs text-slate-400">{s.group}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={submit} disabled={selected.length === 0}>
            <Send size={14} /> 下发
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateForm({ onClose, onSave }: { onClose: () => void; onSave: (tpl: TaskTemplate) => Promise<void> }) {
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('adult');
  const [subject, setSubject] = useState<Subject>('xingce');
  const [taskKind, setTaskKind] = useState<TaskTemplate['taskKind']>('topic');
  const [total, setTotal] = useState(20);
  const [timeLimit, setTimeLimit] = useState(30);
  const [description, setDescription] = useState('');

  const save = async () => {
    const now = new Date().toISOString();
    await onSave({
      id: uuid(),
      name,
      gradeLevel,
      subject,
      taskKind,
      suggestedQuestions: total,
      timeLimitMinutes: timeLimit,
      description: description || undefined,
      createdAt: now,
      updatedAt: now,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 modal-clamp [--modal-max:28rem] [--modal-max-h:90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">新建任务模板</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">名称</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">学段</label>
              <select className="input" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value as GradeLevel)}>
                {Object.entries(GRADE_LEVEL_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">学科</label>
              <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
                {Object.entries(SUBJECT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">任务类型</label>
            <select className="input" value={taskKind} onChange={(e) => setTaskKind(e.target.value as TaskTemplate['taskKind'])}>
              <option value="topic">专项训练</option>
              <option value="review">错题修复</option>
              <option value="timed">限时训练</option>
              <option value="exam">测验/模考</option>
              <option value="subjective">主观题</option>
              <option value="interview">面试练习</option>
              <option value="experiment">实验探究</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">建议题量</label>
              <input className="input" type="number" min={1} value={total} onChange={(e) => setTotal(+e.target.value || 0)} />
            </div>
            <div>
              <label className="label">时限(分)</label>
              <input className="input" type="number" min={0} value={timeLimit} onChange={(e) => setTimeLimit(+e.target.value || 0)} />
            </div>
          </div>
          <div>
            <label className="label">说明</label>
            <textarea className="input min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save} disabled={!name.trim()}>保存</button>
        </div>
      </div>
    </div>
  );
}
