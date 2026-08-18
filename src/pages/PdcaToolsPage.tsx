/**
 * PDCA 自定义工具注册 (PRD V5.8 §30.5)
 * 用户注册自己的常用分析工具, 系统按 PDCA 阶段推荐
 */
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@shared/core';
import { Wrench, PlusCircle, Trash2, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { deleteRecord } from '../services/localDB';
import { listCustomTools, registerCustomTool } from '../services/pdca';
import { PDCA_STAGE_LABEL, type CustomPdcaTool, type PDCAStage } from '../domain/types';

const STAGES: PDCAStage[] = ['p1-define', 'p2-root-cause', 'p3-countermeasure', 'd-execute', 'c-check', 'a-act'];

export function PdcaToolsPage() {
  const { showToast } = useToast();
  const [tools, setTools] = useState<CustomPdcaTool[]>([]);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    setTools(await listCustomTools());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (id: string) => {
    if (!window.confirm('确认删除该工具?')) return;
    await deleteRecord('customTools', id);
    void refresh();
    showToast('已删除', 'info');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="PDCA 自定义工具"
        description="注册你的常用分析工具(名称+链接+适用阶段), 系统会在问题详情页对应阶段推荐。 教师可为学员批量配置。"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <PlusCircle size={16} /> 注册工具
          </button>
        }
      />

      {tools.length === 0 ? (
        <EmptyState icon={Wrench} title="尚无自定义工具" description="内置的根因分析/决策日志/情绪管理已挂在工具箱中, 无需重复注册" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tools.map((t) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    适用阶段: {t.appliesTo.map((s) => PDCA_STAGE_LABEL[s]).join(', ')}
                  </div>
                  <div className="text-xs text-blue-600 truncate mt-1">{t.url}</div>
                  <div className="text-xs text-slate-400 mt-1">嵌入方式: {t.embedType === 'iframe' ? '页内 iframe' : '新窗口跳转'}</div>
                </div>
                <button className="btn-ghost text-red-500" onClick={() => remove(t.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <RegisterForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('工具已注册', 'success');
          }}
        />
      )}
    </div>
  );
}

function RegisterForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [embedType, setEmbedType] = useState<'iframe' | 'link'>('iframe');
  const [appliesTo, setAppliesTo] = useState<Set<PDCAStage>>(new Set());

  const toggle = (s: PDCAStage) => {
    setAppliesTo((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim() || !url.trim() || appliesTo.size === 0) return;
    await registerCustomTool({
      name: name.trim(),
      url: url.trim(),
      appliesTo: Array.from(appliesTo),
      embedType,
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">注册自定义工具</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">工具名称</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如: 5WHY 追问模板 / SWOT 分析器" />
          </div>
          <div>
            <label className="label">工具链接</label>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label className="label">嵌入方式</label>
            <div className="flex gap-2">
              {(['iframe', 'link'] as const).map((v) => (
                <button
                  key={v}
                  className={`px-3 py-1.5 rounded border text-sm ${embedType === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                  onClick={() => setEmbedType(v)}
                >
                  {v === 'iframe' ? '页内 iframe' : '新窗口跳转'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">适用阶段(可多选)</label>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <button
                  key={s}
                  className={`px-2 py-1 rounded border text-xs ${appliesTo.has(s) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                  onClick={() => toggle(s)}
                >
                  {PDCA_STAGE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={submit} disabled={!name.trim() || !url.trim() || appliesTo.size === 0}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
