/**
 * PRD V5.8 §14.4 申论答案版本管理
 * 保留原始答案 → 教师批改 → 二次修改 → 三次重写, 支持前后对比
 *
 * 2026-11-09 录入收敛（第二轮）：
 * - 申论是唯一录入入口（训练记录不再能新建申论记录）；
 * - 单题与套卷都必须带题型、试卷来源、题号、作答时间；
 * - questionKey = 学科 + 试卷来源 + 年份 + 题号，同一 key 的作答按作答时间自动形成版本链；
 * - 套卷按题拆分记录题型/得分，统计可回答「归纳概括这类题做得怎么样」。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { FileText, PlusCircle, Trash2, X, ArrowRight, History, Layers, AlertCircle } from 'lucide-react';
import { EmptyState as CoreEmptyState, ResponsiveGrid, StatCard, useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, putRecord, deleteRecord, findTrainingsByStudent } from '../services/localDB';
import {
  buildSubjectiveByType,
  buildSubjectiveComposition,
  buildSubjectiveDimensions,
  buildSubjectiveErrorStats,
  buildSubjectiveQuestionHistory,
} from '../services/analytics';
import {
  ERROR_CATEGORY_LABEL,
  SHENLUN_ERROR_CATEGORIES,
  SHENLUN_QUESTION_TYPES,
  type ErrorCategory,
  type SubjectiveAnswer,
  type SubjectiveDimensionScores,
  type SubjectivePaperQuestion,
  type TrainingRecord,
} from '../domain/types';
import {
  displayQuestionType,
  makeQuestionKey,
  nowLocalInputValue,
  toAnsweredAtIso,
} from '../domain/subjectiveQuestion';

type AnswerMode = 'single' | 'paper';
type ModeFilter = 'all' | AnswerMode;
type View = 'records' | 'questions';

const DIMENSION_LABEL = {
  points: '要点',
  structure: '结构',
  language: '语言',
  logic: '逻辑',
} as const;
const DIMENSION_KEYS = ['points', 'structure', 'language', 'logic'] as const;

/** 老记录没有 mode 字段，一律按单题读 */
const modeOf = (a: SubjectiveAnswer): AnswerMode => (a.mode === 'paper' ? 'paper' : 'single');
const fmtTime = (iso: string) => iso.slice(0, 16).replace('T', ' ');
const dimsAvg = (dims: Partial<SubjectiveDimensionScores>) => {
  const values = DIMENSION_KEYS.map((k) => dims[k]).filter((v): v is number => typeof v === 'number');
  return values.length === 0 ? null : Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
};

