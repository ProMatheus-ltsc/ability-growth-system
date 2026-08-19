import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, X, CheckCircle2, AlertOctagon, ExternalLink, RefreshCw, Sparkles, Sprout } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { getRecord } from '../services/localDB';
import {
  addCheckEntry,
  addCountermeasure,
  addRootCause,
  advanceStage,
  canAdvance,
  checkStretchZone,
  EMOTION_TRIPLE_QUESTIONS,
  ORID_TEMPLATE,
  EXTERNAL_TOOLS,
  executeActExit,
  listArtifacts,
  listCustomTools,
  saveProblem,
  updateCountermeasureStatus,
  validateInformationTypes,
  canAddMadHatter,
  getEffectiveCountermeasures,
  MAD_HATTER_BUDGET_RATIO,
  ANTI_TRAP_PRINCIPLES,
  NINE_STAGE_MEANING,
  ACE_TEMPLATE,
  shouldSuggestMutation,
  bumpPartialSolvedStreak,
} from '../services/pdca';
import type { PdcaArtifact, CustomPdcaTool } from '../domain/types';
import {
  CLOSURE_OBSTACLE_LABEL,
  INFORMATION_TYPE_LABEL,
  INFORMATION_TYPE_ARGUMENT,
  LIFE_DOMAIN_LABEL,
  PDCA_PROBLEM_TYPE_LABEL,
  PDCA_STAGE_LABEL,
  SENSORY_SIGNAL_LABEL,
  type InformationType,
  type PDCAActExit,
  type PDCAProblem,
  type PDCAStage,
  type PDCACountermeasure,
} from '../domain/types';

const STAGE_STEP: PDCAStage[] = ['p1-define', 'p2-root-cause', 'p3-countermeasure', 'd-execute', 'c-check', 'a-act'];

