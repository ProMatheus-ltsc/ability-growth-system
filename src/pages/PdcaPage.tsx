import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, ClipboardList, X, ChevronRight, Filter, ChevronDown } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, deleteRecord } from '../services/localDB';
import { computeStallRisk, createProblem, saveProblem, detectClosureObstacle } from '../services/pdca';
import {
  LIFE_DOMAIN_LABEL,
  PDCA_PROBLEM_TYPE_LABEL,
  PDCA_STAGE_LABEL,
  SENSORY_SIGNAL_LABEL,
  SENSORY_SIGNAL_DEFAULT,
  SENSORY_SIGNAL_ADVANCED,
  CLOSURE_OBSTACLE_LABEL,
  type LifeDomain,
  type PDCAProblem,
  type PDCAProblemType,
  type SensorySignalMethod,
} from '../domain/types';

const STAGE_STEP: PDCAProblem['currentStage'][] = [
  'p1-define',
  'p2-root-cause',
  'p3-countermeasure',
  'd-execute',
  'c-check',
  'a-act',
];

export function PdcaPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [list, setList] = useState<PDCAProblem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [domainFilter, setDomainFilter] = useState<LifeDomain | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');

  const refresh = useCallback(async () => {
    const all = await getAllRecords('pdcaProblems');
    setList(all.filter((p) => (prefs.currentStudentId ? p.studentId === prefs.currentStudentId : true)));
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const rank = (r: 'red' | 'yellow' | 'green') => (r === 'red' ? 0 : r === 'yellow' ? 1 : 2);
    return list
      .filter((p) => (statusFilter === 'all' ? true : p.status === statusFilter))
      .filter((p) => (domainFilter === 'all' ? true : p.lifeDomain === domainFilter))
      .sort((a, b) => {
        const ra = rank(computeStallRisk(a));
        const rb = rank(computeStallRisk(b));
        if (ra !== rb) return ra - rb;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [list, domainFilter, statusFilter]);

  const remove = async (id: string) => {
    if (!window.confirm('确认删除该问题?')) return;
    await deleteRecord('pdcaProblems', id);
    void refresh();
    showToast('已删除', 'info');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="问题跟进 · PDCA"
        description="将 PDCA 方法论产品化: 问题定义 → 根因分析 → 对策制定 → 执行 → 检查 → 修正。 让每个问题的解决过程有记录、有状态、有反馈、有沉淀。"
        actions={
          <>
            <Link to="/pdca-calendar" className="btn-secondary">
              <ClipboardList size={14} /> 日历视图
            </Link>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> 新建问题
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Filter size={14} className="text-slate-400" />
        <span className="text-slate-500">状态:</span>
        {(['active', 'archived', 'all'] as const).map((s) => (
          <button
            key={s}
            className={`px-2 py-1 rounded ${statusFilter === s ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'active' && '进行中'}
            {s === 'archived' && '已归档'}
            {s === 'all' && '全部'}
          </button>
        ))}
        <span className="mx-2 text-slate-300">·</span>
        <span className="text-slate-500">生活域:</span>
        {(['all', 'learning', 'work', 'life'] as const).map((d) => (
          <button
            key={d}
            className={`px-2 py-1 rounded ${domainFilter === d ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`}
            onClick={() => setDomainFilter(d)}
          >
            {d === 'all' ? '全部' : LIFE_DOMAIN_LABEL[d]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={statusFilter === 'archived' ? '还没有归档问题' : '还没有跟进中的问题'}
          description="将现实工作与生活中的复杂问题以 PDCA 方式跟进, 防止问题不了了之"
          action={
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> 新建问题
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <ProblemCard key={p.id} problem={p} onDelete={() => remove(p.id)} />
          ))}
        </div>
      )}

      {showForm && (
        <NewProblemForm
          studentId={prefs.currentStudentId}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('问题已创建, 进入 P1 阶段', 'success');
          }}
        />
      )}
    </div>
  );
}

function ProblemCard({ problem, onDelete }: { problem: PDCAProblem; onDelete: () => void }) {
  const risk = computeStallRisk(problem);
  const stageIdx = STAGE_STEP.indexOf(problem.currentStage);
  const riskColor: Record<string, string> = {
    red: 'text-red-600 bg-red-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    green: 'text-emerald-600 bg-emerald-50',
  };
  const daysStalled = Math.floor((Date.now() - new Date(problem.stageEnteredAt).getTime()) / 86400000);
  const doneCount = problem.countermeasures.filter((c) => c.status === 'done').length;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`badge ${riskColor[risk]}`}>{risk === 'red' ? '🔴' : risk === 'yellow' ? '🟡' : '🟢'}</span>
            <span className="font-semibold text-slate-900">{problem.title}</span>
            <span className="badge bg-slate-100 text-slate-600">{LIFE_DOMAIN_LABEL[problem.lifeDomain]}</span>
            <span className="badge bg-blue-50 text-blue-700">{PDCA_PROBLEM_TYPE_LABEL[problem.problemType]}</span>
            <span className="badge bg-purple-50 text-purple-700">第 {problem.currentCycle} 轮</span>
            {problem.status === 'archived' && <span className="badge bg-slate-200 text-slate-700">已归档</span>}
          </div>
          <div className="text-xs text-slate-500 mt-1">{problem.description}</div>

          <div className="mt-3 flex items-center gap-1 text-xs text-slate-600 flex-wrap">
            {STAGE_STEP.map((s, i) => (
              <span key={s} className={`px-2 py-0.5 rounded ${i <= stageIdx ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>
                {PDCA_STAGE_LABEL[s]}
              </span>
            ))}
          </div>

          <div className="text-xs text-slate-500 mt-2">
            当前阶段停留 {daysStalled} 天 · 对策完成 {doneCount}/{problem.countermeasures.length}
          </div>
        </div>

        <div className="flex flex-col gap-1 items-end">
          <Link className="btn-primary text-xs" to={`/pdca/detail?id=${problem.id}`}>
            打开 <ChevronRight size={12} />
          </Link>
          <button className="btn-ghost text-red-500 text-xs" onClick={onDelete}>
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

function NewProblemForm({
  studentId,
  onClose,
  onSaved,
}: {
  studentId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [problemType, setProblemType] = useState<PDCAProblemType>('restore');
  const [lifeDomain, setLifeDomain] = useState<LifeDomain>('work');
  const [targetState, setTargetState] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [expectedDueAt, setExpectedDueAt] = useState('');
  // V5.11 · 感性信号六法
  const [sensorySignals, setSensorySignals] = useState<Set<SensorySignalMethod>>(new Set(['most']));
  const [showAdvancedSensory, setShowAdvancedSensory] = useState(false);
  // V5.11 · 每个感性法都可以填一段捕捉内容
  const [sensoryNotes, setSensoryNotes] = useState<Record<SensorySignalMethod, string>>({
    most: '',
    always: '',
    instinct: '',
    body: '',
    intuition: '',
    dream: '',
  });

  const toggleSensory = (m: SensorySignalMethod) => {
    setSensorySignals((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const submit = async () => {
    if (!title.trim() || !description.trim() || !targetState.trim() || !successCriteria.trim()) return;
    // 把感性信号捕捉的补充说明并入 description(可选)
    const notes = (Array.from(sensorySignals) as SensorySignalMethod[])
      .map((m) => (sensoryNotes[m].trim() ? `[${SENSORY_SIGNAL_LABEL[m]}] ${sensoryNotes[m].trim()}` : ''))
      .filter(Boolean)
      .join('\n');
    const fullDesc = notes ? `${description.trim()}\n\n${notes}` : description.trim();
    const problem = createProblem({
      studentId,
      title: title.trim(),
      description: fullDesc,
      problemType,
      lifeDomain,
      targetState: targetState.trim(),
      successCriteria: successCriteria.trim(),
      expectedDueAt: expectedDueAt || undefined,
      sensorySignals: Array.from(sensorySignals),
    });
    // 顺便识别闭环阻碍类型
    const closure = detectClosureObstacle(fullDesc);
    if (closure) problem.closureObstacle = closure;
    await saveProblem(problem);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">新建问题(P1 定义)</h2>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">问题标题</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如: 产品方案连续两次评审未过" />
          </div>
          <div>
            <label className="label">现状描述(一句话: 现状 + 与期望的差距)</label>
            <textarea className="input min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* V5.11 · 感性信号六法(默认 2 种 + 折叠 4 种) */}
          <div className="border border-slate-200 rounded p-3 bg-blue-50/30">
            <div className="text-xs text-slate-600 mb-2">
              <b className="text-slate-800">感性信号捕捉(六法)</b>
              <span className="ml-2 text-slate-500">先感性捕捉,再理性陈述——多个方法可组合使用</span>
            </div>
            {/* 默认 2 种 */}
            <div className="space-y-2">
              {SENSORY_SIGNAL_DEFAULT.map((m) => (
                <div key={m} className="flex items-start gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 min-w-[110px] mt-1.5">
                    <input
                      type="checkbox"
                      checked={sensorySignals.has(m)}
                      onChange={() => toggleSensory(m)}
                    />
                    {SENSORY_SIGNAL_LABEL[m]}
                  </label>
                  <input
                    className="input flex-1 text-xs"
                    value={sensoryNotes[m]}
                    onChange={(e) => setSensoryNotes({ ...sensoryNotes, [m]: e.target.value })}
                    placeholder={
                      m === 'most' ? '最近最触动你的一件事…' : '总是挥之不去的困扰…'
                    }
                    disabled={!sensorySignals.has(m)}
                  />
                </div>
              ))}
            </div>
            {/* 折叠 4 种 */}
            <button
              type="button"
              className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:underline"
              onClick={() => setShowAdvancedSensory((v) => !v)}
            >
              <ChevronDown
                size={12}
                className={showAdvancedSensory ? '' : '-rotate-90'}
                style={{ transition: 'transform 0.15s' }}
              />
              更多捕捉方式(4 种)
            </button>
            {showAdvancedSensory && (
              <div className="space-y-2 mt-2 pl-3 border-l-2 border-blue-100">
                {SENSORY_SIGNAL_ADVANCED.map((m) => (
                  <div key={m} className="flex items-start gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 min-w-[110px] mt-1.5">
                      <input
                        type="checkbox"
                        checked={sensorySignals.has(m)}
                        onChange={() => toggleSensory(m)}
                      />
                      {SENSORY_SIGNAL_LABEL[m]}
                    </label>
                    <input
                      className="input flex-1 text-xs"
                      value={sensoryNotes[m]}
                      onChange={(e) => setSensoryNotes({ ...sensoryNotes, [m]: e.target.value })}
                      placeholder={
                        m === 'instinct'
                          ? '第一次面对时的瞬间念头…'
                          : m === 'body'
                            ? '身体反复出现的不适反馈…'
                            : m === 'intuition'
                              ? '来路不明却挥之不去的不安…'
                              : '相关的梦境线索(仅作辅助)…'
                      }
                      disabled={!sensorySignals.has(m)}
                    />
                  </div>
                ))}
              </div>
            )}
            {/* 闭环阻碍识别提示 */}
            {(() => {
              const c = detectClosureObstacle(description);
              return c ? (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
                  ⚠️ 从描述中识别到闭环阻碍类型:<b>{CLOSURE_OBSTACLE_LABEL[c]}</b>
                  {c === 'hands-off' && ' · P3 对策模板将强制包含"今天就能亲手完成的最小动作"'}
                </div>
              ) : null;
            })()}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">问题类型</label>
              <select className="input" value={problemType} onChange={(e) => setProblemType(e.target.value as PDCAProblemType)}>
                <option value="restore">恢复原状型</option>
                <option value="prevent">预防隐患型</option>
                <option value="pursue">追求理想型</option>
              </select>
            </div>
            <div>
              <label className="label">生活域</label>
              <select className="input" value={lifeDomain} onChange={(e) => setLifeDomain(e.target.value as LifeDomain)}>
                <option value="learning">个人学习</option>
                <option value="work">工作项目</option>
                <option value="life">生活事务</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">目标状态(可衡量的期望结果)</label>
            <input className="input" value={targetState} onChange={(e) => setTargetState(e.target.value)} placeholder="例如: 评审一次通过" />
          </div>
          <div>
            <label className="label">衡量标准(如何判断问题已解决)</label>
            <input className="input" value={successCriteria} onChange={(e) => setSuccessCriteria(e.target.value)} placeholder="例如: 评审结论为通过" />
          </div>
          <div>
            <label className="label">期望解决时间(可选)</label>
            <input className="input" type="date" value={expectedDueAt} onChange={(e) => setExpectedDueAt(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={
              !title.trim() ||
              !description.trim() ||
              !targetState.trim() ||
              !successCriteria.trim() ||
              sensorySignals.size === 0
            }
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
