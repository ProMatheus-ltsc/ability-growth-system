/**
 * 报考信息：按「设置 → 学科」里已选的科目，分别维护目标分与考试时间，供分析中心按科目计算目标分差。
 * 存储结构沿用 ExamRegistration；新记录写入 subjectPlans，老记录（仅顶层 targetScore）读取时回退，
 * 编辑老记录会把历史值预填到各科目，保存后仍保留顶层 targetScore，不破坏已有数据。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { Briefcase, PlusCircle, Trash2, X } from 'lucide-react';
import { useToast } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, putRecord, deleteRecord } from '../services/localDB';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { REGISTRATION_TIMELINE_LABEL, SUBJECT_LABEL, type ExamRegistration, type RegistrationTimeline, type Subject, type SubjectExamPlan } from '../domain/types';

type PlanForm = { examDate: string; targetScore: string };

export function ExamRegistrationPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [list, setList] = useState<ExamRegistration[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExamRegistration | null>(null);

  // 科目来自全局设置，不在本页重复选择
  const subjects = useMemo(() => Array.from(new Set(prefs.subjects)), [prefs.subjects]);

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
        description="按已选科目分别填写目标分与考试时间，用于分析中心按学科计算目标分差；目标分为掌握度口径（0–100），不是卷面分。"
        actions={
          subjects.length > 0 ? (
            <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
              <PlusCircle size={16} /> 新增报考信息
            </button>
          ) : undefined
        }
      />

      {subjects.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={Briefcase}
            title="尚未选择考试科目"
            description="报考信息按科目填写。请先到设置页选择参加的科目（如行测、申论），再回来填写目标分与考试时间。"
          />
          <div className="text-center">
            <Link to="/settings" className="text-sm text-blue-600 hover:underline">去设置学科 →</Link>
          </div>
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="还没有报考信息"
          description={`当前已选科目：${subjects.map((s) => SUBJECT_LABEL[s]).join(' / ')}。新增后即可按科目填写目标分与考试时间。`}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">报考信息</div>
                  {r.subjectPlans ? (
                    <div className="mt-1 space-y-1">
                      {orderedPlanSubjects(r, subjects).map((s) => {
                        const plan = r.subjectPlans?.[s];
                        return (
                          <div key={s} className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2">
                            <span className="badge bg-slate-100 text-slate-600">{SUBJECT_LABEL[s]}</span>
                            <span>{plan?.targetScore !== undefined ? `目标分 ${plan.targetScore}%` : '未设置目标分'}</span>
                            <span className="text-slate-400">·</span>
                            <span>考试 {plan?.examDate ?? '未填写'}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-600 mt-1">
                      历史记录（未分科） · 目标分 {r.targetScore !== undefined ? `${r.targetScore}%` : '未设置'} · 考试 {r.examDate || '未填写'}
                    </div>
                  )}
                  {r.postName && r.postName !== '报考信息' && (
                    <div className="text-xs text-slate-400 mt-1">原记录：{r.postName}</div>
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

      {showForm && subjects.length > 0 && (
        <RegForm
          subjects={subjects}
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

/** 列表里展示的科目：设置里的科目在前，记录里额外的科目补在后面 */
function orderedPlanSubjects(record: ExamRegistration, subjects: Subject[]): Subject[] {
  const planKeys = Object.keys(record.subjectPlans ?? {}) as Subject[];
  const extras = planKeys.filter((s) => !subjects.includes(s));
  return [...subjects, ...extras];
}

