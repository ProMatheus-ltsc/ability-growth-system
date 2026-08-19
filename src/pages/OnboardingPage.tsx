import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { GraduationCap, Users2, ArrowRight, CheckCircle2, Sparkles, Info } from 'lucide-react';
import { useAppSession, type Role } from '../hooks/useAppSession';
import {
  GRADE_LEVEL_LABEL,
  SUBJECT_LABEL,
  SUBJECT_MATRIX,
  TRAINING_TYPE_LABEL,
  type GradeLevel,
  type Subject,
  type TrainingRecord,
  type TrainingType,
} from '../domain/types';
import { getModules } from '../domain/abilityTags';
import { putRecord } from '../services/localDB';
import { deriveGapsFromTraining, deriveSnapshotFromTraining } from '../services/analytics';

const GRADE_ORDER: GradeLevel[] = ['primary', 'junior', 'senior', 'adult'];

interface BaselineDraft {
  subject: Subject;
  module: string;
  trainingType: TrainingType;
  totalQuestions: number;
  errorCount: number;
  durationMinutes: number;
  isUnfamiliar: boolean;
}

/**
 * V5.11 引导流程完全重构:
 * - Bug #001: 教师端跳过学段/学科强制选择,直接完成初始化(教师主要管理多学段学生)
 * - Bug #002: 引导补齐第 4 步"建立能力基线",提示用户完成一次训练以建立 baseline
 * - Bug #003 / #033: 学段切换后学科**不再默认全选**,改为空数组,由用户主动多选
 */
