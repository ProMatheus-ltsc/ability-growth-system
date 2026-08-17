import { useEffect, useState } from 'react';
import { useToast } from '@shared/core';
import { Download, Upload, Trash2, RefreshCw } from 'lucide-react';
import { useAppSession, type Role } from '../hooks/useAppSession';
import { PageHeader } from '../components/PageHeader';
import { clearAllBusinessData, exportSnapshot, importSnapshot, type ExportedSnapshot } from '../services/localDB';
import {
  GRADE_LEVEL_LABEL,
  SUBJECT_LABEL,
  SUBJECT_MATRIX,
  type GradeLevel,
  type Subject,
} from '../domain/types';

export function SettingsPage() {
  const { prefs, setPrefs } = useAppSession();
  const { showToast } = useToast();

  const [gradeLevel, setGradeLevel] = useState<GradeLevel>(prefs.gradeLevel);
  const [subjects, setSubjects] = useState<Subject[]>(prefs.subjects);
  const [role, setRole] = useState<Role>(prefs.role);

  useEffect(() => {
    setGradeLevel(prefs.gradeLevel);
    setSubjects(prefs.subjects);
    setRole(prefs.role);
  }, [prefs]);

  const saveProfile = async () => {
    await setPrefs({
      role,
      gradeLevel,
      subjects: subjects.filter((s) => SUBJECT_MATRIX[gradeLevel].includes(s)),
    });
    showToast('偏好已保存', 'success');
  };

  const doExport = async () => {
    const data = await exportSnapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ability-growth-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出到本地', 'success');
  };

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as ExportedSnapshot;
        await importSnapshot(data, 'merge');
        showToast('已导入 (合并模式)', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : '导入失败', 'error');
      }
    };
    input.click();
  };

  const doClear = async () => {
    if (!window.confirm('确认清空所有本地训练/能力/复盘/学生数据？此操作不可撤销')) return;
    await clearAllBusinessData();
    showToast('已清空本地业务数据', 'warning');
  };

  const availableSubjects = SUBJECT_MATRIX[gradeLevel];
  const toggleSubject = (s: Subject) =>
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <div className="space-y-5">
      <PageHeader title="设置" description="个人偏好、数据导入导出、危险操作。" />

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">身份与学段</h2>
        <div>
          <div className="label">身份</div>
          <div className="flex items-center gap-2">
            {(['student', 'teacher'] as Role[]).map((r) => (
              <button
                key={r}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  role === r ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
                onClick={() => setRole(r)}
              >
                {r === 'student' ? '学生 / 学习者' : '教师 / 教练'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="label">学段</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(GRADE_LEVEL_LABEL) as GradeLevel[]).map((g) => (
              <button
                key={g}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  gradeLevel === g
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600'
                }`}
                onClick={() => {
                  setGradeLevel(g);
                  setSubjects(SUBJECT_MATRIX[g]);
                }}
              >
                {GRADE_LEVEL_LABEL[g]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="label">学科</div>
          <div className="flex flex-wrap gap-2">
            {availableSubjects.map((s) => (
              <button
                key={s}
                className={`px-3 py-1 rounded-full border text-sm ${
                  subjects.includes(s)
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600'
                }`}
                onClick={() => toggleSubject(s)}
              >
                {SUBJECT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button className="btn-primary" onClick={saveProfile}>
            <RefreshCw size={16} /> 保存偏好
          </button>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">数据管理</h2>
        <p className="text-sm text-slate-500">
          本系统数据默认存储在浏览器 IndexedDB (Local-First)。 云端备份请到「云端同步」页面配置 Cloudflare D1。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={doExport}>
            <Download size={16} /> 导出本地数据 (JSON)
          </button>
          <button className="btn-secondary" onClick={doImport}>
            <Upload size={16} /> 从 JSON 导入 (合并)
          </button>
          <button
            className="btn-secondary text-red-600 border-red-200 hover:bg-red-50"
            onClick={doClear}
          >
            <Trash2 size={16} /> 清空本地数据
          </button>
        </div>
      </div>
    </div>
  );
}
