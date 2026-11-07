import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, User } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { MasteryBar } from '../../components/MasteryBar';
import { AbilityRadar } from '../../components/RadarChart';
import { getAllRecords, findGaps, findAbilities, findExams, findTrainingsByStudent, findCorrections } from '../../services/localDB';
import { aggregateBySubject, buildRadarSlices, prioritizeGaps } from '../../services/analytics';
import { GRADE_LEVEL_LABEL, SUBJECT_LABEL, type AbilityGap, type AbilitySnapshot, type Correction, type ExamRecord, type StudentProfile, type Subject, type TrainingRecord } from '../../domain/types';

export function StudentDetailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = params.get('id') ?? '';
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [gaps, setGaps] = useState<AbilityGap[]>([]);
  const [abilities, setAbilities] = useState<AbilitySnapshot[]>([]);
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [subject, setSubject] = useState<Subject>('math');

  useEffect(() => {
    (async () => {
      const all = await getAllRecords('students');
      const s = all.find((it) => it.id === id) ?? null;
      setStudent(s);
      if (s) {
        setSubject(s.subjects[0] ?? 'math');
        setTrainings(await findTrainingsByStudent(id));
        setGaps(await findGaps(id));
        setAbilities(await findAbilities(id));
        setExams(await findExams(id));
        setCorrections(await findCorrections(id));
      }
    })();
  }, [id]);

  const stats = useMemo(() => aggregateBySubject(trainings), [trainings]);
  const radarSlices = useMemo(
    () => (student ? buildRadarSlices(trainings, abilities, student.gradeLevel, subject) : []),
    [trainings, abilities, student, subject],
  );
  const priorityGaps = useMemo(() => prioritizeGaps(gaps.filter((g) => g.status !== 'verified')), [gaps]);

  if (!student) {
    return <EmptyState icon={User} title="未找到该学生" description="可能已被删除" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button className="btn-ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> 返回
        </button>
      </div>

      <PageHeader
        title={`${student.name} · ${GRADE_LEVEL_LABEL[student.gradeLevel]}`}
        description={`学科: ${student.subjects.map((s) => SUBJECT_LABEL[s]).join(' / ')}${student.group ? ` · 分组: ${student.group}` : ''}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">能力画像</h2>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {student.subjects.map((s) => (
              <button
                key={s}
                className={`px-2 py-1 rounded text-sm ${subject === s ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`}
                onClick={() => setSubject(s)}
              >
                {SUBJECT_LABEL[s]}
              </button>
            ))}
          </div>
          {radarSlices.length === 0 ? (
            <EmptyState icon={User} title="暂无雷达数据" />
          ) : (
            <AbilityRadar slices={radarSlices} height={280} />
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">各学科掌握度</h2>
          {stats.length === 0 ? (
            <EmptyState icon={User} title="尚未记录训练" />
          ) : (
            <div className="space-y-3">
              {stats.map((s) => (
                <div key={s.subject} className="flex items-center gap-3">
                  <span className="w-16 text-sm text-slate-700">{SUBJECT_LABEL[s.subject]}</span>
                  <MasteryBar score={s.masteryScore} className="flex-1" />
                  <span className="text-xs text-slate-400 w-24 text-right">
                    {s.totalQuestions} 题 · 错 {s.totalErrors}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">未修复能力缺口 (Top 5)</h2>
        {priorityGaps.length === 0 ? (
          <EmptyState icon={User} title="当前没有未修复的能力缺口" />
        ) : (
          <div className="space-y-2">
            {priorityGaps.slice(0, 5).map((g) => (
              <div key={g.id} className="border border-slate-100 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{g.abilityPath.split('/').slice(-1)[0]}</span>
                  <span className="badge bg-slate-100 text-slate-600">{SUBJECT_LABEL[g.subject]}</span>
                  <span className="badge bg-red-50 text-red-600">复现 {g.occurrenceCount} 次</span>
                </div>
                {g.suggestion && <div className="text-xs text-slate-600 mt-1">💡 {g.suggestion}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* V5.11 Bug #027 修复:学生档案 7 组件 · 第 6 · 能力基线 */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">能力基线(首次训练建立)</h2>
        {trainings.length === 0 ? (
          <EmptyState icon={User} title="尚未建立基线" description="首次训练录入后自动生成能力基线" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {(() => {
              const first = trainings[trainings.length - 1];
              const rate = first.totalQuestions === 0 ? 0 : Math.round(((first.totalQuestions - first.errorCount) / first.totalQuestions) * 100);
              return (
                <>
                  <div className="p-3 rounded bg-blue-50">
                    <div className="text-xs text-slate-500">基线日期</div>
                    <div className="font-semibold text-slate-800 mt-1">{first.date}</div>
                  </div>
                  <div className="p-3 rounded bg-blue-50">
                    <div className="text-xs text-slate-500">学科·模块</div>
                    <div className="font-semibold text-slate-800 mt-1">
                      {SUBJECT_LABEL[first.subject]} · {first.module}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-blue-50">
                    <div className="text-xs text-slate-500">基线正确率</div>
                    <div className="font-semibold text-slate-800 mt-1">{rate}%</div>
                  </div>
                  <div className="p-3 rounded bg-blue-50">
                    <div className="text-xs text-slate-500">题量</div>
                    <div className="font-semibold text-slate-800 mt-1">
                      {first.totalQuestions} 题 · 错 {first.errorCount}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* V5.11 Bug #027 修复:学生档案 7 组件 · 第 7 · 训练历史时间线 */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">训练历史时间线(最近 10 次)</h2>
        {trainings.length === 0 ? (
          <EmptyState icon={User} title="尚无训练记录" />
        ) : (
          <div className="space-y-2">
            {trainings.slice(0, 10).map((t) => {
              const rate = t.totalQuestions === 0 ? 0 : Math.round(((t.totalQuestions - t.errorCount) / t.totalQuestions) * 100);
              return (
                <div key={t.id} className="flex items-center gap-3 text-sm border-l-2 border-blue-300 pl-3">
                  <span className="text-xs text-slate-400 w-20">{t.date}</span>
                  <span className="text-slate-700 flex-1">
                    {SUBJECT_LABEL[t.subject]} · {t.module}
                    {t.isUnfamiliar && <span className="badge bg-amber-100 text-amber-700 ml-2 text-[10px]">陌生题</span>}
                  </span>
                  <span className="text-xs font-semibold text-slate-600 w-16 text-right">{rate}%</span>
                  <span className="text-xs text-slate-400 w-20 text-right">
                    {t.totalQuestions}/{t.errorCount}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">历次测验诊断</h2>
          {exams.length === 0 ? (
            <EmptyState icon={User} title="尚无测验记录" />
          ) : (
            <ul className="space-y-2 text-sm">
              {exams.slice(0, 6).map((e) => (
                <li key={e.id} className="border-b border-slate-100 pb-2">
                  <div className="flex items-center justify-between">
                    <span>{e.date} · {SUBJECT_LABEL[e.subject]} · {e.scenario}</span>
                    <span className="text-xs text-slate-500">
                      正确率 {Math.round(((e.totalQuestions - e.totalErrors) / e.totalQuestions) * 100)}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{e.diagnosis}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">教师批注 / 评价</h2>
          {corrections.length === 0 ? (
            <EmptyState icon={User} title="尚未收到批注" />
          ) : (
            <ul className="space-y-2 text-sm">
              {corrections.slice(0, 6).map((c) => (
                <li key={c.id} className="border-b border-slate-100 pb-2">
                  <div>{c.date} · {SUBJECT_LABEL[c.subject]} · {c.scenario}</div>
                  <div className="text-xs text-slate-600 mt-1">{c.suggestion}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
