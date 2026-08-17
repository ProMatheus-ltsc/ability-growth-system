import { useEffect, useMemo, useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import { RadarChart, Radar, PolarAngleAxis, PolarGrid, ResponsiveContainer, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { getAllRecords, findTrainingsByStudent } from '../../services/localDB';
import { aggregateBySubject } from '../../services/analytics';
import { SUBJECT_LABEL } from '../../domain/types';
import type { StudentProfile, TrainingRecord } from '../../domain/types';

interface RollupRow {
  student: StudentProfile;
  bySubject: Record<string, number>;
  totalQuestions: number;
  errorRate: number;
}

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export function StudentComparePage() {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rollups, setRollups] = useState<RollupRow[]>([]);

  useEffect(() => {
    void getAllRecords('students').then(setStudents);
  }, []);

  useEffect(() => {
    (async () => {
      const rows: RollupRow[] = [];
      for (const sid of selected) {
        const student = students.find((s) => s.id === sid);
        if (!student) continue;
        const trs: TrainingRecord[] = await findTrainingsByStudent(sid);
        const stats = aggregateBySubject(trs);
        const bySubject: Record<string, number> = {};
        for (const s of stats) bySubject[s.subject] = s.masteryScore;
        const totalQuestions = stats.reduce((a, b) => a + b.totalQuestions, 0);
        const totalErrors = stats.reduce((a, b) => a + b.totalErrors, 0);
        rows.push({
          student,
          bySubject,
          totalQuestions,
          errorRate: totalQuestions === 0 ? 0 : totalErrors / totalQuestions,
        });
      }
      setRollups(rows);
    })();
  }, [selected, students]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  const radarData = useMemo(() => {
    const subjectKeys = Object.keys(SUBJECT_LABEL) as Array<keyof typeof SUBJECT_LABEL>;
    return subjectKeys.map((s) => {
      const row: Record<string, unknown> = { subject: SUBJECT_LABEL[s] };
      rollups.forEach((r, i) => {
        row[r.student.name] = r.bySubject[s] ?? 0;
        row[`${r.student.name}-color`] = COLORS[i % COLORS.length];
      });
      return row;
    });
  }, [rollups]);

  const barData = useMemo(
    () =>
      rollups.map((r) => ({
        name: r.student.name,
        累计题量: r.totalQuestions,
        错题率: +(r.errorRate * 100).toFixed(1),
      })),
    [rollups],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="学生对比分析"
        description="选择 2-5 位学生，对比其能力雷达、进步速度、训练投入。"
      />

      <div className="card p-4">
        <div className="text-sm text-slate-600 mb-2">选择学生 (最多 5 位, 已选 {selected.length})</div>
        <div className="flex flex-wrap gap-2">
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                selected.includes(s.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {rollups.length < 2 ? (
        <EmptyState icon={GitCompareArrows} title="请至少选择 2 位学生" description="用于横向对比" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="font-semibold mb-3">能力雷达对比</h2>
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#cbd5e1" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                {rollups.map((r, i) => (
                  <Radar
                    key={r.student.id}
                    name={r.student.name}
                    dataKey={r.student.name}
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.2}
                  />
                ))}
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold mb-3">训练投入 vs 错题率</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="累计题量" fill="#2563eb" />
                <Bar yAxisId="right" dataKey="错题率" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