export function PdcaDetailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = params.get('id') ?? '';
  const { showToast } = useToast();
  const [problem, setProblem] = useState<PDCAProblem | null>(null);
  const [artifacts, setArtifacts] = useState<PdcaArtifact[]>([]);
  const [customTools, setCustomTools] = useState<CustomPdcaTool[]>([]);
  // V5.12 · A 阶段归档前的经验输入 & 归档后追加输入
  const [archiveLessonInput, setArchiveLessonInput] = useState('');
  const [appendLessonInput, setAppendLessonInput] = useState('');

  const refresh = useCallback(async () => {
    const p = await getRecord('pdcaProblems', id);
    setProblem(p ?? null);
    setArtifacts(await listArtifacts(id));
    setCustomTools(await listCustomTools());
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (next: PDCAProblem) => {
    await saveProblem(next);
    setProblem(next);
  };

  const doAdvance = async () => {
    if (!problem) return;
    const check = canAdvance(problem);
    if (!check.ok) {
      showToast(check.reason ?? '当前阶段未满足退出条件', 'warning');
      return;
    }
    const next = advanceStage(problem);
    await save(next);
    showToast(`已进入 ${PDCA_STAGE_LABEL[next.currentStage]}`, 'success');
  };

  const doExit = async (exit: PDCAActExit, opts?: { lessons?: string[]; gapNote?: string }) => {
    if (!problem) return;
    // V5.11 · 更新部分解决连续轮次(用于 ACE E-Evolve 变异触发)
    const bumped = bumpPartialSolvedStreak(problem, exit === 'archived');
    const next = executeActExit(bumped, exit, opts);
    await save(next);
    if (exit === 'archived') showToast('问题已归档, 沉淀为成功经验', 'success');
    if (exit === 'next-cycle') showToast('已进入第 ' + next.currentCycle + ' 轮 PDCA', 'info');
    if (exit === 'adjust-countermeasure') showToast('已回到 P3 调整对策', 'info');
  };

  if (!problem) {
    return <EmptyState icon={AlertOctagon} title="未找到该问题" description="可能已被删除" />;
  }

  const stageIdx = STAGE_STEP.indexOf(problem.currentStage);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button className="btn-ghost" onClick={() => navigate('/pdca')}>
          <ArrowLeft size={16} /> 返回列表
        </button>
      </div>

      <PageHeader
        title={problem.title}
        description={`${LIFE_DOMAIN_LABEL[problem.lifeDomain]} · ${PDCA_PROBLEM_TYPE_LABEL[problem.problemType]} · 第 ${problem.currentCycle} 轮`}
        actions={
          <button className="btn-ghost" onClick={refresh}>
            <RefreshCw size={14} />
          </button>
        }
      />

      <div className="card p-4">
        <div className="flex items-center gap-1 flex-wrap text-xs">
          {STAGE_STEP.map((s, i) => (
            <span key={s} className={`px-2 py-1 rounded ${i < stageIdx ? 'bg-emerald-600 text-white' : i === stageIdx ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 text-slate-500'}`}>
              {PDCA_STAGE_LABEL[s]}
            </span>
          ))}
        </div>
        {/* V5.12 · P1 展示合并为单一"问题定义"(RCA 导入 problemDescription 即为定义) */}
        <div className="mt-3 text-sm text-slate-700 space-y-1">
          <div>
            <b className="text-slate-500 mr-1">问题定义:</b>
            <span>
              {problem.targetState?.trim() ||
                problem.description?.trim() ||
                <em className="text-slate-400">未设置</em>}
            </span>
          </div>
          {problem.expectedDueAt && (
            <div>
              <b className="text-slate-500 mr-1">期望解决:</b>
              <span>{problem.expectedDueAt}</span>
            </div>
          )}
        </div>

        {/* V5.11 · 感性信号 & 闭环阻碍标注 */}
        {(problem.sensorySignals?.length || problem.closureObstacle) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {problem.sensorySignals?.map((s) => (
              <span key={s} className="badge bg-blue-50 text-blue-700">
                {SENSORY_SIGNAL_LABEL[s]}
              </span>
            ))}
            {problem.closureObstacle && (
              <span className="badge bg-amber-50 text-amber-700">
                闭环阻碍:{CLOSURE_OBSTACLE_LABEL[problem.closureObstacle]}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {problem.currentStage !== 'a-act' && problem.status === 'active' && (
            <button className="btn-primary" onClick={doAdvance}>
              进入下一阶段 →
            </button>
          )}

          {problem.currentStage === 'a-act' && problem.status === 'active' && (
            <>
              <button
                className="btn-primary"
                onClick={() => {
                  const lessons = archiveLessonInput
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  doExit('archived', { lessons: lessons.length > 0 ? lessons : ['(未记录)'] });
                }}
              >
                <CheckCircle2 size={14} /> 已解决, 归档
              </button>
              <button className="btn-secondary" onClick={() => doExit('next-cycle', { gapNote: '进入第 N+1 轮' })}>
                部分解决, 下一轮
              </button>
              <button className="btn-secondary" onClick={() => doExit('adjust-countermeasure')}>
                调整对策
              </button>
            </>
          )}
        </div>

        {/* V5.12 · A 阶段归档前的成功经验输入区 */}
        {problem.currentStage === 'a-act' && problem.status === 'active' && (
          <div className="mt-3 border border-emerald-100 bg-emerald-50/40 rounded p-3">
            <div className="text-xs text-slate-700 mb-1.5">
              <b>沉淀成功经验(归档时一并保存)</b>
              <span className="text-slate-500 ml-1">每行一条,可留空</span>
            </div>
            <textarea
              className="input text-xs min-h-[70px]"
              placeholder={'例如:\n评审前先与主评人对齐大方向\n方案分层展示,避免细节吞掉主旨'}
              value={archiveLessonInput}
              onChange={(e) => setArchiveLessonInput(e.target.value)}
            />
          </div>
        )}

        {/* V5.11 §30.9 · A 阶段"重启视角"提示 + ACE 变异建议 */}
        {problem.currentStage === 'a-act' && problem.status === 'active' && (
          <div className="mt-3 space-y-2">
            <div className="text-xs bg-purple-50 border border-purple-100 rounded p-2 text-purple-900">
              <b>重启视角(九段心法·重启):</b> 舍不得旧的 → 尝试外星人视角冷静评估现实、无视沉没成本;不敢开始新的 → 把所有事实当已知条件,像解题者一样重新配置资源
            </div>
            {shouldSuggestMutation(problem) && (
              <div className="text-xs bg-orange-50 border border-orange-100 rounded p-2 text-orange-900">
                <b>{ACE_TEMPLATE.evolve.label}:</b> 已连续 {problem.partialSolvedStreak} 轮"部分解决",建议在下一轮强制变异一条对策(换思路重试)
              </div>
            )}
          </div>
        )}
      </div>

      {/* 根因板块 */}
      <StageBlock
        title="根因分析(P2)"
        active={problem.currentStage === 'p2-root-cause'}
        empty="尚无根因, 支持嵌入外部因果图工具"
      >
        <RootCausePanel problem={problem} onSave={save} />
      </StageBlock>

      {/* 对策板块 */}
      <StageBlock
        title="对策制定 & 执行(P3 / D)"
        active={problem.currentStage === 'p3-countermeasure' || problem.currentStage === 'd-execute'}
        empty="尚无对策"
      >
        <CountermeasurePanel problem={problem} onSave={save} />
      </StageBlock>

      {/* 检查 */}
      <StageBlock
        title="检查(C · ORID)"
        active={problem.currentStage === 'c-check'}
        empty="尚无检查记录"
      >
        <CheckPanel problem={problem} onSave={save} />
      </StageBlock>

      {/* V5.11 Bug #035 修复:拉伸区自查仅在 C(检查)或 A(修正)阶段展示,
         D 阶段刚进入时不再触发"数据不足以判断"过早提示 */}
      {(problem.currentStage === 'c-check' || problem.currentStage === 'a-act') && (() => {
        const zone = checkStretchZone(problem);
        const tone = zone.status === 'stretch' ? 'bg-emerald-50 text-emerald-700'
          : zone.status === 'comfort' ? 'bg-yellow-50 text-yellow-700'
          : zone.status === 'panic' ? 'bg-red-50 text-red-700'
          : 'bg-slate-50 text-slate-600';
        return (
          <div className={`card p-3 text-sm ${tone}`}>
            <b>拉伸区自查:</b> {zone.message}
          </div>
        );
      })()}

      {/* V5.11 §30.9 · 三条反陷阱原则 + 九段心法钩子(仅成年人展示) */}
      <div className="card p-4 bg-slate-50/60">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-purple-600" /> 反陷阱原则 & 心法钩子
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs mb-3">
          {ANTI_TRAP_PRINCIPLES.map((p) => (
            <div key={p.key} className="bg-white rounded p-2 border border-slate-100">
              <b className="text-slate-900">{p.title}</b>
              <div className="text-slate-500 mt-1 leading-relaxed">{p.body}</div>
            </div>
          ))}
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-600 hover:text-slate-900">
            九段心法钩子(点击展开)
          </summary>
          <div className="mt-2 space-y-1">
            {(Object.keys(NINE_STAGE_MEANING) as Array<keyof typeof NINE_STAGE_MEANING>).map((k) => {
              const it = NINE_STAGE_MEANING[k];
              return (
                <div key={k} className="text-slate-600">
                  <b>{it.title}</b>:{it.essence}
                  <span className="text-slate-400 ml-1">→ {it.hook}</span>
                </div>
              );
            })}
          </div>
        </details>
      </div>

      {/* 外部工具 · 仅新窗口打开(去掉内嵌 iframe) */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <ExternalLink size={16} /> 工具箱
          </h2>
          <Link to="/pdca-tools" className="text-xs text-blue-600 hover:underline">
            管理自定义工具 →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          {[...EXTERNAL_TOOLS, ...customTools].map((tool) => {
            const applies = tool.appliesTo.includes(problem.currentStage);
            return (
              <div
                key={tool.id}
                className={`border border-slate-100 rounded-lg p-3 hover:bg-slate-50 ${applies ? 'ring-1 ring-blue-500' : ''}`}
              >
                <div className="font-medium text-slate-900">{tool.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  适用: {tool.appliesTo.map((s) => PDCA_STAGE_LABEL[s]).join(', ')}
                </div>
                <div className="flex gap-2 mt-2">
                  <a className="btn-secondary text-xs" href={tool.url} target="_blank" rel="noreferrer">
                    新窗口打开
                  </a>
                </div>
              </div>
            );
          })}
        </div>
        {artifacts.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-2">已归档产出物 ({artifacts.length}):</div>
            <ul className="space-y-1 text-sm">
              {artifacts.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b border-slate-50 py-1">
                  <span>
                    <b>{a.toolName}</b> · {PDCA_STAGE_LABEL[a.stage]} · {a.productType}
                    {a.note ? ` · ${a.note}` : ''}
                  </span>
                  <span className="text-xs text-slate-400">{a.createdAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* V5.12 · 成功经验(随时可补充,不再依赖归档) */}
      <div className="card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles size={16} className="text-emerald-600" /> 成功经验
        </h2>
        {problem.archivedLessons && problem.archivedLessons.length > 0 ? (
          <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
            {problem.archivedLessons.map((l, i) => (
              <li key={i} className="group flex items-start gap-2">
                <span className="flex-1">{l}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:underline"
                  onClick={async () => {
                    const next: PDCAProblem = {
                      ...problem,
                      archivedLessons: (problem.archivedLessons ?? []).filter((_, idx) => idx !== i),
                      updatedAt: new Date().toISOString(),
                    };
                    await save(next);
                  }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">尚未沉淀经验;可以在下方随时补充。</p>
        )}
        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs text-slate-600 mb-1.5">追加一条成功经验</div>
          <div className="flex gap-2">
            <input
              className="input text-sm flex-1"
              placeholder="从这个问题里学到的可迁移经验…"
              value={appendLessonInput}
              onChange={(e) => setAppendLessonInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && appendLessonInput.trim()) {
                  const next: PDCAProblem = {
                    ...problem,
                    archivedLessons: [...(problem.archivedLessons ?? []), appendLessonInput.trim()],
                    updatedAt: new Date().toISOString(),
                  };
                  await save(next);
                  setAppendLessonInput('');
                }
              }}
            />
            <button
              className="btn-primary text-sm"
              disabled={!appendLessonInput.trim()}
              onClick={async () => {
                const next: PDCAProblem = {
                  ...problem,
                  archivedLessons: [...(problem.archivedLessons ?? []), appendLessonInput.trim()],
                  updatedAt: new Date().toISOString(),
                };
                await save(next);
                setAppendLessonInput('');
              }}
            >
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * V5.11 Bug #018 修复:PDCA 阶段面板改用 details 折叠(默认非当前阶段折叠)
 * 优化点 #006:按 PRD 要求"阶段折叠"避免一屏噪声
 */
function StageBlock({
  title,
  active,
  children,
  empty,
}: {
  title: string;
  active: boolean;
  children: React.ReactNode;
  empty?: string;
}) {
  return (
    <details
      className={`card p-5 ${active ? 'ring-2 ring-blue-400' : ''}`}
      open={active}
    >
      <summary className="font-semibold cursor-pointer flex items-center gap-2 list-none">
        <span className="text-slate-400 text-xs">▸</span>
        {title}
        {active && <span className="badge bg-blue-100 text-blue-700">当前阶段</span>}
      </summary>
      <div className="mt-3">
        {children ?? <div className="text-sm text-slate-500">{empty}</div>}
      </div>
    </details>
  );
}

function RootCausePanel({ problem, onSave }: { problem: PDCAProblem; onSave: (p: PDCAProblem) => Promise<void> }) {
  const [content, setContent] = useState('');
  const [impact, setImpact] = useState<'high' | 'medium' | 'low'>('high');
  const [infoType, setInfoType] = useState<InformationType>('descriptive');
  const [evalCriterion, setEvalCriterion] = useState('');

  const add = async () => {
    if (!content.trim()) return;
    await onSave(
      addRootCause(problem, content, impact, {
        informationType: infoType,
        evaluationCriterion: infoType === 'evaluative' ? evalCriterion.trim() || undefined : undefined,
      }),
    );
    setContent('');
    setEvalCriterion('');
    setInfoType('descriptive');
  };

  // V5.11 · 信息分类校验
  const infoValidation = validateInformationTypes(problem);

  return (
    <div>
      {/* V5.11 · 信息类型校验警告 */}
      {infoValidation.warnings.length > 0 && (
        <div className="mb-3 text-xs bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-900 space-y-1">
          {infoValidation.warnings.map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </div>
      )}

      <div className="space-y-2 mb-4">
        {problem.rootCauses.map((r) => (
          <div key={r.id} className="border border-slate-100 rounded p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex-1">{r.content}</span>
              <span className={`badge ${r.impact === 'high' ? 'bg-red-50 text-red-600' : r.impact === 'medium' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
                {r.impact === 'high' ? '高' : r.impact === 'medium' ? '中' : '低'} 影响
              </span>
              {r.informationType && (
                <span
                  className={`badge text-xs ${r.informationType === 'descriptive' ? 'bg-blue-50 text-blue-700' : r.informationType === 'evaluative' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-700'}`}
                >
                  {INFORMATION_TYPE_LABEL[r.informationType]}
                </span>
              )}
            </div>
            {r.evaluationCriterion && (
              <div className="text-xs text-slate-500 mt-1">评价标准:{r.evaluationCriterion}</div>
            )}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input className="input flex-1" value={content} onChange={(e) => setContent(e.target.value)} placeholder="添加一条根因(优先使用记述信息)..." />
          <select className="input max-w-[80px]" value={impact} onChange={(e) => setImpact(e.target.value as 'high' | 'medium' | 'low')}>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-slate-500">信息类型(§30.3)</label>
            <select
              className="input py-1"
              value={infoType}
              onChange={(e) => setInfoType(e.target.value as InformationType)}
            >
              <option value="descriptive">{INFORMATION_TYPE_LABEL.descriptive}</option>
              <option value="evaluative">{INFORMATION_TYPE_LABEL.evaluative}</option>
              <option value="normative">{INFORMATION_TYPE_LABEL.normative}</option>
            </select>
            <div className="text-slate-400 mt-1">论证方式:{INFORMATION_TYPE_ARGUMENT[infoType]}</div>
          </div>
          {infoType === 'evaluative' && (
            <div>
              <label className="text-slate-500">评价标准(必填)</label>
              <input
                className="input py-1"
                value={evalCriterion}
                onChange={(e) => setEvalCriterion(e.target.value)}
                placeholder="如:超出可接受范围的判断依据"
              />
            </div>
          )}
        </div>
        <button className="btn-primary text-sm" onClick={add}>
          添加根因
        </button>
      </div>
    </div>
  );
}

function CountermeasurePanel({ problem, onSave }: { problem: PDCAProblem; onSave: (p: PDCAProblem) => Promise<void> }) {
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [rootCauseId, setRootCauseId] = useState<string>('');
  // V5.11 · 疯帽匠时间与 SWOT
  const [isMadHatter, setIsMadHatter] = useState(false);
  const [hasHandsOn, setHasHandsOn] = useState(false);
  const [rationale, setRationale] = useState('');
  const [showSwot, setShowSwot] = useState(false);
  const [swotS, setSwotS] = useState('');
  const [swotW, setSwotW] = useState('');
  const [swotO, setSwotO] = useState('');
  const [swotT, setSwotT] = useState('');

  const madHatterAllowed = canAddMadHatter(problem);
  const isHandsOffType = problem.closureObstacle === 'hands-off';

  const add = async () => {
    if (!content.trim() || !scheduledDate) return;
    // 手弄脏型强制要求"亲手完成最小动作"
    if (isHandsOffType && !isMadHatter && !hasHandsOn) {
      alert('该问题为"不愿把手弄脏"型,对策必须包含至少一条"今天就能亲手完成的最小动作"');
      return;
    }
    const swot =
      swotS.trim() || swotW.trim() || swotO.trim() || swotT.trim()
        ? {
            strengths: swotS.trim() || undefined,
            weaknesses: swotW.trim() || undefined,
            opportunities: swotO.trim() || undefined,
            threats: swotT.trim() || undefined,
          }
        : undefined;
    const payload: Omit<PDCACountermeasure, 'id' | 'status' | 'createdAt' | 'updatedAt'> = {
      content: content.trim(),
      rootCauseId: isMadHatter ? undefined : rootCauseId || undefined,
      scheduledDate,
      isMadHatter,
      hasHandsOnMinimalAction: hasHandsOn || undefined,
      rationale: rationale.trim() || undefined,
      swot,
    };
    await onSave(addCountermeasure(problem, payload));
    setContent('');
    setScheduledDate('');
    setRootCauseId('');
    setIsMadHatter(false);
    setHasHandsOn(false);
    setRationale('');
    setSwotS('');
    setSwotW('');
    setSwotO('');
    setSwotT('');
    setShowSwot(false);
    setShowForm(false);
  };

  // 进度统计只算非疯帽匠对策
  const effective = getEffectiveCountermeasures(problem);
  const doneCount = effective.filter((c) => c.status === 'done').length;
  const madHatterCount = problem.countermeasures.filter((c) => c.isMadHatter).length;

  return (
    <div>
      {/* V5.11 · 进度统计 + 疯帽匠预算 */}
      <div className="flex items-center gap-3 text-xs mb-3">
        <span className="text-slate-600">
          正式对策进度:<b>{doneCount}</b> / {effective.length}
        </span>
        <span className="text-purple-600 flex items-center gap-1">
          <Sprout size={12} /> 疯帽匠时间:{madHatterCount} / 1 (预算 {Math.round(MAD_HATTER_BUDGET_RATIO * 100)}%,不计入进度)
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {problem.countermeasures.map((c) => (
          <div
            key={c.id}
            className={`border rounded p-3 text-sm ${c.isMadHatter ? 'border-purple-200 bg-purple-50/40' : 'border-slate-100'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <div className="font-medium text-slate-800 flex items-center gap-2">
                  {c.isMadHatter && <Sprout size={12} className="text-purple-600" />}
                  {c.content}
                  {c.isMadHatter && (
                    <span className="badge bg-purple-100 text-purple-700 text-[10px]">疯帽匠时间</span>
                  )}
                  {c.hasHandsOnMinimalAction && (
                    <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">亲手完成</span>
                  )}
                </div>
                {c.scheduledDate && <div className="text-xs text-slate-500">计划执行: {c.scheduledDate}</div>}
                {c.rootCauseId && (
                  <div className="text-xs text-slate-400">
                    关联根因: {problem.rootCauses.find((r) => r.id === c.rootCauseId)?.content ?? '未知'}
                  </div>
                )}
                {c.rationale && <div className="text-xs text-slate-500 mt-1">决策理由:{c.rationale}</div>}
                {c.swot && (
                  <details className="text-xs text-slate-500 mt-1">
                    <summary className="cursor-pointer">SWOT 预判</summary>
                    <div className="grid grid-cols-2 gap-1 mt-1 pl-2">
                      {c.swot.strengths && <div>S:{c.swot.strengths}</div>}
                      {c.swot.weaknesses && <div>W:{c.swot.weaknesses}</div>}
                      {c.swot.opportunities && <div>O:{c.swot.opportunities}</div>}
                      {c.swot.threats && <div>T:{c.swot.threats}</div>}
                    </div>
                  </details>
                )}
              </div>
              <select
                className="input py-1 text-xs max-w-[120px]"
                value={c.status}
                onChange={(e) => onSave(updateCountermeasureStatus(problem, c.id, e.target.value as typeof c.status))}
                disabled={c.isMadHatter && c.status === 'pending'}
              >
                <option value="pending">未开始</option>
                <option value="in-progress">进行中</option>
                <option value="done">已完成</option>
                <option value="invalidated">已废弃</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      {!showForm ? (
        <button className="btn-secondary text-sm" onClick={() => setShowForm(true)}>
          + 添加对策
        </button>
      ) : (
        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          <input className="input" value={content} onChange={(e) => setContent(e.target.value)} placeholder="对策内容(具体指令 + 步骤)" />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            <select
              className="input"
              value={rootCauseId}
              onChange={(e) => setRootCauseId(e.target.value)}
              disabled={isMadHatter}
            >
              <option value="">{isMadHatter ? '疯帽匠时间无需关联' : '关联根因(可选)'}</option>
              {problem.rootCauses.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.content}
                </option>
              ))}
            </select>
          </div>

          {/* V5.11 · 疯帽匠时间 + 亲手完成 + SWOT 折叠 */}
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1 text-purple-700">
              <input
                type="checkbox"
                checked={isMadHatter}
                onChange={(e) => setIsMadHatter(e.target.checked)}
                disabled={!madHatterAllowed && !isMadHatter}
              />
              疯帽匠时间(无约束探索,不计入进度)
              {!madHatterAllowed && !isMadHatter && <span className="text-slate-400"> · 额度已用</span>}
            </label>
            {isHandsOffType && (
              <label className="flex items-center gap-1 text-emerald-700">
                <input
                  type="checkbox"
                  checked={hasHandsOn}
                  onChange={(e) => setHasHandsOn(e.target.checked)}
                />
                今天就能亲手完成的最小动作(必选)
              </label>
            )}
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => setShowSwot((v) => !v)}
            >
              {showSwot ? '收起' : '展开'} {ACE_TEMPLATE.anticipate.label}(可选)
            </button>
          </div>

          {showSwot && (
            <div className="bg-slate-50 rounded p-2 space-y-1 text-xs">
              <div className="text-slate-500 mb-1">{ACE_TEMPLATE.anticipate.body}</div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input py-1 text-xs" value={swotS} onChange={(e) => setSwotS(e.target.value)} placeholder="S 优势" />
                <input className="input py-1 text-xs" value={swotW} onChange={(e) => setSwotW(e.target.value)} placeholder="W 劣势" />
                <input className="input py-1 text-xs" value={swotO} onChange={(e) => setSwotO(e.target.value)} placeholder="O 机会" />
                <input className="input py-1 text-xs" value={swotT} onChange={(e) => setSwotT(e.target.value)} placeholder="T 威胁" />
              </div>
            </div>
          )}

          {/* 决策理由(九段心法·内控:重大决策不写下理由就不行动) */}
          <input
            className="input"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="决策理由(高风险对策建议填写 · 九段心法·内控)"
          />

          <div className="flex gap-2 justify-end">
            <button className="btn-ghost text-sm" onClick={() => setShowForm(false)}>
              <X size={12} /> 取消
            </button>
            <button className="btn-primary text-sm" onClick={add}>
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckPanel({ problem, onSave }: { problem: PDCAProblem; onSave: (p: PDCAProblem) => Promise<void> }) {
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [emotion, setEmotion] = useState('');
  const [factAnalysis, setFactAnalysis] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [showEmotion, setShowEmotion] = useState(false);

  const add = async () => {
    if (!expected.trim() || !actual.trim()) return;
    await onSave(addCheckEntry(problem, {
      expected: expected.trim(),
      actual: actual.trim(),
      gapNote: `预期: ${expected} / 实际: ${actual}`,
      emotionTag: emotion || undefined,
      factAnalysis: factAnalysis || undefined,
      nextAction: nextAction || undefined,
    }));
    setExpected('');
    setActual('');
    setEmotion('');
    setFactAnalysis('');
    setNextAction('');
  };

  return (
    <div>
      <div className="space-y-2 mb-4">
        {problem.checkEntries.map((e) => (
          <div key={e.id} className="border border-slate-100 rounded p-2 text-sm">
            <div className="text-xs text-slate-500">O:</div>
            <div>{e.gapNote}</div>
            {e.emotionTag && <div className="text-xs text-slate-500 mt-1">R: {e.emotionTag}</div>}
            {e.factAnalysis && <div className="text-xs text-slate-500 mt-1">I: {e.factAnalysis}</div>}
            {e.nextAction && <div className="text-xs text-slate-500 mt-1">D: {e.nextAction}</div>}
          </div>
        ))}
      </div>

      <div className="text-xs text-slate-500 mb-2">
        ORID 模板: {ORID_TEMPLATE.O} / {ORID_TEMPLATE.R} / {ORID_TEMPLATE.I} / {ORID_TEMPLATE.D}
      </div>

      <div className="border border-slate-200 rounded-lg p-3 space-y-2">
        <input className="input" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="O: 预期结果" />
        <input className="input" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="O: 实际结果" />
        <div className="flex items-center gap-2">
          <input className="input flex-1" value={emotion} onChange={(e) => setEmotion(e.target.value)} placeholder="R: 我的情绪反应(可选)" />
          <button className="btn-ghost text-xs" onClick={() => setShowEmotion(!showEmotion)}>
            情绪拆解三问
          </button>
        </div>
        {showEmotion && (
          <div className="bg-slate-50 p-2 rounded text-xs text-slate-600 space-y-1">
            {EMOTION_TRIPLE_QUESTIONS.map((q, i) => (
              <div key={i}>{i + 1}. {q}</div>
            ))}
          </div>
        )}
        <input className="input" value={factAnalysis} onChange={(e) => setFactAnalysis(e.target.value)} placeholder="I: 差距背后的原因(可选)" />
        <input className="input" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="D: 下一步行动(时间/地点/方式)" />
        <button className="btn-primary text-sm" onClick={add}>
          添加检查记录
        </button>
      </div>
    </div>
  );
}

