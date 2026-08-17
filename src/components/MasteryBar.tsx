import { scoreToLevel, MASTERY_LABEL } from '../domain/types';

interface Props {
  score: number;
  showLabel?: boolean;
  className?: string;
}

const LEVEL_STYLE: Record<string, string> = {
  unmastered: 'bg-slate-200',
  basic: 'bg-orange-400',
  proficient: 'bg-blue-500',
  expert: 'bg-emerald-500',
};

const TEXT_STYLE: Record<string, string> = {
  unmastered: 'text-slate-500 bg-slate-100',
  basic: 'text-orange-600 bg-orange-50',
  proficient: 'text-blue-600 bg-blue-50',
  expert: 'text-emerald-600 bg-emerald-50',
};

export function MasteryBar({ score, showLabel = true, className = '' }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const level = scoreToLevel(clamped);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${LEVEL_STYLE[level]}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-700 w-9 text-right">{clamped}%</span>
      {showLabel && (
        <span className={`badge ${TEXT_STYLE[level]}`}>{MASTERY_LABEL[level]}</span>
      )}
    </div>
  );
}
