import { AlertCircle, BellOff, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { TOAST_CATEGORIES, useToastStore, type Toast } from '../store/toast';

const ICON: Record<Toast['kind'], { Icon: typeof Info; color: string; bar: string }> = {
  info: { Icon: Info, color: 'text-accent', bar: 'bg-accent' },
  success: { Icon: CheckCircle2, color: 'text-accent-success', bar: 'bg-accent-success' },
  warn: { Icon: AlertTriangle, color: 'text-accent-warn', bar: 'bg-accent-warn' },
  error: { Icon: AlertCircle, color: 'text-accent-danger', bar: 'bg-accent-danger' },
};

function categoryLabel(key: string): string {
  return TOAST_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export default function ToastContainer(): JSX.Element {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);
  const muteCategory = useToastStore((s) => s.muteCategory);
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 pointer-events-none w-[360px]">
      {items.map((t) => {
        const meta = ICON[t.kind];
        return (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto bg-bg-sub border border-zinc-800 rounded-lg shadow-xl overflow-hidden',
              'animate-in slide-in-from-right-5',
            )}
          >
            <div className={clsx('h-0.5', meta.bar)} />
            <div className="p-3 pr-2 flex items-start gap-2.5">
              <meta.Icon className={clsx('h-4 w-4 mt-0.5 flex-shrink-0', meta.color)} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{t.title}</div>
                {t.message && (
                  <div className="text-xs text-text-muted mt-0.5 break-words">{t.message}</div>
                )}
                {t.category && (
                  <div className="mt-1.5">
                    <button
                      onClick={() => {
                        muteCategory(t.category!, true);
                        dismiss(t.id);
                      }}
                      title={`Mute all "${categoryLabel(t.category)}" notifications`}
                      className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      <BellOff className="h-3 w-3" />
                      Mute {categoryLabel(t.category)}
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-bg-elev text-text-muted hover:text-text-primary cursor-pointer flex-shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
