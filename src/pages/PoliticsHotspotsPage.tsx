/**
 * §27 A 类 AI 接入 - 时政热点素材整理(按月三科映射)
 */
import { useEffect, useState } from 'react';
import { Copy, FileJson, Newspaper, Trash2 } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { deleteRecord } from '../services/localDB';
import {
  buildPoliticsHotspotPrompt,
  parsePoliticsHotspotResponse,
  importPoliticsHotspots,
  listPoliticsHotspots,
} from '../services/aiTypeAServices';
import type { PoliticsHotspot } from '../domain/types';

export function PoliticsHotspotsPage() {
  const { showToast } = useToast();
  const [yearMonth, setYearMonth] = useState(new Date().toISOString().slice(0, 7));
  const [prompt, setPrompt] = useState('');
  const [raw, setRaw] = useState('');
  const [list, setList] = useState<PoliticsHotspot[]>([]);

  useEffect(() => {
    void listPoliticsHotspots().then(setList);
  }, []);

  const build = () => setPrompt(buildPoliticsHotspotPrompt(yearMonth));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('已复制', 'success');
    } catch {
      showToast('复制失败', 'error');
    }
  };

  const doImport = async () => {
    const data = parsePoliticsHotspotResponse(raw);
    if (!data) {
      showToast('JSON 解析失败', 'error');
      return;
    }
    const count = await importPoliticsHotspots(data);
    showToast(`已导入 ${count} 条时政素材`, 'success');
    void listPoliticsHotspots().then(setList);
  };

  const remove = async (id: string) => {
    if (!window.confirm('确认删除?')) return;
    await deleteRecord('politicsHotspots', id);
    void listPoliticsHotspots().then(setList);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="时政热点素材中心(A 类)"
        description="按月整理时政热点, 每条同时给出行测常识 / 申论素材 / 面试综合分析三科的映射。 A 类接入。"
      />

      <div className="card p-5">
        <div className="grid grid-cols-2 gap-3 max-w-md mb-3">
          <div>
            <label className="label">年月</label>
            <input className="input" type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" onClick={build}>
          生成 AI 提示词
        </button>
      </div>

      {prompt && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">提示词</h2>
            <button className="btn-secondary text-sm" onClick={copy}>
              <Copy size={14} /> 复制
            </button>
          </div>
          <textarea className="input font-mono text-xs min-h-[180px]" readOnly value={prompt} />
          <div className="mt-3">
            <label className="label">粘贴 AI 返回的 JSON</label>
            <textarea className="input font-mono text-xs min-h-[160px]" value={raw} onChange={(e) => setRaw(e.target.value)} />
          </div>
          <div className="flex justify-end mt-3">
            <button className="btn-primary" onClick={doImport} disabled={!raw.trim()}>
              <FileJson size={14} /> 导入素材
            </button>
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Newspaper size={16} /> 素材库
        </h2>
        {list.length === 0 ? (
          <EmptyState icon={Newspaper} title="尚无时政素材" />
        ) : (
          <div className="space-y-2">
            {list.map((h) => (
              <div key={h.id} className="border border-slate-100 rounded p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="badge bg-slate-100 text-slate-600 mr-2">{h.yearMonth}</span>
                    <b>{h.title}</b>
                  </div>
                  <button className="btn-ghost text-red-500 text-xs" onClick={() => remove(h.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="text-xs text-slate-600 mt-1">{h.summary}</div>
                {(h.mappedToXingce || h.mappedToShenlun || h.mappedToMianshi) && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    {h.mappedToXingce && (
                      <div className="bg-blue-50 rounded p-2 text-blue-800">
                        <b>行测常识:</b> {h.mappedToXingce}
                      </div>
                    )}
                    {h.mappedToShenlun && (
                      <div className="bg-emerald-50 rounded p-2 text-emerald-800">
                        <b>申论素材:</b> {h.mappedToShenlun}
                      </div>
                    )}
                    {h.mappedToMianshi && (
                      <div className="bg-orange-50 rounded p-2 text-orange-800">
                        <b>面试综合分析:</b> {h.mappedToMianshi}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
