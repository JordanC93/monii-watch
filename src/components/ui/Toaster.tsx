import { useEffect, useState } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X, Undo2 } from 'lucide-react';
import { listToasts, subscribeToasts, dismissToast, type Toast, type ToastTone } from '../../lib/toast';
import { cn } from '../../lib/cn';

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 size={14} className="text-positive" />,
  info:    <Info size={14} className="text-accent" />,
  warn:    <AlertTriangle size={14} className="text-warning" />,
  error:   <XCircle size={14} className="text-negative" />,
};

const TONE_RING: Record<ToastTone, string> = {
  success: 'ring-positive/30',
  info:    'ring-accent/30',
  warn:    'ring-warning/30',
  error:   'ring-negative/40',
};

/**
 * Top-center toast stack. Mounted once at the app root next to ChatPanel /
 * CommandPalette. Stays out of the way (above content, below modals).
 */
export function Toaster() {
  const [, force] = useState(0);
  useEffect(() => subscribeToasts(() => force((x) => x + 1)), []);
  const toasts = listToasts();
  if (toasts.length === 0) return null;
  return (
    <div
      // Position: top-center on desktop (≥md), bottom-center on mobile.
      // Mobile bottom keeps toasts away from the floating Search/Chat
      // circles in the top-right and from the iPhone Dynamic Island.
      // The bottom anchor sits well above the BottomNav (~80 px) +
      // the home indicator inset.
      // Live-region announce: aria-live="polite" lets screen readers
      // read each new toast without interrupting the current speech.
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none top-3 md:top-3 max-md:top-auto max-md:bottom-[calc(80px+env(safe-area-inset-bottom,0))]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
    >
      {toasts.map((t) => <ToastRow key={t.id} t={t} />)}
    </div>
  );
}

function ToastRow({ t }: { t: Toast }) {
  function onUndo() {
    try { t.undo?.(); } finally { dismissToast(t.id); }
  }
  function onAction() {
    try { t.action?.run(); } finally { dismissToast(t.id); }
  }
  return (
    <div
      className={cn(
        'pointer-events-auto glass-panel flex items-center gap-2 pl-3 pr-2 py-2 max-w-[92vw] sm:max-w-md min-h-[40px] shadow-glass animate-fade-in ring-1',
        TONE_RING[t.tone],
      )}
    >
      <span className="flex-shrink-0">{ICONS[t.tone]}</span>
      <span className="text-[12.5px] leading-snug min-w-0 flex-1">{t.message}</span>
      {t.action && (
        <button
          onClick={onAction}
          className="px-2 py-1 rounded text-[11.5px] font-medium text-accent hover:bg-accent/15 active:scale-95 whitespace-nowrap"
        >
          {t.action.label}
        </button>
      )}
      {t.undo && (
        <button
          onClick={onUndo}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11.5px] font-medium text-accent hover:bg-accent/15 active:scale-95"
        >
          <Undo2 size={11} /> Undo
        </button>
      )}
      <button
        onClick={() => dismissToast(t.id)}
        className="text-fg-subtle hover:text-fg p-1 rounded"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
