import { useCallback, useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Beaker, PlusCircle, Trash2, X, TrendingUp } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { findTrainingsByStudent, getAllRecords, putRecord, deleteRecord } from '../../services/localDB';
import { aggregateBySubject } from '../../services/analytics';
import type { StudentProfile, TeachingStrategy, TrainingRecord } from '../../domain/types';

export function TeachingEffectPage() {
  const { showToast } = useToast();
  const [strategies, setStrategies] = useState<TeachingStrategy[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    setStrategies(await getAllRecords('strategies'));
    setStudents(await getAllRecords('students'));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const evaluate = async (s: TeachingStrategy) => {
    const trainings: TrainingRecord[] = [];
    for (const sid of s.targetStudentIds) trainings.push(...(await findTrainingsByStudent(sid)));
    const before = trainings.filter((t) => t.date < s.startDate);
    const after = trainings.filter((t) => t.date >= s.startDate && (!s.endDate || t.date <= s.endDate));

    const compute = (arr: TrainingRecord[]) => {
      if (arr.length === 0) return { avgMastery: 0, unfamiliarCorrectRate: 0 };
      const stats = aggregateBySubject(arr);
      const avgMastery = stats.length === 0 ? 0 : Math.round(stats.reduce((a, b) => a + b.masteryScore, 0) / stats.length);
      const uq = arr.filter((r) => r.isUnfamiliar).reduce((s, r) => s + r.totalQuestions, 0);
      const ue = arr.filter((r) => r.isUnfamiliar).reduce((s, r) => s + r.errorCount, 0);
      return { avgMastery, unfamiliarCorrectRate: uq === 0 ? 0 : +((uq - ue) / uq).toFixed(2) };
    };

    const bef = compute(before);
    const aft = compute(after);
    const effectiveness = aft.avgMastery - bef.avgMastery;

    const updated: TeachingStrategy = {
      ...s,
      metricsSnapshotBefore: bef,
      metricsSnapshotAfter: aft,
      effectivenessScore: effectiveness,
      updatedAt: new Date().toISOString(),
    };
    await putRecord('strategies', updated);
    void refresh();
    showToast('已计算策略效果', 'success');
  };

  const remove = async (id: string) => {
    if (!window.confirm('确认删除?')) return;
    await deleteRecord('strategies', id);
    void refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="教学效果分析"
        description="记录你采用的教学策略, 追踪该策略实施前后的学生能力变化。 教学 ROI 一目了然。"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <PlusCircle size={16} /> 记录教学策略
          </button>
        }
      />

      {strategies.length === 0 ? (
        <EmptyState icon={Beaker} title="尚未记录教学策略" description="记录一次'我为张三新增了限时训练',一段时间后系统自动计算策略收益" />
      ) : (
        <div className="space-y-3">
          {strategies.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">{s.strategyName}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {s.startDate}{s.endDate ? ` → ${s.endDate}` : ' (进行中)'} · 覆盖 {s.targetStudentIds.length} 名学生
                  </div>
                  <div className="text-sm text-slate-600 mt-1">
                    学生: {s.targetStudentIds.map((sid) => students.find((x) => x.id === sid)?.name ?? sid).join(', ')}
                  </div>
                  {s.description && <div className="text-sm text-slate-700 mt-2">{s.description}</div>}
                  {s.metricsSnapshotBefore && s.metricsSnapshotAfter && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <span>实施前平均掌握度: <b>{s.metricsSnapshotBefore.avgMastery}%</b></span>
                      <span>实施后平均掌握度: <b>{s.metricsSnapshotAfter.avgMastery}%</b></span>
                      <span>陌生题正确率变化: <b>{(s.metricsSnapshotAfter.unfamiliarCorrectRate - s.metricsSnapshotBefore.unfamiliarCorrectRate).toFixed(2)}</b></span>
                      <span className={(s.effectivenessScore ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        <TrendingUp size={12} className="inline mr-1" />
                        策略效果分: {s.effectivenessScore ?? 0}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button className="btn-secondary text-xs" onClick={() => evaluate(s)}>重算收益</button>
                  <button className="btn-ghost text-red-500" onClick={() => remove(s.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <StrategyForm
          students={students}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('策略已记录, 稍后可点击"重算收益"评估效果', 'success');
          }}
        />
      )}
    </div>
  );
}

function StrategyForm({
  students,
  onClose,
  onSaved,
}: {
  students: StudentProfile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!name.trim() || selected.length === 0) return;
    const now = new Date().toISOString();
    const strat: TeachingStrategy = {
      id: uuid(),
      teacherLabel: 'me',
      targetStudentIds: selected,
      strategyName: name,
      description: description || undefined,
      startDate,
      endDate: endDate || undefined,
      status: endDate ? 'ended' : 'active',
      createdAt: now,
      updatedAt: now,
    };
    await putRecord('strategies', strat);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">记录教学策略</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">策略名称</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例:增加限时训练 / 重点攻克削弱题" />
          </div>
          <div>
            <label className="label">说明</label>
            <textarea className="input min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">开始日期</label>
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">结束日期 (可选)</label>
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="label">目标学生 (已选 {selected.length})</div>
            <div className="max-h-40 overflow-y-auto border border-slate-100 rounded p-2 space-y-1">
              {students.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={save} disabled={!name.trim() || selected.length === 0}>保存</button>
        </div>
      </div>
    </div>
  );
}
