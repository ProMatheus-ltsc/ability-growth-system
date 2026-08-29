/**
 * §27 A 类 AI 接入 - 岗位表解析与硬性条件筛查
 */
import { useState } from 'react';
import { Copy, FileJson, Filter } from 'lucide-react';
import { TableScroll, useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { buildJobParsePrompt, parseJobResponse, importParsedJobsAsRegistrations } from '../services/aiTypeAServices';
import { useAppSession } from '../hooks/useAppSession';
import type { AiJobParseResult } from '../domain/types';

export function AiJobParsePage() {
  const { showToast } = useToast();
  const { prefs } = useAppSession();
  const [batchSourceHint, setSourceHint] = useState('国考 2027 岗位表');
  const [education, setEducation] = useState('本科及以上');
  const [major, setMajor] = useState('不限');
  const [politicalStatus, setPolitical] = useState('中共党员或共青团员');
  const [otherLimits, setOther] = useState('');
  const [prompt, setPrompt] = useState('');
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<AiJobParseResult | null>(null);
  const [onlyPassed, setOnlyPassed] = useState(true);

  const build = () => {
    const p = buildJobParsePrompt({
      batchSourceHint,
      hardFilters: { education, major, politicalStatus, otherLimits },
    });
    setPrompt(p);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('提示词已复制', 'success');
    } catch {
      showToast('复制失败', 'error');
    }
  };

  const doParse = () => {
    const data = parseJobResponse(raw);
    if (!data) {
      showToast('JSON 解析失败, 请检查粘贴内容', 'error');
      return;
    }
    setParsed(data);
    showToast(`识别 ${data.candidates.length} 个岗位`, 'success');
  };

  const doImport = async () => {
    if (!parsed) return;
    const count = await importParsedJobsAsRegistrations(parsed, onlyPassed, prefs.currentStudentId);
    showToast(`已导入 ${count} 个岗位到「公考报考」`, 'success');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI 岗位表解析(A 类)"
        description="将官方岗位表 CSV/文本粘贴给外部 AI, 让 AI 结构化为岗位信息 + 按你的硬性条件筛查通过状态。 A 类接入,仅信息处理不做推理。"
      />

      <div className="card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Filter size={16} /> 硬性筛查条件
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">岗位表来源</label>
            <input className="input" value={batchSourceHint} onChange={(e) => setSourceHint(e.target.value)} />
          </div>
          <div>
            <label className="label">学历要求</label>
            <input className="input" value={education} onChange={(e) => setEducation(e.target.value)} />
          </div>
          <div>
            <label className="label">专业</label>
            <input className="input" value={major} onChange={(e) => setMajor(e.target.value)} />
          </div>
          <div>
            <label className="label">政治面貌</label>
            <input className="input" value={politicalStatus} onChange={(e) => setPolitical(e.target.value)} />
          </div>
          <div className="cq-span-2">
            <label className="label">其他限制</label>
            <input className="input" value={otherLimits} onChange={(e) => setOther(e.target.value)} placeholder='例如: 应届 / 男性 / 服从调剂 / 户籍要求' />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button className="btn-primary" onClick={build}>
            生成 AI 提示词
          </button>
        </div>
      </div>

      {prompt && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">提示词</h2>
            <button className="btn-secondary text-sm" onClick={copy}>
              <Copy size={14} /> 复制
            </button>
          </div>
          <textarea className="input font-mono text-xs min-h-[200px]" readOnly value={prompt} />

          <div className="mt-4">
            <label className="label">粘贴 AI 返回的 JSON</label>
            <textarea className="input font-mono text-xs min-h-[180px]" value={raw} onChange={(e) => setRaw(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className="btn-primary" onClick={doParse} disabled={!raw.trim()}>
              <FileJson size={14} /> 解析并预览
            </button>
          </div>
        </div>
      )}

      {parsed && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">解析结果 ({parsed.candidates.length})</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={onlyPassed} onChange={(e) => setOnlyPassed(e.target.checked)} />
                仅导入通过筛查
              </label>
              <button className="btn-primary text-sm" onClick={doImport}>
                导入到公考报考
              </button>
            </div>
          </div>
          <TableScroll label="解析结果">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left py-1">岗位</th>
                <th className="text-left py-1 w-24">部门</th>
                <th className="text-left py-1 w-16">层级</th>
                <th className="text-left py-1 w-16">招录</th>
                <th className="text-left py-1 w-20">硬性筛查</th>
              </tr>
            </thead>
            <tbody>
              {parsed.candidates.map((c, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1">{c.postName}</td>
                  <td className="py-1">{c.department ?? '—'}</td>
                  <td className="py-1">{c.postLevel ?? '—'}</td>
                  <td className="py-1">{c.headcount ?? '—'}</td>
                  <td className="py-1">
                    {c.hardFilterPassed ? (
                      <span className="badge bg-emerald-50 text-emerald-700">通过</span>
                    ) : (
                      <span className="badge bg-red-50 text-red-600" title={c.filterFailReasons?.join(' · ')}>
                        未通过
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
        </div>
      )}
    </div>
  );
}
