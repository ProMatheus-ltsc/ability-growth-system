import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { CheckSquare, PlusCircle, Star, Trash2, X } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { findCorrections, getAllRecords, putRecord, deleteRecord } from '../../services/localDB';
import { PROBLEM_TAG_LIBRARY, QUICK_PHRASES } from '../../services/taskTemplates';
import { ERROR_CATEGORY_LABEL, SUBJECT_LABEL, type Correction, type ErrorCategory, type StudentProfile, type Subject } from '../../domain/types';

export function CorrectionPage() {
  const { showToast } = useToast();
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    setCorrections(await findCorrections());
    setStudents(await getAllRecords('students'));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (id: string) => {
    if (!window.confirm('确认删除?')) return;
    await deleteRecord('corrections', id);
    void refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="批改与评价"
        description="主观题(申论/面试)与理科解答的批改。 问题标签自动关联到学生能力缺口。"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <PlusCircle size={16} /> 新建批改
          </button>
        }
      />

      {corrections.length === 0 ? (
        <EmptyState icon={CheckSquare} title="尚无批改记录" description="点击右上按钮开始为学生批改" />
      ) : (
        <div className="space-y-3">
          {corrections.map((c) => {
            const student = students.find((s) => s.id === c.studentId);
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">
                      {student?.name ?? '未知学生'} · {SUBJECT_LABEL[c.subject]} · {c.scenario}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{c.date}</div>
                    {c.problemTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.problemTags.map((t) => (
                          <span key={t} className="badge bg-red-50 text-red-600">
                            {ERROR_CATEGORY_LABEL[t]}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.scoreDims && c.scoreDims.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-600">
                        {c.scoreDims.map((d) => (
                          <span key={d.label}>
                            {d.label}: {'★'.repeat(d.stars)}{'☆'.repeat(5 - d.stars)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-sm text-slate-700 mt-2">{c.suggestion}</div>
                    {c.quickPhrases.length > 0 && (
                      <div className="text-xs text-slate-500 mt-1">
                        评语: {c.quickPhrases.join(' · ')}
                      </div>
                    )}
                  </div>
                  <button className="btn-ghost text-red-500" onClick={() => remove(c.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <CorrectionForm
          students={students}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('批改已保存', 'success');
          }}
        />
      )}
    </div>
  );
}

function CorrectionForm({
  students,
  onClose,
  onSaved,
}: {
  students: StudentProfile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? '');
  const student = useMemo(() => students.find((s) => s.id === studentId), [studentId, students]);
  const [subject, setSubject] = useState<Subject>(student?.subjects[0] ?? 'shenlun');
  const [scenario, setScenario] = useState('申论归纳概括');
  const [tags, setTags] = useState<ErrorCategory[]>([]);
  const [phrases, setPhrases] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState('');
  const [dims, setDims] = useState<Array<{ label: string; stars: number }>>([
    { label: '全面性', stars: 3 },
    { label: '准确性', stars: 3 },
    { label: '条理性', stars: 3 },
  ]);

  const availableTags = PROBLEM_TAG_LIBRARY[subject];
  const availablePhrases = QUICK_PHRASES[subject];

  const toggleTag = (t: ErrorCategory) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const togglePhrase = (p: string) => setPhrases((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const save = async () => {
    if (!studentId) return;
    const now = new Date().toISOString();
    const rec: Correction = {
      id: uuid(),
      studentId,
      subject,
      scenario,
      date: now.slice(0, 10),
      problemTags: tags,
      quickPhrases: phrases,
      suggestion: suggestion.trim(),
      scoreDims: dims,
      relatedGapIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await putRecord('corrections', rec);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">批改评价</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">学生</label>
            <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
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
          <div className="col-span-2">
            <label className="label">评价场景</label>
            <input className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder='例:申论归纳概括 / 面试综合分析' />
          </div>
        </div>

        <div className="mt-4">
          <div className="label">问题标签(多选)</div>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((t) => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={`badge cursor-pointer px-2 py-1 ${tags.includes(t) ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}
              >
                {ERROR_CATEGORY_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="label">评语快捷插入</div>
          <div className="flex flex-wrap gap-2">
            {availablePhrases.map((p) => (
              <button
                key={p}
                onClick={() => togglePhrase(p)}
                className={`badge cursor-pointer px-2 py-1 text-xs ${phrases.includes(p) ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="label">评分维度</div>
          <div className="space-y-2">
            {dims.map((d, i) => (
              <div key={d.label} className="flex items-center gap-2 text-sm">
                <span className="w-16">{d.label}</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setDims((prev) => prev.map((x, idx) => (idx === i ? { ...x, stars: n } : x)))}
                    className={n <= d.stars ? 'text-yellow-500' : 'text-slate-300'}
                  >
                    <Star size={16} fill="currentColor" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="label">修改建议</label>
          <textarea className="input min-h-[80px]" value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save} disabled={!studentId}>提交评价</button>
        </div>
      </div>
    </div>
  );
}
