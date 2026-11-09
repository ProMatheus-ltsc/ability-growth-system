/**
 * 题型（考点）正确率排名
 * 数据源：`labelStats`（按标签路径前缀向上卷成树），口径与训练记录一致：
 * 剔除 `validity: 'duplicate'` 与 `aggregationRole: 'derived'`。
 * 排名只收「作答次数 >= MIN_SAMPLE」的叶子，样本不足的单独列示、不参与排名。
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronRight, Tags } from 'lucide-react';
import { ResponsiveGrid } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords } from '../services/localDB';
import { buildLabelStats, selectValidLabelStats, type LabelStatNode } from '../services/analytics';
import { SUBJECT_LABEL, type LabelStat, type Subject } from '../domain/types';

/** 最小样本门槛：作答次数少于该值的标签不进排名 */
const MIN_SAMPLE = 5;

const keyOfPath = (path: string[]) => path.join(' > ');

const SOURCE_META: Record<LabelStatNode['labelSource'], { label: string; cls: string; title: string }> = {
  official: {
    label: '官方',
    cls: 'bg-slate-100 text-slate-600',
    title: '标签来自题库官方考点体系',
  },
  inferred: {
    label: '推断',
    cls: 'bg-amber-50 text-amber-700 border border-amber-200',
    title: '官方只给到 1–2 级或缺标签，由题干特征 / 解析文本推断',
  },
  mixed: {
    label: '混合',
    cls: 'bg-sky-50 text-sky-700',
    title: '该层级汇总中同时包含官方与推断来源',
  },
};

