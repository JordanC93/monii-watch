import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

type Props = {
  /** Short title shown bold at the top of the popover. */
  title?: string;
  /** Body content. Plain text or React nodes. */
  children: ReactNode;
  /** Pixel size of the icon. Default 13. */
  size?: number;
  /** Where the popover anchors. Defaults to "below". */
  side?: 'top' | 'bottom';
  className?: string;
};

/**
 * Inline contextual help. Renders a small "?" button next to whatever it's
 * placed beside; clicking (or tapping on mobile) opens a small popover with
 * the explanation. Closes on outside click or Esc.
 *
 * Touch-friendly: the button itself is 24×24 (above iOS HIG min), the
 * popover sits below by default so it doesn't get cut off by the OS
 * status bar on phones. Use `side="top"` near the bottom of the screen.
 */
export function HelpHint({ title, children, size = 13, side = 'bottom', className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent | TouchEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label={title ? `What is ${title}?` : 'Help'}
        className="text-fg-subtle hover:text-fg-muted active:scale-95 p-1 -m-1 rounded"
      >
        <HelpCircle size={size} />
      </button>
      {open && (
        <div
          role="tooltip"
          className={cn(
            'absolute left-1/2 -translate-x-1/2 z-40 w-64 max-w-[80vw] glass-panel p-3 text-[12px] leading-relaxed shadow-glass-lg animate-fade-in',
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
          )}
        >
          {title && <div className="text-[12.5px] font-semibold mb-1">{title}</div>}
          <div className="text-fg-muted">{children}</div>
        </div>
      )}
    </span>
  );
}
