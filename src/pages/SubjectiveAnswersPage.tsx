/**
 * PRD V5.8 §14.4 申论答案版本管理
 * 保留原始答案 → 教师批改 → 二次修改 → 三次重写, 支持前后对比
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { FileText, PlusCircle, Trash2, X, ArrowRight } from 'lucide-react';
import { EmptyState as CoreEmptyState, ResponsiveGrid, StatCard, useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, putRecord, deleteRecord } from '../services/localDB';
import { buildSubjectiveDimensions } from '../services/analytics';
import type { SubjectiveAnswer } from '../domain/types';

type ShenlunOrMianshi = 'shenlun' | 'mianshi';

const DIMENSION_LABEL = {
  points: '要点',
  structure: '结构',
  language: '语言',
  logic: '逻辑',
} as const;

export function SubjectiveAnswersPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [list, setList] = useState<SubjectiveAnswer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [parent, setParent] = useState<SubjectiveAnswer | null>(null);

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
        description="保留原始答案 → 教师批改 → 二次修改 → 三次重写。 系统保存原始答案而非只保存最终答案, 便于比较修改前后能力变化。"
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
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="尚无申论/面试作答"
          description="记录第一次作答, 后续可基于批改建立修订版本"
          action={
            <button className="btn-primary" onClick={openNewChain}>
              <PlusCircle size={16} /> 新增作答
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {grouped.map((chain) => (
            <div key={chain[0].id} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-medium">
                    {chain[0].subject === 'shenlun' ? '申论' : '面试'} · {chain[0].scenario}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{chain[0].date} · 共 {chain.length} 个版本</div>
                </div>
                <button className="btn-secondary text-xs" onClick={() => openRevision(chain[chain.length - 1])}>
                  <ArrowRight size={12} /> 追加修订版
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {chain.map((v) => (
                  <div key={v.id} className="border border-slate-100 rounded p-3 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="badge bg-blue-50 text-blue-700">v{v.version}</span>
                      <button className="btn-ghost text-red-500 text-xs" onClick={() => remove(v.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto text-xs">
                      {v.content}
                    </div>
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
          ))}
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
  const [scenario, setScenario] = useState(parent?.scenario ?? '归纳概括');
  const [content, setContent] = useState('');
  const [duration, setDuration] = useState<number>(25);
  const [teacherFeedback, setTeacherFeedback] = useState('');
  // 四维评分（0-100，可空）
  const [dimPoints, setDimPoints] = useState('');
  const [dimStructure, setDimStructure] = useState('');
  const [dimLanguage, setDimLanguage] = useState('');
  const [dimLogic, setDimLogic] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    if (!content.trim()) return;
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
    setFormError(null);
    const now = new Date().toISOString();
    const record: SubjectiveAnswer = {
      id: uuid(),
      studentId,
      subject,
      scenario,
      date: now.slice(0, 10),
      parentId: parent?.id,
      version: parent ? parent.version + 1 : 1,
      content: content.trim(),
      wordCount: content.trim().length,
      durationMinutes: duration,
      teacherFeedback: teacherFeedback.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      ...(Object.keys(dims).length > 0 ? { dimensionScores: dims } : {}),
    };
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">学科</label>
              <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as ShenlunOrMianshi)}>
                <option value="shenlun">申论</option>
                <option value="mianshi">面试</option>
              </select>
            </div>
            <div>
              <label className="label">场景 / 题型</label>
              <input className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder="例:归纳概括 / 综合分析" />
            </div>
          </div>
          <div>
            <label className="label">作答内容</label>
            <textarea className="input min-h-[180px]" value={content} onChange={(e) => setContent(e.target.value)} />
            <div className="text-xs text-slate-500 mt-1">{content.length} 字</div>
          </div>
          <div>
            <label className="label">作答时长(分钟)</label>
            <input className="input" type="number" min={0} value={duration} onChange={(e) => setDuration(+e.target.value || 0)} />
          </div>
          <div>
            <label className="label">四维评分（0-100，可空）</label>
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
          <button className="btn-primary" onClick={submit} disabled={!content.trim()}>保存</button>
        </div>
      </div>
    </div>
  );
}
