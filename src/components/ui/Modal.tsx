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

  // v0.7.25 — `onClose` lives in a ref so the focus / key-listener
  // effect below doesn't have to depend on it. The previous version
  // listed `onClose` directly in the deps array, which caused the
  // entire effect to re-run on every parent render that passed an
  // inline `onClose={() => ...}` (which most callers do). Re-running
  // the effect calls `cardRef.current.focus()` on every render →
  // steals focus from the input the user is typing in → on iOS
  // WKWebView the keyboard dismisses on every keystroke. Desktop
  // browsers were silently affected too but kept the cursor in the
  // input so it wasn't visible.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Body scroll lock while open.
  //
  // iOS WKWebView (Capacitor + the PWA in Safari) doesn't always honor
  // `body { overflow: hidden }` for touch-drag scrolling — the modal
  // floats on top, but a one-finger drag on the backdrop still scrolls
  // the page behind it. The bulletproof fix is the "freeze body in
  // place" pattern: snapshot scrollY, then set body to position:fixed
  // with top:-scrollY so the body visually stays put. On close we
  // restore the styles AND scrollTo(0, scrollY) so the user lands back
  // exactly where they were.
  //
  // Layered: also zero `overflow` because some browsers (older Android
  // WebView) ignore the position:fixed approach.
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      // Restore scroll position. Without this the page jumps back to
      // the top when the modal closes (because position:fixed reset
      // scrollY to 0 while it was active).
      window.scrollTo(0, scrollY);
    };
  }, [open]);

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
      if (e.key === 'Escape') onCloseRef.current();
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
    // Intentionally NO `onClose` in deps. We use the ref above so the
    // effect runs exactly once per modal open / close, not once per
    // render. Adding `onClose` here is what caused the iOS keyboard-
    // dismiss-on-every-keystroke bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        {/*
          v0.7.30 — `overflow-x-hidden` is critical. Per the CSS spec,
          setting `overflow-y: auto` while `overflow-x` is `visible`
          coerces overflow-x to `auto` (used value), which means any
          oversized child (a long unbreakable string, a wide grid, an
          off-screen icon) silently enables horizontal scrolling on the
          whole modal. Pinning overflow-x to hidden forces content to
          reshape to the modal width instead of letting the user pan
          left/right to find the rest of the form.
          v0.7.30 — also reduce padding on mobile from p-5 (20px) to
          p-4 (16px). On a 360 px viewport that buys 8 px back per row
          for the actual content — the difference between a row that
          fits and one that crowds.
        */}
        <div className="p-4 sm:p-5 overflow-y-auto overflow-x-hidden flex-1">{children}</div>
        {footer ? <div className="px-5 py-3 border-t border-border bg-surface-2/40 flex-shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}