function RegForm({
  subjects,
  initial,
  studentId,
  onClose,
  onSaved,
}: {
  subjects: Subject[];
  initial: ExamRegistration | null;
  studentId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // 老记录没有 subjectPlans：顶层 targetScore / examDate 视为该科目的历史值，预填到每个已选科目
  const legacy = initial && !initial.subjectPlans ? initial : null;
  const [forms, setForms] = useState<Partial<Record<Subject, PlanForm>>>(() => {
    const init: Partial<Record<Subject, PlanForm>> = {};
    for (const s of subjects) {
      const plan = initial?.subjectPlans?.[s];
      init[s] = {
        examDate: plan?.examDate ?? (legacy ? legacy.examDate ?? '' : ''),
        targetScore:
          plan?.targetScore !== undefined
            ? String(plan.targetScore)
            : legacy?.targetScore !== undefined
              ? String(legacy.targetScore)
              : '',
      };
    }
    return init;
  });

  const update = (subject: Subject, patch: Partial<PlanForm>) => {
    setForms((prev) => ({
      ...prev,
      [subject]: { examDate: '', targetScore: '', ...prev[subject], ...patch },
    }));
  };

  // 报考流程时间节点（报名/缴费/准考证/成绩），键与 RegistrationTimeline 一致
  const [timeline, setTimeline] = useState<RegistrationTimeline>(() => initial?.timeline ?? {});
  const [postName, setPostName] = useState<string>(() => {
    const name = initial?.postName ?? '';
    return name === '报考信息' ? '' : name;
  });
  const updateTimeline = (key: keyof RegistrationTimeline, value: string) => {
    setTimeline((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    const plans: Partial<Record<Subject, SubjectExamPlan>> = {};
    for (const s of subjects) {
      const form = forms[s] ?? { examDate: '', targetScore: '' };
      if (!form.examDate) {
        window.alert(`请填写「${SUBJECT_LABEL[s]}」的考试时间`);
        return;
      }
      const trimmed = form.targetScore.trim();
      const targetScore = trimmed === '' ? undefined : Number(trimmed);
      if (targetScore !== undefined && (!Number.isFinite(targetScore) || targetScore < 0 || targetScore > 100)) {
        window.alert(`「${SUBJECT_LABEL[s]}」目标分需为 0-100 的数字，或留空表示未设置`);
        return;
      }
      plans[s] = { examDate: form.examDate, ...(targetScore !== undefined ? { targetScore } : {}) };
    }

    const now = new Date().toISOString();
    const dates = Object.values(plans)
      .map((p) => p?.examDate)
      .filter((d): d is string => Boolean(d))
      .sort();
    // 只保留真正填了值的时间节点，避免存一堆空字符串
    const cleanTimeline: RegistrationTimeline = {};
    for (const { key } of REGISTRATION_TIMELINE_LABEL) {
      const v = timeline[key];
      if (v && v.trim()) cleanTimeline[key] = v.trim();
    }
    const record: ExamRegistration = {
      ...(initial ?? {}),
      id: initial?.id ?? uuid(),
      studentId: studentId ?? initial?.studentId,
      // 存储层这两个字段必填；岗位名留空时用中性默认值（页面显示「未填写」）
      postName: postName.trim() || '报考信息',
      examType: initial?.examType ?? 'national',
      // 顶层考试时间取最早一场，兼容仍要读顶层 examDate 的旧逻辑
      examDate: dates[0] ?? initial?.examDate ?? '',
      subjectPlans: plans,
      timeline: Object.keys(cleanTimeline).length > 0 ? cleanTimeline : undefined,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    // 老记录的顶层 targetScore 原样保留（不删除、不清空），新记录不写顶层 targetScore
    await putRecord('registrations', record);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">{initial ? '编辑' : '新增'}报考信息</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 mb-4">
          科目来自「设置 → 学科」，本页不重复选择。
        </div>

        {/* 岗位名称：用于日历/时间线的节点标签，留空显示为「报考信息」 */}
        <div className="mb-4">
          <label className="label">岗位名称</label>
          <input
            className="input"
            value={postName}
            onChange={(e) => setPostName(e.target.value)}
            placeholder="例如：广州市南沙区发展和改革局 · 一级科员"
          />
          <p className="text-xs text-slate-400 mt-1">
            日历与时间线上的节点会带上这个名字，填「单位 + 职位」最好认。
          </p>
        </div>

        {legacy?.targetScore !== undefined && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 mb-4">
            这是旧版单目标分记录（目标 {legacy.targetScore}% / 考试 {legacy.examDate}，未分科），已按科目预填，请确认后保存。
          </div>
        )}

        <div className="space-y-4">
          {subjects.map((s) => (
            <div key={s} className="rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold text-slate-800 mb-2">{SUBJECT_LABEL[s]}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">考试时间 ★</label>
                  <input
                    className="input"
                    type="date"
                    value={forms[s]?.examDate ?? ''}
                    onChange={(e) => update(s, { examDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">目标分（0-100，可留空）</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    value={forms[s]?.targetScore ?? ''}
                    onChange={(e) => update(s, { targetScore: e.target.value })}
                    placeholder="留空表示未设置"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 报考流程时间节点：填了哪个就在日历上生成对应节点，全不填不影响 */}
        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <div className="text-sm font-semibold text-slate-800 mb-1">报考流程时间节点</div>
          <p className="text-xs text-slate-400 mb-3">
            填了就会出现在日历的「关键节点」里；截止类（报名/缴费）带 * 提醒别错过。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REGISTRATION_TIMELINE_LABEL.map(({ key, label, isDeadline }) => (
              <div key={key}>
                <label className="label">
                  {label}
                  {isDeadline && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  className="input"
                  type="date"
                  value={timeline[key] ?? ''}
                  onChange={(e) => updateTimeline(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}
