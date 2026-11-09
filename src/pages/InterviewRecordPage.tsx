/**
 * 面试专项训练记录（/interview，学生/教师导航「学科专项」→「面试记录」）
 * 唯一面试录入入口：题目身份（来源 + 年份 + 题号）→ questionKey → 自动版本链；
 * 题型 / 失分原因使用面试专属枚举；自评 + 他评双轨评分保留。
 * 数据只写 interviewRecords；老记录无新字段时按「未分类」展示且可编辑、数据不丢。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Mic, Video, PlusCircle, StopCircle, Trash2, X, Play, Pencil, History } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, putRecord, deleteRecord } from '../services/localDB';
import { buildInterviewQuestionHistory, buildInterviewStats, interviewAnsweredAt, interviewScorePercent } from '../services/analytics';
import {
  ERROR_CATEGORY_LABEL,
  INTERVIEW_ERROR_CATEGORIES,
  INTERVIEW_QUESTION_TYPES,
  UNCLASSIFIED_INTERVIEW_TYPE,
  type InterviewRecord,
} from '../domain/types';
import { makeQuestionKey, nowLocalInputValue, toAnsweredAtIso } from '../domain/subjectiveQuestion';

const DIMENSION_KEYS = ['content', 'structure', 'expression', 'fluency'] as const;
const DIMENSION_LABEL: Record<(typeof DIMENSION_KEYS)[number], string> = {
  content: '内容',
  structure: '结构',
  expression: '表达',
  fluency: '流畅',
};

const formatTime = (iso: string) => iso.slice(0, 16).replace('T', ' ');

export function InterviewRecordPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InterviewRecord | null>(null);
  const [parent, setParent] = useState<InterviewRecord | null>(null);

  const refresh = useCallback(async () => {
    const all = await getAllRecords('interviewRecords');
    setRecords(
      all
        .filter((r) => (prefs.currentStudentId ? r.studentId === prefs.currentStudentId : true))
        .sort((a, b) => interviewAnsweredAt(b).localeCompare(interviewAnsweredAt(a))),
    );
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stats = useMemo(() => buildInterviewStats(records), [records]);
  const history = useMemo(() => buildInterviewQuestionHistory(records), [records]);
  const legacy = useMemo(() => records.filter((r) => !r.questionKey), [records]);

  const remove = async (id: string) => {
    if (!window.confirm('确认删除该面试记录?')) return;
    await deleteRecord('interviewRecords', id);
    void refresh();
    showToast('已删除', 'info');
  };

  const openNew = () => {
    setEditing(null);
    setParent(null);
    setShowForm(true);
  };
  const openEdit = (record: InterviewRecord) => {
    setEditing(record);
    setParent(null);
    setShowForm(true);
  };
  const openRevision = (record: InterviewRecord) => {
    setEditing(null);
    setParent(record);
    setShowForm(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="面试记录（唯一录入入口）"
        description="面试统一在这里录入：题型 · 题目来源 + 题号 · 失分原因 · 自评/他评 · 作答时间。同一道题再次作答会按 questionKey 自动进入版本链。"
        actions={
          <button className="btn-primary" onClick={openNew}>
            <PlusCircle size={16} /> 新增记录
          </button>
        }
      />

      {records.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="font-semibold text-slate-900">面试统计（独立口径，不与申论混算）</h2>
            <span className="text-xs text-slate-400">共 {stats.total} 条</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">平均综合得分</div>
              <div className="text-lg font-semibold text-slate-900">
                {stats.avgScore === null ? '未评分' : `${stats.avgScore}%`}
              </div>
              <div className="text-[11px] text-slate-400">满分按 5 分制折算 · 已评分 {stats.ratedCount} 条</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">评分来源</div>
              <div className="text-sm font-medium text-slate-900">
                自评 {stats.selfCount} · 他评 {stats.teacherCount}
              </div>
              <div className="text-[11px] text-slate-400">双评 {stats.bothCount} 条；同维度双评取平均</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">未分类</div>
              <div className="text-sm font-medium text-slate-900">{stats.unclassifiedTypeCount} 条</div>
              <div className="text-[11px] text-slate-400">无版本键 {stats.withoutKeyCount} 条</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-xs text-slate-500">未记录失分原因</div>
              <div className="text-sm font-medium text-slate-900">{stats.untaggedCount} 条</div>
              <div className="text-[11px] text-slate-400">不影响评分与版本链</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">按面试题型</div>
              {stats.byType.length === 0 ? (
                <div className="text-xs text-slate-500">还没有命中面试题型枚举的记录。</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-100">
                        <th className="py-1.5">题型</th>
                        <th className="py-1.5 text-right">次数</th>
                        <th className="py-1.5 text-right">已评分</th>
                        <th className="py-1.5 text-right">平均综合得分</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byType.map((t) => (
                        <tr key={t.questionType} className="border-b border-slate-50">
                          <td className="py-1.5 text-slate-700">{t.questionType}</td>
                          <td className="py-1.5 text-right">{t.attempts}</td>
                          <td className="py-1.5 text-right text-slate-500">{t.ratedCount}</td>
                          <td className="py-1.5 text-right">{t.avgScore === null ? '—' : `${t.avgScore}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">按失分原因</div>
              {stats.tags.length === 0 ? (
                <div className="text-xs text-slate-500">还没有记录面试失分原因。</div>
              ) : (
                <div className="space-y-1">
                  {stats.tags.map((t) => (
                    <div key={t.tag} className="flex items-center gap-2">
                      <span className="text-xs text-slate-700 w-20 shrink-0">{t.tag}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded">
                        <div className="h-2 bg-red-400 rounded" style={{ width: `${Math.min(100, t.share)}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 w-16 text-right">
                        {t.count} 次 · {t.share}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-2 leading-relaxed">
            口径：面试统计只读 interviewRecords，独立于申论四维掌握度；综合得分按内容/结构/表达/流畅四维（1-5）计算，
            同维度自评 + 他评都在时取平均，再折算百分比；老记录的问题标签属于训练通用错因体系，不并入面试失分原因聚合，
            原记录照常展示。
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <EmptyState icon={Mic} title="尚无面试记录" description="点击右上按钮开始新一次面试训练" />
      ) : (
        <>
          {history.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History size={16} className="text-slate-500" />
                <h2 className="font-semibold text-slate-900">按题目（自动版本链）</h2>
                <span className="text-xs text-slate-400">同来源 + 题号 + 作答时间自动串联，不依赖手动指定版本</span>
              </div>
              {history.map((group) => {
                const latest = group.entries[group.entries.length - 1];
                const previous = group.entries[group.entries.length - 2];
                const latestScore = interviewScorePercent(latest);
                const prevScore = previous ? interviewScorePercent(previous) : null;
                return (
                  <div key={group.questionKey} className="card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge bg-blue-50 text-blue-700">{group.questionType || UNCLASSIFIED_INTERVIEW_TYPE}</span>
                      <span className="text-sm font-medium text-slate-900">
                        {group.paperSource || '未填来源'} · 第 {group.questionNo || '?'} 题
                      </span>
                      <span className="text-xs text-slate-400">{group.attempts} 个版本</span>
                      <span className="text-xs text-slate-400">最近 {formatTime(group.latestAnsweredAt)}</span>
                      <button className="btn-secondary text-xs ml-auto" onClick={() => openRevision(latest)}>
                        <PlusCircle size={12} /> 追加修订版
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-600">
                      <span>最新综合得分：{latestScore === null ? '未评分' : `${latestScore}%`}</span>
                      {latestScore !== null && prevScore !== null && (
                        <span className={latestScore >= prevScore ? 'text-emerald-600' : 'text-red-600'}>
                          较上次 {latestScore >= prevScore ? '+' : ''}
                          {Math.round((latestScore - prevScore) * 10) / 10} 分
                        </span>
                      )}
                      <span className="text-slate-400">版本按作答时间升序</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {group.entries.map((entry, index) => (
                        <div key={entry.id} className="border border-slate-100 rounded p-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="badge bg-slate-100 text-slate-600">v{entry.version ?? index + 1}</span>
                            <span className="text-slate-500">{formatTime(interviewAnsweredAt(entry))}</span>
                            <span className="text-slate-600">
                              综合 {interviewScorePercent(entry) === null ? '未评分' : `${interviewScorePercent(entry)}%`}
                            </span>
                            <span className="text-slate-400">
                              自评 {DIMENSION_KEYS.map((k) => entry.selfScore?.[k] ?? '-').join('/')}
                            </span>
                            {entry.teacherScore && (
                              <span className="text-emerald-700">
                                他评 {DIMENSION_KEYS.map((k) => entry.teacherScore?.[k] ?? '-').join('/')}
                              </span>
                            )}
                            <button className="btn-ghost text-xs ml-auto" onClick={() => openEdit(entry)}>
                              <Pencil size={12} /> 编辑
                            </button>
                            <button className="btn-ghost text-xs text-red-500" onClick={() => void remove(entry.id)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                          {(entry.errorTags?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {entry.errorTags?.map((tag) => (
                                <span key={tag} className="badge bg-red-50 text-red-600">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(legacy.length > 0 || history.length === 0) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900">未分类 / 老记录</h2>
                <span className="text-xs text-slate-400">缺少来源或题号，暂不参与自动版本链；仍可正常编辑补全</span>
              </div>
              {(legacy.length > 0 ? legacy : records).map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  onEdit={() => openEdit(r)}
                  onDelete={() => void remove(r.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showForm && (
        <RecordForm
          initial={editing}
          parent={parent}
          studentId={prefs.currentStudentId}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('已保存', 'success');
          }}
        />
      )}
    </div>
  );
}

function RecordCard({
  record,
  onEdit,
  onDelete,
}: {
  record: InterviewRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const score = interviewScorePercent(record);
  const typeClassified = (INTERVIEW_QUESTION_TYPES as readonly string[]).includes(record.questionType ?? '');
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${typeClassified ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
              {record.questionType?.trim() || UNCLASSIFIED_INTERVIEW_TYPE}
            </span>
            <span className="text-xs text-slate-500">{formatTime(interviewAnsweredAt(record))}</span>
            <span className="text-xs text-slate-500">思考 {record.thinkingSec}s · 答题 {record.answerSec}s</span>
            {score !== null && <span className="text-xs text-slate-600">综合 {score}%</span>}
            {!record.questionKey && <span className="badge bg-amber-50 text-amber-700">信息不足：缺来源/题号</span>}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600 mt-2">
            {DIMENSION_KEYS.map((k) => (
              <span key={k}>
                {DIMENSION_LABEL[k]} {record.selfScore?.[k] ?? '-'}/5
              </span>
            ))}
          </div>
          {record.teacherScore && (
            <div className="text-xs text-emerald-700 mt-1">
              教师: {DIMENSION_KEYS.map((k) => `${DIMENSION_LABEL[k]} ${record.teacherScore?.[k] ?? '-'}/5`).join(' · ')}
              {record.teacherScore.note ? ` · ${record.teacherScore.note}` : ''}
            </div>
          )}
          {(record.errorTags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {record.errorTags?.map((tag) => (
                <span key={tag} className="badge bg-red-50 text-red-600 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {record.problemTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {record.problemTags.map((t) => (
                <span key={t} className="badge bg-slate-50 text-slate-500 text-xs">
                  历史标签：{ERROR_CATEGORY_LABEL[t] ?? t}
                </span>
              ))}
            </div>
          )}
          {record.audioDataUrl && <audio className="mt-2 w-full max-w-md" controls src={record.audioDataUrl} />}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-ghost text-slate-600" onClick={onEdit} title="编辑">
            <Pencil size={14} />
          </button>
          <button className="btn-ghost text-red-500" onClick={onDelete} title="删除">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordForm({
  initial,
  parent,
  onClose,
  onSaved,
  studentId,
}: {
  initial: InterviewRecord | null;
  parent: InterviewRecord | null;
  onClose: () => void;
  onSaved: () => void;
  studentId?: string;
}) {
  const base = initial ?? parent;
  const initialType = base?.questionType?.trim() ?? '';
  const [questionType, setQuestionType] = useState(
    (INTERVIEW_QUESTION_TYPES as readonly string[]).includes(initialType) ? initialType : '综合分析',
  );
  const [paperSource, setPaperSource] = useState(base?.paperSource ?? '');
  const [paperYear, setPaperYear] = useState(base?.paperYear ?? '');
  const [questionNo, setQuestionNo] = useState(base?.questionNo ?? '');
  const [answeredAt, setAnsweredAt] = useState(
    base ? interviewAnsweredAt(base).slice(0, 16) : nowLocalInputValue(),
  );
  const [thinkingSec, setThinkingSec] = useState(base?.thinkingSec ?? 75);
  const [answerSec, setAnswerSec] = useState(base?.answerSec ?? 180);
  const [self, setSelf] = useState(base?.selfScore ?? { content: 3, structure: 3, expression: 3, fluency: 3 });
  const [hasTeacher, setHasTeacher] = useState(!!base?.teacherScore);
  const [teacher, setTeacher] = useState(base?.teacherScore ?? { content: 3, structure: 3, expression: 3, fluency: 3 });
  const [teacherNote, setTeacherNote] = useState(base?.teacherScore?.note ?? '');
  const [errorTags, setErrorTags] = useState<string[]>(base?.errorTags ?? []);
  const [audioDataUrl, setAudioDataUrl] = useState<string | undefined>(base?.audioDataUrl);
  const [isRecording, setIsRecording] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => setAudioDataUrl(reader.result as string);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      alert('浏览器无法访问麦克风, 或未授权');
    }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const toggleTag = (tag: string) => {
    setErrorTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  };

  const submit = async () => {
    if (saving) return;
    setFormError(null);
    const answeredAtIso = toAnsweredAtIso(answeredAt);
    if (!answeredAtIso) {
      setFormError('请填写有效的作答时间');
      return;
    }
    if (!questionType.trim()) {
      setFormError('请选择面试题型');
      return;
    }
    if (!paperSource.trim()) {
      setFormError('请填写题目来源（如「2023 国考面试真题」）；同来源 + 题号用于识别同一道题');
      return;
    }
    if (!questionNo.trim()) {
      setFormError('请填写题号；同来源 + 题号用于识别同一道题');
      return;
    }
    const key = makeQuestionKey({
      subject: 'mianshi',
      paperSource,
      paperYear,
      questionNo,
    });
    if (!key) {
      setFormError('题目身份不完整，无法生成版本键');
      return;
    }

    const now = new Date().toISOString();
    let version = initial ? initial.version ?? 1 : parent ? (parent.version ?? 0) + 1 : 1;
    let parentId = initial ? initial.parentId : parent?.id;
    if (initial) {
      // 编辑历史记录：保持原版本号；若补全了 questionKey，则并入已有版本链
      const all = await getAllRecords('interviewRecords');
      const siblings = all
        .filter((r) => r.studentId === studentId && r.questionKey === key && r.id !== initial.id)
        .sort((a, b) => interviewAnsweredAt(a).localeCompare(interviewAnsweredAt(b)));
      if (siblings.length > 0) {
        version = Math.max(0, ...siblings.map((r) => r.version ?? 0)) + 1;
        parentId = siblings[siblings.length - 1].id;
      }
    } else {
      const all = await getAllRecords('interviewRecords');
      const siblings = all
        .filter((r) => r.studentId === studentId && r.questionKey === key)
        .sort((a, b) => interviewAnsweredAt(a).localeCompare(interviewAnsweredAt(b)));
      const latest = siblings[siblings.length - 1];
      version = Math.max(0, ...siblings.map((r) => r.version ?? 0)) + 1;
      parentId = latest?.id ?? parentId;
    }

    const record: InterviewRecord = {
      id: initial?.id ?? uuid(),
      studentId,
      date: answeredAt.slice(0, 10),
      questionType: questionType.trim(),
      thinkingSec,
      answerSec,
      selfScore: self,
      teacherScore: hasTeacher ? { ...teacher, ...(teacherNote.trim() ? { note: teacherNote.trim() } : {}) } : undefined,
      audioDataUrl,
      problemTags: initial?.problemTags ?? [],
      answeredAt: answeredAtIso,
      paperSource: paperSource.trim(),
      ...(paperYear.trim() ? { paperYear: paperYear.trim() } : {}),
      questionNo: questionNo.trim(),
      questionKey: key,
      ...(errorTags.length > 0 ? { errorTags } : {}),
      parentId,
      version,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    setSaving(true);
    await putRecord('interviewRecords', record);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl max-h-[95vh] overflow-y-auto p-6 modal-clamp [--modal-max:42rem] [--modal-max-h:95vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">
            {initial ? '编辑面试记录' : parent ? `追加 v${(parent.version ?? 0) + 1} 修订版` : '新增面试训练'}
          </h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">面试题型 ★</label>
            <select className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
              {INTERVIEW_QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="col-span-2 sm:col-span-1">
              <label className="label">题目来源 ★</label>
              <input className="input" value={paperSource} onChange={(e) => setPaperSource(e.target.value)} placeholder="如 2023 国考面试真题" />
            </div>
            <div>
              <label className="label">年份 / 场次</label>
              <input className="input" value={paperYear} onChange={(e) => setPaperYear(e.target.value)} placeholder="如 2023 第一批" />
            </div>
            <div>
              <label className="label">题号 ★</label>
              <input className="input" value={questionNo} onChange={(e) => setQuestionNo(e.target.value)} placeholder="如 1 / 第三题" />
            </div>
            <div>
              <label className="label">作答时间 ★</label>
              <input className="input" type="datetime-local" value={answeredAt} onChange={(e) => setAnsweredAt(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">思考时间(秒)</label>
              <input className="input" type="number" min={0} value={thinkingSec} onChange={(e) => setThinkingSec(+e.target.value || 0)} />
            </div>
            <div>
              <label className="label">答题时间(秒)</label>
              <input className="input" type="number" min={0} value={answerSec} onChange={(e) => setAnswerSec(+e.target.value || 0)} />
            </div>
          </div>

          <div>
            <label className="label">自评(每项 1-5)</label>
            <div className="grid grid-cols-4 gap-2">
              {DIMENSION_KEYS.map((k) => (
                <div key={k}>
                  <div className="text-xs text-slate-500">{DIMENSION_LABEL[k]}</div>
                  <input
                    className="input py-1"
                    type="number"
                    min={1}
                    max={5}
                    value={self[k]}
                    onChange={(e) => setSelf({ ...self, [k]: Math.max(1, Math.min(5, +e.target.value || 1)) })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={hasTeacher} onChange={(e) => setHasTeacher(e.target.checked)} />
              记录教师/他评（双评，统计时同维度取平均）
            </label>
            {hasTeacher && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  {DIMENSION_KEYS.map((k) => (
                    <div key={k}>
                      <div className="text-xs text-slate-500">{DIMENSION_LABEL[k]}</div>
                      <input
                        className="input py-1"
                        type="number"
                        min={1}
                        max={5}
                        value={teacher[k]}
                        onChange={(e) => setTeacher({ ...teacher, [k]: Math.max(1, Math.min(5, +e.target.value || 1)) })}
                      />
                    </div>
                  ))}
                </div>
                <input className="input" value={teacherNote} onChange={(e) => setTeacherNote(e.target.value)} placeholder="教师点评（选填）" />
              </div>
            )}
          </div>

          <div>
            <label className="label">失分原因（面试专属，可多选，选填）</label>
            <div className="flex flex-wrap gap-2">
              {INTERVIEW_ERROR_CATEGORIES.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`badge cursor-pointer px-2 py-1 ${errorTags.includes(tag) ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-400 mt-1">不选不影响保存，但会影响面试失分原因统计。</div>
          </div>

          <div>
            <label className="label">录音附件</label>
            <div className="flex items-center gap-2">
              {!isRecording ? (
                <button className="btn-secondary text-sm" onClick={startRecording}>
                  <Mic size={14} /> 开始录音
                </button>
              ) : (
                <button className="btn-primary text-sm" onClick={stopRecording}>
                  <StopCircle size={14} /> 停止录音
                </button>
              )}
              <button className="btn-secondary text-sm" disabled>
                <Video size={14} /> 视频(暂只支持音频)
              </button>
              {audioDataUrl && <span className="text-xs text-emerald-600 flex items-center gap-1"><Play size={12} /> 录音已就绪</span>}
            </div>
            {audioDataUrl && <audio className="mt-2 w-full" controls src={audioDataUrl} />}
          </div>

          {formError && <div className="text-xs text-red-600">{formError}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
