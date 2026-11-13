import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Link } from 'react-router-dom';
import { PlusCircle, Trash2, Zap, X, Filter, ArrowRight, FileText } from 'lucide-react';
import { useToast } from '@shared/core';
import { useAppSession } from '../hooks/useAppSession';
import { getTrainingsCopy } from '../domain/trainingsCopy';
import { findTrainingsByStudent, findGaps, putRecord, deleteRecord, getMeta, setMeta, getAllRecords } from '../services/localDB';
import { deriveGapsFromTraining, deriveSnapshotFromTraining, isTimedMet, interviewAnsweredAt, interviewScorePercent } from '../services/analytics';
import { getAbilityTags, getModules } from '../domain/abilityTags';
import { selectTrainingEntrySubjects, isTrainingExcludedSubject } from '../domains/public-exam';
import { domainOfGradeLevel, domainOfSubject } from '../domains/shared/scope';
import {
  SUBJECT_LABEL,
  SUBJECT_MATRIX,
  TRAINING_TYPE_LABEL,
  ERROR_CATEGORY_LABEL,
  PAPER_TYPE_LABEL,
  PAPER_TYPE_OPTIONS,
  type ErrorCategory,
  type InterviewRecord,
  type PaperType,
  type Subject,
  type SubjectiveAnswer,
  type TrainingRecord,
  type TrainingType,
} from '../domain/types';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';

const RECENT_KEY = 'trainings-recent';

interface RecentDefaults {
  subject: Subject;
  module: string;
  trainingType: TrainingType;
  totalQuestions: number;
  durationMinutes: number;
}