function barColor(rate: number): string {
  if (rate < 60) return 'bg-red-500';
  if (rate < 80) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function rateColor(rate: number): string {
  if (rate < 60) return 'text-red-600';
  if (rate < 80) return 'text-amber-600';
  return 'text-emerald-600';
}

/** 并列多标签占比（%），0 表示没有不确定性 */
function multiRatio(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  const toneMap: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    slate: 'text-slate-600 bg-slate-100',
  };
  return (
    <div className={`rounded-xl p-4 ${toneMap[tone] ?? toneMap.slate}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

export function LabelRankingPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { prefs } = useAppSession();
  const [leaves, setLeaves] = useState<LabelStat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [subject, setSubject] = useState<Subject | ''>(prefs.subjects[0] ?? '');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void getAllRecords('labelStats').then((list) => {
      if (cancelled) return;
      // 与训练记录同一口径：重复导入行、跨日期聚合行不参与统计
      setLeaves(selectValidLabelStats(list));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const subjectsInData = useMemo(() => {
    const present = new Set(leaves.map((l) => l.subject));
    const ordered = (Object.keys(SUBJECT_LABEL) as Subject[]).filter((s) => present.has(s));
    return ordered;
  }, [leaves]);

  // 数据到达后校正学科选择：优先保留当前学科，否则落到有数据的第一个
  useEffect(() => {
    if (!loaded) return;
    if (subject !== '' && subjectsInData.includes(subject)) return;
    const fallback = subjectsInData[0] ?? prefs.subjects[0] ?? '';
    if (fallback !== subject) setSubject(fallback);
  }, [loaded, subjectsInData, subject, prefs.subjects]);

  const subjectLeaves = useMemo(
    () => leaves.filter((l) => l.subject === subject),
    [leaves, subject],
  );

  const ranked = useMemo(
    () => subjectLeaves.filter((l) => l.questionCount >= MIN_SAMPLE),
    [subjectLeaves],
  );

  const insufficient = useMemo(
    () =>
      subjectLeaves
        .filter((l) => l.questionCount < MIN_SAMPLE)
        .sort((a, b) => a.questionCount - b.questionCount || a.rate - b.rate),
    [subjectLeaves],
  );

  const tree = useMemo(() => buildLabelStats(ranked), [ranked]);

  const leafByPath = useMemo(
    () => new Map(subjectLeaves.map((l) => [keyOfPath(l.path), l] as const)),
    [subjectLeaves],
  );

  const totals = useMemo(
    () => ({
      questionCount: subjectLeaves.reduce((s, l) => s + l.questionCount, 0),
      uniqueQuestionCount: subjectLeaves.reduce((s, l) => s + l.uniqueQuestionCount, 0),
      official: subjectLeaves.filter((l) => l.labelSource === 'official').length,
      inferred: subjectLeaves.filter((l) => l.labelSource === 'inferred').length,
    }),
    [subjectLeaves],
  );

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** 逐层渲染：一级模块默认全部可见，子节点按展开集合显示 */
  const renderNodes = (nodes: LabelStatNode[], depth: number) =>
    nodes.map((node, index) => {
      const key = keyOfPath(node.path);
      const hasChildren = node.children.length > 0;
      const isLeaf = !hasChildren;
      const isExpanded = expanded.has(key);
      const leaf = isLeaf ? leafByPath.get(key) : undefined;
      const sourceMeta = SOURCE_META[node.labelSource];
      const sourceTitle =
        leaf && leaf.labelSource === 'inferred'
          ? leaf.labelBasis
            ? `推断依据：${leaf.labelBasis}`
            : sourceMeta.title
          : sourceMeta.title;
      const ratio = multiRatio(node.multiLabelCount, node.questionCount);
      const suspicious = isLeaf && ratio >= 50;

      return (
        <div key={key}>
          <div className="card p-3 flex items-start gap-2">
            <button
              type="button"
              className="mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 disabled:cursor-default"
              onClick={() => toggle(key)}
              disabled={!hasChildren}
              aria-label={hasChildren ? (isExpanded ? '收起下级' : '展开下级') : '叶子节点'}
            >
              {hasChildren ? (
                <ChevronRight
                  size={14}
                  className={isExpanded ? 'rotate-90 transition-transform' : 'transition-transform'}
                />
              ) : (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
              )}
            </button>
            <span className="mt-1 text-xs text-slate-400 tabular-nums w-7 shrink-0">#{index + 1}</span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={depth === 1 ? 'font-semibold text-slate-900' : 'text-slate-800'}>
                  {node.path[node.path.length - 1]}
                </span>
                {depth > 1 && (
                  <span className="text-[10px] text-slate-400">L{depth}</span>
                )}
                <span className={`badge ${sourceMeta.cls}`} title={sourceTitle}>
                  {sourceMeta.label}
                </span>
                {isLeaf && node.uniqueQuestionCount === 1 && (
                  <span
                    className="badge bg-slate-100 text-slate-500"
                    title="该叶子只有 1 道题，正确率必然是 0% 或 100%，不是中间值"
                  >
                    仅 1 题
                  </span>
                )}
                {suspicious && (
                  <span
                    className={`badge ${ratio >= 90 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}
                    title="该叶子绝大多数作答的最深标签并列，正确率无法归因到单一考点"
                  >
                    <AlertTriangle size={10} className="inline mr-0.5" />
                    并列 {ratio}% · 排名不可信
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                作答 {node.questionCount} 次 · 去重题量 {node.uniqueQuestionCount} 道
                {node.multiLabelCount > 0 && (
                  <span className={suspicious ? 'text-amber-700 font-medium' : ''}>
                    · 并列 {node.multiLabelCount} 次（{ratio}%）
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <div className="hidden sm:block w-24">
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor(node.rate)}`} style={{ width: `${node.rate}%` }} />
                </div>
              </div>
              <span className={`text-sm font-semibold tabular-nums w-12 text-right ${rateColor(node.rate)}`}>
                {node.rate}%
              </span>
            </div>
          </div>

          {hasChildren && isExpanded && (
            <div className="mt-1.5 ml-4 pl-2 border-l border-slate-100 space-y-1.5">
              {renderNodes(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {!embedded && (
        <>
          <PageHeader
            title="题型正确率排名"
            description={`按考点路径逐层钻取，正确率从低到高；作答次数少于 ${MIN_SAMPLE} 次的标签不进排名，单独列示`}
          />

          <div className="card p-3 text-xs text-slate-500 leading-relaxed">
            数据来源：云端题库标签聚合（labelStats）。本页只读，本地没有写入路径；未同步到 labelStats 时本页保持空态，不会用其他数据推算或预置示例。
          </div>
        </>
      )}
      {!loaded ? (
        <div className="text-sm text-slate-400">正在读取题型统计…</div>
      ) : leaves.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="尚无题型统计数据"
          description="导入题库练习后，系统会按考点标签统计正确率；当前 labelStats 为空。"
        />
      ) : (
        <>
          {subjectsInData.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              {subjectsInData.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    subject === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                  onClick={() => {
                    setSubject(s);
                    setExpanded(new Set());
                  }}
                >
                  {SUBJECT_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          {subjectLeaves.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="该学科暂无题型统计"
              description="切换学科查看其他考点数据；若长期为空，请确认题库练习是否已导入。"
            />
          ) : (
            <>
              <ResponsiveGrid minItemWidth="150px" gap="0.75rem">
                <StatCard label="覆盖作答次数" value={totals.questionCount.toLocaleString('zh-CN')} tone="blue" />
                <StatCard
                  label="去重题量"
                  value={totals.uniqueQuestionCount.toLocaleString('zh-CN')}
                  tone="slate"
                />
                <StatCard label="参与排名叶子" value={`${ranked.length} / ${subjectLeaves.length}`} tone="emerald" />
                <StatCard
                  label="标签来源（官方 / 推断）"
                  value={`${totals.official} / ${totals.inferred}`}
                  tone="amber"
                />
              </ResponsiveGrid>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <BarChart3 size={16} className="text-blue-600" />
                    正确率排名（低 → 高）
                  </h2>
                  <span className="text-xs text-slate-500">点击行首箭头逐层钻取</span>
                </div>

                {ranked.length === 0 ? (
                  <EmptyState
                    icon={AlertTriangle}
                    title="全部样本不足，暂无排名"
                    description={`当前学科所有标签的作答次数都少于 ${MIN_SAMPLE} 次，排名不可信，已全部放入下方「样本不足」区域。`}
                  />
                ) : (
                  <div className="space-y-1.5">{renderNodes(tree, 1)}</div>
                )}
              </section>

              {insufficient.length > 0 && (
                <section className="card p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-500" />
                    <h2 className="font-semibold text-slate-900">样本不足 · 不参与排名</h2>
                    <span className="badge bg-amber-50 text-amber-700">{insufficient.length} 个标签</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    作答次数少于 {MIN_SAMPLE} 次，仅列出实际次数供参考：不代表强项，也不代表弱项。
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {insufficient.map((l) => {
                      const ratio = multiRatio(l.multiLabelCount, l.questionCount);
                      const meta = SOURCE_META[l.labelSource];
                      return (
                        <div
                          key={l.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-2.5"
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-slate-800 break-words">
                              {l.path.join(' > ')}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              作答 {l.questionCount} 次 · 去重题量 {l.uniqueQuestionCount} 道
                              {l.multiLabelCount > 0 && ` · 并列 ${l.multiLabelCount} 次（${ratio}%）`}
                              {l.uniqueQuestionCount === 1 && ' · 仅 1 题，正确率必为 0% 或 100%'}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className={`text-sm font-semibold ${rateColor(l.rate)}`}>{l.rate}%</div>
                            <span className={`badge ${meta.cls} mt-1`} title={l.labelBasis ?? meta.title}>
                              {meta.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <p className="text-xs text-slate-400">
                口径：剔除重复导入行（validity = duplicate）与跨日期聚合行（aggregationRole = derived）；父级正确率由叶子作答次数汇总，题量为去重题量之和。并列占比越高，正确率越难归因到单一考点。
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
