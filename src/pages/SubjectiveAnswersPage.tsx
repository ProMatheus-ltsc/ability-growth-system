/**
 * PRD V5.8 §14.4 申论答案版本管理
 * 保留原始答案 → 教师批改 → 二次修改 → 三次重写, 支持前后对比
 *
 * 2026-11-09 录入收敛：申论分「单题 / 套卷」两种模式，套卷一次录入
 * （卷名、年份、总题数、时长、满分得分、四维评分、可选分题），
 * 直接作为一条 subjectiveAnswers 记录进入申论掌握度统计，无需再去训练记录录一遍。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { FileText, PlusCircle, Trash2, X, ArrowRight } from 'lucide-react';
import { EmptyState as CoreEmptyState, ResponsiveGrid, StatCard, useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, putRecord, deleteRecord } from '../services/localDB';
import { buildSubjectiveComposition, buildSubjectiveDimensions } from '../services/analytics';
import type { SubjectiveAnswer, SubjectivePaperQuestion } from '../domain/types';

type ShenlunOrMianshi = 'shenlun' | 'mianshi';
type AnswerMode = 'single' | 'paper';
type ModeFilter = 'all' | AnswerMode;

const DIMENSION_LABEL = {
  points: '要点',
  structure: '结构',
  language: '语言',
  logic: '逻辑',
} as const;

/** 老记录没有 mode 字段，一律按单题读 */
const modeOf = (a: SubjectiveAnswer): AnswerMode => (a.mode === 'paper' ? 'paper' : 'single');

