import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, ClipboardList, X, ChevronRight, Filter, ExternalLink } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, deleteRecord } from '../services/localDB';
import { computeStallRisk, createProblem, saveProblem, detectClosureObstacle } from '../services/pdca';
import type { PDCARootCause, InformationType } from '../domain/types';
import { INFORMATION_TYPE_LABEL, INFORMATION_TYPE_ARGUMENT } from '../domain/types';
import { v4 as uuid } from 'uuid';

/** V5.12 · RCA 工具返回 JSON 的类型 */
interface RcaImport {
  problemDescription?: string;
  rootCauses?: Array<string | { content?: string; text?: string; description?: string; impact?: 'high' | 'medium' | 'low' }>;
  surfaceCauses?: Array<string | { content?: string; text?: string; description?: string }>;
}

interface ParsedRca {
  problemDescription: string;
  rootCauses: Array<{ content: string; impact: 'high' | 'medium' | 'low' }>;
  surfaceCauses: string[];
}

/** 宽松解析 RCA 工具输出的 JSON */
function parseRcaImport(raw: string): { ok: true; data: ParsedRca } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: '请粘贴 JSON 内容' };
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: `JSON 格式错误: ${(e as Error).message}` };
  }
  if (!obj || typeof obj !== 'object') return { ok: false, error: '顶层必须为对象' };
  const src = obj as RcaImport;
  const problemDescription = (src.problemDescription ?? '').toString().trim();
  const extract = (item: string | { content?: string; text?: string; description?: string }): string => {
    if (typeof item === 'string') return item.trim();
    return (item.content ?? item.text ?? item.description ?? '').toString().trim();
  };
  const rootCauses = (src.rootCauses ?? [])
    .map((r) => ({
      content: extract(r as never),
      impact: (typeof r === 'object' && r && 'impact' in r && r.impact ? r.impact : 'high') as 'high' | 'medium' | 'low',
    }))
    .filter((r) => r.content.length > 0);
  const surfaceCauses = (src.surfaceCauses ?? []).map((s) => extract(s as never)).filter((s) => s.length > 0);
  if (!problemDescription) return { ok: false, error: '缺少 problemDescription 字段' };
  return { ok: true, data: { problemDescription, rootCauses, surfaceCauses } };
}

