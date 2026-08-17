import { useEffect, useState } from 'react';
import { AlertOctagon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { getAllRecords, findTrainingsByStudent, findGaps } from '../../services/localDB';
import { computeWarnings } from '../../services/analytics';
import type { AbilityGap, StudentProfile, TrainingRecord, WarningItem, WarningLevel } from '../../domain/types';

const LEVEL_COLOR: Record<WarningLevel, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  attention: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const LEVEL_LABEL: Record<WarningLevel, string> = {
  high: '🔴 高危',
  attention: '🟡 关注',
  normal: '🟢 正常',
};

export function WarningPage() {
  const [warnings, setWarnings] = useState<WarningItem[]>([]);
  const [filter, setFilter] = useState<WarningLevel | 'all'>('all');

  useEffect(() => {
    (async () => {
      const students = await getAllRecords('students');
      const trainings: TrainingRecord[] = [];
      const gaps: AbilityGap[] = [];
      for (const s of students) {
        const t = await findTrainingsByStudent(s.id);
        const g = await findGaps(s.id);
        trainings.push(...t);
        gaps.push(...g);
      }
      setWarnings(computeWarnings(students as StudentProfile[], trainings, gaps));
    })();
  }, []);

  const filtered = filter === 'all' ? warnings : warnings.filter((w) => w.level === filter);
  const high = warnings.filter((w) => w.level === 'high').length;
  const attention = warnings.filter((w) => w.level === 'attention').length;
  const normal = warnings.filter((w) => w.level === 'normal').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="预警中心"
        description="自动识别需要教师关注的学生 (长期未训练/能力停滞/退步/回避行为)。 分三级预警。"
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={LEVEL_LABEL.high} value={high} color="text-red-600" />
        <StatCard label={LEVEL_LABEL.attention} value={attention} color="text-yellow-600" />
        <StatCard label={LEVEL_LABEL.normal} value={normal} color="text-emerald-600" />
      </div>

      <div className="flex items-center gap-2 text-sm">
        {(['all', 'high', 'attention', 'normal'] as const).map((k) => (
          <button
            key={k}
            className={`px-3 py-1.5 rounded-lg ${
              filter === k ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
            onClick={() => setFilter(k)}
          >
            {k === 'all' ? '全部' : LEVEL_LABEL[k]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={AlertOctagon} title="没有相关预警" />
      ) : (
        <div className="space-y-2">
          {filtered.map((w, i) => (
            <div key={i} className={`border rounded-lg p-3 ${LEVEL_COLOR[w.level]}`}>
              <div className="flex items-center justify-between">
                <div className="font-medium">{w.studentName}</div>
                <span className="text-xs">{LEVEL_LABEL[w.level]}</span>
              </div>
              <div className="text-sm mt-1">{w.reason}</div>
              {w.since && <div className="text-xs opacity-70 mt-0.5">最后活动: {w.since}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
