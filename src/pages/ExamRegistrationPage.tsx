import { useCallback, useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Briefcase, PlusCircle, Trash2, X } from 'lucide-react';
import { useToast } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, putRecord, deleteRecord } from '../services/localDB';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import type { ExamRegistration } from '../domain/types';

const EXAM_TYPES: Array<{ v: ExamRegistration['examType']; label: string }> = [
  { v: 'national', label: '国考' },
  { v: 'provincial', label: '省考' },
  { v: 'selected', label: '选调' },
  { v: 'public-inst', label: '事业单位' },
  { v: 'military', label: '军队文职' },
];

const POST_LEVELS: Array<{ v: ExamRegistration['postLevel']; label: string }> = [
  { v: 'central', label: '中央' },
  { v: 'province', label: '省级' },
  { v: 'city', label: '市级' },
  { v: 'county', label: '县级' },
  { v: 'town', label: '乡镇' },
];

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
        title="公考报考信息"
        description="仅作信息记录与备考规划参考,不做分数预测/岗位匹配度分数对比。"
        actions={
          <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            <PlusCircle size={16} /> 新增岗位
          </button>
        }
      />

      {list.length === 0 ? (
        <EmptyState icon={Briefcase} title="还没有报考信息" description="记录目标岗位便于设定备考计划" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">{r.postName}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {r.department ? `${r.department} · ` : ''}
                    {r.postLevel ? POST_LEVELS.find((p) => p.v === r.postLevel)?.label : ''}
                  </div>
                  <div className="text-sm text-slate-700 mt-2">
                    {EXAM_TYPES.find((e) => e.v === r.examType)?.label} · 考试日期 {r.examDate}
                  </div>
                  {r.headcount && (
                    <div className="text-xs text-slate-500 mt-1">
                      招录 {r.headcount} 人{r.applicantsHistory ? ` · 历年报名 ${r.applicantsHistory}` : ''}
                    </div>
                  )}
                  {r.educationLimit && <div className="text-xs text-slate-500 mt-0.5">学历要求: {r.educationLimit}</div>}
                  {r.majorLimit && <div className="text-xs text-slate-500 mt-0.5">专业限制: {r.majorLimit}</div>}
                  {r.interviewLineHistory && (
                    <div className="text-xs text-slate-500 mt-0.5">历年进面: {r.interviewLineHistory}</div>
                  )}
                  {r.note && <div className="text-xs text-slate-500 mt-1">备注: {r.note}</div>}
                </div>
                <div className="flex flex-col gap-1">
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
  const [postName, setPostName] = useState(initial?.postName ?? '');
  const [department, setDepartment] = useState(initial?.department ?? '');
  const [postLevel, setPostLevel] = useState<ExamRegistration['postLevel']>(initial?.postLevel ?? 'county');
  const [examType, setExamType] = useState<ExamRegistration['examType']>(initial?.examType ?? 'national');
  const [examDate, setExamDate] = useState(initial?.examDate ?? '');
  const [headcount, setHeadcount] = useState(String(initial?.headcount ?? ''));
  const [educationLimit, setEducationLimit] = useState(initial?.educationLimit ?? '');
  const [majorLimit, setMajorLimit] = useState(initial?.majorLimit ?? '');
  const [applicants, setApplicants] = useState(initial?.applicantsHistory ?? '');
  const [interview, setInterview] = useState(initial?.interviewLineHistory ?? '');
  const [note, setNote] = useState(initial?.note ?? '');

  const save = async () => {
    if (!postName.trim() || !examDate) return;
    const now = new Date().toISOString();
    const record: ExamRegistration = {
      id: initial?.id ?? uuid(),
      studentId,
      postName: postName.trim(),
      department: department.trim() || undefined,
      postLevel,
      examType,
      examDate,
      headcount: headcount ? +headcount : undefined,
      educationLimit: educationLimit.trim() || undefined,
      majorLimit: majorLimit.trim() || undefined,
      applicantsHistory: applicants.trim() || undefined,
      interviewLineHistory: interview.trim() || undefined,
      note: note.trim() || undefined,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    await putRecord('registrations', record);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">{initial ? '编辑' : '新增'}岗位信息</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">岗位名称 ★</label>
            <input className="input" value={postName} onChange={(e) => setPostName(e.target.value)} />
          </div>
          <div>
            <label className="label">部门</label>
            <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div>
            <label className="label">岗位层级</label>
            <select className="input" value={postLevel} onChange={(e) => setPostLevel(e.target.value as ExamRegistration['postLevel'])}>
              {POST_LEVELS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">考试类型</label>
            <select className="input" value={examType} onChange={(e) => setExamType(e.target.value as ExamRegistration['examType'])}>
              {EXAM_TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">考试日期 ★</label>
            <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>
          <div>
            <label className="label">招录人数</label>
            <input className="input" type="number" min={0} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
          </div>
          <div>
            <label className="label">学历要求</label>
            <input className="input" value={educationLimit} onChange={(e) => setEducationLimit(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">专业要求</label>
            <input className="input" value={majorLimit} onChange={(e) => setMajorLimit(e.target.value)} />
          </div>
          <div>
            <label className="label">历年报名人数</label>
            <input className="input" value={applicants} onChange={(e) => setApplicants(e.target.value)} placeholder="例:近3年 300/450/500" />
          </div>
          <div>
            <label className="label">历年进面情况</label>
            <input className="input" value={interview} onChange={(e) => setInterview(e.target.value)} placeholder="例:面试线 130 分" />
          </div>
          <div className="col-span-2">
            <label className="label">备注</label>
            <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save} disabled={!postName.trim() || !examDate}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
