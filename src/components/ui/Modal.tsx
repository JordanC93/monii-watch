import { type ReactNode, useEffect } from 'react';
import { cn } from '../../lib/cn';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Tailwind max-w- token */
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

const sizes = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/**
 * Modal — bottom sheet on mobile (full width, slides up), centered card on
 * desktop. Closes on Esc or backdrop click. Auto-pads for iOS safe-area.
 */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4 animate-fade-in modal-sheet-container"
      // Landscape Dynamic Island: side insets pull the entire modal in so
      // its rounded corners + close button aren't hidden under the Island.
      style={{
        paddingLeft: 'env(safe-area-inset-left, 0)',
        paddingRight: 'env(safe-area-inset-right, 0)',
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full bg-elevated text-fg shadow-glass-lg overflow-hidden glass-panel modal-sheet-card',
          'animate-slide-up sm:animate-scale-in',
          'rounded-t-2xl sm:rounded-2xl',
          'max-h-[92vh] flex flex-col',
          sizes[size],
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <div className="text-sm font-semibold">{title}</div>
          <button
            className="text-fg-subtle hover:text-fg p-1.5 -mr-1 rounded"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer ? <div className="px-5 py-3 border-t border-border bg-surface-2/40 flex-shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}