export function SubjectiveAnswersPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [list, setList] = useState<SubjectiveAnswer[]>([]);
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [parent, setParent] = useState<SubjectiveAnswer | null>(null);
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [view, setView] = useState<View>('records');

  const refresh = useCallback(async () => {
    const all = await getAllRecords('subjectiveAnswers');
    setList(all.filter((r) => (prefs.currentStudentId ? r.studentId === prefs.currentStudentId : true)));
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void findTrainingsByStudent(prefs.currentStudentId).then(setTrainings);
  }, [prefs.currentStudentId]);

  const grouped = useMemo(() => {
    // 按 rootId 分组, 每组按 version 排序（兼容老数据的手动版本链）
    const rootMap = new Map<string, SubjectiveAnswer[]>();
    const rootOf = (a: SubjectiveAnswer): string => {
      let cur = a;
      while (cur.parentId) {
        const p = list.find((x) => x.id === cur.parentId);
        if (!p) break;
        cur = p;
      }
      return cur.id;
    };
    for (const a of list) {
      const root = rootOf(a);
      const arr = rootMap.get(root) ?? [];
      arr.push(a);
      rootMap.set(root, arr);
    }
    return Array.from(rootMap.values()).map((chain) => chain.sort((a, b) => a.version - b.version));
  }, [list]);

  // 统计只算申论作答；历史「面试」subject 记录仅在列表中原样展示，不混入申论口径
  const shenlunList = useMemo(() => list.filter((r) => r.subject === 'shenlun'), [list]);
  const composition = useMemo(() => buildSubjectiveComposition(shenlunList), [shenlunList]);
  const dimensionSummary = useMemo(() => buildSubjectiveDimensions(shenlunList), [shenlunList]);
  const typeStats = useMemo(() => buildSubjectiveByType(shenlunList), [shenlunList]);
  const questionHistory = useMemo(() => buildSubjectiveQuestionHistory(shenlunList), [shenlunList]);
  // 错因：新作答 + 历史申论训练记录只读合并（不迁移、不回写）
  const errorStats = useMemo(
    () => buildSubjectiveErrorStats(shenlunList, trainings),
    [shenlunList, trainings],
  );
  const unclassifiedCount = useMemo(
    () => shenlunList.filter((r) => r.mode === 'paper'
      ? (r.paperQuestions ?? []).some((q) => !q.questionType?.trim())
      : !r.questionType?.trim()).length,
    [shenlunList],
  );

  const visibleChains = useMemo(
    () => (modeFilter === 'all' ? grouped : grouped.filter((chain) => modeOf(chain[0]) === modeFilter)),
    [grouped, modeFilter],
  );

  const remove = async (id: string) => {
    if (!window.confirm('确认删除该作答？链上的所有版本会一并删除')) return;
    const chain = grouped.find((c) => c.some((r) => r.id === id));
    if (chain) for (const r of chain) await deleteRecord('subjectiveAnswers', r.id);
    else await deleteRecord('subjectiveAnswers', id);
    void refresh();
    showToast('已删除', 'info');
  };

  const openNewChain = () => {
    setParent(null);
    setShowForm(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="申论作答（唯一录入入口）"
        description="单题与套卷都在这里录：题型 + 试卷来源 + 题号 + 作答时间决定题目身份，同一道题多次作答会按时间自动排成版本；套卷逐题填题型，统计可按题型聚合。"
        actions={
          <button className="btn-primary" onClick={openNewChain}>
            <PlusCircle size={16} /> 新增作答
          </button>
        }
      />

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">四维评分汇总</h2>
          <span className="text-xs text-slate-400">样本 {dimensionSummary.samples} 条（0-100）</span>
        </div>
        {dimensionSummary.samples === 0 ? (
          <CoreEmptyState title="暂无四维评分" description="在录入作答时填写要点 / 结构 / 语言 / 逻辑后展示汇总" />
        ) : (
          <>
            <ResponsiveGrid minItemWidth="140px" gap="0.5rem">
              {DIMENSION_KEYS.map((key) => (
                <StatCard
                  key={key}
                  label={DIMENSION_LABEL[key]}
                  value={dimensionSummary.avg[key] ?? '—'}
                  hint={key === dimensionSummary.weakest ? '最弱维度' : '平均分'}
                  accentClassName="text-slate-800"
                />
              ))}
            </ResponsiveGrid>
            {dimensionSummary.weakest && (
              <div className="text-xs text-slate-500 mt-2">
                最弱维度：<b className="text-orange-600">{DIMENSION_LABEL[dimensionSummary.weakest as keyof typeof DIMENSION_LABEL]}</b>
              </div>
            )}
          </>
        )}
        <div className="text-xs text-slate-500 mt-3 leading-relaxed">
          作答构成：单题 <b className="text-slate-700">{composition.singleCount}</b> 次 · 套卷{' '}
          <b className="text-slate-700">{composition.paperCount}</b> 份（套卷按「份」计，不拆成单题计数）；
          四维样本中单题 {composition.singleRated} / 套卷 {composition.paperRated}。
          按题型的统计见下方「按题型」表，老记录缺题型计为「未分类」且不参与题型聚合。
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={16} className="text-purple-600" />
          <h2 className="font-semibold text-slate-900">按题型</h2>
          <span className="text-xs text-slate-400">套卷按题拆分统计 · 未分类 {unclassifiedCount} 条未计入</span>
        </div>
        {typeStats.length === 0 ? (
          <div className="text-sm text-slate-500">还没有带题型的作答记录。录入时选择题型后，这里会按题型汇总得分率与四维评分。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="py-2">题型</th>
                  <th className="py-2 text-right">作答次数</th>
                  <th className="py-2 text-right">单题 / 套卷题</th>
                  <th className="py-2 text-right">得分率</th>
                  <th className="py-2 text-right">要点</th>
                  <th className="py-2 text-right">结构</th>
                  <th className="py-2 text-right">语言</th>
                  <th className="py-2 text-right">逻辑</th>
                </tr>
              </thead>
              <tbody>
                {typeStats.map((t) => (
                  <tr key={t.questionType} className="border-b border-slate-50">
                    <td className="py-2 text-slate-700">{t.questionType}</td>
                    <td className="py-2 text-right">{t.attempts}</td>
                    <td className="py-2 text-right text-slate-500">{t.singleCount} / {t.paperQuestionCount}</td>
                    <td className="py-2 text-right">{t.avgScoreRate === null ? '—' : `${t.avgScoreRate}%`}</td>
                    {DIMENSION_KEYS.map((k) => (
                      <td key={k} className="py-2 text-right text-slate-600">{t.avgDims[k] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-slate-400 mt-2">
          得分率只统计套卷分题的「得分 / 满分」；四维评分优先取题目级，套卷未单题评分时继承整卷四维。
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <AlertCircle size={16} className="text-red-500" />
          <h2 className="font-semibold text-slate-900">错因分析（申论）</h2>
          <span className="text-xs text-slate-400">
            错因选择 {errorStats.selections} 次 · 新作答 {errorStats.answerSelections} 次 / 历史训练记录{' '}
            {errorStats.trainingSelections} 次
          </span>
        </div>
        {errorStats.selections === 0 ? (
          <div className="text-sm text-slate-500">
            暂无错因记录。申论单题与套卷分题都可以选「失分原因」，历史申论训练记录里的错因会自动并入这里（只读，不修改原记录）。
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">按错因（含历史训练记录）</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="py-1.5">错因</th>
                      <th className="py-1.5 text-right">次数</th>
                      <th className="py-1.5 text-right">占比</th>
                      <th className="py-1.5 text-right">新作答</th>
                      <th className="py-1.5 text-right">历史训练</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorStats.rows.map((r) => (
                      <tr key={r.category} className="border-b border-slate-50">
                        <td className="py-1.5 text-slate-700">{ERROR_CATEGORY_LABEL[r.category]}</td>
                        <td className="py-1.5 text-right">{r.count}</td>
                        <td className="py-1.5 text-right text-slate-500">{r.share}%</td>
                        <td className="py-1.5 text-right">{r.answerCount}</td>
                        <td className="py-1.5 text-right text-slate-500">{r.trainingCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">题型 × 错因（主要失分原因）</div>
              {errorStats.byType.length === 0 ? (
                <div className="text-xs text-slate-500">还没有同时记录「题型 + 错因」的数据。</div>
              ) : (
                <div className="space-y-2">
                  {errorStats.byType.map((t) => (
                    <div key={t.questionType} className="border border-slate-100 rounded p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700">{t.questionType}</span>
                        <span className="text-xs text-slate-400">有错因 {t.attempts} 次</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {t.counts.slice(0, 4).map((c) => (
                          <span key={c.category} className="badge bg-red-50 text-red-600">
                            {ERROR_CATEGORY_LABEL[c.category]} ×{c.count}
                          </span>
                        ))}
                        {t.counts.length > 4 && (
                          <span className="text-xs text-slate-400">+{t.counts.length - 4} 种</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="text-xs text-slate-400 mt-2 leading-relaxed">
          统计口径：新作答按题目计次（套卷整卷级错因会摊到每道分题，题目级错因优先）；历史申论训练记录的「错因」在读取时合并，
          不迁移、不回写、不修改原记录；未记录错因 {errorStats.untaggedEntries} 条（含继承整卷错因 {errorStats.inheritedEntries} 条）
          不影响其他展示；历史训练记录只有题型命中申论枚举时才参与「题型 × 错因」右侧交叉。
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { k: 'all', label: `全部 ${grouped.length}` },
            { k: 'single', label: `单题 ${composition.singleCount}` },
            { k: 'paper', label: `套卷 ${composition.paperCount}` },
          ] as Array<{ k: ModeFilter; label: string }>).map((it) => (
            <button
              key={it.k}
              onClick={() => setModeFilter(it.k)}
              className={`px-3 py-1.5 rounded-lg text-sm ${modeFilter === it.k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
            >
              {it.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('records')}
            className={`px-3 py-1.5 rounded-lg text-sm ${view === 'records' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            按记录
          </button>
          <button
            onClick={() => setView('questions')}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${view === 'questions' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            <History size={14} /> 按题目（自动版本链）
          </button>
        </div>
      </div>

      {view === 'questions' ? (
        <QuestionHistoryView history={questionHistory} />
      ) : visibleChains.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={grouped.length === 0 ? '尚无申论/面试作答' : '该类型下暂无作答'}
          description="记录第一次作答, 后续同一道题再录会按作答时间自动排版本"
          action={
            <button className="btn-primary" onClick={openNewChain}>
              <PlusCircle size={16} /> 新增作答
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {visibleChains.map((chain) => {
            const head = chain[0];
            const isPaper = modeOf(head) === 'paper';
            return (
              <div key={head.id} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${isPaper ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                        {isPaper ? '套卷' : '单题'}
                      </span>
                      <span className="font-medium truncate">
                        {head.subject === 'shenlun' ? '申论' : '面试（历史记录）'} ·{' '}
                        {isPaper ? head.paperSource || head.paperTitle || head.scenario : head.scenario}
                      </span>
                      {isPaper && head.paperQuestionCount ? (
                        <span className="text-xs text-slate-500">{head.paperQuestionCount} 题</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {head.date} · 共 {chain.length} 个版本
                      {isPaper && head.paperYear ? ` · ${head.paperYear}` : ''}
                      {isPaper && head.paperFullMark !== undefined
                        ? ` · 满分 ${head.paperFullMark}${head.paperScore !== undefined ? ` / 得分 ${head.paperScore}` : ''}`
                        : ''}
                    </div>
                  </div>
                  {head.subject === 'shenlun' ? (
                    <button
                      className="btn-secondary text-xs shrink-0"
                      onClick={() => {
                        setParent(chain[chain.length - 1]);
                        setShowForm(true);
                      }}
                    >
                      <ArrowRight size={12} /> 追加修订版
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 shrink-0">面试已统一到「面试记录」页</span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {chain.map((v) => (
                    <div key={v.id} className="border border-slate-100 rounded p-3 text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="badge bg-blue-50 text-blue-700">v{v.version}</span>
                          <span className="badge bg-slate-100 text-slate-500">{modeOf(v) === 'paper' ? '套卷' : '单题'}</span>
                        </div>
                        <button className="btn-ghost text-red-500 text-xs" onClick={() => remove(v.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                      {modeOf(v) === 'paper' ? (
                        <div className="space-y-1">
                          <div className="text-xs text-slate-600">
                            {[v.paperSource || v.paperTitle, v.paperYear].filter(Boolean).join(' · ') || '未命名套卷'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {v.paperQuestionCount ? `${v.paperQuestionCount} 题 · ` : ''}
                            {v.durationMinutes ? `${v.durationMinutes} 分钟` : '未记时长'}
                            {v.paperFullMark !== undefined
                              ? ` · 满分 ${v.paperFullMark}${v.paperScore !== undefined ? ` / 得分 ${v.paperScore}` : ''}`
                              : ''}
                          </div>
                          {v.paperQuestions && v.paperQuestions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {v.paperQuestions.map((q) => (
                                <span key={`${q.no}-${q.questionType ?? ''}`} className="badge bg-slate-100 text-slate-600">
                                  {q.no}题 · {displayQuestionType(q.questionType)}
                                  {q.score !== undefined ? ` ${q.score}${q.fullMark !== undefined ? `/${q.fullMark}` : ''} 分` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {v.content && !v.content.startsWith('套卷：') && (
                            <div className="text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto text-xs mt-1">{v.content}</div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs text-slate-500">
                            {displayQuestionType(v.questionType)}
                            {v.paperSource ? ` · ${v.paperSource}` : ''}
                            {v.questionNo ? ` · 第 ${v.questionNo} 题` : ''}
                          </div>
                          <div className="text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto text-xs mt-1">{v.content}</div>
                        </div>
                      )}
                      <div className="text-xs text-slate-500 mt-2">
                        {v.answeredAt ? `作答于 ${fmtTime(v.answeredAt)}` : `记录于 ${v.date}`}
                        {v.durationMinutes ? ` · ${v.durationMinutes} 分钟` : ''}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {DIMENSION_KEYS.map((key) => (
                          <span key={key} className="badge bg-slate-100 text-slate-600">
                            {DIMENSION_LABEL[key]} {v.dimensionScores?.[key] ?? '未评分'}
                          </span>
                        ))}
                      </div>
                      {(() => {
                        const recordCauses = v.errorCategories ?? [];
                        const questionCauses = (v.paperQuestions ?? []).filter(
                          (q) => (q.errorCategories?.length ?? 0) > 0,
                        );
                        if (recordCauses.length === 0 && questionCauses.length === 0) {
                          return <div className="text-xs text-slate-400 mt-1">未记录错因</div>;
                        }
                        return (
                          <div className="mt-1 space-y-1">
                            {recordCauses.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-xs text-slate-400">
                                  {modeOf(v) === 'paper' ? '整卷统一错因：' : '错因：'}
                                </span>
                                {recordCauses.map((c) => (
                                  <span key={c} className="badge bg-red-50 text-red-600">
                                    {ERROR_CATEGORY_LABEL[c]}
                                  </span>
                                ))}
                              </div>
                            )}
                            {questionCauses.map((q) => (
                              <div key={`cause-${q.no}`} className="flex flex-wrap items-center gap-1">
                                <span className="text-xs text-slate-400">第 {q.no} 题：</span>
                                {q.errorCategories?.map((c) => (
                                  <span key={c} className="badge bg-red-50 text-red-600">
                                    {ERROR_CATEGORY_LABEL[c]}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {v.teacherFeedback && (
                        <div className="text-xs text-emerald-700 mt-1"><b>教师评语:</b> {v.teacherFeedback}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <AnswerForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('作答已保存', 'success');
          }}
          studentId={prefs.currentStudentId}
          parent={parent}
        />
      )}
    </div>
  );
}

/** 同一 questionKey 的历史版本对比：得分 / 四维 / 变化 */
function QuestionHistoryView({ history }: { history: ReturnType<typeof buildSubjectiveQuestionHistory> }) {
  if (history.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="暂无自动版本链"
        description="录入时填写试卷来源与题号后，同一道题再次作答会自动归到这里；老记录没有题号，仍在上方「按记录」查看"
      />
    );
  }
  return (
    <div className="space-y-4">
      {history.map((g) => {
        const latest = g.entries[g.entries.length - 1];
        const prev = g.entries[g.entries.length - 2];
        const latestDim = dimsAvg(latest.dims);
        const prevDim = prev ? dimsAvg(prev.dims) : null;
        const scoreDelta = latest.scoreRate !== null && prev?.scoreRate != null ? Math.round((latest.scoreRate - prev.scoreRate) * 10) / 10 : null;
        const dimDelta = latestDim !== null && prevDim !== null ? Math.round((latestDim - prevDim) * 10) / 10 : null;
        return (
          <div key={g.questionKey} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge bg-purple-50 text-purple-700">{g.questionType}</span>
                <span className="font-medium text-sm">
                  {g.paperSource ?? '未填来源'} · 第 {g.questionNo ?? '—'} 题
                </span>
                <span className="text-xs text-slate-400">{g.attempts} 次作答</span>
              </div>
              <span className="text-xs text-slate-400">最近 {fmtTime(g.latestAnsweredAt)}</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-600 mb-2">
              <span>最新得分率：<b>{latest.scoreRate === null ? '—' : `${latest.scoreRate}%`}</b></span>
              <span>最新四维均值：<b>{latestDim ?? '—'}</b></span>
              {scoreDelta !== null && (
                <span className={scoreDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  较上次 {scoreDelta >= 0 ? '+' : ''}{scoreDelta}pt
                </span>
              )}
              {dimDelta !== null && (
                <span className={dimDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  四维 {dimDelta >= 0 ? '+' : ''}{dimDelta}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {g.entries.map((e, i) => (
                <div key={`${e.recordId}-${i}`} className="border border-slate-100 rounded p-2 text-xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>v{i + 1} · 作答于 {fmtTime(e.answeredAt)}</span>
                    <span>
                      {e.scoreRate === null ? '无卷面得分' : `得分率 ${e.scoreRate}%`}
                      {dimsAvg(e.dims) !== null ? ` · 四维 ${dimsAvg(e.dims)}` : ''}
                    </span>
                  </div>
                  {e.content && (
                    <div className="text-slate-700 whitespace-pre-wrap mt-1 max-h-40 overflow-y-auto">{e.content}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {e.errorCategories.length === 0 ? (
                      <span className="text-slate-400">未记录错因</span>
                    ) : (
                      <>
                        <span className="text-slate-400">错因：</span>
                        {e.errorCategories.map((c) => (
                          <span key={c} className="badge bg-red-50 text-red-600">
                            {ERROR_CATEGORY_LABEL[c]}
                            {e.errorInherited ? '（整卷）' : ''}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface PaperQuestionDraft {
  no: string;
  questionType: string;
  content: string;
  score: string;
  fullMark: string;
  errorCategories: ErrorCategory[];
}

const emptyQuestionDraft = (): PaperQuestionDraft => ({
  no: '',
  questionType: '归纳概括',
  content: '',
  score: '',
  fullMark: '',
  errorCategories: [],
});

/** 申论错因多选（复用训练记录同一套枚举） */
function CauseChips({
  value,
  onChange,
  compact = false,
}: {
  value: ErrorCategory[];
  onChange: (next: ErrorCategory[]) => void;
  compact?: boolean;
}) {
  const toggle = (category: ErrorCategory) => {
    onChange(value.includes(category) ? value.filter((c) => c !== category) : [...value, category]);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {SHENLUN_ERROR_CATEGORIES.map((category) => {
        const active = value.includes(category);
        return (
          <button
            key={category}
            type="button"
            onClick={() => toggle(category)}
            className={`${compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'} rounded border ${
              active ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-slate-200 text-slate-500'
            }`}
          >
            {ERROR_CATEGORY_LABEL[category]}
          </button>
        );
      })}
    </div>
  );
}

function AnswerForm({
  onClose,
  onSaved,
  studentId,
  parent,
}: {
  onClose: () => void;
  onSaved: () => void;
  studentId?: string;
  parent: SubjectiveAnswer | null;
}) {
  const subject = 'shenlun' as const;
  const [mode, setMode] = useState<AnswerMode>(parent ? modeOf(parent) : 'single');
  const [questionType, setQuestionType] = useState<string>(parent?.questionType ?? '归纳概括');
  const [paperSource, setPaperSource] = useState(parent?.paperSource ?? parent?.paperTitle ?? '');
  const [questionNo, setQuestionNo] = useState(parent?.questionNo ?? '');
  const [answeredAt, setAnsweredAt] = useState(nowLocalInputValue());
  const [content, setContent] = useState('');
  const [errorCategories, setErrorCategories] = useState<ErrorCategory[]>(parent?.errorCategories ?? []);
  const [duration, setDuration] = useState<string>(parent?.durationMinutes !== undefined ? String(parent.durationMinutes) : '');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  const [paperYear, setPaperYear] = useState(parent?.paperYear ?? '');
  const [paperQuestionCount, setPaperQuestionCount] = useState(
    parent?.paperQuestionCount !== undefined ? String(parent.paperQuestionCount) : '',
  );
  const [paperFullMark, setPaperFullMark] = useState(parent?.paperFullMark !== undefined ? String(parent.paperFullMark) : '');
  const [paperScore, setPaperScore] = useState('');
  const [paperQuestions, setPaperQuestions] = useState<PaperQuestionDraft[]>(
    parent?.paperQuestions?.map((q) => ({
      no: q.no,
      questionType: q.questionType ?? '归纳概括',
      content: q.content ?? '',
      score: q.score !== undefined ? String(q.score) : '',
      fullMark: q.fullMark !== undefined ? String(q.fullMark) : '',
      errorCategories: q.errorCategories ?? [],
    })) ?? [],
  );
  const [dimPoints, setDimPoints] = useState('');
  const [dimStructure, setDimStructure] = useState('');
  const [dimLanguage, setDimLanguage] = useState('');
  const [dimLogic, setDimLogic] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isPaper = mode === 'paper';

  const parseOptional = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));

  const updateQuestion = (index: number, patch: Partial<PaperQuestionDraft>) => {
    setPaperQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const submit = async () => {
    if (saving) return;
    setFormError(null);
    const answeredAtIso = toAnsweredAtIso(answeredAt);
    if (!answeredAtIso) {
      setFormError('请填写有效的作答时间');
      return;
    }
    if (!questionType.trim()) {
      setFormError('请选择题型');
      return;
    }
    if (!paperSource.trim()) {
      setFormError('请填写试卷来源（如「2023 国考副省级」）；同来源 + 题号用于识别同一道题');
      return;
    }
    if (!isPaper && !content.trim()) return;
    if (!isPaper && !questionNo.trim()) {
      setFormError('请填写题号；同来源 + 题号用于识别同一道题');
      return;
    }
    const durationValue = parseOptional(duration);
    if (durationValue !== null && (!Number.isFinite(durationValue) || durationValue < 0)) {
      setFormError('作答时长须为不小于 0 的数字');
      return;
    }
    const fullMarkValue = parseOptional(paperFullMark);
    const scoreValue = parseOptional(paperScore);
    const questionCountValue = parseOptional(paperQuestionCount);
    if (isPaper) {
      if (questionCountValue !== null && (!Number.isInteger(questionCountValue) || questionCountValue <= 0)) {
        setFormError('总题数须为正整数');
        return;
      }
      if (fullMarkValue !== null && (!Number.isFinite(fullMarkValue) || fullMarkValue <= 0)) {
        setFormError('满分须大于 0');
        return;
      }
      if (scoreValue !== null) {
        if (!Number.isFinite(scoreValue) || scoreValue < 0) {
          setFormError('得分不得小于 0');
          return;
        }
        if (fullMarkValue === null) {
          setFormError('填写得分前请先填写满分');
          return;
        }
        if (scoreValue > fullMarkValue) {
          setFormError('得分不得大于满分');
          return;
        }
      }
    }
    // 套卷：逐题必须有题号与题型；题号可不连续
    const questions: SubjectivePaperQuestion[] = [];
    if (isPaper) {
      if (paperQuestions.length === 0) {
        setFormError('套卷请至少添加一道分题，并填写题号与题型');
        return;
      }
      const seen = new Set<string>();
      for (const q of paperQuestions) {
        const no = q.no.trim();
        if (!no) {
          setFormError('每道分题都必须填写题号');
          return;
        }
        if (!q.questionType.trim()) {
          setFormError(`第 ${no} 题请选择题型`);
          return;
        }
        const normalizedNo = no.toLowerCase();
        if (seen.has(normalizedNo)) {
          setFormError(`第 ${no} 题重复出现，请检查题号`);
          return;
        }
        seen.add(normalizedNo);
        const qScore = parseOptional(q.score);
        const qFull = parseOptional(q.fullMark);
        if (qScore !== null && (!Number.isFinite(qScore) || qScore < 0)) {
          setFormError(`第 ${no} 题得分不得小于 0`);
          return;
        }
        if (qFull !== null && (!Number.isFinite(qFull) || qFull <= 0)) {
          setFormError(`第 ${no} 题满分须大于 0`);
          return;
        }
        if (qScore !== null && qFull !== null && qScore > qFull) {
          setFormError(`第 ${no} 题得分不得大于该题满分`);
          return;
        }
        const key = makeQuestionKey({ subject, paperSource, paperYear, questionNo: no });
        questions.push({
          no,
          questionType: q.questionType.trim(),
          ...(q.content.trim() ? { content: q.content.trim() } : {}),
          ...(qScore !== null ? { score: qScore } : {}),
          ...(qFull !== null ? { fullMark: qFull } : {}),
          ...(key ? { questionKey: key } : {}),
          ...(q.errorCategories.length > 0 ? { errorCategories: q.errorCategories } : {}),
        });
      }
    }
    const rawDims: Array<[keyof typeof DIMENSION_LABEL, string]> = [
      ['points', dimPoints],
      ['structure', dimStructure],
      ['language', dimLanguage],
      ['logic', dimLogic],
    ];
    const dims: SubjectiveDimensionScores = {};
    for (const [key, raw] of rawDims) {
      if (raw.trim() === '') continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setFormError(`${DIMENSION_LABEL[key]}评分须在 0-100 之间`);
        return;
      }
      dims[key] = value;
    }

    const now = new Date().toISOString();
    const trimmedContent = content.trim();
    const key = !isPaper
      ? makeQuestionKey({ subject, paperSource, paperYear, questionNo })
      : null;
    // 单题：同一 questionKey 下按作答时间自动形成版本链，不再依赖用户手动指定 parentId
    let version = parent ? parent.version + 1 : 1;
    let parentId = parent?.id;
    if (key) {
      const all = await getAllRecords('subjectiveAnswers');
      const siblings = all
        .filter((r) => r.studentId === studentId && r.questionKey === key)
        .sort((a, b) => (a.answeredAt ?? a.createdAt).localeCompare(b.answeredAt ?? b.createdAt));
      const latest = siblings[siblings.length - 1];
      version = Math.max(0, ...siblings.map((r) => r.version)) + 1;
      parentId = latest?.id ?? parent?.id;
    }
    const record: SubjectiveAnswer = {
      id: uuid(),
      studentId,
      subject,
      scenario: isPaper ? (paperSource.trim() || '套卷') : questionType.trim(),
      date: answeredAt.slice(0, 10),
      parentId,
      version,
      content: trimmedContent || (isPaper ? `套卷：${paperSource.trim()}` : ''),
      createdAt: now,
      updatedAt: now,
      answeredAt: answeredAtIso,
      ...(trimmedContent ? { wordCount: trimmedContent.length } : {}),
      ...(durationValue !== null ? { durationMinutes: durationValue } : {}),
      ...(teacherFeedback.trim() ? { teacherFeedback: teacherFeedback.trim() } : {}),
      ...(Object.keys(dims).length > 0 ? { dimensionScores: dims } : {}),
      ...(errorCategories.length > 0 ? { errorCategories } : {}),
    };
    record.mode = isPaper ? 'paper' : 'single';
    record.paperSource = paperSource.trim();
    if (!isPaper) {
      record.questionType = questionType.trim();
      if (questionNo.trim()) record.questionNo = questionNo.trim();
    }
    if (key) record.questionKey = key;
    if (isPaper) {
      record.mode = 'paper';
      record.paperTitle = paperSource.trim();
      if (paperYear.trim()) record.paperYear = paperYear.trim();
      record.paperQuestionCount = questionCountValue ?? questions.length;
      if (fullMarkValue !== null) record.paperFullMark = fullMarkValue;
      if (scoreValue !== null) record.paperScore = scoreValue;
      record.paperQuestions = questions;
      delete record.questionType;
      delete record.questionNo;
      delete record.questionKey;
    }
    setSaving(true);
    await putRecord('subjectiveAnswers', record);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl max-h-[95vh] overflow-y-auto p-6 modal-clamp [--modal-max:42rem] [--modal-max-h:95vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">{parent ? `追加 v${parent.version + 1} 修订版` : '新增作答'}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            {([
              { k: 'single', label: '单题' },
              { k: 'paper', label: '套卷' },
            ] as Array<{ k: AnswerMode; label: string }>).map((it) => (
              <button
                key={it.k}
                onClick={() => setMode(it.k)}
                className={`px-3 py-1.5 rounded-lg text-sm ${mode === it.k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
              >
                {it.label}
              </button>
            ))}
            <span className="text-xs text-slate-400 self-center">套卷逐题记题型，不拆成多条记录</span>
          </div>

          <div>
            <label className="label">题型 ★</label>
            <select className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
              {SHENLUN_QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="col-span-2 sm:col-span-1">
              <label className="label">试卷来源 ★</label>
              <input
                className="input"
                value={paperSource}
                onChange={(e) => setPaperSource(e.target.value)}
                placeholder="如 2023 国考副省级"
              />
            </div>
            <div>
              <label className="label">年份 / 卷别</label>
              <input className="input" value={paperYear} onChange={(e) => setPaperYear(e.target.value)} placeholder="如 2023 副省级" />
            </div>
            {!isPaper && (
              <div>
                <label className="label">题号 ★</label>
                <input className="input" value={questionNo} onChange={(e) => setQuestionNo(e.target.value)} placeholder="如 1 / 第三题" />
              </div>
            )}
            <div>
              <label className="label">作答时间 ★</label>
              <input
                className="input"
                type="datetime-local"
                value={answeredAt}
                onChange={(e) => setAnsweredAt(e.target.value)}
              />
            </div>
          </div>

          {isPaper && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="label">总题数</label>
                <input className="input" type="number" min={0} value={paperQuestionCount} onChange={(e) => setPaperQuestionCount(e.target.value)} placeholder="默认=分题数" />
              </div>
              <div>
                <label className="label">整卷时长(分钟)</label>
                <input className="input" type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="如 150" />
              </div>
              <div>
                <label className="label">满分</label>
                <input className="input" type="number" min={0} value={paperFullMark} onChange={(e) => setPaperFullMark(e.target.value)} placeholder="如 100" />
              </div>
              <div>
                <label className="label">得分</label>
                <input className="input" type="number" min={0} value={paperScore} onChange={(e) => setPaperScore(e.target.value)} placeholder="0 到满分" />
              </div>
            </div>
          )}

          {isPaper && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">分题（逐题必填题号 + 题型）★</label>
                <button className="btn-secondary text-xs" onClick={() => setPaperQuestions((prev) => [...prev, emptyQuestionDraft()])}>
                  <PlusCircle size={12} /> 添加一题
                </button>
              </div>
              {paperQuestions.length === 0 ? (
                <div className="text-xs text-amber-600">至少添加一道分题；套卷不再允许「整卷一坨」不拆题。</div>
              ) : (
                <div className="space-y-2">
                  {paperQuestions.map((q, i) => (
                    <div key={i} className="border border-slate-100 rounded p-2 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input className="input w-16" value={q.no} onChange={(e) => updateQuestion(i, { no: e.target.value })} placeholder="题号" />
                        <select
                          className="input w-28"
                          value={q.questionType}
                          onChange={(e) => updateQuestion(i, { questionType: e.target.value })}
                        >
                          {SHENLUN_QUESTION_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <input className="input flex-1 min-w-[120px]" value={q.content} onChange={(e) => updateQuestion(i, { content: e.target.value })} placeholder="作答 / 要点（可空）" />
                        <input className="input w-16" type="number" min={0} value={q.score} onChange={(e) => updateQuestion(i, { score: e.target.value })} placeholder="得分" />
                        <input className="input w-16" type="number" min={0} value={q.fullMark} onChange={(e) => updateQuestion(i, { fullMark: e.target.value })} placeholder="满分" />
                        <button className="btn-ghost text-red-500 shrink-0" onClick={() => setPaperQuestions((prev) => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-slate-400 shrink-0">失分原因：</span>
                        <CauseChips
                          compact
                          value={q.errorCategories}
                          onChange={(next) => updateQuestion(i, { errorCategories: next })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="label">{isPaper ? '整卷备注 / 作答补充（选填）' : '作答内容'}</label>
            <textarea className="input min-h-[140px]" value={content} onChange={(e) => setContent(e.target.value)} />
            <div className="text-xs text-slate-500 mt-1">{content.length} 字</div>
          </div>

          {!isPaper && (
            <div>
              <label className="label">作答时长(分钟)</label>
              <input className="input" type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="如 25" />
            </div>
          )}

          <div>
            <label className="label">
              {isPaper ? '整卷统一失分原因（选填，分题未选时继承）' : '失分原因（可多选，选填）'}
            </label>
            <CauseChips value={errorCategories} onChange={setErrorCategories} />
            <div className="text-xs text-slate-400 mt-1">不选不影响保存，但会影响错因分析与「题型 × 错因」交叉统计。</div>
          </div>

          <div>
            <label className="label">
              四维评分（0-100，可空）{isPaper ? ' · 整卷评分，分题未单独评分时由各题继承' : ''}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([['points', '要点', dimPoints, setDimPoints], ['structure', '结构', dimStructure, setDimStructure], ['language', '语言', dimLanguage, setDimLanguage], ['logic', '逻辑', dimLogic, setDimLogic]] as const).map(
                ([key, label, value, setter]) => (
                  <div key={key}>
                    <div className="text-xs text-slate-500 mb-1">{label}</div>
                    <input className="input" type="number" min={0} max={100} value={value} onChange={(e) => setter(e.target.value)} placeholder="未评分" />
                  </div>
                ),
              )}
            </div>
            {formError && <div className="text-xs text-red-600 mt-1">{formError}</div>}
          </div>

          <div>
            <label className="label">教师批注 / 评语 (可选)</label>
            <textarea className="input min-h-[70px]" value={teacherFeedback} onChange={(e) => setTeacherFeedback(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={submit} disabled={saving || (!isPaper && !content.trim())}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
