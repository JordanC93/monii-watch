import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

type Props = {
  /** Short title shown bold at the top of the popover. */
  title?: string;
  /** Body content. Plain text or React nodes. */
  children: ReactNode;
  /** Pixel size of the icon. Default 13. */
  size?: number;
  /** Where the popover anchors. Defaults to "below". Auto-flips to
   *  "above" when there isn't room below. */
  side?: 'top' | 'bottom';
  className?: string;
};

const POPOVER_WIDTH = 280; // px
const VIEWPORT_MARGIN = 12; // px gutter from screen edges

/**
 * Inline contextual help. Renders a small "?" button next to whatever
 * it's placed beside; clicking opens a small popover with the
 * explanation. Closes on outside click or Esc.
 *
 * v0.7.13 — keeps the original subtle popover UX (pops up beside the
 * icon, no full-screen modal) but with two surviving fixes from the
 * v0.7.11 rewrite:
 *
 *   1. Portal rendering. The popover `createPortal`s into
 *      `document.body` so it escapes any parent overflow / stacking
 *      context. Without this it could be clipped by a parent's
 *      `overflow: hidden` (modals, scrollable cards) or break the
 *      parent's layout altogether.
 *
 *   2. Bounds-aware positioning. Computes its position from the
 *      trigger button's `getBoundingClientRect()` and clamps to the
 *      viewport with a 12 px gutter on every edge, so it can't run
 *      off the screen even when the trigger is near a corner. Also
 *      auto-flips to "above" if the default "below" placement would
 *      overflow the viewport bottom.
 *
 *   3. Opaque-with-blur background. The popover uses an opaque
 *      surface backdrop, NOT the translucent `glass-panel` material,
 *      so body copy stays readable even when the popover lands on
 *      top of other text. On the glass theme it keeps a heavy
 *      `backdrop-filter: blur` so the area behind it gets a haze /
 *      mist effect — visually cohesive with the rest of the glass
 *      surfaces, but legible.
 */
export function HelpHint({ title, children, size = 13, side = 'bottom', className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Compute the popover position when it opens, on resize, and on
  // scroll. Portal-rendered popovers don't follow their trigger
  // automatically when the page scrolls; we recompute so the popover
  // stays anchored.
  useEffect(() => {
    if (!open) { setPos(null); return; }
    function compute() {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const popoverW = Math.min(POPOVER_WIDTH, vw - VIEWPORT_MARGIN * 2);

      // Center the popover on the trigger; clamp left/right.
      let left = r.left + r.width / 2 - popoverW / 2;
      if (left + popoverW > vw - VIEWPORT_MARGIN) left = vw - VIEWPORT_MARGIN - popoverW;
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

      // Default to below the trigger; flip above if it overflows the
      // bottom. The actual rendered height is unknown until the
      // popover paints; ~200 px is a generous estimate that handles
      // every help body we currently ship.
      const wantsBelow = side === 'bottom';
      const estH = popoverRef.current?.offsetHeight ?? 200;
      let top = wantsBelow ? r.bottom + 6 : r.top - estH - 6;
      if (wantsBelow && top + estH > vh - VIEWPORT_MARGIN) {
        top = r.top - estH - 6;
      }
      if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

      setPos({ top, left });
    }
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open, side]);

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
        <div
          ref={popoverRef}
          role="tooltip"
          className="help-hint-popover fixed z-50 text-[12.5px] leading-relaxed animate-fade-in"
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: Math.min(
              POPOVER_WIDTH,
              typeof window !== 'undefined' ? window.innerWidth - VIEWPORT_MARGIN * 2 : POPOVER_WIDTH,
            ),
          }}
        >
          {title && <div className="text-[13px] font-semibold mb-1">{title}</div>}
          <div className="text-fg-muted">{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