export function SubjectiveAnswersPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [list, setList] = useState<SubjectiveAnswer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [parent, setParent] = useState<SubjectiveAnswer | null>(null);
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');

  const refresh = useCallback(async () => {
    const all = await getAllRecords('subjectiveAnswers');
    setList(all.filter((r) => (prefs.currentStudentId ? r.studentId === prefs.currentStudentId : true)));
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    // 按 rootId 分组, 每组按 version 排序
    const rootMap = new Map<string, SubjectiveAnswer[]>();
    const rootOf = (a: SubjectiveAnswer): string => {
      let cur = a;
      while (cur.parentId) {
        const parent = list.find((x) => x.id === cur.parentId);
        if (!parent) break;
        cur = parent;
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

  const composition = useMemo(() => buildSubjectiveComposition(list), [list]);
  const visibleChains = useMemo(
    () => (modeFilter === 'all' ? grouped : grouped.filter((chain) => modeOf(chain[0]) === modeFilter)),
    [grouped, modeFilter],
  );

  const remove = async (id: string) => {
    if (!window.confirm('确认删除该作答?链上的所有版本会一并删除')) return;
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

  const openRevision = (p: SubjectiveAnswer) => {
    setParent(p);
    setShowForm(true);
  };

  const dimensionSummary = useMemo(() => buildSubjectiveDimensions(list), [list]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="申论作答版本管理"
        description="单题与套卷都只在这里录一次：保留原始答案 → 教师批改 → 二次修改 → 三次重写。套卷可一次录入卷名、得分与四维评分，直接进入申论掌握度统计。"
        actions={
          <button className="btn-primary" onClick={openNewChain}>
            <PlusCircle size={16} /> 新增作答
          </button>
        }
      />

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">四维评分汇总</h2>
          <span className="text-xs text-slate-400">
            样本 {dimensionSummary.samples} 条（0-100）
          </span>
        </div>
        {dimensionSummary.samples === 0 ? (
          <CoreEmptyState title="暂无四维评分" description="在录入作答时填写要点 / 结构 / 语言 / 逻辑后展示汇总" />
        ) : (
          <>
            <ResponsiveGrid minItemWidth="140px" gap="0.5rem">
              {(Object.keys(DIMENSION_LABEL) as Array<keyof typeof DIMENSION_LABEL>).map((key) => (
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
                最弱维度：
                <b className="text-orange-600">
                  {DIMENSION_LABEL[dimensionSummary.weakest as keyof typeof DIMENSION_LABEL]}
                </b>
              </div>
            )}
          </>
        )}
        <div className="text-xs text-slate-500 mt-3 leading-relaxed">
          作答构成：单题 <b className="text-slate-700">{composition.singleCount}</b> 次 · 套卷{' '}
          <b className="text-slate-700">{composition.paperCount}</b> 份（套卷按「份」计，不拆成单题参与计数）；
          四维样本中单题 {composition.singleRated} / 套卷 {composition.paperRated}，缺失维度分不计入均值。
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { k: 'all', label: `全部 ${grouped.length}` },
            { k: 'single', label: `单题 ${composition.singleCount}` },
            { k: 'paper', label: `套卷 ${composition.paperCount}` },
          ] as Array<{ k: ModeFilter; label: string }>
        ).map((it) => (
          <button
            key={it.k}
            onClick={() => setModeFilter(it.k)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              modeFilter === it.k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>

      {visibleChains.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={grouped.length === 0 ? '尚无申论/面试作答' : '该类型下暂无作答'}
          description="记录第一次作答, 后续可基于批改建立修订版本"
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
                        {head.subject === 'shenlun' ? '申论' : '面试'} ·{' '}
                        {isPaper ? head.paperTitle || head.scenario : head.scenario}
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
                  <button className="btn-secondary text-xs shrink-0" onClick={() => openRevision(chain[chain.length - 1])}>
                    <ArrowRight size={12} /> 追加修订版
                  </button>
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
                            {[v.paperTitle, v.paperYear].filter(Boolean).join(' · ') || '未命名套卷'}
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
                                <span key={q.no} className="badge bg-slate-100 text-slate-600">
                                  第 {q.no} 题
                                  {q.score !== undefined ? ` ${q.score}${q.fullMark !== undefined ? `/${q.fullMark}` : ''} 分` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {v.content && !v.content.startsWith('套卷：') && (
                            <div className="text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto text-xs mt-1">
                              {v.content}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto text-xs">
                          {v.content}
                        </div>
                      )}
                      <div className="text-xs text-slate-500 mt-2">
                        {v.wordCount ?? v.content.length} 字
                        {v.durationMinutes ? ` · ${v.durationMinutes} 分钟` : ''}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(Object.keys(DIMENSION_LABEL) as Array<keyof typeof DIMENSION_LABEL>).map((key) => (
                          <span key={key} className="badge bg-slate-100 text-slate-600">
                            {DIMENSION_LABEL[key]} {v.dimensionScores?.[key] ?? '未评分'}
                          </span>
                        ))}
                      </div>
                      {v.scoreDims && v.scoreDims.length > 0 && (
                        <div className="text-xs text-orange-600 mt-1">
                          {v.scoreDims.map((d) => `${d.label} ${'★'.repeat(d.stars)}`).join(' · ')}
                        </div>
                      )}
                      {v.teacherFeedback && (
                        <div className="text-xs text-emerald-700 mt-1">
                          <b>教师评语:</b> {v.teacherFeedback}
                        </div>
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

interface PaperQuestionDraft {
  no: string;
  content: string;
  score: string;
  fullMark: string;
}

const emptyQuestionDraft = (): PaperQuestionDraft => ({ no: '', content: '', score: '', fullMark: '' });

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
  const [subject, setSubject] = useState<ShenlunOrMianshi>(parent?.subject ?? 'shenlun');
  const [mode, setMode] = useState<AnswerMode>(parent ? modeOf(parent) : 'single');
  const [scenario, setScenario] = useState(parent?.scenario ?? '归纳概括');
  const [content, setContent] = useState('');
  const [duration, setDuration] = useState<string>(parent?.durationMinutes !== undefined ? String(parent.durationMinutes) : '');
  const [teacherFeedback, setTeacherFeedback] = useState('');
  // 套卷字段（新建时为空；追加修订时沿用卷面结构，但分数/评分留给新版本）
  const [paperTitle, setPaperTitle] = useState(parent?.paperTitle ?? '');
  const [paperYear, setPaperYear] = useState(parent?.paperYear ?? '');
  const [paperQuestionCount, setPaperQuestionCount] = useState(
    parent?.paperQuestionCount !== undefined ? String(parent.paperQuestionCount) : '',
  );
  const [paperFullMark, setPaperFullMark] = useState(
    parent?.paperFullMark !== undefined ? String(parent.paperFullMark) : '',
  );
  const [paperScore, setPaperScore] = useState('');
  const [paperQuestions, setPaperQuestions] = useState<PaperQuestionDraft[]>(
    parent?.paperQuestions?.map((q) => ({
      no: q.no,
      content: q.content ?? '',
      score: q.score !== undefined ? String(q.score) : '',
      fullMark: q.fullMark !== undefined ? String(q.fullMark) : '',
    })) ?? [],
  );
  // 四维评分（0-100，可空）
  const [dimPoints, setDimPoints] = useState('');
  const [dimStructure, setDimStructure] = useState('');
  const [dimLanguage, setDimLanguage] = useState('');
  const [dimLogic, setDimLogic] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isPaper = subject === 'shenlun' && mode === 'paper';

  /** 数值输入解析：空串返回 null，非法返回 NaN */
  const parseOptional = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));

  const changeSubject = (next: ShenlunOrMianshi) => {
    setSubject(next);
    // 面试没有套卷形态，切过去自动回单题
    if (next !== 'shenlun') setMode('single');
  };

  const updateQuestion = (index: number, patch: Partial<PaperQuestionDraft>) => {
    setPaperQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const submit = async () => {
    setFormError(null);
    // 单题必须有作答内容；套卷必须有卷名（内容可留空）
    if (!isPaper && !content.trim()) return;
    if (isPaper && !paperTitle.trim()) {
      setFormError('请填写卷名或来源（如「2023 国考副省级」）');
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
    // 分题：填了任一字段就必须有题号；得分不得大于该题满分
    const questions: SubjectivePaperQuestion[] = [];
    for (const q of paperQuestions) {
      const touched = q.no.trim() || q.content.trim() || q.score.trim() || q.fullMark.trim();
      if (!touched) continue;
      if (!q.no.trim()) {
        setFormError('分题记录需要填写题号（其余字段可留空）');
        return;
      }
      const qScore = parseOptional(q.score);
      const qFull = parseOptional(q.fullMark);
      if (qScore !== null && (!Number.isFinite(qScore) || qScore < 0)) {
        setFormError(`第 ${q.no} 题得分不得小于 0`);
        return;
      }
      if (qFull !== null && (!Number.isFinite(qFull) || qFull <= 0)) {
        setFormError(`第 ${q.no} 题满分须大于 0`);
        return;
      }
      if (qScore !== null && qFull !== null && qScore > qFull) {
        setFormError(`第 ${q.no} 题得分不得大于该题满分`);
        return;
      }
      questions.push({
        no: q.no.trim(),
        ...(q.content.trim() ? { content: q.content.trim() } : {}),
        ...(qScore !== null ? { score: qScore } : {}),
        ...(qFull !== null ? { fullMark: qFull } : {}),
      });
    }
    const rawDims: Array<[keyof typeof DIMENSION_LABEL, string]> = [
      ['points', dimPoints],
      ['structure', dimStructure],
      ['language', dimLanguage],
      ['logic', dimLogic],
    ];
    const dims: NonNullable<SubjectiveAnswer['dimensionScores']> = {};
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
    const record: SubjectiveAnswer = {
      id: uuid(),
      studentId,
      subject,
      scenario: isPaper ? paperTitle.trim() : scenario,
      date: now.slice(0, 10),
      parentId: parent?.id,
      version: parent ? parent.version + 1 : 1,
      // 套卷允许不写作答正文；为空时存一个可读标题，避免列表出现空白行
      content: trimmedContent || (isPaper ? `套卷：${paperTitle.trim()}` : ''),
      createdAt: now,
      updatedAt: now,
      ...(trimmedContent ? { wordCount: trimmedContent.length } : {}),
      ...(durationValue !== null ? { durationMinutes: durationValue } : {}),
      ...(teacherFeedback.trim() ? { teacherFeedback: teacherFeedback.trim() } : {}),
      ...(Object.keys(dims).length > 0 ? { dimensionScores: dims } : {}),
    };
    if (subject === 'shenlun') {
      record.mode = isPaper ? 'paper' : 'single';
    }
    if (isPaper) {
      record.mode = 'paper';
      record.paperTitle = paperTitle.trim();
      if (paperYear.trim()) record.paperYear = paperYear.trim();
      if (questionCountValue !== null) record.paperQuestionCount = questionCountValue;
      if (fullMarkValue !== null) record.paperFullMark = fullMarkValue;
      if (scoreValue !== null) record.paperScore = scoreValue;
      if (questions.length > 0) record.paperQuestions = questions;
    }
    await putRecord('subjectiveAnswers', record);
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
          {subject === 'shenlun' && (
            <div className="flex gap-2">
              {(
                [
                  { k: 'single', label: '单题' },
                  { k: 'paper', label: '套卷' },
                ] as Array<{ k: AnswerMode; label: string }>
              ).map((it) => (
                <button
                  key={it.k}
                  onClick={() => setMode(it.k)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    mode === it.k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {it.label}
                </button>
              ))}
              <span className="text-xs text-slate-400 self-center">套卷按一份计，不拆成多道单题</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">学科</label>
              <select className="input" value={subject} onChange={(e) => changeSubject(e.target.value as ShenlunOrMianshi)}>
                <option value="shenlun">申论</option>
                <option value="mianshi">面试</option>
              </select>
            </div>
            {!isPaper && (
              <div>
                <label className="label">场景 / 题型</label>
                <input className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder="例:归纳概括 / 综合分析" />
              </div>
            )}
            {isPaper && (
              <div>
                <label className="label">年份 / 卷别</label>
                <input className="input" value={paperYear} onChange={(e) => setPaperYear(e.target.value)} placeholder="例:2023 副省级" />
              </div>
            )}
          </div>

          {isPaper && (
            <>
              <div>
                <label className="label">卷名 / 来源 ★</label>
                <input
                  className="input"
                  value={paperTitle}
                  onChange={(e) => setPaperTitle(e.target.value)}
                  placeholder="例:2023 国考副省级"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="label">总题数</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={paperQuestionCount}
                    onChange={(e) => setPaperQuestionCount(e.target.value)}
                    placeholder="如 5"
                  />
                </div>
                <div>
                  <label className="label">整卷时长(分钟)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="如 150"
                  />
                </div>
                <div>
                  <label className="label">满分</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={paperFullMark}
                    onChange={(e) => setPaperFullMark(e.target.value)}
                    placeholder="如 100"
                  />
                </div>
                <div>
                  <label className="label">得分</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={paperScore}
                    onChange={(e) => setPaperScore(e.target.value)}
                    placeholder="0 到满分"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="label">{isPaper ? '整卷作答 / 备注（选填）' : '作答内容'}</label>
            <textarea className="input min-h-[140px]" value={content} onChange={(e) => setContent(e.target.value)} />
            <div className="text-xs text-slate-500 mt-1">{content.length} 字</div>
          </div>

          {!isPaper && (
            <div>
              <label className="label">作答时长(分钟)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="如 25"
              />
            </div>
          )}

          {isPaper && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">分题作答（选填，至少填题号）</label>
                <button className="btn-secondary text-xs" onClick={() => setPaperQuestions((prev) => [...prev, emptyQuestionDraft()])}>
                  <PlusCircle size={12} /> 添加一题
                </button>
              </div>
              {paperQuestions.length === 0 ? (
                <div className="text-xs text-slate-400">不填也可以，套卷整体分数与四维评分已足够统计。</div>
              ) : (
                <div className="space-y-2">
                  {paperQuestions.map((q, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                      <input
                        className="input col-span-2"
                        value={q.no}
                        onChange={(e) => updateQuestion(i, { no: e.target.value })}
                        placeholder="题号"
                      />
                      <input
                        className="input col-span-5"
                        value={q.content}
                        onChange={(e) => updateQuestion(i, { content: e.target.value })}
                        placeholder="作答 / 要点（可空）"
                      />
                      <input
                        className="input col-span-2"
                        type="number"
                        min={0}
                        value={q.score}
                        onChange={(e) => updateQuestion(i, { score: e.target.value })}
                        placeholder="得分"
                      />
                      <input
                        className="input col-span-2"
                        type="number"
                        min={0}
                        value={q.fullMark}
                        onChange={(e) => updateQuestion(i, { fullMark: e.target.value })}
                        placeholder="满分"
                      />
                      <button
                        className="btn-ghost text-red-500 col-span-1 justify-self-center"
                        onClick={() => setPaperQuestions((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="label">四维评分（0-100，可空）{isPaper ? ' · 有评分时掌握度以四维为准，不用得分率' : ''}</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <div className="text-xs text-slate-500 mb-1">要点</div>
                <input className="input" type="number" min={0} max={100} value={dimPoints} onChange={(e) => setDimPoints(e.target.value)} placeholder="未评分" />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">结构</div>
                <input className="input" type="number" min={0} max={100} value={dimStructure} onChange={(e) => setDimStructure(e.target.value)} placeholder="未评分" />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">语言</div>
                <input className="input" type="number" min={0} max={100} value={dimLanguage} onChange={(e) => setDimLanguage(e.target.value)} placeholder="未评分" />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">逻辑</div>
                <input className="input" type="number" min={0} max={100} value={dimLogic} onChange={(e) => setDimLogic(e.target.value)} placeholder="未评分" />
              </div>
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
          <button className="btn-primary" onClick={submit} disabled={isPaper ? !paperTitle.trim() : !content.trim()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
