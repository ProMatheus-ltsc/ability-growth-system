import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Sparkles, BookOpen, LineChart, Users } from 'lucide-react';
import { TableScroll } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { AbilityRadar } from '../components/RadarChart';
import { MasteryBar } from '../components/MasteryBar';
import { useAppSession } from '../hooks/useAppSession';
import { findGaps, findReviews, findTrainingsByStudent } from '../services/localDB';
import { deriveLiteracyProfile, type LiteracyDimensionSummary } from '../services/literacy';
import {
  LITERACY_DIMENSION_LABEL,
  GRADE_LEVEL_LABEL,
} from '../domain/types';
import { getLiteracyCopy } from '../domain/literacyCopy';

const LEVEL_LABEL = { L1: 'L1 · 初步', L2: 'L2 · 发展', L3: 'L3 · 熟练' } as const;

export function LiteracyPage() {
  const { prefs } = useAppSession();
  const [profile, setProfile] = useState<LiteracyDimensionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // V5.11 §33 P2 · 家长端只读预览模式:隐藏细节表格 + 弱化术语, 保留雷达 + 等级
  const [parentView, setParentView] = useState(false);

  useEffect(() => {
    (async () => {
      const [trainings, reviews, gaps] = await Promise.all([
        findTrainingsByStudent(prefs.currentStudentId),
        findReviews(undefined, prefs.currentStudentId),
        findGaps(prefs.currentStudentId),
      ]);
      const derived = deriveLiteracyProfile(prefs.gradeLevel, trainings, reviews, gaps);
      setProfile(derived);
      setLoading(false);
    })();
  }, [prefs.currentStudentId, prefs.gradeLevel]);

  const radarSlices = useMemo(
    () =>
      profile.map((p) => ({
        key: p.dimension,
        label: LITERACY_DIMENSION_LABEL[p.dimension],
        weight: 20,
        score: p.score,
        targetScore: 75,
      })),
    [profile],
  );

  const copy = getLiteracyCopy(prefs.gradeLevel);
  if (prefs.gradeLevel === 'adult') {
    return (
      <div className="space-y-5">
        <PageHeader title={copy.pageTitle} description="K12 通用能力体系" />
        <EmptyState
          icon={GraduationCap}
          title={copy.adultBlockedTitle}
          description={copy.adultBlockedDescription}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={copy.pageTitle}
        description={copy.pageDescription}
        actions={
          <button
            className={`btn-ghost text-xs ${parentView ? 'bg-emerald-100 text-emerald-800' : ''}`}
            onClick={() => setParentView((v) => !v)}
            title="家长模式:隐藏详细指标表, 只保留雷达图与等级"
          >
            <Users size={14} /> {parentView ? '退出家长视图' : '家长视图预览'}
          </button>
        }
      />

      {parentView && (
        <div className="card p-3 bg-emerald-50/60 border-emerald-100 text-xs text-emerald-800">
          👨‍👩‍👧 <b>家长视图</b>:隐藏了详细指标与专业术语, 保留雷达图 + 等级摘要, 便于家长快速了解孩子当前学段的通用能力水平。
        </div>
      )}

      <div className="card p-4 text-sm text-slate-600 bg-blue-50 border-blue-100 flex items-start gap-2">
        <Sparkles size={16} className="text-blue-600 mt-0.5" />
        <div>
          <div>
            <b>{copy.levelHint}</b>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            指标数据由训练记录/复盘/能力缺口自动派生,不会打扰学生;跨学段升学时素养曲线连续追踪。
          </div>
        </div>
      </div>

      {loading ? (
        <EmptyState icon={LineChart} title="加载中..." />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card p-5">
              <h2 className="font-semibold mb-3">五维素养雷达图</h2>
              <AbilityRadar slices={radarSlices} height={320} />
            </div>

            <div className="card p-5 space-y-4">
              <h2 className="font-semibold">当前学段: {GRADE_LEVEL_LABEL[prefs.gradeLevel]}</h2>
              {profile.map((p) => (
                <div key={p.dimension}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      <BookOpen size={14} className="text-slate-400" />
                      {LITERACY_DIMENSION_LABEL[p.dimension]}
                    </span>
                    <span className={`badge ${p.level === 'L3' ? 'bg-emerald-50 text-emerald-700' : p.level === 'L2' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {LEVEL_LABEL[p.level]}
                    </span>
                  </div>
                  <MasteryBar score={p.score} showLabel={false} />
                </div>
              ))}
            </div>
          </div>

          {!parentView && (
          <div className="card p-5">
            <h2 className="font-semibold mb-3">量化指标详情 (行为锚点)</h2>
            <div className="space-y-4">
              {profile.map((p) => (
                <div key={p.dimension} className="border-b border-slate-100 pb-3">
                  <div className="font-medium text-slate-800 mb-2">{LITERACY_DIMENSION_LABEL[p.dimension]}</div>
                  <TableScroll label={`${LITERACY_DIMENSION_LABEL[p.dimension]}指标`}>
                  <table className="w-full text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="text-left py-1 w-1/3">指标</th>
                        <th className="text-left py-1 w-16">分数</th>
                        <th className="text-left py-1 w-16">等级</th>
                        <th className="text-left py-1">证据</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.measurements.map((m, i) => (
                        <tr key={i} className="text-slate-700 border-t border-slate-50">
                          <td className="py-1">{m.indicator}</td>
                          <td className="py-1">{m.value}</td>
                          <td className="py-1">{m.level}</td>
                          <td className="py-1 text-slate-500">{m.evidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </TableScroll>
                </div>
              ))}
            </div>
          </div>
          )}

          {parentView && (
            <div className="card p-5 bg-emerald-50/40">
              <h2 className="font-semibold mb-3">家长速览</h2>
              <div className="space-y-2 text-sm">
                {profile.map((p) => {
                  const familyText: Record<string, string> = {
                    L1: '刚起步, 建议家长多陪伴多鼓励',
                    L2: '有一定基础, 引导孩子自我总结',
                    L3: '已比较熟练, 支持孩子自主实践',
                  };
                  return (
                    <div key={p.dimension} className="flex items-center justify-between border-b border-emerald-100 pb-2">
                      <span className="text-slate-800">{LITERACY_DIMENSION_LABEL[p.dimension]}</span>
                      <span className="text-slate-500 text-xs">{familyText[p.level]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-slate-500 mt-3">
                本视图不展示分数与技术术语, 更适合与孩子共同讨论。
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
