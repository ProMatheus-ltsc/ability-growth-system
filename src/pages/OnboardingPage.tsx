import { useState } from 'react';
import { GraduationCap, Users2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAppSession, type Role } from '../hooks/useAppSession';
import { GRADE_LEVEL_LABEL, SUBJECT_LABEL, SUBJECT_MATRIX } from '../domain/types';
import type { GradeLevel, Subject } from '../domain/types';

const GRADE_ORDER: GradeLevel[] = ['primary', 'junior', 'senior', 'adult'];

export function OnboardingPage() {
  const { finishOnboarding } = useAppSession();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>('student');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('adult');
  const [subjects, setSubjects] = useState<Subject[]>(SUBJECT_MATRIX.adult);
  const [busy, setBusy] = useState(false);

  const availableSubjects = SUBJECT_MATRIX[gradeLevel];
  const toggleSubject = (s: Subject) => {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const finish = async () => {
    setBusy(true);
    try {
      await finishOnboarding({
        role,
        gradeLevel,
        subjects: subjects.filter((s) => availableSubjects.includes(s)),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-4 py-10">
      <div className="max-w-2xl mx-auto card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
            {step + 1}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {step === 0 && '选择你的身份'}
              {step === 1 && '选择学段与学科'}
              {step === 2 && '完成初始化'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">5 分钟启动 · 后续所有能力表现都以此为基线</p>
          </div>
        </div>

        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RoleCard
              icon={<GraduationCap size={22} />}
              title="学生 / 学习者"
              desc="记录训练、追踪能力增长，用于自主学习或公考备考"
              active={role === 'student'}
              onClick={() => setRole('student')}
            />
            <RoleCard
              icon={<Users2 size={22} />}
              title="教师 / 教练"
              desc="管理多名学生，诊断能力瓶颈，追踪教学策略效果"
              active={role === 'teacher'}
              onClick={() => setRole('teacher')}
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <div className="label mb-2">学段</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GRADE_ORDER.map((g) => (
                  <button
                    key={g}
                    className={`px-3 py-2 rounded-lg border text-sm text-center ${
                      gradeLevel === g
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
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
              <div className="label mb-2">学科（可多选，按学段自动过滤）</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableSubjects.map((s) => (
                  <button
                    key={s}
                    className={`px-3 py-2 rounded-lg border text-sm text-center ${
                      subjects.includes(s)
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                    onClick={() => toggleSubject(s)}
                  >
                    {SUBJECT_LABEL[s]}
                  </button>
                ))}
              </div>
              {subjects.length === 0 && (
                <p className="text-xs text-red-500 mt-2">请至少选择一个学科</p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <CheckCircle2 size={18} className="text-emerald-500" />
              <span>身份：{role === 'student' ? '学生 / 学习者' : '教师 / 教练'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <CheckCircle2 size={18} className="text-emerald-500" />
              <span>学段：{GRADE_LEVEL_LABEL[gradeLevel]}</span>
            </div>
            <div className="flex items-start gap-2 text-slate-700">
              <CheckCircle2 size={18} className="text-emerald-500 mt-0.5" />
              <span>学科：{subjects.map((s) => SUBJECT_LABEL[s]).join(' / ') || '无'}</span>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 text-sm text-blue-800">
              系统将根据你的学段展示对应的能力标签体系。 首次没有数据时，请到「训练记录」记录一次训练来建立能力基线。
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-100">
          <button
            className="btn-ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            上一步
          </button>
          {step < 2 ? (
            <button
              className="btn-primary"
              disabled={step === 1 && subjects.length === 0}
              onClick={() => setStep((s) => s + 1)}
            >
              下一步 <ArrowRight size={16} />
            </button>
          ) : (
            <button className="btn-primary" onClick={finish} disabled={busy}>
              进入工作台 <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  icon,
  title,
  desc,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-all ${
        active ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
        {icon}
      </div>
      <div className="font-medium text-slate-900">{title}</div>
      <div className="text-xs text-slate-500 mt-1">{desc}</div>
    </button>
  );
}
