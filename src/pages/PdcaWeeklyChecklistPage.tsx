/**
 * PDCA 每周检查清单 (PRD V5.8 §30.2)
 * 每周固定时间推送处于 D/C/A 阶段的问题, 强制填写检查结果, 防止闭环断裂
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, CheckCircle2, AlertOctagon, RefreshCw } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { getAllRecords, putRecord } from '../services/localDB';
import { generateWeeklyChecklist } from '../services/pdca';
import { PDCA_STAGE_LABEL, type PDCAProblem, type WeeklyChecklist } from '../domain/types';

export function PdcaWeeklyChecklistPage() {
  const { showToast } = useToast();
  const [checklists, setChecklists] = useState<WeeklyChecklist[]>([]);
  const [problems, setProblems] = useState<PDCAProblem[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [wc, ps] = await Promise.all([getAllRecords('weeklyChecklists'), getAllRecords('pdcaProblems')]);
    setChecklists(wc.sort((a, b) => b.weekStart.localeCompare(a.weekStart)));
    setProblems(ps.filter((p) => p.status === 'active'));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doGenerate = async () => {
    setBusy(true);
    try {
      const wc = await generateWeeklyChecklist(problems);
      showToast(`已生成 ${wc.entries.length} 条本周检查项`, 'success');
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleFilled = async (checklist: WeeklyChecklist, index: number, note: string) => {
    const now = new Date().toISOString();
    const updated: WeeklyChecklist = {
      ...checklist,
      entries: checklist.entries.map((e, i) =>
        i === index ? { ...e, filled: !e.filled, filledAt: !e.filled ? now : undefined, note } : e,
      ),
      updatedAt: now,
    };
    await putRecord('weeklyChecklists', updated);
    void refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="每周检查清单"
        description="每周固定时间推送处于 D/C/A 阶段的问题, 强制填写检查结果。 防止闭环断裂。"
        actions={
          <button className="btn-primary" onClick={doGenerate} disabled={busy}>
            <RefreshCw size={14} /> 生成本周清单
          </button>
        }
      />

      {checklists.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="还没有周检查清单"
          description="点击右上按钮生成本周待检查项(自动扫描 D/C/A 阶段的活跃问题)"
        />
      ) : (
        <div className="space-y-4">
          {checklists.map((wc) => {
            const allFilled = wc.entries.length > 0 && wc.entries.every((e) => e.filled);
            return (
              <div key={wc.id} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium">本周: {wc.weekStart}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      共 {wc.entries.length} 条 · 已填 {wc.entries.filter((e) => e.filled).length}
                    </div>
                  </div>
                  {allFilled && (
                    <span className="badge bg-emerald-50 text-emerald-700">
                      <CheckCircle2 size={12} className="inline mr-1" /> 本周检查已完成
                    </span>
                  )}
                </div>
                {wc.entries.length === 0 ? (
                  <div className="text-sm text-slate-500">本周暂无 D/C/A 阶段问题</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {wc.entries.map((e, i) => (
                      <ChecklistEntry key={e.problemId} entry={e} onToggle={(note) => toggleFilled(wc, i, note)} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChecklistEntry({
  entry,
  onToggle,
}: {
  entry: WeeklyChecklist['entries'][number];
  onToggle: (note: string) => void;
}) {
  const [note, setNote] = useState(entry.note ?? '');
  return (
    <li className="py-2 flex items-start gap-3">
      <button
        className={`w-6 h-6 rounded flex items-center justify-center text-sm ${
          entry.filled ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
        }`}
        onClick={() => onToggle(note)}
      >
        {entry.filled ? '✓' : ''}
      </button>
      <div className="flex-1">
        <Link to={`/pdca/detail?id=${entry.problemId}`} className="text-sm font-medium hover:text-blue-600">
          {entry.problemTitle}
        </Link>
        <div className="text-xs text-slate-500 mt-0.5">{PDCA_STAGE_LABEL[entry.stage]}</div>
        <input
          className="input py-1 text-xs mt-1"
          placeholder="本周实际执行结果 / 差距 / 下一步(可选)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => onToggle(note)}
        />
        {entry.filled && entry.filledAt && (
          <div className="text-xs text-slate-400 mt-1">
            <AlertOctagon size={10} className="inline mr-1" />
            已填于 {entry.filledAt.slice(0, 10)}
          </div>
        )}
      </div>
    </li>
  );
}