export function OnboardingPage() {
  const { finishOnboarding } = useAppSession();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>('student');
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>('adult');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [baseline, setBaseline] = useState<BaselineDraft | null>(null);
  const [skipBaseline, setSkipBaseline] = useState(false);
  const [busy, setBusy] = useState(false);

  const availableSubjects = SUBJECT_MATRIX[gradeLevel];
  const isTeacher = role === 'teacher';

  // 教师端只需要 2 步(身份 + 完成),学生端 4 步(身份 + 学段学科 + 能力基线 + 完成)
  const totalSteps = isTeacher ? 2 : 4;
  const currentStepIndex = isTeacher ? (step === 0 ? 0 : 1) : step;

  const toggleSubject = (s: Subject) => {
    setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const finish = async () => {
    setBusy(true);
    try {
      await finishOnboarding({
        role,
        gradeLevel: isTeacher ? 'adult' : gradeLevel,
        subjects: isTeacher ? [] : subjects.filter((s) => availableSubjects.includes(s)),
      });

      // V5.11 Bug #002 修复:如用户填写了基线训练,立即保存并派生 gap+快照
      if (!isTeacher && !skipBaseline && baseline) {
        const now = new Date().toISOString();
        const record: TrainingRecord = {
          id: uuid(),
          date: now.slice(0, 10),
          gradeLevel,
          subject: baseline.subject,
          module: baseline.module,
          trainingType: baseline.trainingType,
          totalQuestions: baseline.totalQuestions,
          correctCount: baseline.totalQuestions - baseline.errorCount,
          errorCount: baseline.errorCount,
          durationMinutes: baseline.durationMinutes,
          errorCategories: [],
          isUnfamiliar: baseline.isUnfamiliar,
          note: '初始能力基线',
          createdAt: now,
          updatedAt: now,
        };
        await putRecord('trainings', record);
        const gaps = deriveGapsFromTraining(record, []);
        for (const g of gaps) await putRecord('gaps', g);
        const snapshot = deriveSnapshotFromTraining(record);
        await putRecord('abilities', snapshot);
      }
    } finally {
      setBusy(false);
    }
  };

  const canGoNext = () => {
    if (step === 0) return true;
    if (isTeacher) return true;
    if (step === 1) return subjects.length > 0;
    if (step === 2) return true; // 基线可跳过
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-4 py-10">
      <div className="max-w-2xl mx-auto card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
            {currentStepIndex + 1} / {totalSteps}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{getStepTitle(step, isTeacher)}</h1>
            <p className="text-xs text-slate-500 mt-1">5 分钟启动 · 后续所有能力表现都以此为基线</p>
          </div>
        </div>

        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RoleCard
              icon={<GraduationCap size={22} />}
              title="学生 / 学习者"
              desc="记录训练、追踪能力增长,用于自主学习或公考备考"
              active={role === 'student'}
              onClick={() => setRole('student')}
            />
            <RoleCard
              icon={<Users2 size={22} />}
              title="教师 / 教练"
              desc="管理多名学生,诊断能力瓶颈,追踪教学策略效果"
              active={role === 'teacher'}
              onClick={() => setRole('teacher')}
            />
          </div>
        )}

        {!isTeacher && step === 1 && (
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
                      // Bug #003/#033 修复:切学段清空学科,由用户主动多选
                      setSubjects([]);
                    }}
                  >
                    {GRADE_LEVEL_LABEL[g]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="label mb-2 flex items-center gap-1">
                学科(可多选,请至少选择 1 门)
                <span className="text-xs text-slate-400">· 按学段自动过滤</span>
              </div>
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
                <p className="text-xs text-red-500 mt-2">请至少选择一门学科</p>
              )}
            </div>
          </div>
        )}

        {!isTeacher && step === 2 && (
          <BaselineForm
            gradeLevel={gradeLevel}
            subjects={subjects}
            value={baseline}
            skip={skipBaseline}
            onSkipChange={setSkipBaseline}
            onChange={setBaseline}
          />
        )}

        {((isTeacher && step === 1) || (!isTeacher && step === 3)) && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700">
              <CheckCircle2 size={18} className="text-emerald-500" />
              <span>身份:{isTeacher ? '教师 / 教练' : '学生 / 学习者'}</span>
            </div>
            {!isTeacher && (
              <>
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  <span>学段:{GRADE_LEVEL_LABEL[gradeLevel]}</span>
                </div>
                <div className="flex items-start gap-2 text-slate-700">
                  <CheckCircle2 size={18} className="text-emerald-500 mt-0.5" />
                  <span>学科:{subjects.map((s) => SUBJECT_LABEL[s]).join(' / ') || '无'}</span>
                </div>
                {baseline && !skipBaseline && (
                  <div className="flex items-start gap-2 text-slate-700">
                    <CheckCircle2 size={18} className="text-emerald-500 mt-0.5" />
                    <span>
                      基线:{SUBJECT_LABEL[baseline.subject]} · {baseline.module} · {baseline.totalQuestions} 题错{' '}
                      {baseline.errorCount}
                    </span>
                  </div>
                )}
                {skipBaseline && (
                  <div className="flex items-start gap-2 text-slate-500">
                    <Info size={16} className="mt-0.5" />
                    <span>本次跳过基线;首次训练录入即会自动建立基线</span>
                  </div>
                )}
              </>
            )}
            <div className="p-3 rounded-lg bg-blue-50 text-sm text-blue-800">
              {isTeacher
                ? '教师端将展示班级管理与教学工作模块,每位学生的学段/学科将在添加学生时独立设置。'
                : '系统将根据你的学段展示对应的能力标签体系与学习素养期。 首次训练后即建立能力基线。'}
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
          {(isTeacher ? step < 1 : step < 3) ? (
            <button
              className="btn-primary"
              disabled={!canGoNext()}
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

function getStepTitle(step: number, isTeacher: boolean): string {
  if (step === 0) return '选择你的身份';
  if (isTeacher) return '完成初始化';
  if (step === 1) return '选择学段与学科';
  if (step === 2) return '建立能力基线(可跳过)';
  return '完成初始化';
}

function BaselineForm({
  gradeLevel,
  subjects,
  value,
  skip,
  onSkipChange,
  onChange,
}: {
  gradeLevel: GradeLevel;
  subjects: Subject[];
  value: BaselineDraft | null;
  skip: boolean;
  onSkipChange: (v: boolean) => void;
  onChange: (v: BaselineDraft | null) => void;
}) {
  const primarySubject = subjects[0];
  const moduleOptions = primarySubject ? getModules(gradeLevel, primarySubject) : [];
  const defaultModule = moduleOptions[0] ?? '基础模块';

  const [subject, setSubject] = useState<Subject>(primarySubject ?? 'math');
  const [moduleName, setModuleName] = useState(defaultModule);
  const [trainingType, setTrainingType] = useState<TrainingType>('daily');
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [errorCount, setErrorCount] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [isUnfamiliar, setIsUnfamiliar] = useState(false);

  const currentModules = getModules(gradeLevel, subject);

  useEffect(() => {
    if (!currentModules.includes(moduleName) && currentModules.length > 0) {
      setModuleName(currentModules[0]);
    }
  }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (skip) {
      onChange(null);
      return;
    }
    onChange({ subject, module: moduleName, trainingType, totalQuestions, errorCount, durationMinutes, isUnfamiliar });
  }, [skip, subject, moduleName, trainingType, totalQuestions, errorCount, durationMinutes, isUnfamiliar]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-emerald-50 text-sm text-emerald-800 flex items-start gap-2">
        <Sparkles size={16} className="mt-0.5" />
        <span>
          建议现在填写一次训练作为能力基线。 后续所有能力增长曲线都将以此作为对照。
          {' '}
          <span className="text-emerald-700">
            (只需要填写题数与错题数,其他字段已预填默认值)
          </span>
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
        <input type="checkbox" checked={skip} onChange={(e) => onSkipChange(e.target.checked)} />
        跳过基线,稍后到训练记录页录入
      </label>

      {!skip && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">学科</label>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">知识模块</label>
            {currentModules.length > 0 ? (
              <select className="input" value={moduleName} onChange={(e) => setModuleName(e.target.value)}>
                {currentModules.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" value={moduleName} onChange={(e) => setModuleName(e.target.value)} />
            )}
          </div>
          <div>
            <label className="label">训练类型</label>
            <select
              className="input"
              value={trainingType}
              onChange={(e) => setTrainingType(e.target.value as TrainingType)}
            >
              {(Object.keys(TRAINING_TYPE_LABEL) as TrainingType[])
                .filter((k) => {
                  // Bug #004:实验记录仅物理/化学/生物
                  if (k === 'experiment') {
                    return subject === 'physics' || subject === 'chemistry' || subject === 'biology';
                  }
                  return true;
                })
                .map((k) => (
                  <option key={k} value={k}>
                    {TRAINING_TYPE_LABEL[k]}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">题目数量</label>
            <input
              className="input"
              type="number"
              min={0}
              value={totalQuestions}
              onChange={(e) => setTotalQuestions(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div>
            <label className="label">错题数量 ★</label>
            <input
              className="input"
              type="number"
              min={0}
              max={totalQuestions}
              value={errorCount}
              onChange={(e) => setErrorCount(Math.max(0, Math.min(totalQuestions, Number(e.target.value) || 0)))}
            />
          </div>
          <div>
            <label className="label">用时(分钟)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 col-span-2 mt-1">
            <input type="checkbox" checked={isUnfamiliar} onChange={(e) => setIsUnfamiliar(e.target.checked)} />
            标记为陌生题(用于计算陌生题正确率;基线阶段建议勾选)
          </label>
        </div>
      )}
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
