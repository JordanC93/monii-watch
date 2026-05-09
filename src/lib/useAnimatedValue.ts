/**
 * Smoothly interpolate a number from its previous value to a new target
 * over a short duration (default 380ms with ease-out cubic). Used by
 * the Money component to animate balance changes — instead of digits
 * snapping when an amount updates, they roll smoothly. v0.7.29.
 *
 * Honors `prefers-reduced-motion: reduce` — when set, the value
 * snaps immediately to the target instead of animating. Same default
 * we use for the glass-backdrop drift and other visual flourishes.
 *
 * Cheap: a single rAF loop per consumer; cancels on unmount or when
 * the target changes mid-animation.
 */

import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 380;

function reduceMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useAnimatedValue(target: number, duration: number = DEFAULT_DURATION_MS): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
    if (reduceMotion()) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    fromRef.current = value;
    startRef.current = performance.now();

    function step(now: number) {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const next = fromRef.current + (targetRef.current - fromRef.current) * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // Intentionally omit `value` from deps — it changes inside this
    // effect every frame, which would re-trigger the effect and reset
    // the animation. We only want to start a NEW animation when the
    // target itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}
