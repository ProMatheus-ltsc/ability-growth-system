import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Users, TrendingUp, AlertOctagon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { MasteryBar } from '../../components/MasteryBar';
import { getAllRecords, findTrainingsByStudent, findGaps } from '../../services/localDB';
import { aggregateBySubject, computeWarnings } from '../../services/analytics';
import type { StudentProfile, TrainingRecord, AbilityGap, WarningItem, GradeLevel } from '../../domain/types';
import { GRADE_LEVEL_LABEL, SUBJECT_LABEL } from '../../domain/types';

interface StudentRollup {
  student: StudentProfile;
  masteryAvg: number;
  totalQuestions: number;
  unresolvedGaps: number;
  lastTrainingDate?: string;
}

export function ClassOverviewPage() {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [rollups, setRollups] = useState<StudentRollup[]>([]);
  const [warnings, setWarnings] = useState<WarningItem[]>([]);
  const [gradeFilter, setGradeFilter] = useState<GradeLevel | 'all'>('all');

  useEffect(() => {
    (async () => {
      const list = await getAllRecords('students');
      setStudents(list);
      const rollupList: StudentRollup[] = [];
      const allWarnings: WarningItem[] = [];
      const allTrainings: TrainingRecord[] = [];
      const allGaps: AbilityGap[] = [];
      for (const s of list) {
        const [tr, g] = await Promise.all([findTrainingsByStudent(s.id), findGaps(s.id)]);
        allTrainings.push(...tr);
        allGaps.push(...g);
        const stats = aggregateBySubject(tr);
        const masteryAvg = stats.length === 0 ? 0 : Math.round(stats.reduce((a, b) => a + b.masteryScore, 0) / stats.length);
        const totalQuestions = stats.reduce((a, b) => a + b.totalQuestions, 0);
        rollupList.push({
          student: s,
          masteryAvg,
          totalQuestions,
          unresolvedGaps: g.filter((it) => it.status === 'unresolved').length,
          lastTrainingDate: tr[0]?.date,
        });
      }
      setRollups(rollupList);
      allWarnings.push(...computeWarnings(list, allTrainings, allGaps));
      setWarnings(allWarnings);
    })();
  }, []);

  const filtered = useMemo(
    () => (gradeFilter === 'all' ? rollups : rollups.filter((r) => r.student.gradeLevel === gradeFilter)),
    [rollups, gradeFilter],
  );

  const activeCount = filtered.filter((r) => r.totalQuestions > 0).length;
  const totalQuestions = filtered.reduce((a, r) => a + r.totalQuestions, 0);
  const avgMastery = filtered.length === 0 ? 0 : Math.round(filtered.reduce((a, r) => a + r.masteryAvg, 0) / filtered.length);
  const highWarnings = warnings.filter((w) => w.level === 'high').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="班级总览仪表盘"
        description="一屏掌握全班训练状态、能力分布、共性短板与预警学生。"
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">学段筛选:</span>
        <button
          className={`px-2 py-1 rounded ${gradeFilter === 'all' ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`}
          onClick={() => setGradeFilter('all')}
        >
          全部
        </button>
        {(Object.keys(GRADE_LEVEL_LABEL) as GradeLevel[]).map((g) => (
          <button
            key={g}
            className={`px-2 py-1 rounded ${gradeFilter === g ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`}
            onClick={() => setGradeFilter(g)}
          >
            {GRADE_LEVEL_LABEL[g]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users size={18} />} label="学生总数" value={filtered.length} tone="blue" />
        <StatCard icon={<TrendingUp size={18} />} label="活跃学生" value={activeCount} tone="emerald" />
        <StatCard icon={<LayoutDashboard size={18} />} label="全班平均掌握度" value={`${avgMastery}%`} tone="slate" />
        <StatCard icon={<AlertOctagon size={18} />} label="高危预警" value={highWarnings} tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">全班能力热力图 (学生 × 学科)</h2>
          {filtered.length === 0 ? (
            <EmptyState icon={Users} title="还没有学生" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left py-1">学生</th>
                    {(Object.keys(SUBJECT_LABEL) as Array<keyof typeof SUBJECT_LABEL>).map((s) => (
                      <th key={s} className="py-1 text-center">
                        {SUBJECT_LABEL[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <HeatRow key={r.student.id} rollup={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">学生一览</h2>
          {filtered.length === 0 ? (
            <EmptyState icon={Users} title="还没有学生" />
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filtered.map((r) => {
                const w = warnings.find((it) => it.studentId === r.student.id);
                return (
                  <div key={r.student.id} className="border border-slate-100 rounded-lg p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        {w && (
                          <span className={`w-2 h-2 rounded-full ${w.level === 'high' ? 'bg-red-500' : w.level === 'attention' ? 'bg-yellow-500' : 'bg-emerald-500'}`}></span>
                        )}
                        <b>{r.student.name}</b>
                        <span className="text-xs text-slate-400 ml-1">{GRADE_LEVEL_LABEL[r.student.gradeLevel]}</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {r.totalQuestions} 题 · 未修复 {r.unresolvedGaps}
                      </span>
                    </div>
                    <MasteryBar score={r.masteryAvg} className="mt-1" />
                    {w && w.level !== 'normal' && (
                      <div className="text-xs text-orange-600 mt-1">⚠ {w.reason}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeatRow({ rollup }: { rollup: StudentRollup }) {
  const [subjectScores, setSubjectScores] = useState<Record<string, number | null>>({});
  useEffect(() => {
    (async () => {
      const tr = await findTrainingsByStudent(rollup.student.id);
      const stats = aggregateBySubject(tr);
      const map: Record<string, number | null> = {};
      for (const k of Object.keys(SUBJECT_LABEL)) {
        const found = stats.find((s) => s.subject === k);
        map[k] = found ? found.masteryScore : null;
      }
      setSubjectScores(map);
    })();
  }, [rollup.student.id]);

  const heatColor = (score: number | null) => {
    if (score === null) return 'bg-slate-100 text-slate-400';
    if (score >= 86) return 'bg-emerald-500 text-white';
    if (score >= 61) return 'bg-emerald-300';
    if (score >= 26) return 'bg-yellow-200';
    return 'bg-red-200';
  };

  return (
    <tr className="border-b border-slate-50">
      <td className="py-1 pr-2">
        <b>{rollup.student.name}</b>
        <div className="text-[10px] text-slate-400">{GRADE_LEVEL_LABEL[rollup.student.gradeLevel]}</div>
      </td>
      {(Object.keys(SUBJECT_LABEL) as Array<keyof typeof SUBJECT_LABEL>).map((s) => (
        <td key={s} className="py-1 px-1 text-center">
          <div className={`inline-block w-10 h-6 rounded text-center leading-6 text-[11px] ${heatColor(subjectScores[s] ?? null)}`}>
            {subjectScores[s] ?? '-'}
          </div>
        </td>
      ))}
    </tr>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone: string }) {
  const toneMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-xl p-3 ${toneMap[tone]}`}>
      <div className="flex items-center gap-2 opacity-80 text-xs">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
