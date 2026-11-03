import { useCallback, useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { FlaskConical, PlusCircle, Trash2, Wrench, X, Zap } from 'lucide-react';
import { TableScroll, useToast } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { findExams, putRecord, deleteRecord } from '../services/localDB';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { MasteryBar } from '../components/MasteryBar';
import { getAbilityTags, getModules } from '../domain/abilityTags';
import { scoreToLevel, SUBJECT_LABEL } from '../domain/types';
import type { AbilityGap, ExamRecord, FixTask, Subject } from '../domain/types';

export function ExamDiagnosisPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    setExams(await findExams(prefs.currentStudentId));
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const convertToFixTasks = async (exam: ExamRecord) => {
    const now = new Date().toISOString();
    // 找出掌握度 <60% 的模块, 每个模块建能力缺口 + 修复任务
    const weakModules = exam.moduleBreakdown.filter((m) => m.score < 60);
    if (weakModules.length === 0) {
      showToast('本次模考没有明显薄弱模块 (掌握度 < 60%)', 'info');
      return;
    }
    const generatedIds: string[] = [];
    for (const m of weakModules) {
      const tags = getAbilityTags(prefs.gradeLevel, exam.subject).filter((t) => t.module === m.module);
      const path = tags[0]?.path ?? `${exam.subject}/${m.module}/综合薄弱`;
      const gapId = uuid();
      const gap: AbilityGap = {
        id: gapId,
        studentId: exam.studentId,
        subject: exam.subject,
        abilityPath: path,
        errorCategory: 'not-know',
        severity: m.score < 30 ? 'serious' : m.score < 45 ? 'medium' : 'light',
        status: 'unresolved',
        sourceRecordIds: [exam.id],
        occurrenceCount: m.errors,
        firstSeenAt: exam.date,
        lastSeenAt: exam.date,
        suggestion: `模考诊断: ${m.module} 掌握度 ${m.score}% (${m.level}), 建议做 20 题专项训练并订正`,
        createdAt: now,
        updatedAt: now,
      };
      const task: FixTask = {
        id: uuid(),
        studentId: exam.studentId,
        subject: exam.subject,
        abilityPath: path,
        relatedGapId: gapId,
        type: 'fix',
        status: 'pending',
        suggestedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await putRecord('gaps', gap);
      await putRecord('tasks', task);
      generatedIds.push(task.id);
    }
    const updated: ExamRecord = { ...exam, generatedTaskIds: [...(exam.generatedTaskIds ?? []), ...generatedIds], updatedAt: now };
    await putRecord('exams', updated);
    void refresh();
    showToast(`已生成 ${generatedIds.length} 个修复任务`, 'success');
  };

  const remove = async (id: string) => {
    if (!window.confirm('确认删除该测验记录?')) return;
    await deleteRecord('exams', id);
    void refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="测验诊断中心"
        description="模考/测验只需要记录结果, 系统把测验结果转换为能力诊断而非分数评价。 发现 N 个待修复问题, 而不是给出一个分数。"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <PlusCircle size={16} /> 录入测验结果
          </button>
        }
      />

      {exams.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="还没有测验记录"
          description="录入一次模考,系统自动转化为能力诊断和修复任务"
          action={
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> 录入模考结果
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {exams.map((e) => (
            <div key={e.id} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold text-slate-900">
                    {SUBJECT_LABEL[e.subject]} · {e.scenario}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {e.date} · 共 {e.totalQuestions} 题 · 错 {e.totalErrors}
                    {e.durationMinutes ? ` · 用时 ${e.durationMinutes} 分钟` : ''}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button className="btn-primary text-xs" onClick={() => convertToFixTasks(e)}>
                    <Wrench size={12} /> 一键生成修复任务
                  </button>
                  <button className="btn-ghost text-red-500 text-xs" onClick={() => remove(e.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* V5.11 Bug #030 修复:测验诊断四层结构清晰分层
                  第一层:总体诊断  第二层:模块掌握度分布
                  第三层:主要问题清单  第四层:修复行动(一键任务) */}
              <div className="space-y-2">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">
                  Layer 1 · 模块掌握度分布
                </div>
                {e.moduleBreakdown.map((m) => (
                  <div key={m.module} className="flex items-center gap-3 text-sm">
                    <div className="w-32 text-slate-700">{m.module}</div>
                    <MasteryBar score={m.score} className="flex-1" />
                    <span className="text-xs text-slate-400 w-24 text-right">
                      {m.total} 题 · 错 {m.errors}
                    </span>
                  </div>
                ))}
              </div>

              {e.diagnosis && (
                <div className="mt-3">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">
                    Layer 2 · 总体诊断
                  </div>
                  <div className="p-3 rounded bg-blue-50 text-sm text-blue-900">
                    💡 {e.diagnosis}
                  </div>
                </div>
              )}

              {e.mainProblems.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">
                    Layer 3 · 主要能力短板
                  </div>
                  <ul className="text-sm text-slate-700 list-disc list-inside">
                    {e.mainProblems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">
                  Layer 4 · 修复行动
                </div>
                <div className="text-xs text-slate-500">
                  点击右上「一键生成修复任务」自动派生 gap 到问题中心,并生成陌生题验证任务
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ExamForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('测验诊断已生成', 'success');
          }}
          studentId={prefs.currentStudentId}
          gradeLevel={prefs.gradeLevel}
          subjects={prefs.subjects}
        />
      )}
    </div>
  );
}

interface ModuleRow {
  module: string;
  total: number;
  errors: number;
}

function ExamForm({
  onClose,
  onSaved,
  studentId,
  gradeLevel,
  subjects,
}: {
  onClose: () => void;
  onSaved: () => void;
  studentId?: string;
  gradeLevel: ExamRecord['moduleBreakdown'] extends unknown ? string : never;
  subjects: Subject[];
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [subject, setSubject] = useState<Subject>(subjects[0] ?? 'math');
  const [scenario, setScenario] = useState('全套模拟');
  const [duration, setDuration] = useState(120);
  const [rows, setRows] = useState<ModuleRow[]>([]);
  const { prefs } = useAppSession();

  useEffect(() => {
    const modules = getModules(prefs.gradeLevel, subject);
    setRows(modules.map((m) => ({ module: m, total: 0, errors: 0 })));
  }, [subject, prefs.gradeLevel]);

  const updateRow = (i: number, key: 'total' | 'errors', v: number) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  };

  const submit = async () => {
    const now = new Date().toISOString();
    const breakdown = rows
      .filter((r) => r.total > 0)
      .map((r) => {
        const score = r.total === 0 ? 0 : Math.round(((r.total - r.errors) / r.total) * 100);
        return {
          module: r.module,
          total: r.total,
          errors: r.errors,
          score,
          level: scoreToLevel(score),
        };
      });
    if (breakdown.length === 0) {
      onClose();
      return;
    }
    const totalQuestions = breakdown.reduce((s, r) => s + r.total, 0);
    const totalErrors = breakdown.reduce((s, r) => s + r.errors, 0);
    const weakest = breakdown.sort((a, b) => a.score - b.score).slice(0, 3);
    const mainProblems = weakest.map((w) => `${w.module}: ${w.score}% (${w.level})`);
    const record: ExamRecord = {
      id: uuid(),
      studentId,
      date,
      subject,
      scenario,
      totalQuestions,
      totalErrors,
      durationMinutes: duration,
      moduleBreakdown: breakdown,
      mainProblems,
      diagnosis: `发现 ${weakest.length} 个待修复能力短板, 建议优先攻克 ${weakest[0]?.module}`,
      generatedTaskIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await putRecord('exams', record);
    onSaved();
  };

  const suggested = rows.map((r) => (r.total === 0 ? '-' : Math.round(((r.total - r.errors) / r.total) * 100) + '%'));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 modal-clamp [--modal-max:42rem] [--modal-max-h:90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold flex items-center gap-2">
            <Zap size={18} className="text-orange-500" /> 录入模考结果
          </h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">日期</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
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
            <label className="label">场景</label>
            <input className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} />
          </div>
          <div>
            <label className="label">总用时(分钟)</label>
            <input className="input" type="number" min={0} value={duration} onChange={(e) => setDuration(+e.target.value || 0)} />
          </div>
        </div>

        <div>
          <div className="label">各模块录入(自动带出该学段/学科模块列表)</div>
          <TableScroll label="各模块录入">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="py-2">模块</th>
                <th className="py-2 w-20 text-center">题量</th>
                <th className="py-2 w-20 text-center">错误</th>
                <th className="py-2 w-24 text-center">掌握度</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.module} className="border-b border-slate-50">
                  <td className="py-2">{r.module}</td>
                  <td className="py-2 text-center">
                    <input
                      className="input py-1 px-1 text-center w-16"
                      type="number"
                      min={0}
                      value={r.total}
                      onChange={(e) => updateRow(i, 'total', +e.target.value || 0)}
                    />
                  </td>
                  <td className="py-2 text-center">
                    <input
                      className="input py-1 px-1 text-center w-16"
                      type="number"
                      min={0}
                      max={r.total}
                      value={r.errors}
                      onChange={(e) => updateRow(i, 'errors', +e.target.value || 0)}
                    />
                  </td>
                  <td className="py-2 text-center text-slate-700">{suggested[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={submit}>
            生成诊断
          </button>
        </div>
      </div>
    </div>
  );
}
