/**
 * §31.9 教师端班级生涯测评汇总(匿名统计)
 */
import { useEffect, useState } from 'react';
import { PieChart } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { getAllRecords } from '../../services/localDB';
import { summarizeClassCareer, type CareerClassSummary } from '../../services/careerAssessment';
import {
  BOTTOM_LINE_LABEL,
  CAREER_QUADRANT_LABEL,
  GRADE_LEVEL_LABEL,
  type CareerAssessment,
  type CareerReport,
} from '../../domain/types';

export function CareerClassPage() {
  const [stats, setStats] = useState<CareerClassSummary[]>([]);

  useEffect(() => {
    (async () => {
      const [a, r] = await Promise.all([getAllRecords('careerAssessments'), getAllRecords('careerReports')]);
      setStats(summarizeClassCareer(a as CareerAssessment[], r as CareerReport[]));
    })();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="班级生涯测评汇总"
        description="匿名统计 · 辅助选科指导。 显示 MBTI 分布、四象限分布、底线价值分布, 不显示个人信息。"
      />

      {stats.length === 0 ? (
        <EmptyState icon={PieChart} title="尚无测评数据" description="学生完成测评后汇总数据在此" />
      ) : (
        <div className="space-y-5">
          {stats.map((s) => (
            <div key={s.gradeLevel} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">
                  {GRADE_LEVEL_LABEL[s.gradeLevel]} · 共 {s.totalCount} 人
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm font-medium mb-2">MBTI 类型分布</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(s.mbtiDist)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .slice(0, 8)
                      .map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between">
                          <span className="font-mono">{type}</span>
                          <span className="text-slate-500">{count as number}</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">四象限分布</div>
                  {Object.entries(s.quadrantDist).map(([q, count]) => (
                    <div key={q} className="flex items-center justify-between text-xs">
                      <span>{CAREER_QUADRANT_LABEL[q as keyof typeof CAREER_QUADRANT_LABEL]}</span>
                      <span className="text-slate-500">{count as number}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">底线价值分布(Top)</div>
                  {Object.entries(s.bottomLineDist)
                    .sort(([, a], [, b]) => b - a)
                    .filter(([, v]) => v > 0)
                    .map(([bl, count]) => (
                      <div key={bl} className="flex items-center justify-between text-xs">
                        <span>{BOTTOM_LINE_LABEL[bl as keyof typeof BOTTOM_LINE_LABEL]}</span>
                        <span className="text-slate-500">{count}</span>
                      </div>
                    ))}
                </div>
              </div>

              {s.topBottomLines.length > 0 && (
                <div className="mt-3 p-2 rounded bg-amber-50 text-xs text-amber-800">
                  <b>建议选科关注:</b> 班级 Top 底线为 {s.topBottomLines.map((bl) => BOTTOM_LINE_LABEL[bl]).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
