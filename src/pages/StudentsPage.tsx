import { useCallback, useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Users, PlusCircle, X, Trash2, UserRound } from 'lucide-react';
import { useToast } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { findGaps, findTrainingsByStudent, getAllRecords, putRecord, deleteRecord } from '../services/localDB';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { aggregateBySubject } from '../services/analytics';
import { MasteryBar } from '../components/MasteryBar';
import {
  GRADE_LEVEL_LABEL,
  SUBJECT_LABEL,
  SUBJECT_MATRIX,
  type GradeLevel,
  type StudentProfile,
  type Subject,
} from '../domain/types';

export function StudentsPage() {
  const { prefs, setPrefs } = useAppSession();
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    setStudents(await getAllRecords('students'));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (student: StudentProfile) => {
    await putRecord('students', student);
    setShowForm(false);
    void refresh();
    showToast('学生已保存', 'success');
  };

  const remove = async (id: string) => {
    if (!window.confirm('确认删除该学生？其历史训练记录不会删除')) return;
    await deleteRecord('students', id);
    if (prefs.currentStudentId === id) void setPrefs({ currentStudentId: undefined });
    void refresh();
    showToast('已删除', 'info');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="学生管理"
        description="教师端：管理多名学生，为每个学生诊断能力瓶颈。"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <PlusCircle size={16} /> 添加学生
          </button>
        }
      />

      {prefs.role !== 'teacher' && (
        <div className="card p-3 text-sm text-slate-600 bg-yellow-50 border-yellow-100">
          当前是学生身份。 学生管理主要为教师使用；你可以在「设置」中切换身份。
        </div>
      )}

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="还没有学生"
          description="添加第一个学生开始管理，或将自己也作为一个学生以隔离多学员数据"
          action={
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> 添加学生
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {students.map((s) => (
            <StudentCard
              key={s.id}
              student={s}
              active={prefs.currentStudentId === s.id}
              onSelect={() => setPrefs({ currentStudentId: s.id })}
              onDelete={() => remove(s.id)}
            />
          ))}
          {prefs.currentStudentId && (
            <button className="btn-ghost" onClick={() => setPrefs({ currentStudentId: undefined })}>
              取消选中当前学生 (回到自用视图)
            </button>
          )}
        </div>
      )}

      {showForm && <StudentForm onClose={() => setShowForm(false)} onSave={save} />}
    </div>
  );
}

function StudentCard({
  student,
  active,
  onSelect,
  onDelete,
}: {
  student: StudentProfile;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [summary, setSummary] = useState<{ questions: number; errors: number; gaps: number }>({
    questions: 0,
    errors: 0,
    gaps: 0,
  });

  useEffect(() => {
    void Promise.all([findTrainingsByStudent(student.id), findGaps(student.id, 'unresolved')]).then(
      ([trainings, gaps]) => {
        const q = trainings.reduce((s, r) => s + r.totalQuestions, 0);
        const err = trainings.reduce((s, r) => s + r.errorCount, 0);
        setSummary({ questions: q, errors: err, gaps: gaps.length });
      },
    );
  }, [student.id]);

  const rate = summary.questions === 0 ? 0 : Math.round(((summary.questions - summary.errors) / summary.questions) * 100);

  return (
    <div className={`card p-4 ${active ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
            <UserRound size={18} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{student.name}</span>
              <span className="badge bg-slate-100 text-slate-600">
                {GRADE_LEVEL_LABEL[student.gradeLevel]}
                {student.grade ? ` · ${student.grade}` : ''}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              学科: {student.subjects.map((s) => SUBJECT_LABEL[s]).join(' / ')}
            </div>
            {student.group && <div className="text-xs text-slate-400 mt-0.5">分组: {student.group}</div>}
          </div>
        </div>
        <button className="btn-ghost text-red-500" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mt-3 text-xs text-slate-600 flex items-center gap-3">
        <span>累计 {summary.questions} 题</span>
        <span>错 {summary.errors}</span>
        <span>未修复问题 {summary.gaps}</span>
      </div>
      <div className="mt-2">
        <MasteryBar score={rate} showLabel={false} />
      </div>

      <button
        className={`w-full mt-3 text-sm py-1.5 rounded-lg transition-colors ${
          active ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
        onClick={onSelect}
      >
        {active ? '当前工作学生' : '设为当前工作学生'}
      </button>
    </div>
  );
}

function StudentForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (student: StudentProfile) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('adult');
  const [subjects, setSubjects] = useState<Subject[]>(SUBJECT_MATRIX.adult);
  const [group, setGroup] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const availableSubjects = SUBJECT_MATRIX[gradeLevel];

  const toggle = (s: Subject) => {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    const student: StudentProfile = {
      id: uuid(),
      name: name.trim(),
      gradeLevel,
      subjects: subjects.filter((s) => availableSubjects.includes(s)),
      group: group.trim() || undefined,
      note: note.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await onSave(student);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">添加学生</h2>
          <button className="btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">姓名 ★</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div>
            <label className="label">学段 ★</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(GRADE_LEVEL_LABEL) as GradeLevel[]).map((g) => (
                <button
                  key={g}
                  className={`px-2 py-1.5 rounded border text-sm ${
                    gradeLevel === g
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                  onClick={() => {
                    setGradeLevel(g);
                    setSubjects(SUBJECT_MATRIX[g]);
                  }}
                >
                  {GRADE_LEVEL_LABEL[g]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">学科</label>
            <div className="flex flex-wrap gap-2">
              {availableSubjects.map((s) => (
                <button
                  key={s}
                  className={`px-3 py-1 rounded-full border text-sm ${
                    subjects.includes(s)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                  onClick={() => toggle(s)}
                >
                  {SUBJECT_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">分组</label>
            <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder='例如: 2026 国考一期班' />
          </div>

          <div>
            <label className="label">备注</label>
            <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving || !name.trim()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
