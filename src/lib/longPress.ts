/**
 * Long-press hook (Tier 12 #4). Detects a sustained touch / mouse hold
 * on an element. Used by mobile transaction rows to trigger an action
 * sheet — the touch equivalent of right-click.
 *
 * Behavior:
 *   - Fires `onLongPress` after `delayMs` (default 500 ms) of unbroken
 *     touch / mouse-down on the bound element.
 *   - Cancels on touchmove > 8 px (so scrolling doesn't fire it).
 *   - Cancels on touchend / mouseup before the timer.
 *   - Suppresses the synthetic click that would normally follow when
 *     the long-press fires — `onLongPress` is meant to REPLACE the
 *     normal click, not augment it.
 *
 * Attach the returned handlers to the element:
 *   const lp = useLongPress(() => doThing(), 500);
 *   <div {...lp}> ... </div>
 *
 * iOS gotcha: WebKit fires a synthetic context menu on long-press by
 * default for links + images. We add `style={{ WebkitTouchCallout:
 * 'none' }}` via a CSS class on the element instead — the hook
 * doesn't try to attribute that, so callers must set it.
 */

import { useCallback, useRef } from 'react';

export type LongPressBindings = {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

export function useLongPress(
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void,
  delayMs = 500,
): LongPressBindings {
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startedRef.current = null;
  }, []);

  const start = useCallback((x: number, y: number, e: React.TouchEvent | React.MouseEvent) => {
    cancel();
    firedRef.current = false;
    startedRef.current = { x, y };
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      onLongPress(e);
    }, delayMs);
  }, [cancel, onLongPress, delayMs]);

  return {
    onTouchStart: (e) => {
      const t = e.touches[0];
      if (!t) return;
      start(t.clientX, t.clientY, e);
    },
    onTouchMove: (e) => {
      if (!startedRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startedRef.current.x;
      const dy = t.clientY - startedRef.current.y;
      if (Math.hypot(dx, dy) > 8) cancel();
    },
    onTouchEnd: (e) => {
      cancel();
      // If we fired the long-press handler, swallow the trailing
      // synthetic click event by preventDefault (only when supported).
      if (firedRef.current) e.preventDefault();
    },
    onTouchCancel: () => cancel(),
    onMouseDown: (e) => {
      // Only respond to primary button; right-click already handled
      // by the existing onContextMenu wiring.
      if (e.button !== 0) return;
      start(e.clientX, e.clientY, e);
    },
    onMouseUp: () => cancel(),
    onMouseLeave: () => cancel(),
    onContextMenu: (e) => {
      // On mobile browsers, the OS sometimes synthesizes a
      // contextmenu event after long-press. We want to override
      // that so our action sheet wins. preventDefault + handle.
      if (firedRef.current) {
        e.preventDefault();
      }
    },
  };
}
