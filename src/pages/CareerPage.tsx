import { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, PlayCircle, FileText, ChevronRight, Trash2 } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { getAllRecords, deleteRecord } from '../services/localDB';
import { CareerAssessmentFlow } from '../components/career/CareerAssessmentFlow';
import { CareerReportView } from '../components/career/CareerReportView';
import { useAppSession } from '../hooks/useAppSession';
import type { CareerAssessment, CareerReport } from '../domain/types';

type Mode = 'list' | 'assess' | 'report';

export function CareerPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>('list');
  const [assessments, setAssessments] = useState<CareerAssessment[]>([]);
  const [reports, setReports] = useState<CareerReport[]>([]);
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [a, r] = await Promise.all([getAllRecords('careerAssessments'), getAllRecords('careerReports')]);
    setAssessments(a.filter((x) => (prefs.currentStudentId ? x.studentId === prefs.currentStudentId : true)));
    setReports(r.filter((x) => (prefs.currentStudentId ? x.studentId === prefs.currentStudentId : true)));
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const removeReport = async (id: string) => {
    if (!window.confirm('确认删除该报告?')) return;
    await deleteRecord('careerReports', id);
    void refresh();
    showToast('已删除', 'info');
  };

  const currentReport = useMemo(() => reports.find((r) => r.id === viewingReportId) ?? null, [reports, viewingReportId]);

  if (mode === 'assess') {
    return (
      <CareerAssessmentFlow
        gradeLevel={prefs.gradeLevel}
        studentId={prefs.currentStudentId}
        onComplete={(reportId) => {
          setViewingReportId(reportId);
          setMode('report');
          void refresh();
          showToast('测评已完成, 报告已生成', 'success');
        }}
        onCancel={() => setMode('list')}
      />
    );
  }

  if (mode === 'report' && currentReport) {
    return (
      <CareerReportView
        report={currentReport}
        assessment={assessments.find((a) => a.id === currentReport.assessmentId)}
        onBack={() => {
          setMode('list');
          setViewingReportId(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="职业选择"
        description="价值观 · 能力 · 性格 三合一测评。 兴趣×能力四象限定位 + 价值观一票否决 + 三定输出 + 双路线参考。"
        actions={
          <button className="btn-primary" onClick={() => setMode('assess')}>
            <PlayCircle size={16} /> 开始测评
          </button>
        }
      />

      <div className="card p-4 text-sm text-slate-600 bg-blue-50 border-blue-100">
        <b>本次交付版本</b>: 三个子测评简短版(价值观 15 / MBTI 28 / 能力 20 = 63 题), 大约 15-20 分钟完成。 完成后自动生成职业定位报告。
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="尚未完成任何测评"
          description="首次测评建议在放松状态下按第一反应作答, 不做过度思考"
          action={
            <button className="btn-primary" onClick={() => setMode('assess')}>
              <PlayCircle size={16} /> 立即开始
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">历史报告</h2>
          {reports
            .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
            .map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-blue-600" />
                      <span className="font-medium">职业定位报告 · {r.generatedAt.slice(0, 10)}</span>
                      <span className="badge bg-slate-100 text-slate-600">主象限 {r.quadrant}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      候选幸存 {r.survivors.length} · 一票否决 {r.vetoed.length} · 专家倾向 {r.routes.expertBias}%
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      className="btn-primary text-xs"
                      onClick={() => {
                        setViewingReportId(r.id);
                        setMode('report');
                      }}
                    >
                      查看 <ChevronRight size={12} />
                    </button>
                    <button className="btn-ghost text-red-500 text-xs" onClick={() => removeReport(r.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
