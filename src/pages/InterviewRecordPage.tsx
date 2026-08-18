/**
 * PRD V5.8 §15.1 面试专项训练记录
 * 音视频附件(浏览器录音/录像转 Base64) · 思考时间 · 答题时间 · 自评+他评双轨
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Mic, Video, PlusCircle, StopCircle, Trash2, X, Play } from 'lucide-react';
import { useToast } from '@shared/core';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppSession } from '../hooks/useAppSession';
import { getAllRecords, putRecord, deleteRecord } from '../services/localDB';
import { ERROR_CATEGORY_LABEL, type ErrorCategory, type InterviewRecord } from '../domain/types';

const TAG_LIB: ErrorCategory[] = ['structure', 'argument', 'language', 'read', 'concept', 'time'];

export function InterviewRecordPage() {
  const { prefs } = useAppSession();
  const { showToast } = useToast();
  const [records, setRecords] = useState<InterviewRecord[]>([]);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    const all = await getAllRecords('interviewRecords');
    setRecords(
      all
        .filter((r) => (prefs.currentStudentId ? r.studentId === prefs.currentStudentId : true))
        .sort((a, b) => b.date.localeCompare(a.date)),
    );
  }, [prefs.currentStudentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (id: string) => {
    if (!window.confirm('确认删除该面试记录?')) return;
    await deleteRecord('interviewRecords', id);
    void refresh();
    showToast('已删除', 'info');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="面试专项训练"
        description="面试的核心不是刷题数量, 而是表达能力 + 思考能力 + 临场能力。 支持音频录制 · 思考/答题时间 · 自评+他评。"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <PlusCircle size={16} /> 新增记录
          </button>
        }
      />

      {records.length === 0 ? (
        <EmptyState icon={Mic} title="尚无面试记录" description="点击右上按钮开始新一次面试训练" />
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <RecordCard key={r.id} record={r} onDelete={() => remove(r.id)} />
          ))}
        </div>
      )}

      {showForm && (
        <RecordForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void refresh();
            showToast('已保存', 'success');
          }}
          studentId={prefs.currentStudentId}
        />
      )}
    </div>
  );
}

function RecordCard({ record, onDelete }: { record: InterviewRecord; onDelete: () => void }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="badge bg-blue-50 text-blue-700">{record.questionType}</span>
            <span className="text-xs text-slate-500">{record.date}</span>
            <span className="text-xs text-slate-500">思考 {record.thinkingSec}s · 答题 {record.answerSec}s</span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600 mt-2">
            <span>内容 {record.selfScore.content}/5</span>
            <span>结构 {record.selfScore.structure}/5</span>
            <span>表达 {record.selfScore.expression}/5</span>
            <span>流畅 {record.selfScore.fluency}/5</span>
          </div>
          {record.teacherScore && (
            <div className="text-xs text-emerald-700 mt-1">
              教师: 内容 {record.teacherScore.content}/5 · 结构 {record.teacherScore.structure}/5 · 表达 {record.teacherScore.expression}/5 · 流畅 {record.teacherScore.fluency}/5
              {record.teacherScore.note ? ` · ${record.teacherScore.note}` : ''}
            </div>
          )}
          {record.problemTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {record.problemTags.map((t) => (
                <span key={t} className="badge bg-red-50 text-red-600 text-xs">
                  {ERROR_CATEGORY_LABEL[t]}
                </span>
              ))}
            </div>
          )}
          {record.audioDataUrl && (
            <audio className="mt-2 w-full max-w-md" controls src={record.audioDataUrl} />
          )}
        </div>
        <button className="btn-ghost text-red-500" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function RecordForm({
  onClose,
  onSaved,
  studentId,
}: {
  onClose: () => void;
  onSaved: () => void;
  studentId?: string;
}) {
  const [questionType, setQuestionType] = useState('综合分析');
  const [thinkingSec, setThinkingSec] = useState(75);
  const [answerSec, setAnswerSec] = useState(180);
  const [self, setSelf] = useState({ content: 3, structure: 3, expression: 3, fluency: 3 });
  const [problemTags, setProblemTags] = useState<ErrorCategory[]>([]);
  const [audioDataUrl, setAudioDataUrl] = useState<string | undefined>();
  const [isRecording, setIsRecording] = useState(false);
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

  const toggleTag = (t: ErrorCategory) => {
    setProblemTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submit = async () => {
    const now = new Date().toISOString();
    const record: InterviewRecord = {
      id: uuid(),
      studentId,
      date: now.slice(0, 10),
      questionType,
      thinkingSec,
      answerSec,
      selfScore: self,
      audioDataUrl,
      problemTags,
      createdAt: now,
      updatedAt: now,
    };
    await putRecord('interviewRecords', record);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card w-full max-w-lg max-h-[95vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">新增面试训练</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">题型</label>
            <select className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
              <option>综合分析</option>
              <option>计划组织</option>
              <option>人际关系</option>
              <option>应急应变</option>
              <option>情境模拟</option>
              <option>自我认知</option>
            </select>
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
              {(['content', 'structure', 'expression', 'fluency'] as const).map((k) => (
                <div key={k}>
                  <div className="text-xs text-slate-500">{k === 'content' ? '内容' : k === 'structure' ? '结构' : k === 'expression' ? '表达' : '流畅'}</div>
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
            <label className="label">问题标签</label>
            <div className="flex flex-wrap gap-2">
              {TAG_LIB.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`badge cursor-pointer px-2 py-1 ${problemTags.includes(t) ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}
                >
                  {ERROR_CATEGORY_LABEL[t]}
                </button>
              ))}
            </div>
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
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={submit}>保存</button>
        </div>
      </div>
    </div>
  );
}
