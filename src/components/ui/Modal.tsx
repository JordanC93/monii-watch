import { type ReactNode, useEffect, useRef } from 'react';
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
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // a11y: capture the focused element BEFORE the modal opens so we can
  // return focus to it when the modal closes. Move focus into the
  // modal once it's mounted.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    // Focus the modal card itself; the user can Tab into the first
    // interactive element.
    requestAnimationFrame(() => {
      const focusable = cardRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? cardRef.current)?.focus();
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      // Trap Tab inside the modal. Without this, focus can drift behind
      // the backdrop into hidden chrome — confusing for screen readers.
      if (e.key === 'Tab' && cardRef.current) {
        const focusables = Array.from(
          cardRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Return focus to the trigger so keyboard users don't get dumped
      // back to the top of the page.
      try { triggerRef.current?.focus(); } catch {}
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4 animate-fade-in modal-sheet-container"
      // Landscape Dynamic Island: side insets pull the entire modal in so
      // its rounded corners + close button aren't hidden under the Island.
      style={{
        paddingLeft: 'env(safe-area-inset-left, 0)',
        paddingRight: 'env(safe-area-inset-right, 0)',
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={cardRef}
        tabIndex={-1}
        className={cn(
          'relative w-full bg-elevated text-fg shadow-glass-lg overflow-hidden glass-panel modal-sheet-card',
          'animate-slide-up sm:animate-scale-in',
          'rounded-t-2xl sm:rounded-2xl',
          'max-h-[92vh] flex flex-col focus:outline-none',
          sizes[size],
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
          <div id="modal-title" className="text-sm font-semibold">{title}</div>
          <button
            className="text-fg-subtle hover:text-fg p-1.5 -mr-1 rounded"
            onClick={onClose}
            aria-label="Close dialog"
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
