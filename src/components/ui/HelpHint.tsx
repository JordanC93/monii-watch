import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import { cn } from '../../lib/cn';

type Props = {
  /** Short title shown bold at the top of the popover. */
  title?: string;
  /** Body content. Plain text or React nodes. */
  children: ReactNode;
  /** Pixel size of the icon. Default 13. */
  size?: number;
  /** Where the popover anchors. Defaults to "below". Ignored on mobile,
   *  which always uses a centered sheet style. */
  side?: 'top' | 'bottom';
  className?: string;
};

const POPOVER_WIDTH = 280; // px; matches w-[280px]
const VIEWPORT_MARGIN = 12; // px gutter from screen edges
const MOBILE_BREAKPOINT = 640; // px; below this → centered modal style

/**
 * Inline contextual help. Renders a small "?" button next to whatever
 * it's placed beside; clicking opens a small popover with the
 * explanation. Closes on outside click or Esc.
 *
 * v0.7.11 rewrite addresses two bugs from the original implementation:
 *
 *   1. Mobile overflow. The original used `absolute left-1/2
 *      -translate-x-1/2` so the popover centered on its parent. When
 *      the parent sat near the screen edge the popover ran off the
 *      viewport, and on small phones the popover wider than 80vw
 *      didn't fit at all. Now: < 640 px viewport renders the popover
 *      as a centered fixed sheet with a backdrop dimmer. Always fits.
 *
 *   2. Glass-theme readability. The original used `glass-panel` which
 *      on the glass theme is ~6% surface alpha; underlying text bled
 *      through. Now the popover uses an opaque elevated surface
 *      regardless of theme so the body copy is always legible.
 *
 * Portals to document.body so the popover escapes any parent overflow
 * or stacking context. Position is computed from the button's
 * bounding rect and clamped to the viewport with a margin.
 */
export function HelpHint({ title, children, size = 13, side = 'bottom', className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Track viewport size. The mobile vs desktop layout choice is sticky
  // for the lifetime of an open popover, but for next-open we re-read.
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < MOBILE_BREAKPOINT); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Compute the popover position when it opens (desktop layout only —
  // mobile uses a centered sheet with no per-button anchoring).
  useEffect(() => {
    if (!open || isMobile) { setPos(null); return; }
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popoverW = Math.min(POPOVER_WIDTH, vw - VIEWPORT_MARGIN * 2);

    // Default: center horizontally on the button. Clamp left/right to
    // viewport bounds with VIEWPORT_MARGIN gutter.
    let left = r.left + r.width / 2 - popoverW / 2;
    if (left + popoverW > vw - VIEWPORT_MARGIN) left = vw - VIEWPORT_MARGIN - popoverW;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    // Default: below the button. Flip above if it would overflow the
    // bottom edge.
    const wantsBelow = side === 'bottom';
    let top = wantsBelow ? r.bottom + 6 : r.top - 6;
    // Estimate popover height. Don't have it yet; assume a generous
    // ~200 px for the flip check. The actual popover will fit content
    // and may be shorter; that's fine.
    const estH = 200;
    if (wantsBelow && top + estH > vh - VIEWPORT_MARGIN) {
      top = r.top - estH - 6;
    }
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

    setPos({ top, left });
  }, [open, isMobile, side]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
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

  const popoverContent = (
    <div
      ref={popoverRef}
      role="tooltip"
      className="help-hint-popover text-[12.5px] leading-relaxed animate-fade-in"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        {title && <div className="text-[13px] font-semibold">{title}</div>}
        {isMobile && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close help"
            className="text-fg-subtle hover:text-fg p-0.5 -mr-0.5 -mt-0.5 rounded"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="text-fg-muted">{children}</div>
    </div>
  );

  return (
    <>
      <span className={cn('relative inline-flex items-center', className)}>
        <button
          ref={buttonRef}
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          aria-label={title ? `What is ${title}?` : 'Help'}
          aria-expanded={open}
          className="text-fg-subtle hover:text-fg-muted active:scale-95 p-1 -m-1 rounded"
        >
          <HelpCircle size={size} />
        </button>
      </span>
      {open && typeof document !== 'undefined' && createPortal(
        isMobile ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
            style={{
              paddingLeft: 'max(1rem, env(safe-area-inset-left, 0))',
              paddingRight: 'max(1rem, env(safe-area-inset-right, 0))',
            }}
          >
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div className="relative w-full max-w-sm">
              {popoverContent}
            </div>
          </div>
        ) : (
          <div
            className="fixed z-50"
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: Math.min(POPOVER_WIDTH, typeof window !== 'undefined' ? window.innerWidth - VIEWPORT_MARGIN * 2 : POPOVER_WIDTH),
            }}
          >
            {popoverContent}
          </div>
        ),
        document.body,
      )}
    </>
  );
}
