/**
 * PRD V5.8 §14.4 申论答案版本管理
 * 保留原始答案 → 教师批改 → 二次修改 → 三次重写, 支持前后对比
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { FileText, PlusCircle, Trash2, X, ArrowRight } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, putRecord, deleteRecord } from '../services/localDB';
import type { SubjectiveAnswer } from '../domain/types';

type ShenlunOrMianshi = 'shenlun' | 'mianshi';

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

  const submit = async () => {
    if (!content.trim()) return;
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