export function TrainingsPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [filterSubject, setFilterSubject] = useState<Subject | 'all'>('all');
  const [recent, setRecent] = useState<RecentDefaults | null>(null);
  // 申论 / 面试只在训练记录页只读展示，录入仍走各自唯一入口（不写 trainings）
  const [shenlunAnswers, setShenlunAnswers] = useState<SubjectiveAnswer[]>([]);
  const [interviewRecords, setInterviewRecords] = useState<InterviewRecord[]>([]);
  const [subjectiveFilter, setSubjectiveFilter] = useState<'all' | 'shenlun' | 'mianshi'>('all');

  const refresh = useCallback(async () => {
    const list = await findTrainingsByStudent(prefs.currentStudentId);
    setRecords(list);
    const [answers, interviews] = await Promise.all([
      getAllRecords('subjectiveAnswers'),
      getAllRecords('interviewRecords'),
    ]);
    const scopeAnswers = prefs.currentStudentId
      ? answers.filter((r) => r.studentId === prefs.currentStudentId)
      : answers;
    const scopeInterviews = prefs.currentStudentId
      ? interviews.filter((r) => r.studentId === prefs.currentStudentId)
      : interviews;
    setShenlunAnswers(scopeAnswers.filter((r) => r.subject === 'shenlun'));
    setInterviewRecords(scopeInterviews);
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
    void getMeta<RecentDefaults | null>(RECENT_KEY, null).then(setRecent);
  }, [refresh]);

  /** 训练记录只允许客观题学科：申论 / 面试从学科下拉与筛选里一起剔除 */
  const entrySubjects = useMemo(
    () => selectTrainingEntrySubjects(prefs.subjects.length > 0 ? prefs.subjects : SUBJECT_MATRIX[prefs.gradeLevel]),
    [prefs.subjects, prefs.gradeLevel],
  );

  // ---- 筛选 / 排序 / 分页（2026-11-12 加：记录多时刷屏，默认每页 20 条）----
  const PAGE_SIZE = 20;
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'accuracy-asc' | 'accuracy-desc'>('date-desc');
  const [page, setPage] = useState(1);

  /** 当前学科筛选下的可选模块与题型，只列出真实存在的，避免下拉里一堆空选项 */
  const moduleOptions = useMemo(() => {
    const scoped = filterSubject === 'all' ? records : records.filter((r) => r.subject === filterSubject);
    return Array.from(new Set(scoped.map((r) => r.module).filter(Boolean))).sort();
  }, [records, filterSubject]);

  const typeOptions = useMemo(() => {
    const scoped = filterSubject === 'all' ? records : records.filter((r) => r.subject === filterSubject);
    return Array.from(new Set(scoped.map((r) => r.trainingType).filter(Boolean))).sort();
  }, [records, filterSubject]);

  const filtered = useMemo(() => {
    let list = filterSubject === 'all' ? records : records.filter((r) => r.subject === filterSubject);
    if (filterModule !== 'all') list = list.filter((r) => r.module === filterModule);
    if (filterType !== 'all') list = list.filter((r) => r.trainingType === filterType);
    if (dateFrom) list = list.filter((r) => String(r.date ?? '') >= dateFrom);
    if (dateTo) list = list.filter((r) => String(r.date ?? '') <= dateTo);

    const accuracy = (r: TrainingRecord) =>
      r.totalQuestions > 0 ? (r.totalQuestions - r.errorCount) / r.totalQuestions : 0;
    const sorted = [...list];
    if (sortBy === 'date-desc') sorted.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
    else if (sortBy === 'date-asc') sorted.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
    else if (sortBy === 'accuracy-asc') sorted.sort((a, b) => accuracy(a) - accuracy(b));
    else sorted.sort((a, b) => accuracy(b) - accuracy(a));
    return sorted;
  }, [records, filterSubject, filterModule, filterType, dateFrom, dateTo, sortBy]);

  // 筛选条件变化时回到第一页，避免停在越界页
  useEffect(() => {
    setPage(1);
  }, [filterSubject, filterModule, filterType, dateFrom, dateTo, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );
  const hasActiveFilter =
    filterModule !== 'all' || filterType !== 'all' || dateFrom !== '' || dateTo !== '';

  const handleSave = async (draft: TrainingRecord) => {
    await putRecord('trainings', draft);

    // V5.11 Bug #005 修复:训练保存后自动派生能力缺口(错题归集为问题)
    const existingGaps = await findGaps(draft.studentId);
    const derivedGaps = deriveGapsFromTraining(draft, existingGaps);
    let newGapCount = 0;
    for (const gap of derivedGaps) {
      const already = existingGaps.some((g) => g.id === gap.id);
      await putRecord('gaps', gap);
      if (!already) newGapCount += 1;
    }

    // V5.11 Bug #009 修复:训练保存后自动生成能力快照,建立基线 + 支撑增长曲线
    const snapshot = deriveSnapshotFromTraining(draft);
    await putRecord('abilities', snapshot);

    const nextRecent: RecentDefaults = {
      subject: draft.subject,
      module: draft.module,
      trainingType: draft.trainingType,
      totalQuestions: draft.totalQuestions,
      durationMinutes: draft.durationMinutes ?? 30,
    };
    setRecent(nextRecent);
    await setMeta(RECENT_KEY, nextRecent);
    setShowForm(false);
    void refresh();

    if (newGapCount > 0) {
      showToast(`训练已保存,自动归集 ${newGapCount} 个能力缺口到问题中心`, 'success');
    } else if (derivedGaps.length > 0) {
      showToast('训练已保存,合并到既有能力缺口', 'success');
    } else {
      showToast('训练记录已保存', 'success');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除该训练记录？')) return;
    await deleteRecord('trainings', id);
    void refresh();
    showToast('记录已删除', 'info');
  };

  const copy = getTrainingsCopy(prefs.gradeLevel);
  const isPublicExam = domainOfGradeLevel(prefs.gradeLevel) === 'public-exam';
  return (
    <div className="space-y-5">
      <PageHeader
        title={copy.pageTitle}
        description={copy.pageDescription}
        actions={
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                setQuickMode(!quickMode);
                setShowForm(true);
              }}
            >
              <Zap size={14} /> {quickMode ? copy.quickModeOn : copy.quickModeOff}
            </button>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> {copy.addAction}
            </button>
          </>
        }
      />

      {isPublicExam && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 leading-relaxed flex flex-wrap items-center gap-2">
          <span>
            训练记录只接收行测等客观题。申论请到「学科专项 → 申论作答」录入（单题 / 套卷均可，套卷逐题记题型），
            面试请到「学科专项 → 面试记录」录入；这两处保存的作答在本页下方以只读形式展示，不重复计入训练记录。
            历史申论 / 面试训练记录仍然有效，继续参与统计并作为无四维评分时的回退口径。
          </span>
          <Link to="/subjective" className="underline font-medium">去申论作答 →</Link>
          <Link to="/interview" className="underline font-medium">去面试记录 →</Link>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm text-slate-600 flex-wrap">
        <Filter size={14} />
        <span>学科筛选:</span>
        <button
          className={`px-2 py-1 rounded ${filterSubject === 'all' ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`}
          onClick={() => setFilterSubject('all')}
        >
          全部
        </button>
        {entrySubjects.map((s) => (
          <button
            key={s}
            className={`px-2 py-1 rounded ${filterSubject === s ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100'}`}
            onClick={() => setFilterSubject(s)}
          >
            {SUBJECT_LABEL[s]}
          </button>
        ))}
      </div>

      {/* 模块 / 题型 / 时间 / 排序：记录多时用它们把范围收窄，避免一屏几十条 */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <select
          className="input py-1 text-xs"
          value={filterModule}
          onChange={(e) => setFilterModule(e.target.value)}
        >
          <option value="all">全部模块</option>
          {moduleOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          className="input py-1 text-xs"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">全部题型</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {TRAINING_TYPE_LABEL[t as TrainingType] ?? t}
            </option>
          ))}
        </select>

        <span className="text-slate-400">时间</span>
        <input
          className="input py-1 text-xs"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <span className="text-slate-400">至</span>
        <input
          className="input py-1 text-xs"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />

        <select
          className="input py-1 text-xs"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        >
          <option value="date-desc">最近优先</option>
          <option value="date-asc">最早优先</option>
          <option value="accuracy-asc">正确率低到高</option>
          <option value="accuracy-desc">正确率高到低</option>
        </select>

        {hasActiveFilter && (
          <button
            className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:border-slate-300"
            onClick={() => {
              setFilterModule('all');
              setFilterType('all');
              setDateFrom('');
              setDateTo('');
            }}
          >
            清空筛选
          </button>
        )}

        <span className="ml-auto text-slate-400">
          共 {filtered.length} 条
          {totalPages > 1 && ` · 第 ${safePage}/${totalPages} 页`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={PlusCircle}
          title={hasActiveFilter ? '当前筛选没有记录' : copy.emptyTitle}
          description={hasActiveFilter ? '放宽筛选条件试试，或清空筛选' : copy.emptyDescription}
          action={
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <PlusCircle size={16} /> {copy.emptyAction}
            </button>
          }
        />
      ) : (
        <>
          <div className="card divide-y divide-slate-100">
            {pageItems.map((r) => (
              <RecordItem key={r.id} record={r} onDelete={() => handleDelete(r.id)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <button
                className="btn-ghost text-xs disabled:opacity-40"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                上一页
              </button>
              <span className="text-slate-500">
                {safePage} / {totalPages}
              </span>
              <button
                className="btn-ghost text-xs disabled:opacity-40"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {showForm && (
        <TrainingForm
          quick={quickMode}
          defaults={recent}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          studentId={prefs.currentStudentId}
          gradeLevel={prefs.gradeLevel}
          availableSubjects={prefs.subjects.length > 0 ? prefs.subjects : SUBJECT_MATRIX[prefs.gradeLevel]}
        />
      )}

      {isPublicExam && (
        <SubjectiveReadOnlySection
          answers={shenlunAnswers}
          interviews={interviewRecords}
          filter={subjectiveFilter}
          onFilter={setSubjectiveFilter}
        />
      )}
    </div>
  );
}

/**
 * 只读分区：把「申论作答」「面试记录」两个唯一入口的数据在训练记录页原样列出。
 * 只读、不写回、不参与 trainings 统计——避免同一次作答被两处各算一遍。
 */
function SubjectiveReadOnlySection({
  answers,
  interviews,
  filter,
  onFilter,
}: {
  answers: SubjectiveAnswer[];
  interviews: InterviewRecord[];
  filter: 'all' | 'shenlun' | 'mianshi';
  onFilter: (next: 'all' | 'shenlun' | 'mianshi') => void;
}) {
  const shenlunRows = useMemo(
    () =>
      [...answers].sort((a, b) =>
        (b.answeredAt ?? b.createdAt ?? b.date).localeCompare(a.answeredAt ?? a.createdAt ?? a.date),
      ),
    [answers],
  );
  const interviewRows = useMemo(
    () => [...interviews].sort((a, b) => interviewAnsweredAt(b).localeCompare(interviewAnsweredAt(a))),
    [interviews],
  );
  const total = shenlunRows.length + interviewRows.length;
  const showShenlun = filter === 'all' || filter === 'shenlun';
  const showInterview = filter === 'all' || filter === 'mianshi';

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <FileText size={16} className="text-blue-600" />
          <h2 className="font-semibold text-slate-900">申论 / 面试（只读）</h2>
          <span className="text-xs text-slate-400">
            共 {total} 条 · 在各自入口录入，这里只展示，不计入上方训练统计
          </span>
        </div>
        <div className="flex items-center gap-1">
          {([
            { k: 'all', label: `全部 ${total}` },
            { k: 'shenlun', label: `申论 ${shenlunRows.length}` },
            { k: 'mianshi', label: `面试 ${interviewRows.length}` },
          ] as Array<{ k: 'all' | 'shenlun' | 'mianshi'; label: string }>).map((it) => (
            <button
              key={it.k}
              onClick={() => onFilter(it.k)}
              className={`px-2 py-1 rounded text-xs ${
                filter === it.k ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className="text-sm text-slate-500 leading-relaxed">
          还没有申论 / 面试记录。申论到
          <Link to="/subjective" className="underline mx-1">申论作答</Link>
          录入，面试到
          <Link to="/interview" className="underline mx-1">面试记录</Link>
          录入，保存后会出现在这里。
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {showShenlun &&
            shenlunRows.map((r) => {
              const isPaper = r.mode === 'paper';
              const title = isPaper
                ? r.paperSource || r.paperTitle || r.scenario || '未命名套卷'
                : r.questionType || r.scenario || '未分类';
              const dims = r.dimensionScores;
              const dimValues = dims
                ? [dims.points, dims.structure, dims.language, dims.logic].filter(
                    (v): v is number => typeof v === 'number' && Number.isFinite(v),
                  )
                : [];
              const dimAvg =
                dimValues.length === 0
                  ? null
                  : Math.round((dimValues.reduce((s, v) => s + v, 0) / dimValues.length) * 10) / 10;
              return (
                <div key={r.id} className="py-2.5 flex flex-wrap items-center gap-2 text-sm">
                  <span className="badge bg-blue-50 text-blue-700 shrink-0">申论</span>
                  <span className="badge bg-slate-100 text-slate-600 shrink-0">{isPaper ? '套卷' : '单题'}</span>
                  <span className="font-medium text-slate-800 min-w-0 truncate">{title}</span>
                  <span className="text-xs text-slate-500">
                    {(r.answeredAt ?? r.createdAt ?? r.date).slice(0, 10)}
                    {r.questionNo ? ` · 第 ${r.questionNo} 题` : ''}
                    {isPaper && r.paperQuestionCount ? ` · ${r.paperQuestionCount} 题` : ''}
                    {isPaper && r.paperScore !== undefined && r.paperFullMark !== undefined
                      ? ` · 得分 ${r.paperScore}/${r.paperFullMark}`
                      : ''}
                    {r.durationMinutes !== undefined ? ` · ${r.durationMinutes} 分` : ''}
                  </span>
                  {dimAvg !== null && (
                    <span className="badge bg-emerald-50 text-emerald-700">四维 {dimAvg}</span>
                  )}
                  {r.version > 1 && <span className="text-xs text-slate-400">v{r.version}</span>}
                  <Link to="/subjective" className="text-xs text-blue-600 underline ml-auto shrink-0">
                    查看 / 追加修订
                  </Link>
                </div>
              );
            })}
          {showInterview &&
            interviewRows.map((r) => {
              const score = interviewScorePercent(r);
              return (
                <div key={r.id} className="py-2.5 flex flex-wrap items-center gap-2 text-sm">
                  <span className="badge bg-purple-50 text-purple-700 shrink-0">面试</span>
                  <span className="font-medium text-slate-800 min-w-0 truncate">
                    {r.questionType?.trim() || '未分类'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {interviewAnsweredAt(r).slice(0, 10)}
                    {r.paperSource ? ` · ${r.paperSource}` : ''}
                    {r.questionNo ? ` · 第 ${r.questionNo} 题` : ''}
                    {` · 思考 ${r.thinkingSec}s / 答题 ${r.answerSec}s`}
                  </span>
                  <span className={`badge ${score === null ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>
                    {score === null ? '未评分' : `综合 ${score}%`}
                  </span>
                  {r.version !== undefined && r.version > 1 && (
                    <span className="text-xs text-slate-400">v{r.version}</span>
                  )}
                  <Link to="/interview" className="text-xs text-blue-600 underline ml-auto shrink-0">
                    查看 / 追加修订
                  </Link>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function RecordItem({ record, onDelete }: { record: TrainingRecord; onDelete: () => void }) {
  const correct = record.totalQuestions - record.errorCount;
  const rate = record.totalQuestions === 0 ? 0 : Math.round((correct / record.totalQuestions) * 100);
  const timed = isTimedMet(record);
  const timedBadge =
    timed === null
      ? { label: '无基准', className: 'bg-slate-100 text-slate-500' }
      : timed
        ? { label: '达标', className: 'bg-emerald-50 text-emerald-700' }
        : { label: '超时', className: 'bg-red-50 text-red-600' };
  const questionType = record.questionType || record.module.split('/')[1] || '未标注';
  // 卷型/年份/得分/标准用时是公考卷面口径，K12 记录不展示这些空字段
  const showPaperMeta = domainOfSubject(record.subject) === 'public-exam';
  return (
    <div className="p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-900">
            {SUBJECT_LABEL[record.subject]} · {record.module}
          </span>
          <span className="badge bg-slate-100 text-slate-600">{TRAINING_TYPE_LABEL[record.trainingType]}</span>
          {record.isUnfamiliar && <span className="badge bg-amber-100 text-amber-700">陌生题</span>}
          <span className={`badge ${timedBadge.className}`}>{timedBadge.label}</span>
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {record.date} · {record.totalQuestions} 题 · 正确 {correct} / 错 {record.errorCount} · 用时 {record.durationMinutes ?? '-'} 分
        </div>
        {showPaperMeta && (
          <div className="text-xs text-slate-500 mt-1">
            卷型 {record.paperType ? PAPER_TYPE_LABEL[record.paperType] : '未标注'}
            · 年份 {record.paperYear ?? '未标注'}
            · 得分 {record.score ?? '未标注'}
            {record.fullMark !== undefined ? ` / ${record.fullMark}` : ''}
            · 标准用时 {record.standardMinutes ?? '未标注'} 分
            · 题型 {questionType}
          </div>
        )}
        {record.errorCategories.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {record.errorCategories.map((c) => (
              <span key={c} className="badge bg-red-50 text-red-600">
                {ERROR_CATEGORY_LABEL[c]}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-lg font-bold text-slate-800">{rate}%</div>
        <div className="text-xs text-slate-400">正确率</div>
      </div>
      <button className="btn-ghost text-red-500 hover:bg-red-50" onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

interface FormProps {
  quick: boolean;
  defaults: RecentDefaults | null;
  studentId?: string;
  gradeLevel: TrainingRecord['gradeLevel'];
  availableSubjects: Subject[];
  onClose: () => void;
  onSave: (record: TrainingRecord) => Promise<void>;
}

function TrainingForm({ quick, defaults, studentId, gradeLevel, availableSubjects, onClose, onSave }: FormProps) {
  // 申论 → 申论作答；面试 → 面试记录。训练记录不再接收主观题（与后端 guard 同一份规则）
  const entrySubjects: Subject[] = selectTrainingEntrySubjects(availableSubjects);
  const initSubject =
    defaults?.subject && entrySubjects.includes(defaults.subject) ? defaults.subject : (entrySubjects[0] ?? 'xingce');
  const [subject, setSubject] = useState<Subject>(initSubject);
  const moduleOptions = getModules(gradeLevel, subject);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [moduleName, setModuleName] = useState<string>(defaults?.module ?? moduleOptions[0] ?? '');
  // 二级考点（可选）：选了就写进 module，形成 `模块/考点` 两级路径，与导入数据同粒度
  const [pointName, setPointName] = useState<string>('');
  const [trainingType, setTrainingType] = useState<TrainingType>(defaults?.trainingType ?? 'topic');
  const [total, setTotal] = useState<string>('');
  const [errors, setErrors] = useState<string>('');
  const [duration, setDuration] = useState<number>(defaults?.durationMinutes ?? 30);
  const [categories, setCategories] = useState<ErrorCategory[]>([]);
  const [isUnfamiliar, setIsUnfamiliar] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // 卷面结构（选填）：空字符串表示不写入该键
  const [paperType, setPaperType] = useState<PaperType | ''>('');
  const [paperYear, setPaperYear] = useState('');
  const [fullMark, setFullMark] = useState('');
  const [score, setScore] = useState('');
  const [standardMinutes, setStandardMinutes] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const errorLibrary = getErrorLibrary(subject);
  const pointOptions = getPoints(gradeLevel, subject, moduleName);
  // 卷面结构是公考（国考/省考/事业单位/军转）口径，K12 不展示也不写入
  const showPaperMeta = domainOfGradeLevel(gradeLevel) === 'public-exam';
  /** 实际写入记录的 module：有考点则两级，否则一级 */
  const effectiveModule = pointName ? `${moduleName}/${pointName}` : moduleName;

  const toggleCategory = (c: ErrorCategory) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  useEffect(() => {
    if (!moduleOptions.includes(moduleName) && moduleOptions.length > 0) {
      setModuleName(moduleOptions[0]);
    }
  }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  // 换模块时清空考点，避免残留跨模块的考点
  useEffect(() => {
    setPointName('');
  }, [moduleName, subject]);

  const submit = async () => {
    if (!effectiveModule) return;
    const validation: string[] = [];
    // 与后端同一份口径：主观题不允许写进训练记录，UI 先拦一次，避免只靠接口兜底
    if (isTrainingExcludedSubject(subject)) {
      validation.push(
        '训练记录只接收行测等客观题：申论请到「学科专项 → 申论作答」录入，面试请到「学科专项 → 面试记录」录入',
      );
    }
    const yearValue = paperYear.trim() === '' ? undefined : Number(paperYear);
    if (yearValue !== undefined && (!Number.isInteger(yearValue) || yearValue < 1900 || yearValue > 2100)) {
      validation.push('年份须为 1900-2100 的整数');
    }
    const fullMarkValue = fullMark.trim() === '' ? undefined : Number(fullMark);
    if (fullMarkValue !== undefined && (!Number.isFinite(fullMarkValue) || fullMarkValue <= 0)) {
      validation.push('满分须大于 0');
    }
    const scoreValue = score.trim() === '' ? undefined : Number(score);
    if (scoreValue !== undefined) {
      if (!Number.isFinite(scoreValue) || scoreValue < 0) validation.push('得分不得小于 0');
      else if (fullMarkValue !== undefined && scoreValue > fullMarkValue) validation.push('得分不得大于满分');
    }
    const standardValue = standardMinutes.trim() === '' ? undefined : Number(standardMinutes);
    if (standardValue !== undefined && (!Number.isFinite(standardValue) || standardValue <= 0)) {
      validation.push('标准用时须大于 0');
    }
    const questionTypeValue = questionType.trim();
    if (questionTypeValue.length > 20) validation.push('题型须为 1-20 字');
    // 题数与错误数不再静默预填：留空即视为未填写，避免把 15 题 / 0 错当成真实数据
    const totalValue = total.trim() === '' ? null : Number(total);
    if (totalValue === null || !Number.isInteger(totalValue) || totalValue <= 0) {
      validation.push('请填写题目数量（正整数，不能留空）');
    }
    const errorValue = errors.trim() === '' ? null : Number(errors);
    if (errorValue === null || !Number.isInteger(errorValue) || errorValue < 0) {
      validation.push('请填写错误数量（0 也表示已核对过）');
    } else if (totalValue !== null && errorValue > totalValue) {
      validation.push('错误数量不得大于题目数量');
    }
    if (validation.length > 0) {
      setFormErrors(validation);
      return;
    }
    setFormErrors([]);
    setSaving(true);
    const now = new Date().toISOString();
    const record: TrainingRecord = {
      id: uuid(),
      studentId,
      date,
      gradeLevel,
      subject,
      module: effectiveModule,
      trainingType,
      totalQuestions: totalValue ?? 0,
      correctCount: (totalValue ?? 0) - (errorValue ?? 0),
      errorCount: errorValue ?? 0,
      durationMinutes: duration,
      errorCategories: categories,
      isUnfamiliar,
      note: note.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      ...(paperType ? { paperType } : {}),
      ...(yearValue !== undefined ? { paperYear: yearValue } : {}),
      ...(fullMarkValue !== undefined ? { fullMark: fullMarkValue } : {}),
      ...(scoreValue !== undefined ? { score: scoreValue } : {}),
      ...(standardValue !== undefined ? { standardMinutes: standardValue } : {}),
      ...(questionTypeValue ? { questionType: questionTypeValue } : {}),
    };
    try {
      await onSave(record);
    } finally {
      setSaving(false);
    }
  };

  // 只剩申论 / 面试学科的学员：训练记录不再提供录入，直接引导到对应唯一入口
  if (entrySubjects.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="card w-full max-w-md p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">主观题不在训练记录录入</h2>
            <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            申论（单题和套卷）统一到「学科专项 → 申论作答」；面试统一到「学科专项 → 面试记录」。
            两处都会记录题型、题目来源、题号、作答时间与失分原因，并自动形成版本链。训练记录只用于行测等客观题。
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/subjective" className="btn-primary inline-flex" onClick={onClose}>
              去申论作答 <ArrowRight size={14} />
            </Link>
            <Link to="/interview" className="btn-secondary inline-flex" onClick={onClose}>
              去面试记录 <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 modal-clamp [--modal-max:42rem] [--modal-max-h:90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            记录训练 · {quick ? '快速模式' : '标准模式'}
          </h2>
          <button className="btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {subject === 'xingce' && trainingType === 'exam' && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 leading-relaxed">
            行测整卷（模考）请只在「测验诊断」录入：那里会同时生成整卷权威行与模块明细，在这里再录一次会造成同一次考试重复统计。
            <Link to="/exams" className="underline ml-1">去测验诊断 →</Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="label">日期</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">学科 ★</label>
            <select className="input" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
              {entrySubjects.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">知识模块 ★</label>
            {moduleOptions.length > 0 ? (
              <select className="input" value={moduleName} onChange={(e) => setModuleName(e.target.value)}>
                {moduleOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" value={moduleName} onChange={(e) => setModuleName(e.target.value)} placeholder="输入模块名称" />
            )}
          </div>
          <div>
            <label className="label">
              二级考点 <span className="text-slate-400 font-normal">（选填，选得更细能力缺口更准）</span>
            </label>
            {pointOptions.length > 0 ? (
              <select className="input" value={pointName} onChange={(e) => setPointName(e.target.value)}>
                <option value="">不指定（只记到模块）</option>
                {pointOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={pointName}
                onChange={(e) => setPointName(e.target.value)}
                placeholder="该模块暂无内置考点，可手填"
              />
            )}
            <div className="text-xs text-slate-400 mt-1">
              写入路径：{effectiveModule || '—'}
            </div>
          </div>
          <div>
            <label className="label">训练类型</label>
            <select className="input" value={trainingType} onChange={(e) => setTrainingType(e.target.value as TrainingType)}>
              {getTrainingTypesForSubject(subject).map((k) => (
                <option key={k} value={k}>
                  {TRAINING_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">题目数量 ★</label>
            <input
              className="input"
              type="number"
              min={0}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="必填，如 20"
            />
          </div>

          {!quick && (
            <div>
              <label className="label">用时(分钟)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          )}

          <div>
            <label className="label">错误数量 ★</label>
            <input
              className="input"
              type="number"
              min={0}
              max={total.trim() === '' ? undefined : Number(total)}
              value={errors}
              onChange={(e) => setErrors(e.target.value)}
              placeholder="必填，没错就填 0"
            />
            <div className="text-xs text-slate-400 mt-1">
              正确数量 ={' '}
              {total.trim() === ''
                ? '—'
                : Math.max(0, Number(total) - (errors.trim() === '' ? 0 : Number(errors)))}{' '}
              (自动计算)
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <input
              id="unfamiliar"
              type="checkbox"
              checked={isUnfamiliar}
              onChange={(e) => setIsUnfamiliar(e.target.checked)}
            />
            <label htmlFor="unfamiliar" className="text-sm text-slate-600">
              标记为陌生题(用于计算陌生题正确率)
            </label>
          </div>

          {showPaperMeta && (
            <div className="col-span-1 sm:col-span-2">
              <div className="text-sm font-medium text-slate-700 mb-2">卷面结构（选填，留空不记录）</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">卷型</label>
                  <select className="input" value={paperType} onChange={(e) => setPaperType(e.target.value as PaperType | '')}>
                    <option value="">未标注</option>
                    {PAPER_TYPE_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {PAPER_TYPE_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">年份</label>
                  <input className="input" type="number" value={paperYear} onChange={(e) => setPaperYear(e.target.value)} placeholder="如 2025" />
                </div>
                <div>
                  <label className="label">满分</label>
                  <input className="input" type="number" value={fullMark} onChange={(e) => setFullMark(e.target.value)} placeholder="如 100" />
                </div>
                <div>
                  <label className="label">得分</label>
                  <input className="input" type="number" value={score} onChange={(e) => setScore(e.target.value)} placeholder="0 到满分之间" />
                </div>
                <div>
                  <label className="label">标准用时(分钟)</label>
                  <input className="input" type="number" value={standardMinutes} onChange={(e) => setStandardMinutes(e.target.value)} />
                </div>
                <div>
                  <label className="label">题型</label>
                  <input className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value)} placeholder="如 计算/概括" maxLength={20} />
                </div>
              </div>
            </div>
          )}
        </div>

        {formErrors.length > 0 && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
            {formErrors.map((msg) => (
              <div key={msg}>{msg}</div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <label className="label">错误类型 (多选)</label>
          <div className="flex flex-wrap gap-2">
            {errorLibrary.map((c) => (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                className={`badge cursor-pointer px-2 py-1 ${
                  categories.includes(c)
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {ERROR_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        {!quick && (
          <div className="mt-4">
            <label className="label">备注</label>
            <textarea
              className="input min-h-[70px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="选填,例如: 某道题的具体错因、下次改进方向"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving || !effectiveModule}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/** 取某学科+模块下的二级考点名（来自三级能力标签库） */
function getPoints(gradeLevel: TrainingRecord['gradeLevel'], subject: Subject, module: string): string[] {
  if (!module) return [];
  return getAbilityTags(gradeLevel, subject)
    .filter((t) => t.module === module)
    .map((t) => t.point);
}

function getErrorLibrary(subject: Subject): ErrorCategory[] {
  const base: ErrorCategory[] = ['concept', 'read', 'calc', 'method', 'time'];
  if (subject === 'math') return [...base, 'formula', 'model', 'logic', 'norm'];
  if (subject === 'physics') return [...base, 'formula', 'model', 'experiment', 'direction', 'norm'];
  if (subject === 'xingce') return ['not-know', 'concept', 'method', 'judge', 'calc', 'time'];
  if (subject === 'shenlun')
    return ['point', 'accuracy', 'read', 'structure', 'argument', 'language', 'format', 'wordcount', 'time'];
  if (subject === 'mianshi')
    return ['structure', 'argument', 'language', 'read', 'concept', 'time'];
  return base;
}

// V5.11 Bug #004 修复:训练类型按学科过滤
// - 只有物理/化学/生物这类"实验学科"才出现"实验记录"
// - 公考三科(行测/申论/面试)+ 语文/英语等文科不出现"实验记录"
export function getTrainingTypesForSubject(subject: Subject): TrainingType[] {
  const experimentSubjects: Subject[] = ['physics', 'chemistry', 'biology'];
  const base: TrainingType[] = ['daily', 'topic', 'review', 'unfamiliar', 'timed', 'exam'];
  if (experimentSubjects.includes(subject)) {
    return ['daily', 'topic', 'review', 'unfamiliar', 'timed', 'experiment', 'exam'];
  }
  return base;
}
