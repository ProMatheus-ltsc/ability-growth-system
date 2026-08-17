import { useToast } from '@shared/core';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export function Toaster() {
  const { toasts, removeToast } = useToast();
  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const color =
          t.type === 'success'
            ? 'bg-green-50 text-green-800 border-green-200'
            : t.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : t.type === 'warning'
                ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                : 'bg-blue-50 text-blue-800 border-blue-200';
        const Icon =
          t.type === 'success'
            ? CheckCircle2
            : t.type === 'error' || t.type === 'warning'
              ? AlertTriangle
              : Info;
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 shadow-sm text-sm min-w-[220px] max-w-md ${color}`}
          >
            <Icon size={16} />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
