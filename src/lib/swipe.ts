/**
 * Tiny touch-swipe hook. Returns event handlers you spread onto a
 * scrollable container. Calls `onLeft` / `onRight` only when the swipe is
 * (a) primarily horizontal, (b) longer than `minPx` pixels, and (c)
 * faster than `maxMs` milliseconds — so accidental scrolls don't trigger.
 *
 * No external dependencies; works on iOS Safari + Chrome Android.
 */

import { useRef } from 'react';

export type SwipeOptions = {
  /** Horizontal pixels required to count as a swipe. Default 60. */
  minPx?: number;
  /** Vertical/horizontal ratio cutoff — gesture must be `vertical / horizontal < this`. Default 0.6. */
  vRatioMax?: number;
  /** Max gesture duration (ms). Beyond this it's a drag, not a swipe. Default 600. */
  maxMs?: number;
};

export type SwipeHandlers = {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
};

export function useSwipe(
  onLeft: () => void,
  onRight: () => void,
  opts: SwipeOptions = {},
): SwipeHandlers {
  const minPx = opts.minPx ?? 60;
  const vRatioMax = opts.vRatioMax ?? 0.6;
  const maxMs = opts.maxMs ?? 600;
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  return {
    onTouchStart(e) {
      const touch = e.touches[0];
      if (!touch) return;
      start.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    },
    onTouchEnd(e) {
      if (!start.current) return;
      const touch = e.changedTouches[0];
      if (!touch) { start.current = null; return; }
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      const dt = Date.now() - start.current.t;
      start.current = null;
      if (dt > maxMs) return;
      if (Math.abs(dx) < minPx) return;
      if (Math.abs(dy) / Math.max(1, Math.abs(dx)) > vRatioMax) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}
