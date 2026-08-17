import { useEffect, useMemo, useState } from 'react';
import { Copy, FileJson, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../../components/PageHeader';
import { getAllRecords, putRecord } from '../../services/localDB';
import { generatePrompt, parseAIResponse, toAbilitySnapshots, type ParseReport } from '../../services/aiPrompt';
import { GRADE_LEVEL_LABEL, SUBJECT_LABEL, type ExternalAIAssessment, type GradeLevel, type StudentProfile, type Subject } from '../../domain/types';
import { useAppSession } from '../../hooks/useAppSession';

export function AIAssistPage() {
  const { showToast } = useToast();
  const { prefs } = useAppSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [studentId, setStudentId] = useState<string>('');
  const [subject, setSubject] = useState<Subject>('xingce');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('adult');
  const [scenario, setScenario] = useState('模拟考试-国考行测全卷');
  const [prompt, setPrompt] = useState('');
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<ParseReport | null>(null);

  useEffect(() => {
    void getAllRecords('students').then(setStudents);
  }, []);

  const student = useMemo(() => students.find((s) => s.id === studentId) ?? null, [studentId, students]);

  const buildPrompt = () => {
    const p = generatePrompt({
      student,
      gradeLevel,
      subject,
      scenario,
    });
    setPrompt(p);
    setStep(2);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('提示词已复制,粘贴到 AI 对话窗口即可', 'success');
    } catch {
      showToast('复制失败', 'error');
    }
  };

  const doParse = () => {
    const report = parseAIResponse(raw, { student, gradeLevel, subject, scenario });
    setParsed(report);
    if (report.data) setStep(3);
    else if (report.errors.length > 0) showToast(report.errors[0], 'error');
  };

  const applyImport = async (assessment: ExternalAIAssessment) => {
    const snapshots = toAbilitySnapshots(assessment, { student, gradeLevel, subject, scenario });
    for (const s of snapshots) {
      await putRecord('abilities', s);
    }
    showToast(`已导入 ${snapshots.length} 条能力评估`, 'success');
    setStep(1);
    setRaw('');
    setParsed(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="外部 AI 辅助能力评估"
        description="生成标准提示词 → 粘贴学生答题截图给外部 AI → 系统解析 JSON 并填充学生能力档案。 大幅降低教师手动录入负担。"
      />

      <div className="card p-5">
        <div className="flex items-center gap-2 text-sm font-medium mb-4">
          <StepDot num={1} active={step >= 1} />
          <span>生成提示词</span>
          <span className="flex-1 border-t border-slate-200 mx-2" />
          <StepDot num={2} active={step >= 2} />
          <span>粘贴 AI 结果</span>
          <span className="flex-1 border-t border-slate-200 mx-2" />
          <StepDot num={3} active={step >= 3} />
          <span>预览确认</span>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">学生 (可选)</label>
                <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">本人 / 自用</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">学段</label>
                <select className="input" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value as GradeLevel)}>
                  {Object.entries(GRADE_LEVEL_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">学科</label>
                <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
                  {Object.entries(SUBJECT_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">评估场景</label>
                <input className="input" value={scenario} onChange={(e) => setScenario(e.target.value)} />
              </div>
            </div>
            <button className="btn-primary" onClick={buildPrompt}>
              <Sparkles size={14} /> 生成提示词
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-slate-600">复制以下提示词到外部 AI (ChatGPT/Claude 等), 附上学生答题截图</div>
                <button className="btn-secondary text-sm" onClick={copyPrompt}>
                  <Copy size={14} /> 复制提示词
                </button>
              </div>
              <textarea className="input font-mono text-xs min-h-[240px]" value={prompt} readOnly />
            </div>

            <div>
              <label className="label">粘贴 AI 返回的 JSON</label>
              <textarea
                className="input font-mono text-xs min-h-[200px]"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="{ ... }"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setStep(1)}>上一步</button>
              <button className="btn-primary" onClick={doParse} disabled={!raw.trim()}>
                <FileJson size={14} /> 解析并预览
              </button>
            </div>

            {parsed?.errors && parsed.errors.length > 0 && (
              <div className="text-sm text-red-700 bg-red-50 rounded p-3">
                {parsed.errors.map((e) => (
                  <div key={e}>❌ {e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 3 && parsed?.data && (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              解析成功,识别 {parsed.data.abilities.length} 项能力评估、 {parsed.data.issues.length} 条问题记录。
            </div>

            {parsed.warnings.length > 0 && (
              <div className="text-sm text-yellow-700 bg-yellow-50 rounded p-3">
                <AlertTriangle size={14} className="inline mr-1" />
                {parsed.warnings.map((w) => <div key={w}>⚠ {w}</div>)}
              </div>
            )}

            <div className="border border-slate-100 rounded-lg max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left py-2 px-3">能力点</th>
                    <th className="text-right py-2 px-3 w-20">掌握度</th>
                    <th className="text-right py-2 px-3 w-16">置信</th>
                    <th className="text-left py-2 px-3">证据</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.data.abilities.map((a) => (
                    <tr key={a.tag_path} className="border-t border-slate-100">
                      <td className="py-2 px-3">{a.tag_path}</td>
                      <td className="py-2 px-3 text-right">
                        <b>{a.mastery_score}</b>
                      </td>
                      <td className="py-2 px-3 text-right">{(a.confidence * 100).toFixed(0)}%</td>
                      <td className="py-2 px-3 text-slate-500">{a.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parsed.data.summary && (
              <div className="text-sm bg-blue-50 rounded p-3">
                <div className="font-medium text-blue-900">主要瓶颈</div>
                <ul className="list-disc list-inside text-blue-800">
                  {parsed.data.summary.main_bottlenecks.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <div className="font-medium text-blue-900 mt-2">优先修复</div>
                <ul className="list-disc list-inside text-blue-800">
                  {parsed.data.summary.priority_fixes.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setStep(2)}>返回修改</button>
              <button className="btn-primary" onClick={() => applyImport(parsed.data!)}>
                <CheckCircle2 size={14} /> 确认填充到能力档案
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        当前身份: {prefs.role === 'teacher' ? '教师' : '学生'} · 学段: {GRADE_LEVEL_LABEL[prefs.gradeLevel]}
      </div>
    </div>
  );
}

function StepDot({ num, active }: { num: number; active: boolean }) {
  return (
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
      }`}
    >
      {num}
    </div>
  );
}
