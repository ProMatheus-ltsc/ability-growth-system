import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { CalendarDays, PlusCircle, Timer, Trash2, X, Zap, CheckCircle2 } from 'lucide-react';
import { useToast } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { getAllRecords, putRecord, deleteRecord, findDueSpacedReviews } from '../services/localDB';
import { advanceSpacedReview, collectExamTargets, createSpacedReview, describeStagePlan, generateDefaultStagePlan, SPACED_INTERVALS } from '../services/planner';
import { getAbilityTags } from '../domain/abilityTags';
import type { ExamRegistration, GradeLevel, SpacedReviewItem, StagePlan, Subject } from '../domain/types';
import { GRADE_LEVEL_LABEL, PLAN_STAGE_LABEL, SUBJECT_LABEL } from '../domain/types';
import { abilityPointText } from '../domain/missingInfo';

export function TimelinePage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [stages, setStages] = useState<StagePlan[]>([]);
  const [spacedItems, setSpacedItems] = useState<SpacedReviewItem[]>([]);
  const [dueItems, setDueItems] = useState<SpacedReviewItem[]>([]);
  const [showStageForm, setShowStageForm] = useState(false);
  const [showSpacedForm, setShowSpacedForm] = useState(false);
  const [manualExamDate, setManualExamDate] = useState<string>('');
  const [registrations, setRegistrations] = useState<ExamRegistration[]>([]);
  const [subjectChoice, setSubjectChoice] = useState<Subject | ''>('');

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const refresh = useCallback(async () => {
    const [s, spaced, due, regs] = await Promise.all([
      getAllRecords('stagePlans'),
      getAllRecords('spacedReviews'),
      findDueSpacedReviews(new Date().toISOString().slice(0, 10)),
      getAllRecords('registrations'),
    ]);
    setStages(s.filter((it) => (prefs.currentStudentId ? it.studentId === prefs.currentStudentId : true)));
    setSpacedItems(spaced.filter((it) => (prefs.currentStudentId ? it.studentId === prefs.currentStudentId : true)));
    setDueItems(due);
    setRegistrations(regs.filter((it) => (prefs.currentStudentId ? it.studentId === prefs.currentStudentId : true)));
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 从报考信息推导未来的考试节点（按日期升序），第一条为当前规划目标，第二条起为接力
  const examTargets = useMemo(() => collectExamTargets(registrations, today), [registrations, today]);

  const autoExamDate = examTargets[0]?.date;
  const nextExam = examTargets[1];
  const examDate = autoExamDate ?? manualExamDate;

  const daysToExam = useMemo(() => {
    if (!examDate) return null;
    return Math.ceil((new Date(`${examDate}T00:00:00.000Z`).getTime() - new Date(`${today}T00:00:00.000Z`).getTime()) / 86400000);
  }, [examDate, today]);

  const planNote = useMemo(() => (examDate ? describeStagePlan(examDate, today) : ''), [examDate, today]);

  // 只有「开始最晚」的一个阶段算进行中，避免旧数据多段重叠时出现多个进行中
  const activeStages = useMemo(() => stages.filter((s) => s.startDate <= today && s.endDate >= today), [stages, today]);
  const currentStageId = useMemo(
    () => [...activeStages].sort((a, b) => b.startDate.localeCompare(a.startDate))[0]?.id ?? null,
    [activeStages],
  );

  const generateStagePlan = async () => {
    if (!examDate) {
      showToast('请先设定考试日期', 'error');
      return;
    }
    const plan = generateDefaultStagePlan(examDate, subjectChoice || undefined, today);
    if (plan.length === 0) {
      showToast('考试日期已过或就是今天，无法生成阶段规划', 'error');
      return;
    }
    if (!window.confirm('将覆盖此前自动生成的同科目阶段（手动添加的阶段不会被删除），确认生成？')) return;
    const replaced = stages.filter((s) => s.source === 'auto' && (s.subject ?? '') === subjectChoice);
    for (const s of replaced) {
      await deleteRecord('stagePlans', s.id);
    }
    for (const p of plan) {
      await putRecord('stagePlans', { ...p, studentId: prefs.currentStudentId, gradeLevel: prefs.gradeLevel });
    }
    void refresh();
    showToast(`已生成 ${plan.length} 个阶段`, 'success');
  };

  const completeSpaced = async (item: SpacedReviewItem) => {
    const next = advanceSpacedReview(item);
    await putRecord('spacedReviews', next);
    void refresh();
    showToast('已推进复习节点', 'success');
  };

  const deleteStage = async (id: string) => {
    if (!window.confirm('确认删除该阶段?')) return;
    await deleteRecord('stagePlans', id);
    void refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="学习时间线"
        description="考试倒计时 · 阶段规划 · 艾宾浩斯间隔复习。间隔复习周期按学段区分（小学 1/2/4/7 天，初高中与成人 1/3/7/14 天，高中与成人多一轮 30 天）；阶段规划按剩余天数动态生成 1–4 段。"
      />

      <div className="card p-5">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
          <CalendarDays size={18} /> 考试倒计时
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {autoExamDate ? (
            <span className="text-sm text-slate-700">
              规划基准：<b>{autoExamDate}</b>
              <span className="text-slate-500">（{examTargets[0].label}）</span>
            </span>
          ) : (
            <input
              className="input max-w-xs"
              type="date"
              value={manualExamDate}
              onChange={(e) => setManualExamDate(e.target.value)}
            />
          )}
          {daysToExam !== null && (
            <span
              className={`badge text-sm ${
                daysToExam < 0 ? 'bg-slate-100 text-slate-500' : daysToExam < 30 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
              }`}
            >
              {daysToExam < 0 ? '已考完' : `距离考试还剩 ${daysToExam} 天`}
            </span>
          )}
          <select
            className="input max-w-[11rem] text-sm"
            value={subjectChoice}
            onChange={(e) => setSubjectChoice(e.target.value as Subject | '')}
            title="生成阶段时归属的学科"
          >
            <option value="">通用（全部学科）</option>
            {prefs.subjects.map((s) => (
              <option key={s} value={s}>
                {SUBJECT_LABEL[s]}
              </option>
            ))}
          </select>
          <button className="btn-primary text-sm" onClick={generateStagePlan}>
            <Zap size={14} /> 生成阶段规划
          </button>
        </div>
        {!autoExamDate && (
          <div className="text-xs text-amber-600 mt-2">未读到报考信息，使用手动日期</div>
        )}
        {autoExamDate && nextExam && (
          <div className="text-xs text-slate-500 mt-2">
            {nextExam.date}（{nextExam.label}）将在其后接力，前一场结束后自动切换
          </div>
        )}
        {planNote && <div className="text-xs text-slate-500 mt-2">{planNote}</div>}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">阶段规划</h2>
          <button className="btn-secondary text-sm" onClick={() => setShowStageForm(true)}>
            <PlusCircle size={14} /> 手动添加阶段
          </button>
        </div>
        {activeStages.length > 1 && (
          <div className="text-xs text-amber-600 mb-2">
            有 {activeStages.length} 个阶段同时覆盖今天（多为旧数据），只有开始最晚的一个标记为「进行中」；建议删除多余阶段。
          </div>
        )}
        {stages.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="尚未规划学习阶段"
            description="设置考试日期后可一键生成阶段规划（按剩余天数自动决定 1–4 段）"
          />
        ) : (
          <div className="space-y-2">
            {[...stages]
              .sort((a, b) => a.startDate.localeCompare(b.startDate))
              .map((s) => (
                <div key={s.id} className="border border-slate-100 rounded-lg p-3 flex items-start gap-3">
                  <div className="w-28 shrink-0">
                    <div className="text-sm font-semibold text-slate-800 flex items-center gap-1 flex-wrap">
                      {PLAN_STAGE_LABEL[s.stage]}
                      {s.id === currentStageId && (
                        <span className="badge bg-emerald-50 text-emerald-700 text-[10px]">进行中</span>
                      )}
                      {s.id !== currentStageId && s.startDate <= today && s.endDate >= today && (
                        <span className="badge bg-amber-50 text-amber-700 text-[10px]">与当前阶段重叠</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {s.startDate} → {s.endDate}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {s.source === 'manual' ? '手动添加' : s.source === 'auto' ? '自动生成' : '历史阶段'}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-700">
                      {s.subject ? `${SUBJECT_LABEL[s.subject]} · ` : ''}
                      重点: {s.focusModules.length > 0 ? s.focusModules.join(' / ') : '信息不足'}
                    </div>
                    {s.weeklyGoal && (
                      <div className="text-xs text-slate-500 mt-1">周目标: {s.weeklyGoal}</div>
                    )}
                  </div>
                  <button className="btn-ghost text-red-500" onClick={() => deleteStage(s.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Timer size={16} /> 艾宾浩斯间隔复习
          </h2>
          <button className="btn-secondary text-sm" onClick={() => setShowSpacedForm(true)}>
            <PlusCircle size={14} /> 添加复习项
          </button>
        </div>
        <div className="text-xs text-slate-500 mb-3">
          学段周期: {GRADE_LEVEL_LABEL[prefs.gradeLevel]} → {SPACED_INTERVALS[prefs.gradeLevel].join('/')} 天
        </div>

        {dueItems.length > 0 && (
          <div className="mb-3 p-3 rounded-lg bg-orange-50">
            <div className="text-sm font-medium text-orange-800 mb-2">
              今日待复习({dueItems.length} 项)
            </div>
            <div className="space-y-1">
              {dueItems.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm">
                  <span>
                    {SUBJECT_LABEL[it.subject]} · {abilityPointText(it.abilityPath)}
                    <span className="text-xs text-slate-500 ml-2">
                      第 {it.currentIndex + 1} 次复习
                    </span>
                  </span>
                  <button className="btn-ghost text-emerald-600" onClick={() => completeSpaced(it)}>
                    <CheckCircle2 size={14} /> 已完成
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {spacedItems.length === 0 ? (
          <EmptyState icon={Timer} title="没有间隔复习计划" description="标记要复习的能力点后，会在这里按到期日排序展示" />
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {[...spacedItems]
              .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
              .map((it) => (
                <div key={it.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50">
                  <div>
                    <span className="text-slate-700">
                      {SUBJECT_LABEL[it.subject]} · {abilityPointText(it.abilityPath)}
                    </span>
                    <span
                      className={`badge ml-2 ${
                        it.status === 'graduated' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {it.status === 'graduated' ? '已毕业' : `第 ${it.currentIndex + 1}/${it.intervals.length} 次`}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">下次: {it.nextDueDate}</div>
                </div>
              ))}
          </div>
        )}
      </div>

      {showStageForm && <StagePlanForm onClose={() => setShowStageForm(false)} onSaved={() => { setShowStageForm(false); void refresh(); }} studentId={prefs.currentStudentId} gradeLevel={prefs.gradeLevel} />}
      {showSpacedForm && (
        <SpacedForm
          onClose={() => setShowSpacedForm(false)}
          onSaved={() => {
            setShowSpacedForm(false);
            void refresh();
          }}
          studentId={prefs.currentStudentId}
          gradeLevel={prefs.gradeLevel}
          subjects={prefs.subjects}
        />
      )}
    </div>
  );
}

function StagePlanForm({
  onClose,
  onSaved,
  studentId,
  gradeLevel,
}: {
  onClose: () => void;
  onSaved: () => void;
  studentId?: string;
  gradeLevel: GradeLevel;
}) {
  const [stage, setStage] = useState<StagePlan['stage']>('foundation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [focus, setFocus] = useState('');
  const [weeklyGoal, setWeeklyGoal] = useState('');

  const save = async () => {
    if (!startDate || !endDate) return;
    const now = new Date().toISOString();
    await putRecord('stagePlans', {
      id: uuid(),
      studentId,
      gradeLevel,
      stage,
      startDate,
      endDate,
      focusModules: focus.split(/[，,;、]/).map((s) => s.trim()).filter(Boolean),
      focusAbilities: [],
      weeklyGoal: weeklyGoal.trim() || undefined,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 modal-clamp [--modal-max:28rem] [--modal-max-h:90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">新增学习阶段</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">阶段</label>
            <select className="input" value={stage} onChange={(e) => setStage(e.target.value as StagePlan['stage'])}>
              <option value="foundation">基础期</option>
              <option value="topic">专项期</option>
              <option value="sprint">冲刺期</option>
              <option value="pre-exam">考前期</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">开始日期</label>
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">结束日期</label>
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">重点模块 (逗号分隔)</label>
            <input className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="例: 力学, 电学, 综合应用" />
          </div>
          <div>
            <label className="label">周目标 (选填)</label>
            <input className="input" value={weeklyGoal} onChange={(e) => setWeeklyGoal(e.target.value)} />
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

function SpacedForm({
  onClose,
  onSaved,
  studentId,
  gradeLevel,
  subjects,
}: {
  onClose: () => void;
  onSaved: () => void;
  studentId?: string;
  gradeLevel: SpacedReviewItem['gradeLevel'];
  subjects: Subject[];
}) {
  const [subject, setSubject] = useState<Subject>(subjects[0] ?? 'math');
  const tags = getAbilityTags(gradeLevel, subject);
  const [path, setPath] = useState<string>(tags[0]?.path ?? '');
  useEffect(() => { setPath(tags[0]?.path ?? ''); }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!path) return;
    const item = createSpacedReview(studentId, gradeLevel, subject, path);
    await putRecord('spacedReviews', item);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 modal-clamp [--modal-max:28rem] [--modal-max-h:90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">加入间隔复习</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">学科</label>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">能力点</label>
            {tags.length > 0 ? (
              <select className="input" value={path} onChange={(e) => setPath(e.target.value)}>
                {tags.map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.module} · {t.point}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="学科/模块/能力点" />
            )}
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
