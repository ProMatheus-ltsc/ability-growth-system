import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="card p-8 flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-500">
        <Icon size={24} />
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {description && <p className="text-sm text-slate-500 mt-2 max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