const RCA_URL = 'https://promatheus-ltsc.github.io/root-cause-analysis/#/';
const DECISION_URL = 'https://promatheus-ltsc.github.io/personal_review_system/#/login';
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
  const [expectedDueAt, setExpectedDueAt] = useState('');
  // V5.12 · P1 弹窗:感性信号 + 从 RCA 工具导入 JSON
  const [sensorySignals, setSensorySignals] = useState<Set<SensorySignalMethod>>(new Set(['most']));
  const [rcaJsonInput, setRcaJsonInput] = useState('');
  const [rcaParseError, setRcaParseError] = useState<string>('');
  // V5.12 · 生活域 & 问题类型 · RCA 未提供,需要用户在导入后补充
  const [lifeDomain, setLifeDomain] = useState<LifeDomain>('work');
  const [problemType, setProblemType] = useState<PDCAProblemType>('restore');
  // V5.12 · RCA 导入的根因需要用户补充信息类型(§30.3)与影响度
  const [rcaRootInfoTypes, setRcaRootInfoTypes] = useState<Record<number, InformationType>>({});
  const [rcaRootEvalCriteria, setRcaRootEvalCriteria] = useState<Record<number, string>>({});
  const [rcaRootImpacts, setRcaRootImpacts] = useState<Record<number, 'high' | 'medium' | 'low'>>({});

  const rcaParsed = useMemo<ParsedRca | null>(() => {
    if (!rcaJsonInput.trim()) return null;
    const result = parseRcaImport(rcaJsonInput);
    return result.ok ? result.data : null;
  }, [rcaJsonInput]);

  // JSON 内容变化时重置补充字段,避免下标错位
  useEffect(() => {
    setRcaRootInfoTypes({});
    setRcaRootEvalCriteria({});
    setRcaRootImpacts({});
  }, [rcaJsonInput]);
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

  // V5.12 · 感性信号至少 1 条填写内容 才允许保存
  const activeSignalsWithNotes = (Array.from(sensorySignals) as SensorySignalMethod[])
    .filter((m) => sensoryNotes[m].trim().length > 0);
  const canSubmit = activeSignalsWithNotes.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const notesLines = activeSignalsWithNotes
      .map((m) => `[${SENSORY_SIGNAL_LABEL[m]}] ${sensoryNotes[m].trim()}`)
      .join('\n');
    const hasRca = rcaParsed !== null;
    // 结构化字段:有 RCA 导入用 RCA 内容,否则用占位符;title 优先取 problemDescription 前 30 字
    const baseTitle = hasRca ? rcaParsed.problemDescription : sensoryNotes[activeSignalsWithNotes[0]].trim();
    const autoTitle = baseTitle.length > 30 ? baseTitle.slice(0, 30) + '…' : baseTitle;
    const surfaceLines = hasRca && rcaParsed.surfaceCauses.length > 0
      ? `\n\n[表面原因]\n- ${rcaParsed.surfaceCauses.join('\n- ')}`
      : '';
    const description = hasRca
      ? `${rcaParsed.problemDescription}\n\n[感性信号]\n${notesLines}${surfaceLines}`
      : notesLines;
    const placeholder = '(待在 root-cause-analysis 中完善)';
    const problem = createProblem({
      studentId,
      title: autoTitle,
      description,
      problemType,
      lifeDomain,
      targetState: hasRca ? rcaParsed.problemDescription : placeholder,
      successCriteria: hasRca ? rcaParsed.problemDescription : placeholder,
      expectedDueAt: expectedDueAt || undefined,
      sensorySignals: Array.from(sensorySignals),
    });
    // 有 RCA 导入时,写入根因(带用户补充的信息类型 + 用户选定的影响度)并直接推进到 P3 决策阶段
    if (hasRca) {
      const now = new Date().toISOString();
      const rootCauses: PDCARootCause[] = rcaParsed.rootCauses.map((r, i) => {
        const infoType: InformationType = rcaRootInfoTypes[i] ?? 'descriptive';
        const evalCriterion = rcaRootEvalCriteria[i]?.trim();
        const impact: 'high' | 'medium' | 'low' = rcaRootImpacts[i] ?? r.impact;
        return {
          id: uuid(),
          content: r.content,
          impact,
          informationType: infoType,
          evaluationCriterion: infoType === 'evaluative' && evalCriterion ? evalCriterion : undefined,
          createdAt: now,
        };
      });
      problem.rootCauses = rootCauses;
      problem.currentStage = 'p3-countermeasure';
      problem.stageEnteredAt = now;
    }
    const closure = detectClosureObstacle(description);
    if (closure) problem.closureObstacle = closure;
    await saveProblem(problem);
    onSaved();
    // 有 RCA 导入 → 自动跳转到 personal_review_system 决策工具
    if (hasRca) {
      window.open(DECISION_URL, '_blank', 'noopener,noreferrer');
    }
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
          {/* V5.12 · 感性信号六法:捕捉最原始信号即可,结构化定义与根因分析交给 root-cause-analysis */}
          <div className="border border-slate-200 rounded p-3 bg-blue-50/30">
            <div className="text-xs text-slate-600 mb-2">
              <b className="text-slate-800">感性信号捕捉</b>
              <span className="ml-2 text-slate-500">只需捕捉最原始的信号;后续问题定义与根因分析在 root-cause-analysis 工具中完成</span>
            </div>
            <div className="space-y-2">
              {[...SENSORY_SIGNAL_DEFAULT, ...SENSORY_SIGNAL_ADVANCED].map((m) => (
                <div key={m} className="flex items-start gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 min-w-[130px] mt-1.5">
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
                      m === 'most' ? '最近最触动你的一件事…'
                      : m === 'always' ? '总是挥之不去的困扰…'
                      : m === 'instinct' ? '第一次面对时的瞬间念头…'
                      : m === 'body' ? '身体反复出现的不适反馈…'
                      : m === 'intuition' ? '来路不明却挥之不去的不安…'
                      : '相关的梦境线索(仅作辅助)…'
                    }
                    disabled={!sensorySignals.has(m)}
                  />
                </div>
              ))}
            </div>
            <a
              href={RCA_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink size={12} />
              前往 root-cause-analysis 初始化问题 & 分析根因
            </a>
            {(() => {
              const notesText = activeSignalsWithNotes.map((m) => sensoryNotes[m]).join(' ');
              const c = detectClosureObstacle(notesText);
              return c ? (
                <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
                  ⚠️ 从感性信号中识别到闭环阻碍类型:<b>{CLOSURE_OBSTACLE_LABEL[c]}</b>
                  {c === 'hands-off' && ' · P3 对策模板将强制包含"今天就能亲手完成的最小动作"'}
                </div>
              ) : null;
            })()}
          </div>

          {/* V5.12 · 从 RCA 工具导入分析结果 JSON */}
          <div className="border border-slate-200 rounded p-3 bg-emerald-50/30">
            <div className="text-xs text-slate-700 mb-2">
              <b>粘贴 root-cause-analysis 的输出 JSON(可选)</b>
              <div className="text-slate-500 mt-1">
                完成 RCA 工具分析后,把导出的 JSON 粘贴到此处。 <b>确认无误后</b>会自动跳转到 personal_review_system 进行决策。
              </div>
            </div>
            <textarea
              className="input font-mono text-xs min-h-[100px]"
              placeholder={`{\n  "problemDescription": "...",\n  "rootCauses": [],\n  "surfaceCauses": []\n}`}
              value={rcaJsonInput}
              onChange={(e) => {
                setRcaJsonInput(e.target.value);
                if (!e.target.value.trim()) { setRcaParseError(''); return; }
                const r = parseRcaImport(e.target.value);
                setRcaParseError(r.ok ? '' : r.error);
              }}
            />
            {rcaParseError && (
              <div className="mt-2 text-xs text-red-600">⚠️ {rcaParseError}</div>
            )}
            {rcaParsed && (
              <div className="mt-2 text-xs text-slate-700 bg-white/70 border border-emerald-100 rounded p-2 space-y-2">
                <div><b>问题描述</b>:{rcaParsed.problemDescription}</div>
                {/* V5.12 · RCA 不提供 lifeDomain/problemType,导入后由用户在此补充 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <b className="text-slate-500">生活域:</b>
                  <select
                    className="input py-0.5 text-xs max-w-[180px]"
                    value={lifeDomain}
                    onChange={(e) => setLifeDomain(e.target.value as LifeDomain)}
                  >
                    <option value="learning">{LIFE_DOMAIN_LABEL.learning}</option>
                    <option value="work">{LIFE_DOMAIN_LABEL.work}</option>
                    <option value="life">{LIFE_DOMAIN_LABEL.life}</option>
                  </select>
                  <b className="text-slate-500 ml-2">问题类型:</b>
                  <select
                    className="input py-0.5 text-xs max-w-[180px]"
                    value={problemType}
                    onChange={(e) => setProblemType(e.target.value as PDCAProblemType)}
                  >
                    <option value="restore">{PDCA_PROBLEM_TYPE_LABEL.restore}</option>
                    <option value="prevent">{PDCA_PROBLEM_TYPE_LABEL.prevent}</option>
                    <option value="pursue">{PDCA_PROBLEM_TYPE_LABEL.pursue}</option>
                  </select>
                </div>
                {rcaParsed.surfaceCauses.length > 0 && (
                  <div><b>表面原因</b>:
                    <ul className="list-disc list-inside mt-0.5">
                      {rcaParsed.surfaceCauses.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {rcaParsed.rootCauses.length > 0 ? (
                  <div>
                    <b>根因({rcaParsed.rootCauses.length} 条)· 请为每条补充影响度与信息类型(§30.3)</b>
                    <div className="space-y-2 mt-1">
                      {rcaParsed.rootCauses.map((r, i) => {
                        const infoType = rcaRootInfoTypes[i] ?? 'descriptive';
                        const evalCriterion = rcaRootEvalCriteria[i] ?? '';
                        const impact = rcaRootImpacts[i] ?? r.impact;
                        return (
                          <div key={i} className="border border-slate-200 bg-white rounded p-2 space-y-1">
                            <div className="text-slate-800">{r.content}</div>
                            <div className="flex items-center gap-2 text-xs">
                              <label className="text-slate-500">影响度:</label>
                              <select
                                className="input py-0.5 text-xs max-w-[100px]"
                                value={impact}
                                onChange={(e) =>
                                  setRcaRootImpacts((prev) => ({
                                    ...prev,
                                    [i]: e.target.value as 'high' | 'medium' | 'low',
                                  }))
                                }
                              >
                                <option value="high">高</option>
                                <option value="medium">中</option>
                                <option value="low">低</option>
                              </select>
                              <label className="text-slate-500 ml-2">信息类型:</label>
                              <select
                                className="input py-0.5 text-xs flex-1 max-w-[220px]"
                                value={infoType}
                                onChange={(e) =>
                                  setRcaRootInfoTypes((prev) => ({
                                    ...prev,
                                    [i]: e.target.value as InformationType,
                                  }))
                                }
                              >
                                <option value="descriptive">{INFORMATION_TYPE_LABEL.descriptive}</option>
                                <option value="evaluative">{INFORMATION_TYPE_LABEL.evaluative}</option>
                                <option value="normative">{INFORMATION_TYPE_LABEL.normative}</option>
                              </select>
                              <span className="text-slate-400">论证方式:{INFORMATION_TYPE_ARGUMENT[infoType]}</span>
                            </div>
                            {infoType === 'evaluative' && (
                              <input
                                className="input py-1 text-xs"
                                placeholder="评价标准(如:是否满足 X 条件)…"
                                value={evalCriterion}
                                onChange={(e) =>
                                  setRcaRootEvalCriteria((prev) => ({
                                    ...prev,
                                    [i]: e.target.value,
                                  }))
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-700">⚠️ rootCauses 数组为空,建议先在 RCA 工具中完成根因分析再导入</div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="label">期望解决时间(可选)</label>
            <input className="input" type="date" value={expectedDueAt} onChange={(e) => setExpectedDueAt(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={submit} disabled={!canSubmit}>
            {rcaParsed ? '确认并进入决策(P3)' : '保存为草稿(P1)'}
          </button>
        </div>
      </div>
    </div>
  );
}
