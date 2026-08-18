/**
 * §29.2 学生 CSV / 表格粘贴批量导入 (PRD V5.8 §29.2 场景一)
 */
import { useMemo, useState } from 'react';
import { Upload, X, CheckCircle2 } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { putRecord } from '../services/localDB';
import {
  GRADE_LEVEL_LABEL,
  SUBJECT_LABEL,
  SUBJECT_MATRIX,
  type GradeLevel,
  type StudentProfile,
  type Subject,
} from '../domain/types';

interface ParsedRow {
  name: string;
  gradeLevel: GradeLevel;
  grade?: string;
  subjects: Subject[];
  group?: string;
  contact?: string;
  errors: string[];
}

export function StudentsBatchImportPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [raw, setRaw] = useState('');
  const [defaultGrade, setDefaultGrade] = useState<GradeLevel>('senior');
  const [defaultGroup, setDefaultGroup] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseRaw(raw, defaultGrade, defaultGroup), [raw, defaultGrade, defaultGroup]);

  const doImport = async () => {
    const valid = parsed.filter((r) => r.errors.length === 0 && r.name);
    if (valid.length === 0) {
      showToast('没有有效数据可导入', 'warning');
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    try {
      for (const r of valid) {
        const student: StudentProfile = {
          id: uuid(),
          name: r.name,
          gradeLevel: r.gradeLevel,
          grade: r.grade,
          subjects: r.subjects,
          group: r.group,
          contact: r.contact,
          createdAt: now,
          updatedAt: now,
        };
        await putRecord('students', student);
      }
      showToast(`已导入 ${valid.length} 名学生`, 'success');
      navigate('/students');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const csv = ['姓名,学段(小学/初中/高中/成年人),年级,学科(逗号分隔:数学/物理/行测/申论/面试),分组,联系方式',
      '张三,高中,高二,数学|物理,高中物理提高班,',
      '李四,成年人,,行测|申论|面试,国考一期,'].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="批量导入学生"
        description="支持 CSV 文件粘贴 / 表格数据粘贴。 顺序: 姓名 · 学段 · 年级 · 学科(| 分隔) · 分组 · 联系方式。"
      />

      <div className="card p-4 flex items-center gap-3 text-sm">
        <button className="btn-secondary" onClick={downloadTemplate}>
          <Upload size={14} /> 下载 CSV 模板
        </button>
        <div className="text-slate-500">
          默认学段:{' '}
          <select
            className="input py-1 max-w-[120px] inline-block"
            value={defaultGrade}
            onChange={(e) => setDefaultGrade(e.target.value as GradeLevel)}
          >
            {(Object.keys(GRADE_LEVEL_LABEL) as GradeLevel[]).map((g) => (
              <option key={g} value={g}>
                {GRADE_LEVEL_LABEL[g]}
              </option>
            ))}
          </select>
        </div>
        <div className="text-slate-500">
          默认分组:{' '}
          <input className="input py-1 max-w-[180px] inline-block" value={defaultGroup} onChange={(e) => setDefaultGroup(e.target.value)} placeholder="选填" />
        </div>
      </div>

      <div className="card p-5">
        <label className="label">粘贴 CSV / 表格数据</label>
        <textarea
          className="input font-mono text-xs min-h-[200px]"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="张三,高中,高二,数学|物理,高中物理提高班,138xxxxxxxx&#10;李四,成年人,,行测|申论|面试,国考一期,"
        />
      </div>

      {parsed.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">预览({parsed.length} 行, 有效 {parsed.filter((r) => r.errors.length === 0).length})</h2>
            <button className="btn-primary" onClick={doImport} disabled={busy}>
              <CheckCircle2 size={14} /> 确认导入
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left py-1 w-24">姓名</th>
                <th className="text-left py-1 w-20">学段</th>
                <th className="text-left py-1 w-16">年级</th>
                <th className="text-left py-1">学科</th>
                <th className="text-left py-1 w-32">分组</th>
                <th className="text-left py-1">错误</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1">{r.name}</td>
                  <td className="py-1">{GRADE_LEVEL_LABEL[r.gradeLevel]}</td>
                  <td className="py-1">{r.grade ?? '—'}</td>
                  <td className="py-1">{r.subjects.map((s) => SUBJECT_LABEL[s]).join(' / ')}</td>
                  <td className="py-1">{r.group ?? '—'}</td>
                  <td className="py-1 text-red-600 text-xs">{r.errors.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button className="btn-ghost" onClick={() => navigate('/students')}>
        <X size={14} /> 取消返回
      </button>
    </div>
  );
}

function parseRaw(raw: string, defaultGrade: GradeLevel, defaultGroup: string): ParsedRow[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];
  const gradeMap: Record<string, GradeLevel> = { 小学: 'primary', 初中: 'junior', 高中: 'senior', 成年人: 'adult', '成年人/公考': 'adult' };
  const subjectMap: Record<string, Subject> = {
    数学: 'math', 物理: 'physics', 行测: 'xingce', 申论: 'shenlun', 面试: 'mianshi',
    语文: 'chinese', 英语: 'english', 化学: 'chemistry', 生物: 'biology',
  };
  for (const line of lines) {
    if (line.startsWith('姓名')) continue;
    const cols = line.split(/[,，\t]/).map((c) => c.trim());
    const [name, gradeStr, grade, subjectsStr, group, contact] = cols;
    const errors: string[] = [];
    if (!name) errors.push('姓名为空');
    const gradeLevel = gradeMap[gradeStr] ?? defaultGrade;
    const subjectTokens = (subjectsStr ?? '').split(/[|/、\s]/).map((s) => s.trim()).filter(Boolean);
    const subjects = subjectTokens.map((t) => subjectMap[t]).filter((s): s is Subject => !!s);
    if (subjects.length === 0) errors.push('学科为空');
    const allowed = SUBJECT_MATRIX[gradeLevel];
    const unmatched = subjects.filter((s) => !allowed.includes(s));
    if (unmatched.length > 0) errors.push(`学段不允许:${unmatched.map((s) => SUBJECT_LABEL[s]).join(', ')}`);
    rows.push({
      name,
      gradeLevel,
      grade: grade || undefined,
      subjects: subjects.filter((s) => allowed.includes(s)),
      group: group || defaultGroup || undefined,
      contact: contact || undefined,
      errors,
    });
  }
  return rows;
}
